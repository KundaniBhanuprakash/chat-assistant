import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Reports which capabilities are actually configured on this deployment.
 * Returns booleans only — never secret names or values.
 */
serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const has = (name: string) => Boolean(Deno.env.get(name));
  const gateway = has("LOVABLE_API_KEY");

  const capabilities = {
    chat: gateway,
    imageEdit: gateway,
    imageGeneration: gateway,
    imageUnderstanding: gateway,
    // Live web results need a dedicated search provider.
    webSearch: has("TAVILY_API_KEY"),
    // Research works over attached documents even without a web provider.
    deepResearch: gateway,
    voiceInput: false,
    voiceOutput: false,
    documents: true,
    memory: true,
    projects: true,
    // Code execution runs client-side in a sandbox; enabled in a later phase.
    codeExecution: false,
  };

  return new Response(JSON.stringify(capabilities), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "max-age=60" },
  });
});
