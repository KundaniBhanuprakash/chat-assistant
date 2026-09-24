import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveModel } from "../_shared/models.ts";
import { assembleContext } from "../_shared/context.ts";

/**
 * Multi-step research workflow.
 *
 * 1. Plan — break the question into focused sub-questions.
 * 2. Gather — search the web (when a search provider is configured) and the
 *    user's own attached documents for each sub-question.
 * 3. Synthesise — write one grounded answer that cites the sources it used.
 *
 * Every step is real: nothing is returned unless the gather step produced
 * material, and sources are only listed if they were actually retrieved.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MINUTES = 5;
const MAX_SUBQUESTIONS = 4;
const MAX_SNIPPET_CHARS = 1200;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

interface Source {
  title: string;
  url: string;
  snippet: string;
}

const gatewayChat = async (
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature?: number
): Promise<string> => {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      ...(temperature !== undefined ? { temperature } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(detail.slice(0, 300));
    // @ts-expect-error attach status for the caller
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
};

const tavilySearch = async (key: string, query: string): Promise<Source[]> => {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "advanced",
        max_results: 4,
        include_answer: false,
      }),
    });
    if (!res.ok) {
      console.error("Tavily error", res.status);
      return [];
    }
    const data = await res.json();
    return (data?.results ?? []).map((r: { title?: string; url?: string; content?: string }) => ({
      title: r.title ?? r.url ?? "Source",
      url: r.url ?? "",
      snippet: String(r.content ?? "").slice(0, MAX_SNIPPET_CHARS),
    }));
  } catch (e) {
    console.error("Tavily request failed", e instanceof Error ? e.name : "unknown");
    return [];
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: allowed } = await service.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "research",
      p_max_requests: RATE_LIMIT_MAX,
      p_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
    });
    if (!allowed) {
      return json(
        { error: "Research is limited to 5 runs every 5 minutes. Please wait a moment." },
        429,
        { "Retry-After": String(RATE_LIMIT_WINDOW_MINUTES * 60) }
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI service is not configured." }, 503);
    const tavilyKey = Deno.env.get("TAVILY_API_KEY");

    const body = await req.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim().slice(0, 2000) : "";
    if (!question) return json({ error: "Please provide a research question." }, 400);
    const projectId = typeof body?.projectId === "string" ? body.projectId : null;
    const documentIds: string[] = Array.isArray(body?.documentIds)
      ? body.documentIds.filter((d: unknown) => typeof d === "string").slice(0, 10)
      : [];

    const { resolved } = resolveModel("research", question, false);

    // ---- Step 1: plan -----------------------------------------------------
    const planRaw = await gatewayChat(apiKey, resolved.model, [
      {
        role: "system",
        content:
          "You plan research. Break the user's question into at most " +
          MAX_SUBQUESTIONS +
          " focused, self-contained search queries. Reply with a JSON array of strings only, no prose.",
      },
      { role: "user", content: question },
    ]);

    let subQuestions: string[] = [];
    try {
      const match = planRaw.match(/\[[\s\S]*\]/);
      const parsed = match ? JSON.parse(match[0]) : [];
      subQuestions = (Array.isArray(parsed) ? parsed : [])
        .filter((s: unknown) => typeof s === "string" && s.trim())
        .slice(0, MAX_SUBQUESTIONS);
    } catch {
      subQuestions = [];
    }
    if (subQuestions.length === 0) subQuestions = [question];

    // ---- Step 2: gather ---------------------------------------------------
    const sources: Source[] = [];
    if (tavilyKey) {
      const batches = await Promise.all(subQuestions.map((q) => tavilySearch(tavilyKey, q)));
      for (const batch of batches) {
        for (const s of batch) {
          if (s.url && !sources.some((existing) => existing.url === s.url)) sources.push(s);
        }
      }
    }

    const context = await assembleContext(service, user.id, {
      query: question,
      projectId,
      documentIds,
    });

    if (!tavilyKey && !context.documentNames.length) {
      return json(
        {
          error:
            "Research needs something to read. Attach a document, or add a web search key to research the live web.",
          needsSearchProvider: true,
        },
        400
      );
    }

    // ---- Step 3: synthesise ----------------------------------------------
    const webBlock = sources.length
      ? sources
          .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
          .join("\n\n---\n\n")
      : "No web results were retrieved.";

    const answer = await gatewayChat(
      apiKey,
      resolved.model,
      [
        {
          role: "system",
          content:
            "You are Context Talk Agent running a research task. Write a well-structured Markdown " +
            "report answering the question, using ONLY the supplied web results and document " +
            "excerpts. Cite web sources inline as [1], [2] matching the numbered list. Cite " +
            "documents by name. If the material does not answer part of the question, say so " +
            "explicitly. Never invent sources, figures or quotes.\n\n" +
            (context.text ? context.text + "\n\n" : ""),
        },
        {
          role: "user",
          content:
            `Question: ${question}\n\nResearch plan:\n` +
            subQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n") +
            `\n\nWeb results:\n${webBlock}`,
        },
      ],
      0.3
    );

    const citationList = sources.length
      ? "\n\n### Sources\n" + sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join("\n")
      : "";

    return json({
      answer: `${answer.trim()}${citationList}`,
      plan: subQuestions,
      sources,
      documents: context.documentNames,
      webSearchUsed: Boolean(tavilyKey),
    });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 429) return json({ error: "The AI service is busy. Try again shortly." }, 429);
    if (status === 402) {
      return json({ error: "AI usage limit reached. Please add credits to continue." }, 402);
    }
    console.error("Research error:", error instanceof Error ? error.message : "unknown");
    return json({ error: "The research run failed. Please try again." }, 500);
  }
});
