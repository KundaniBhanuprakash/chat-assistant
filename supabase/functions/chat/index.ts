import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSystemPrompt, isChatMode, resolveModel } from "../_shared/models.ts";
import { assembleContext } from "../_shared/context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Context-Talk-Mode, X-Context-Talk-Documents",
};

const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MINUTES = 1;
const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 10000;
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 8_000_000; // base64 data URL budget per image

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return json({ error: "Invalid authentication" }, 401);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: isAllowed, error: rateLimitError } = await serviceClient.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "chat",
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
      p_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
    });

    if (rateLimitError) console.error("Rate limit check error:", rateLimitError.message);

    if (!isAllowed) {
      return json(
        {
          error: "Rate limit exceeded. Please wait a moment before sending more messages.",
          retryAfter: RATE_LIMIT_WINDOW_MINUTES * 60,
        },
        429,
        { "Retry-After": String(RATE_LIMIT_WINDOW_MINUTES * 60) }
      );
    }

    const body = await req.json().catch(() => null);
    const messages = body?.messages;
    const requestedMode = isChatMode(body?.mode) ? body.mode : "auto";
    const projectId = typeof body?.projectId === "string" ? body.projectId : null;
    const documentIds: string[] = Array.isArray(body?.documentIds)
      ? body.documentIds.filter((d: unknown) => typeof d === "string").slice(0, 10)
      : [];
    const images: string[] = Array.isArray(body?.images)
      ? body.images
          .filter((i: unknown) => typeof i === "string" && i.startsWith("data:image/"))
          .slice(0, MAX_IMAGES)
      : [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI service is not configured." }, 503);

    if (!Array.isArray(messages)) return json({ error: "Invalid messages format" }, 400);
    if (messages.length === 0) return json({ error: "No messages provided" }, 400);
    if (messages.length > MAX_MESSAGES) {
      return json({ error: "Too many messages in conversation" }, 400);
    }
    for (const img of images) {
      if (img.length > MAX_IMAGE_CHARS) return json({ error: "Image is too large" }, 400);
    }

    for (const msg of messages) {
      if (!msg?.role || typeof msg.content !== "string" || !msg.content) {
        return json({ error: "Invalid message format" }, 400);
      }
      if (msg.content.length > MAX_MESSAGE_CHARS) {
        return json({ error: `Message too long (max ${MAX_MESSAGE_CHARS} characters)` }, 400);
      }
      if (!["user", "assistant", "system"].includes(msg.role)) {
        return json({ error: "Invalid message role" }, 400);
      }
    }

    // Drop any client-supplied system messages: the system prompt is server-owned
    // so a user cannot overwrite the assistant's instructions via the request body.
    const history = messages.filter((m: { role: string }) => m.role !== "system");
    const lastUser = [...history].reverse().find((m: { role: string }) => m.role === "user");
    const lastUserText = typeof lastUser?.content === "string" ? lastUser.content : "";

    const { mode, resolved } = resolveModel(requestedMode, lastUserText, images.length > 0);

    const context = await assembleContext(serviceClient, user.id, {
      query: lastUserText,
      projectId,
      documentIds,
    });

    // The final user turn carries any attached images as multimodal content.
    const outgoing = history.map((m: { role: string; content: string }, index: number) => {
      const isLastUser = index === history.length - 1 && m.role === "user";
      if (!isLastUser || images.length === 0) return m;
      return {
        role: "user",
        content: [
          { type: "text", text: m.content },
          ...images.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      };
    });

    console.log("chat request", {
      user: user.id,
      requestedMode,
      mode,
      model: resolved.model,
      documents: context.documentNames.length,
      images: images.length,
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolved.model,
        messages: [
          {
            role: "system",
            content: [buildSystemPrompt(resolved), context.text].filter(Boolean).join("\n\n"),
          },
          ...outgoing,
        ],
        ...(resolved.temperature !== undefined ? { temperature: resolved.temperature } : {}),
        stream: true,
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("AI gateway error:", { status: response.status, detail: detail.slice(0, 300) });

      if (response.status === 429) {
        return json({ error: "The AI service is busy. Please try again in a moment." }, 429, {
          "Retry-After": response.headers.get("Retry-After") ?? "30",
        });
      }
      if (response.status === 402) {
        return json({ error: "AI usage limit reached. Please add credits to continue." }, 402);
      }
      if (response.status === 403) {
        return json({ error: "AI access is currently blocked for this workspace." }, 403);
      }
      if (response.status === 400) {
        return json({ error: "That request could not be processed by the selected model." }, 400);
      }
      return json({ error: "Unable to reach the AI service. Please try again." }, 502);
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-Context-Talk-Mode": mode,
        "X-Context-Talk-Documents": String(context.documentNames.length),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(null, { status: 499, headers: corsHeaders });
    }
    console.error("Chat function error:", {
      name: error instanceof Error ? error.name : "Unknown",
    });
    return json({ error: "An error occurred. Please try again." }, 500);
  }
});
