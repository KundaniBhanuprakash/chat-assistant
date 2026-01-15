import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface RateLimitInfo {
  isLimited: boolean;
  retryAfter: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const MAX_MESSAGE_LENGTH = 10000;
const MAX_HISTORY_MESSAGES = 20;

interface UseStreamingChatOptions {
  conversationId: string | null;
  onCreateConversation: (firstMessage: string) => Promise<string | null>;
  onSaveMessage: (conversationId: string, role: "user" | "assistant", content: string) => Promise<string | null>;
  initialMessages?: Message[];
}

export const useStreamingChat = ({
  conversationId,
  onCreateConversation,
  onSaveMessage,
  initialMessages = [],
}: UseStreamingChatOptions) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo>({ isLimited: false, retryAfter: 0 });
  const rateLimitTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Countdown timer for rate limit
  useEffect(() => {
    if (rateLimit.retryAfter > 0) {
      rateLimitTimerRef.current = setInterval(() => {
        setRateLimit((prev) => {
          const newRetryAfter = prev.retryAfter - 1;
          if (newRetryAfter <= 0) {
            if (rateLimitTimerRef.current) {
              clearInterval(rateLimitTimerRef.current);
            }
            return { isLimited: false, retryAfter: 0 };
          }
          return { ...prev, retryAfter: newRetryAfter };
        });
      }, 1000);
    }

    return () => {
      if (rateLimitTimerRef.current) {
        clearInterval(rateLimitTimerRef.current);
      }
    };
  }, [rateLimit.isLimited]);

  const sendMessage = useCallback(async (content: string) => {
    // Validate message length
    if (content.length > MAX_MESSAGE_LENGTH) {
      toast.error(`Message too long. Please keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`);
      return;
    }

    if (!content.trim()) {
      return;
    }

    let activeConversationId = conversationId;

    // Create conversation if needed
    if (!activeConversationId) {
      activeConversationId = await onCreateConversation(content);
      if (!activeConversationId) return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    // Save user message to database
    await onSaveMessage(activeConversationId, "user", content);

    let assistantContent = "";

    const updateAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantContent } : m
          );
        }
        return [
          ...prev,
          { id: (Date.now() + 1).toString(), role: "assistant", content: assistantContent },
        ];
      });
    };

    try {
      // Get user's session token for authenticated request
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        toast.error("You must be logged in to use chat");
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        setIsStreaming(false);
        return;
      }

      // Limit conversation history to prevent unbounded growth
      const conversationHistory = [...messages, userMessage]
        .slice(-MAX_HISTORY_MESSAGES)
        .map(({ role, content }) => ({ role, content }));

      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: conversationHistory }),
      });

      if (!response.ok) {
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
          setRateLimit({ isLimited: true, retryAfter });
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
          setIsStreaming(false);
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get response");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) updateAssistant(delta);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        for (let raw of buffer.split("\n")) {
          if (!raw || raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) updateAssistant(delta);
          } catch {
            /* ignore */
          }
        }
      }

      // Save assistant message to database
      if (assistantContent && activeConversationId) {
        await onSaveMessage(activeConversationId, "assistant", assistantContent);
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send message");
      // Remove the user message if we failed
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsStreaming(false);
    }
  }, [messages, conversationId, onCreateConversation, onSaveMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isStreaming, sendMessage, clearMessages, rateLimit };
};
