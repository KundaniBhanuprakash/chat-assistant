import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_conversation",
  title: "Create conversation",
  description: "Create a new chat conversation for the signed-in user, optionally with a first message.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Title for the new conversation."),
    first_message: z.string().trim().min(1).optional().describe("Optional first user message to store."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, first_message }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({ user_id: ctx.getUserId(), title })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    if (first_message) {
      const { error: msgError } = await supabase
        .from("messages")
        .insert({ conversation_id: conversation.id, role: "user", content: first_message });
      if (msgError) return { content: [{ type: "text", text: msgError.message }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(conversation) }],
      structuredContent: { conversation },
    };
  },
});
