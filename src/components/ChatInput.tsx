import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const submittingRef = useRef(false);

  const submit = () => {
    const value = input.trim();
    // Guard against duplicate submits (double tap / Enter + click).
    if (!value || disabled || submittingRef.current) return;
    submittingRef.current = true;
    onSend(value);
    setInput("");
    window.setTimeout(() => {
      submittingRef.current = false;
    }, 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter sends on desktop; Shift+Enter adds a newline. On touch keyboards
    // Enter always inserts a newline so one-handed typing isn't interrupted.
    const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !isTouch) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="glass rounded-2xl p-1.5 shadow-lg">
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Message
          </label>
          <Textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={disabled}
            enterKeyHint="enter"
            autoComplete="off"
            className="min-h-[52px] max-h-[160px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base sm:text-sm placeholder:text-muted-foreground/60"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={!input.trim() || disabled}
            className="h-11 w-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <p className="hidden sm:block text-xs text-muted-foreground/70 text-center mt-2">
        Press Enter to send, Shift + Enter for new line
      </p>
    </form>
  );
};

export default ChatInput;
