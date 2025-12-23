import { Bot } from "lucide-react";

const TypingIndicator = () => {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-secondary border border-border">
        <Bot className="w-4 h-4" />
      </div>
      <div className="message-bubble message-assistant flex items-center gap-1">
        <span
          className="w-2 h-2 rounded-full bg-muted-foreground animate-typing-dot"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-2 h-2 rounded-full bg-muted-foreground animate-typing-dot"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-2 h-2 rounded-full bg-muted-foreground animate-typing-dot"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
};

export default TypingIndicator;
