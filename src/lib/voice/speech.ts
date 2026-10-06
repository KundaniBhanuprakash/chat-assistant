import { createParser } from "eventsource-parser";
import { supabase } from "@/integrations/supabase/client";
import { IMAGE_MARKER_REGEX } from "@/lib/chatImages";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const authHeaders = async (): Promise<Record<string, string>> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
};

const readError = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
};

/* ------------------------------------------------------------------ */
/* Speech to text                                                      */
/* ------------------------------------------------------------------ */

/** Upload a complete recording; calls onText as the transcript streams in. */
export async function transcribe(
  file: File,
  onText?: (soFar: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch(`${FUNCTIONS_URL}/transcribe`, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(await readError(response, "Voice input failed. Please try again."));
  }

  let text = "";
  let finalText: string | null = null;
  let failure: string | null = null;
  const parser = createParser({
    onEvent(event) {
      if (event.data === "[DONE]") return;
      const payload = JSON.parse(event.data) as {
        type?: string;
        delta?: string;
        text?: string;
        error?: { message?: string } | string;
      };
      if (payload.type === "error" || payload.error) {
        failure = "That recording couldn't be understood. Please try again.";
        return;
      }
      if (payload.type === "transcript.text.delta" && payload.delta) {
        text += payload.delta;
        onText?.(text);
      } else if (payload.type === "transcript.text.done" && typeof payload.text === "string") {
        finalText = payload.text;
        onText?.(payload.text);
      }
    },
  });

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      parser.feed(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (failure) throw new Error(failure);
  const result = (finalText ?? text).trim();
  if (!result) throw new Error("I didn't catch any speech. Please try again.");
  return result;
}

/* ------------------------------------------------------------------ */
/* Text to speech                                                      */
/* ------------------------------------------------------------------ */

/** Turn a Markdown reply into something pleasant to listen to. */
export function toSpeakableText(markdown: string): string {
  return markdown
    .replace(IMAGE_MARKER_REGEX, " ")
    .replace(/```[\s\S]*?```/g, " (code omitted) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/\[(\d+)\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function chunkText(text: string, maxCodePoints = 600): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const sentence of text.match(/[^.!?。！？]+[.!?。！？]*\s*|[.!?。！？]+\s*/gu) ?? []) {
    const points = Array.from(sentence);
    if (Array.from(current).length + points.length <= maxCodePoints) {
      current += sentence;
      continue;
    }
    if (current) chunks.push(current);
    current = "";
    for (let offset = 0; offset < points.length; offset += maxCodePoints) {
      const part = points.slice(offset, offset + maxCodePoints).join("");
      if (offset + maxCodePoints < points.length) chunks.push(part);
      else current = part;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

function decodePCM(pending: Uint8Array, incoming: Uint8Array) {
  const bytes = new Uint8Array(pending.length + incoming.length);
  bytes.set(pending);
  bytes.set(incoming, pending.length);
  const usable = bytes.length - (bytes.length % 2);
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(usable / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return { samples, pending: bytes.slice(usable) };
}

/**
 * Read a reply aloud. Text is split into sentence-sized chunks, each chunk is
 * streamed and played in order on a single audio clock. Abort to stop.
 */
export async function speak(markdown: string, signal: AbortSignal): Promise<void> {
  const chunks = chunkText(toSpeakableText(markdown));
  if (!chunks.length) throw new Error("There's nothing to read aloud in this message.");

  const context = new AudioContext({ sampleRate: 24000 });
  const sources = new Set<AudioBufferSourceNode>();
  let playhead = 0;
  let lastEnded: Promise<void> = Promise.resolve();
  const stopAll = () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
  };
  signal.addEventListener("abort", stopAll, { once: true });

  try {
    if (context.state === "suspended") await context.resume();
    const headers = { ...(await authHeaders()), "Content-Type": "application/json" };

    for (const chunk of chunks) {
      signal.throwIfAborted();
      const response = await fetch(`${FUNCTIONS_URL}/speech`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text: chunk }),
        signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(await readError(response, "Read aloud failed. Please try again."));
      }

      let pending = new Uint8Array(0);
      let completed = false;
      let samples = 0;
      let failed = false;
      const parser = createParser({
        onEvent(event) {
          const payload = JSON.parse(event.data) as { type: string; audio?: string; error?: unknown };
          if (payload.type === "error" || payload.error) {
            failed = true;
            return;
          }
          if (payload.type === "speech.audio.done") {
            completed = true;
            return;
          }
          if (payload.type !== "speech.audio.delta" || !payload.audio) return;
          const decoded = decodePCM(
            pending,
            Uint8Array.from(atob(payload.audio), (c) => c.charCodeAt(0))
          );
          pending = new Uint8Array(decoded.pending);
          if (!decoded.samples.length) return;
          samples += decoded.samples.length;
          const buffer = context.createBuffer(1, decoded.samples.length, 24000);
          buffer.copyToChannel(decoded.samples, 0);
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          sources.add(source);
          lastEnded = new Promise<void>((resolve) => {
            source.onended = () => {
              sources.delete(source);
              resolve();
            };
          });
          playhead = Math.max(playhead, context.currentTime + 0.05);
          source.start(playhead);
          playhead += buffer.duration;
        },
      });

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          parser.feed(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      if (failed || !completed || !samples) {
        throw new Error("Read aloud stopped unexpectedly. Please try again.");
      }
    }

    await lastEnded;
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", stopAll);
    stopAll();
    await context.close().catch(() => undefined);
  }
}
