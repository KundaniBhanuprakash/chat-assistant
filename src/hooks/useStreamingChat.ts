import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { imageMarker, uploadChatImage } from "@/lib/chatImages";
import { extractMemories } from "@/lib/memory";
import type { ChatMode } from "@/lib/models";
import type { SendOptions } from "@/components/ChatInput";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

interface RateLimitInfo {
  isLimited: boolean;
  retryAfter: number;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const MAX_MESSAGE_LENGTH = 10000;
const MAX_HISTORY_MESSAGES = 20;

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

interface UseStreamingChatOptions {
  conversationId: string | null;
  userId?: string;
  mode: ChatMode;
  projectId?: string | null;
  documentIds?: string[];
  onCreateConversation: (firstMessage: string) => Promise<string | null>;
  onSaveMessage: (
    conversationId: string,
    role: "user" | "assistant",
    content: string
  ) => Promise<string | null>;
  onDeleteMessage?: (messageId: string) => Promise<boolean>;
  onRememberFacts?: (facts: string[]) => void;
  initialMessages?: Message[];
}

export const useStreamingChat = ({
  conversationId,
  userId,
  mode,
  projectId,
  documentIds,
  onCreateConversation,
  onSaveMessage,
  onDeleteMessage,
  onRememberFacts,
  initialMessages = [],
}: UseStreamingChatOptions) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo>({ isLimited: false, retryAfter: 0 });
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Latest messages, so callbacks can read history without re-creating themselves.
  const messagesRef = useRef<Message[]>(initialMessages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setMessages(initialMessages);
    messagesRef.current = initialMessages;
  }, [initialMessages]);

  // Countdown timer for rate limit
  useEffect(() => {
    if (rateLimit.retryAfter > 0) {
      rateLimitTimerRef.current = setInterval(() => {
        setRateLimit((prev) => {
          const next = prev.retryAfter - 1;
          if (next <= 0) {
            if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
            return { isLimited: false, retryAfter: 0 };
          }
          return { ...prev, retryAfter: next };
        });
      }, 1000);
    }
    return () => {
      if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
    };
  }, [rateLimit.isLimited]);

  // Abort any in-flight stream when the component unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  /** Persist a message and swap its temporary local id for the database id. */
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
    async (prompt: string, image: File, targetConversationId?: string) => {
      if (!userId) {
        toast.error("You must be logged in to edit images");
        return;
      }

      setFailedMessage(null);
      let activeConversationId = targetConversationId ?? conversationId;
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
        setMessages((prev) => [
          ...prev,
          { id: localId, role: "user", content: userContent, createdAt: new Date().toISOString() },
        ]);
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
          {
            id: assistantLocalId,
            role: "assistant",
            content: assistantContent,
            createdAt: new Date().toISOString(),
          },
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

  /**
   * Core generation loop.
   * `history` is the conversation state the model should answer from;
   * the user's turn must already be included.
   */
  const runCompletion = useCallback(
    async (
      history: Message[],
      activeConversationId: string,
      retryPrompt: string,
      images: string[] = []
    ) => {
      let assistantContent = "";
      const assistantLocalId = `local-${Date.now() + 1}`;
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      const updateAssistant = (chunk: string) => {
        assistantContent += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.id === assistantLocalId) {
            return prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: assistantContent } : m
            );
          }
          return [
            ...prev,
            {
              id: assistantLocalId,
              role: "assistant",
              content: assistantContent,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      };

      const consume = (raw: string) => {
        if (!raw || raw.startsWith(":") || !raw.startsWith("data: ")) return false;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") return true;
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) updateAssistant(delta);
        } catch {
          /* partial frame — ignored, the buffered path retries it */
        }
        return false;
      };

      /** Strip any memory notes before the reply is stored or shown. */
      const finalise = async () => {
        const { clean, facts } = extractMemories(assistantContent);
        if (facts.length && onRememberFacts) onRememberFacts(facts);
        if (clean !== assistantContent) {
          assistantContent = clean;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantLocalId ? { ...m, content: clean } : m))
          );
        }
        if (assistantContent.trim()) {
          await persist(activeConversationId, "assistant", assistantContent, assistantLocalId);
        }
      };

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          toast.error("You must be logged in to use chat");
          setIsStreaming(false);
          return;
        }

        const payload = history
          .slice(-MAX_HISTORY_MESSAGES)
          .map(({ role, content }) => ({ role, content }));

        const response = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: payload,
            mode,
            projectId: projectId ?? null,
            documentIds: documentIds ?? [],
            images,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
            setRateLimit({ isLimited: true, retryAfter });
            setFailedMessage(retryPrompt);
            setIsStreaming(false);
            return;
          }
          if (response.status === 401) throw new Error("Your session expired. Please sign in again.");
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            typeof errorData.error === "string" ? errorData.error : "Failed to get a response."
          );
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        while (!done) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.trim() === "") continue;
            if (consume(line)) {
              done = true;
              break;
            }
          }
        }

        for (const raw of buffer.split("\n")) {
          if (raw.trim()) consume(raw);
        }

        await finalise();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // User pressed stop: keep whatever streamed so far and save it.
          await finalise();
          return;
        }
        console.error("Chat error:", error);
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        toast.error(
          offline
            ? "You appear to be offline. Check your connection and retry."
            : error instanceof Error
              ? error.message
              : "Something went wrong. Please try again."
        );
        setFailedMessage(retryPrompt);
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [mode, projectId, documentIds, persist, onRememberFacts]
  );

  /** Multi-step research: plan, gather sources, answer with citations. */
  const runResearch = useCallback(
    async (question: string, targetConversationId?: string) => {
      setFailedMessage(null);
      let activeConversationId = targetConversationId ?? conversationId;
      if (!activeConversationId) {
        activeConversationId = await onCreateConversation(question);
        if (!activeConversationId) return;
      }

      const userMessage: Message = {
        id: `local-${Date.now()}`,
        role: "user",
        content: question,
        createdAt: new Date().toISOString(),
      };
      const history = [...messagesRef.current, userMessage];
      setMessages(history);
      await persist(activeConversationId, "user", question, userMessage.id);

      setIsResearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("research", {
          body: {
            question,
            projectId: projectId ?? null,
            documentIds: documentIds ?? [],
          },
        });

        const answer = (data as { answer?: string } | null)?.answer;
        if (error || !answer) {
          const message =
            (data as { error?: string } | null)?.error ??
            error?.message ??
            "The research run failed. Please try again.";
          toast.error(message);
          setFailedMessage(question);
          return;
        }

        const localId = `local-${Date.now() + 1}`;
        setMessages((prev) => [
          ...prev,
          { id: localId, role: "assistant", content: answer, createdAt: new Date().toISOString() },
        ]);
        await persist(activeConversationId, "assistant", answer, localId);
      } catch (err) {
        console.error("Research error:", err);
        toast.error("The research run failed. Please try again.");
        setFailedMessage(question);
      } finally {
        setIsResearching(false);
      }
    },
    [conversationId, documentIds, onCreateConversation, persist, projectId]
  );

  const sendMessage = useCallback(
    async (content: string, options: SendOptions & { conversationIdOverride?: string } = {}) => {
      const { image, imageIntent = "ask", research, conversationIdOverride } = options;

      if (content.length > MAX_MESSAGE_LENGTH) {
        toast.error(
          `Message too long. Please keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`
        );
        return;
      }

      if (image && imageIntent === "edit") {
        await sendImageEdit(content.trim(), image, conversationIdOverride);
        return;
      }
      if (!content.trim() && !image) return;

      if (research && !image) {
        await runResearch(content.trim(), conversationIdOverride);
        return;
      }

      setFailedMessage(null);
      let activeConversationId = conversationIdOverride ?? conversationId;
      if (!activeConversationId) {
        activeConversationId = await onCreateConversation(content);
        if (!activeConversationId) return;
      }

      // An image the user wants to talk about is stored for the transcript and
      // also sent inline so the model can actually look at it.
      let displayContent = content;
      const inlineImages: string[] = [];
      if (image && userId) {
        setIsStreaming(true);
        try {
          const [path, dataUrl] = await Promise.all([
            uploadChatImage(image, userId),
            fileToDataUrl(image),
          ]);
          if (path) displayContent = `${imageMarker(path)}\n${content}`;
          inlineImages.push(dataUrl);
        } catch (err) {
          console.error("Image attach failed:", err);
          toast.error("Could not attach that image. Please try again.");
          setIsStreaming(false);
          return;
        }
      }

      const userMessage: Message = {
        id: `local-${Date.now()}`,
        role: "user",
        content: displayContent,
        createdAt: new Date().toISOString(),
      };

      const history = [...messagesRef.current, userMessage];
      setMessages(history);
      await persist(activeConversationId, "user", displayContent, userMessage.id);
      await runCompletion(history, activeConversationId, content, inlineImages);
    },
    [
      conversationId,
      onCreateConversation,
      persist,
      runCompletion,
      runResearch,
      sendImageEdit,
      userId,
    ]
  );

  /** Stop the current generation, keeping the partial answer. */
  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Discard the last assistant reply and generate a fresh one. */
  const regenerate = useCallback(async () => {
    if (isStreaming || !conversationId) return;
    const current = messagesRef.current;
    const lastAssistantIndex = current.map((m) => m.role).lastIndexOf("assistant");
    if (lastAssistantIndex === -1) return;

    const last = current[lastAssistantIndex];
    if (!last.id.startsWith("local-") && onDeleteMessage) {
      const ok = await onDeleteMessage(last.id);
      if (!ok) return;
    }

    const trimmed = current.slice(0, lastAssistantIndex);
    setMessages(trimmed);
    messagesRef.current = trimmed;
    const lastUser = [...trimmed].reverse().find((m) => m.role === "user");
    await runCompletion(trimmed, conversationId, lastUser?.content ?? "");
  }, [conversationId, isStreaming, onDeleteMessage, runCompletion]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setFailedMessage(null);
  }, []);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!messageId.startsWith("local-") && onDeleteMessage) {
        const ok = await onDeleteMessage(messageId);
        if (!ok) return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      toast.success("Message deleted");
    },
    [onDeleteMessage]
  );

  const retryLast = useCallback(() => {
    if (failedMessage) void sendMessage(failedMessage);
  }, [failedMessage, sendMessage]);

  return {
    messages,
    isStreaming,
    isResearching,
    busy: isStreaming || isResearching,
    sendMessage,
    deleteMessage,
    stopGeneration,
    regenerate,
    clearMessages,
    rateLimit,
    retryLast,
    canRetry: failedMessage !== null && !rateLimit.isLimited,
  };
};
