import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Text-to-speech. Streams 24 kHz PCM audio back as SSE so replies start
 * playing before the whole clip is generated. The client sends text in
 * sentence-sized chunks and plays them in order.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-3.1-flash-tts-preview";
const DEFAULT_VOICE = "Kore";
const VOICES = new Set(["Kore", "Puck", "Charon", "Aoede", "Fenrir", "Leda", "Orus", "Zephyr"]);
const MAX_TEXT_CHARS = 1500;

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
      p_endpoint: "speech",
      p_max_requests: 60,
      p_window_minutes: 1,
    });
    if (!allowed) {
      return json({ error: "Too many read-aloud requests. Please wait a moment." }, 429, {
        "Retry-After": "60",
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Read aloud is not configured." }, 503);

    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "Nothing to read aloud." }, 400);
    if (text.length > MAX_TEXT_CHARS) return json({ error: "Text chunk is too long." }, 400);
    const voice = VOICES.has(body?.voice) ? body.voice : DEFAULT_VOICE;

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
        stream_format: "sse",
      }),
      signal: req.signal,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("Speech error", upstream.status, detail.slice(0, 300));
      const message =
        upstream.status === 429
          ? "The voice service is busy. Please try again shortly."
          : upstream.status === 402
            ? "AI usage limit reached. Please add credits to continue."
            : "Read aloud failed. Please try again.";
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
    console.error("speech failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Read aloud failed. Please try again." }, 500);
  }
});
