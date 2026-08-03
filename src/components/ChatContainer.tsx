import { useRef, useEffect, useState, useCallback } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import TypingIndicator from "./TypingIndicator";
import WelcomeScreen from "./WelcomeScreen";
import ChatSidebar from "./ChatSidebar";
import RateLimitBanner from "./RateLimitBanner";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { useConversations } from "@/hooks/useConversations";
import { useAuth } from "@/hooks/useAuth";
import { Menu, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const ChatContainer = () => {
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [loadedMessages, setLoadedMessages] = useState<Message[]>([]);

  const {
    conversations,
    currentConversationId,
    loading: conversationsLoading,
    createConversation,
    loadMessages,
    saveMessage,
    deleteConversation,
    selectConversation,
    startNewChat,
  } = useConversations(user?.id);

  const { messages, isStreaming, sendMessage, clearMessages, rateLimit, retryLast, canRetry } =
    useStreamingChat({
      conversationId: currentConversationId,
      onCreateConversation: createConversation,
      onSaveMessage: saveMessage,
      initialMessages: loadedMessages,
    });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  // Keep the latest message visible when the mobile keyboard opens/resizes.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => scrollToBottom();
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [scrollToBottom]);

  // Load messages when conversation changes
  useEffect(() => {
    let cancelled = false;
    const loadConversationMessages = async () => {
      if (currentConversationId) {
        const msgs = await loadMessages(currentConversationId);
        if (!cancelled) setLoadedMessages(msgs);
      } else if (!cancelled) {
        setLoadedMessages([]);
      }
    };
    loadConversationMessages();
    return () => {
      cancelled = true;
    };
  }, [currentConversationId, loadMessages]);

  const handleNewChat = useCallback(() => {
    startNewChat();
    clearMessages();
    setLoadedMessages([]);
    if (isMobile) setSidebarOpen(false);
  }, [startNewChat, clearMessages, isMobile]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      selectConversation(id);
      if (isMobile) setSidebarOpen(false);
    },
    [selectConversation, isMobile]
  );

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <>
          {isMobile && (
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          <div className={isMobile ? "fixed left-0 top-0 z-50" : ""}>
            <ChatSidebar
              conversations={conversations}
              currentConversationId={currentConversationId}
              loading={conversationsLoading}
              onSelectConversation={handleSelectConversation}
              onNewChat={handleNewChat}
              onDeleteConversation={deleteConversation}
              onSignOut={handleSignOut}
              userEmail={user?.email}
            />
          </div>
        </>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 min-w-0 flex flex-col h-dvh max-w-4xl mx-auto w-full">
        {/* Header */}
        <header className="flex-shrink-0 py-3 px-3 sm:px-4 border-b border-border/50 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? "Hide conversations" : "Show conversations"}
              aria-expanded={sidebarOpen}
              className="min-h-11 min-w-11 text-muted-foreground hover:text-foreground"
            >
              {sidebarOpen && isMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" aria-hidden="true" />
            <h1 className="text-lg font-medium text-foreground truncate">AI Assistant</h1>
          </div>
        </header>

        {/* Messages Area */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 py-6"
          aria-live="polite"
          aria-busy={isStreaming}
        >
          {messages.length === 0 ? (
            <WelcomeScreen onPromptClick={sendMessage} />
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <ChatMessage key={message.id} role={message.role} content={message.content} />
              ))}
              {isStreaming && <TypingIndicator />}
              {canRetry && !isStreaming && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={retryLast}
                    className="min-h-11 gap-2"
                    aria-label="Retry sending the last message"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry last message
                  </Button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Rate Limit Banner */}
        {rateLimit.isLimited && <RateLimitBanner retryAfter={rateLimit.retryAfter} />}

        {/* Input Area */}
        <footer className="flex-shrink-0 p-3 sm:p-4 border-t border-border/50 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ChatInput onSend={sendMessage} disabled={isStreaming || rateLimit.isLimited} />
        </footer>
      </div>
    </div>
  );
};

export default ChatContainer;
