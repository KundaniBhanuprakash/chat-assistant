import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Speech-to-text. Accepts one complete recording (multipart field "file")
 * and streams the transcript back as SSE from the AI gateway.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "openai/gpt-transcribe";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 512 * 1024;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Invalid authentication" }, 401);

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: allowed } = await service.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "transcribe",
      p_max_requests: 20,
      p_window_minutes: 1,
    });
    if (!allowed) {
      return json({ error: "Too many voice messages. Please wait a moment." }, 429, {
        "Retry-After": "60",
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Voice input is not configured." }, 503);

    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_REQUEST_BYTES) return json({ error: "Recording is too long." }, 413);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || file.size < 2048) {
      return json({ error: "The recording was empty. Please try again." }, 400);
    }
    if (file.size > MAX_FILE_BYTES) return json({ error: "Recording is too long." }, 413);
    if (!file.type.startsWith("audio/")) return json({ error: "Unsupported audio format." }, 400);

    const upstreamForm = new FormData();
    upstreamForm.append("model", MODEL);
    upstreamForm.append("file", file, file.name || "recording.wav");
    upstreamForm.append("response_format", "json");
    upstreamForm.append("stream", "true");

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
      signal: req.signal,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("Transcription error", upstream.status, detail.slice(0, 300));
      const message =
        upstream.status === 429
          ? "The voice service is busy. Please try again shortly."
          : upstream.status === 402
            ? "AI usage limit reached. Please add credits to continue."
            : upstream.status === 400
              ? "That recording couldn't be understood. Please try again."
              : "Voice input failed. Please try again.";
      return json({ error: message }, upstream.status);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(null, { status: 499, headers: corsHeaders });
    }
    console.error("transcribe failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Voice input failed. Please try again." }, 500);
  }
});
