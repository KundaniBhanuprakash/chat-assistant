import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "delete_conversation",
  title: "Delete conversation",
  description: "Permanently delete one of the signed-in user's conversations and its messages.",
  inputSchema: {
    conversation_id: z.string().describe("The conversation id to delete."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ conversation_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversation_id)
      .select("id");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data || data.length === 0) {
      return { content: [{ type: "text", text: "Conversation not found" }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Deleted conversation ${conversation_id}` }],
      structuredContent: { deleted_id: conversation_id },
    };
  },
});
