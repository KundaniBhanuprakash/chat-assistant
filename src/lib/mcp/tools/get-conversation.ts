import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_conversation",
  title: "Get conversation messages",
  description: "Read all messages in one of the signed-in user's conversations, oldest first.",
  inputSchema: {
    conversation_id: z.string().describe("The conversation id, from list_conversations."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ conversation_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .eq("id", conversation_id)
      .maybeSingle();
    if (convError) return { content: [{ type: "text", text: convError.message }], isError: true };
    if (!conversation) {
      return { content: [{ type: "text", text: "Conversation not found" }], isError: true };
    }
    const { data: messages, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const payload = { conversation, messages: messages ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
