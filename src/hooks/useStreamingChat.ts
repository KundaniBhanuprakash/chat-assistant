import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { imageMarker, uploadChatImage } from "@/lib/chatImages";


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
  userId?: string;
  onCreateConversation: (firstMessage: string) => Promise<string | null>;
  onSaveMessage: (conversationId: string, role: "user" | "assistant", content: string) => Promise<string | null>;
  onDeleteMessage?: (messageId: string) => Promise<boolean>;
  initialMessages?: Message[];
}


export const useStreamingChat = ({
  conversationId,
  userId,
  onCreateConversation,
  onSaveMessage,
  onDeleteMessage,
  initialMessages = [],
}: UseStreamingChatOptions) => {

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo>({ isLimited: false, retryAfter: 0 });
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Persist a message and swap its temporary local id for the database id,
  // so per-message delete can remove it from history too.
  const persist = useCallback(
    async (
      conversationIdToUse: string,
      role: "user" | "assistant",
      content: string,
      localId: string
    ) => {
      const savedId = await onSaveMessage(conversationIdToUse, role, content);
      if (savedId) {
        setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, id: savedId } : m)));
      }
    },
    [onSaveMessage]
  );

  const sendImageEdit = useCallback(
    async (prompt: string, image: File) => {
      if (!userId) {
        toast.error("You must be logged in to edit images");
        return;
      }

      setFailedMessage(null);
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        activeConversationId = await onCreateConversation(prompt);
        if (!activeConversationId) return;
      }

      setIsStreaming(true);
      const localId = `local-${Date.now()}`;
      try {
        const path = await uploadChatImage(image, userId);
        if (!path) {
          toast.error("Could not upload the image. Please try again.");
          return;
        }

        const userContent = `${imageMarker(path)}\n${prompt}`;
        setMessages((prev) => [...prev, { id: localId, role: "user", content: userContent }]);
        await persist(activeConversationId, "user", userContent, localId);

        const { data, error } = await supabase.functions.invoke("image-edit", {
          body: { prompt, path },
        });

        if (error || !data?.path) {
          const message =
            (data as { error?: string } | null)?.error ??
            error?.message ??
            "Unable to edit the image. Please try again.";
          toast.error(message);
          setFailedMessage(prompt);
          return;
        }

        const assistantLocalId = `local-${Date.now() + 1}`;
        const assistantContent = `${imageMarker(data.path as string)}\nHere's your edited image.`;
        setMessages((prev) => [
          ...prev,
          { id: assistantLocalId, role: "assistant", content: assistantContent },
        ]);
        await persist(activeConversationId, "assistant", assistantContent, assistantLocalId);
      } catch (err) {
        console.error("Image edit error:", err);
        toast.error("Something went wrong editing the image. Please try again.");
      } finally {
        setIsStreaming(false);
      }
    },
    [conversationId, onCreateConversation, persist, userId]
  );

  const sendMessage = useCallback(async (content: string, image?: File) => {
    // Validate message length
    if (content.length > MAX_MESSAGE_LENGTH) {
      toast.error(`Message too long. Please keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`);
      return;
    }

    if (image) {
      await sendImageEdit(content.trim(), image);
      return;
    }

    if (!content.trim()) {
      return;
    }

    setFailedMessage(null);
    let activeConversationId = conversationId;

    // Create conversation if needed
    if (!activeConversationId) {
      activeConversationId = await onCreateConversation(content);
      if (!activeConversationId) return;
    }

    const userMessage: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    // Save user message to database
    await persist(activeConversationId, "user", content, userMessage.id);


    let assistantContent = "";
    const assistantLocalId = `local-${Date.now() + 1}`;


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
          { id: assistantLocalId, role: "assistant", content: assistantContent },
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
          setFailedMessage(content);
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
          setIsStreaming(false);
          return;
        }
        if (response.status === 401) {
          throw new Error("Your session expired. Please sign in again.");
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          typeof errorData.error === "string" ? errorData.error : "Failed to get a response."
        );
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
        await persist(activeConversationId, "assistant", assistantContent, assistantLocalId);
      }

    } catch (error) {
      console.error("Chat error:", error);
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const message = offline
        ? "You appear to be offline. Check your connection and retry."
        : error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";
      toast.error(message);
      setFailedMessage(content);
      // Remove the user message if we failed
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsStreaming(false);
    }
  }, [messages, conversationId, onCreateConversation, onSaveMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setFailedMessage(null);
  }, []);

  const retryLast = useCallback(() => {
    if (failedMessage) void sendMessage(failedMessage);
  }, [failedMessage, sendMessage]);

  return {
    messages,
    isStreaming,
    sendMessage,
    clearMessages,
    rateLimit,
    retryLast,
    canRetry: failedMessage !== null && !rateLimit.isLimited,
  };
};
