import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MINUTES = 1;
const BUCKET = "chat-images";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

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

    const { data: isAllowed } = await serviceClient.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "image-edit",
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
      p_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
    });

    if (!isAllowed) {
      return new Response(
        JSON.stringify({
          error: "Too many image edits. Please wait a moment before trying again.",
          retryAfter: RATE_LIMIT_WINDOW_MINUTES * 60,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(RATE_LIMIT_WINDOW_MINUTES * 60),
          },
        }
      );
    }

    const body = await req.json().catch(() => null);
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const path = typeof body?.path === "string" ? body.path : "";

    if (!prompt || prompt.length > 2000) return json({ error: "Invalid prompt" }, 400);
    if (!path || !path.startsWith(`${user.id}/`)) return json({ error: "Invalid image" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "Service configuration error" }, 500);

    const { data: file, error: downloadError } = await serviceClient.storage
      .from(BUCKET)
      .download(path);
    if (downloadError || !file) return json({ error: "Could not read the source image" }, 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > 8 * 1024 * 1024) return json({ error: "Image too large (max 8MB)" }, 400);
    const mimeType = file.type || "image/png";
    const dataUrl = `data:${mimeType};base64,${toBase64(bytes)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Image gateway error", response.status, detail.slice(0, 500));
      if (response.status === 429) {
        return json({ error: "Rate limit exceeded. Please try again in a moment." }, 429);
      }
      if (response.status === 402) {
        return json({ error: "Usage limit reached. Please add credits to continue." }, 402);
      }
      return json({ error: "Unable to edit the image. Please try again." }, 500);
    }

    const result = await response.json();
    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) {
      console.error("No image returned from gateway");
      return json({ error: "The model did not return an edited image. Try rephrasing." }, 502);
    }

    const outBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const outPath = `${user.id}/edited-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await serviceClient.storage
      .from(BUCKET)
      .upload(outPath, outBytes, { contentType: "image/png" });

    if (uploadError) {
      console.error("Upload error:", uploadError.message);
      return json({ error: "Could not save the edited image" }, 500);
    }

    return json({ path: outPath });
  } catch (error) {
    console.error("image-edit error:", error instanceof Error ? error.message : "unknown");
    return json({ error: "An error occurred. Please try again." }, 500);
  }
});
