import { cn } from "@/lib/utils";
import { Bot, User, ThumbsUp, ThumbsDown, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

type Reaction = "up" | "down" | null;

const ChatMessage = ({ role, content }: ChatMessageProps) => {
  const isUser = role === "user";
  const [reaction, setReaction] = useState<Reaction>(null);
  const [copied, setCopied] = useState(false);

  const handleReaction = (type: "up" | "down") => {
    setReaction(prev => prev === type ? null : type);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div
      className={cn(
        "flex gap-3 animate-fade-in group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary border border-border"
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className="flex flex-col gap-1">
        <div
          className={cn(
            "message-bubble",
            isUser ? "message-user" : "message-assistant"
          )}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
        {!isUser && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopy}
              className={cn(
                "p-1.5 rounded-md transition-all duration-200",
                copied
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              aria-label="Copy to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => handleReaction("up")}
              className={cn(
                "p-1.5 rounded-md transition-all duration-200",
                reaction === "up"
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              aria-label="Thumbs up"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleReaction("down")}
              className={cn(
                "p-1.5 rounded-md transition-all duration-200",
                reaction === "down"
                  ? "bg-destructive/20 text-destructive"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              aria-label="Thumbs down"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
