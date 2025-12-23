import { useState, useRef, useEffect } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import TypingIndicator from "./TypingIndicator";
import WelcomeScreen from "./WelcomeScreen";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const mockResponses = [
  "That's a great question! Let me think about that for a moment. Based on my understanding, I can provide you with a comprehensive answer.",
  "I'd be happy to help you with that. Here's what I know about this topic, broken down into clear points for better understanding.",
  "Interesting! Let me explain this in a way that's easy to follow. There are several key aspects to consider here.",
  "Thanks for asking! This is a topic I can definitely help with. Let me share some insights that might be useful for you.",
];

const ChatContainer = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);

    // Simulate AI response delay
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 1500)
    );

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: mockResponses[Math.floor(Math.random() * mockResponses.length)],
    };

    setIsTyping(false);
    setMessages((prev) => [...prev, assistantMessage]);
  };

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
          <WelcomeScreen onPromptClick={handleSendMessage} />
        ) : (
          <div className="space-y-6">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
              />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="flex-shrink-0 p-4 border-t border-border/50">
        <ChatInput onSend={handleSendMessage} disabled={isTyping} />
      </footer>
    </div>
  );
};

export default ChatContainer;
