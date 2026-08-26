import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// Only the most recent messages are loaded to keep long chats fast.
const MESSAGE_PAGE_SIZE = 100;

export const useConversations = (userId: string | undefined) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch all conversations
  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching conversations:", error);
      toast.error("Could not load your conversations.");
    } else {
      setConversations(data || []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Create a new conversation
  const createConversation = useCallback(async (firstMessage: string): Promise<string | null> => {
    if (!userId) return null;

    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: userId, title })
      .select()
      .single();

    if (error) {
      console.error("Error creating conversation:", error);
      toast.error("Failed to create conversation");
      return null;
    }

    setConversations((prev) => [data, ...prev]);
    setCurrentConversationId(data.id);
    return data.id;
  }, [userId]);

  // Load messages for a conversation
  const loadMessages = useCallback(async (conversationId: string): Promise<Message[]> => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);

    if (error) {
      console.error("Error loading messages:", error);
      toast.error("Could not load this conversation.");
      return [];
    }

    return (data || []).slice().reverse().map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
  }, []);

  // Save a message
  const saveMessage = useCallback(async (
    conversationId: string,
    role: "user" | "assistant",
    content: string
  ): Promise<string | null> => {
    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role, content })
      .select()
      .single();

    if (error) {
      console.error("Error saving message:", error);
      toast.error("Message could not be saved to your history.");
      return null;
    }

    // Update conversation's updated_at
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return data.id;
  }, []);

  // Delete a single message
  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) {
      console.error("Error deleting message:", error);
      toast.error("Failed to delete message");
      return false;
    }
    return true;
  }, []);

  // Delete a conversation

  const deleteConversation = useCallback(async (conversationId: string) => {
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (error) {
      console.error("Error deleting conversation:", error);
      toast.error("Failed to delete conversation");
      return;
    }

    toast.success("Conversation deleted");
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (currentConversationId === conversationId) {
      setCurrentConversationId(null);
    }
  }, [currentConversationId]);

  const selectConversation = useCallback((id: string | null) => {
    setCurrentConversationId(id);
  }, []);

  const startNewChat = useCallback(() => {
    setCurrentConversationId(null);
  }, []);

  return {
    conversations,
    currentConversationId,
    loading,
    createConversation,
    loadMessages,
    saveMessage,
    deleteConversation,
    deleteMessage,

    selectConversation,
    startNewChat,
    refreshConversations: fetchConversations,
  };
};
