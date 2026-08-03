import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_messages",
  title: "Search messages",
  description: "Search the signed-in user's chat messages for a text fragment.",
  inputSchema: {
    query: z.string().min(1).describe("Text to search for inside message content."),
    limit: z.number().int().min(1).max(100).optional().describe("Max matches to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const escaped = query.replace(/[%_]/g, (m) => `\\${m}`);
    const { data, error } = await supabase
      .from("messages")
      .select("id, conversation_id, role, content, created_at")
      .ilike("content", `%${escaped}%`)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { matches: data ?? [] },
    };
  },
});
