import { useEffect, useRef, useState } from "react";
import { Send, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MAX_IMAGE_BYTES } from "@/lib/chatImages";

interface ChatInputProps {
  onSend: (message: string, image?: File) => void;
  disabled?: boolean;
}

const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image is too large (max 8MB).");
      return;
    }
    setImage(file);
  };

  const clearImage = () => {
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    const value = input.trim();
    // Guard against duplicate submits (double tap / Enter + click).
    if ((!value && !image) || disabled || submittingRef.current) return;
    if (image && !value) {
      toast.error("Describe the edit you want for this image.");
      return;
    }
    submittingRef.current = true;
    onSend(value, image ?? undefined);
    setInput("");
    clearImage();
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
        {preview && (
          <div className="flex items-center gap-2 px-2 pt-2 pb-1">
            <img
              src={preview}
              alt="Selected image preview"
              className="h-14 w-14 rounded-lg object-cover border border-border/60"
            />
            <span className="flex-1 truncate text-xs text-muted-foreground">
              Describe how you'd like this image edited
            </span>
            <button
              type="button"
              onClick={clearImage}
              aria-label="Remove selected image"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Message
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pickImage(e.target.files?.[0])}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Attach an image to edit"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground"
          >
            <ImagePlus className="w-5 h-5" />
          </Button>
          <Textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={image ? "e.g. make the background a sunset..." : "Type your message..."}
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
            disabled={(!input.trim() && !image) || disabled}
            className="h-11 w-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <p className="hidden sm:block text-xs text-muted-foreground/70 text-center mt-2">
        Press Enter to send, Shift + Enter for new line — attach an image to edit it with AI
      </p>
    </form>
  );
};

export default ChatInput;
