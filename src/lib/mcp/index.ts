import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listConversationsTool from "./tools/list-conversations";
import getConversationTool from "./tools/get-conversation";
import searchMessagesTool from "./tools/search-messages";
import createConversationTool from "./tools/create-conversation";
import deleteConversationTool from "./tools/delete-conversation";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "chat-assistant",
  title: "Chat Assistant",
  version: "0.1.0",
  instructions:
    "Tools for the Chat Assistant app. Use `list_conversations` to browse the signed-in user's chat conversations, `get_conversation` to read a conversation's messages, `search_messages` to find past messages, `create_conversation` to start a new one, and `delete_conversation` to remove one.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listConversationsTool,
    getConversationTool,
    searchMessagesTool,
    createConversationTool,
    deleteConversationTool,
  ],
});
