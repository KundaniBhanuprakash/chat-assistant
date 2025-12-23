import { useRef, useEffect } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import TypingIndicator from "./TypingIndicator";
import WelcomeScreen from "./WelcomeScreen";
import { useStreamingChat } from "@/hooks/useStreamingChat";

const ChatContainer = () => {
  const { messages, isStreaming, sendMessage } = useStreamingChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex-shrink-0 py-4 px-4 border-b border-border/50">
        <div className="flex items-center gap-2">
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
  );
};

export default ChatContainer;
