import { useRef, useEffect, useState, useCallback } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import TypingIndicator from "./TypingIndicator";
import WelcomeScreen from "./WelcomeScreen";
import ChatSidebar from "./ChatSidebar";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { useConversations } from "@/hooks/useConversations";
import { useAuth } from "@/hooks/useAuth";
import { Menu, X } from "lucide-react";
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

  const { messages, isStreaming, sendMessage, clearMessages } = useStreamingChat({
    conversationId: currentConversationId,
    onCreateConversation: createConversation,
    onSaveMessage: saveMessage,
    initialMessages: loadedMessages,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Load messages when conversation changes
  useEffect(() => {
    const loadConversationMessages = async () => {
      if (currentConversationId) {
        const msgs = await loadMessages(currentConversationId);
        setLoadedMessages(msgs);
      } else {
        setLoadedMessages([]);
      }
    };
    loadConversationMessages();
  }, [currentConversationId, loadMessages]);

  const handleNewChat = useCallback(() => {
    startNewChat();
    clearMessages();
    setLoadedMessages([]);
    if (isMobile) setSidebarOpen(false);
  }, [startNewChat, clearMessages, isMobile]);

  const handleSelectConversation = useCallback((id: string) => {
    selectConversation(id);
    if (isMobile) setSidebarOpen(false);
  }, [selectConversation, isMobile]);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      {sidebarOpen && (
        <>
          {isMobile && (
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setSidebarOpen(false)}
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
      <div className="flex-1 flex flex-col h-screen max-w-4xl mx-auto w-full">
        {/* Header */}
        <header className="flex-shrink-0 py-4 px-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-muted-foreground hover:text-foreground"
            >
              {sidebarOpen && isMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            <h1 className="text-lg font-medium text-foreground">AI Assistant</h1>
          </div>
        </header>

        {/* Messages Area */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <WelcomeScreen onPromptClick={sendMessage} />
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                />
              ))}
              {isStreaming && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input Area */}
        <footer className="flex-shrink-0 p-4 border-t border-border/50">
          <ChatInput onSend={sendMessage} disabled={isStreaming} />
        </footer>
      </div>
    </div>
  );
};

export default ChatContainer;
