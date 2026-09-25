import { useEffect, useRef, useState } from "react";
import { Send, ImagePlus, X, Square, Paperclip, FileText, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MAX_IMAGE_BYTES } from "@/lib/chatImages";
import ModelSelector from "./ModelSelector";
import type { ChatMode } from "@/lib/models";
import type { StoredDocument } from "@/lib/documents";
import { cn } from "@/lib/utils";

export type ImageIntent = "ask" | "edit";

export interface SendOptions {
  image?: File;
  imageIntent?: ImageIntent;
  research?: boolean;
}

interface ChatInputProps {
  onSend: (message: string, options?: SendOptions) => void;
  disabled?: boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  isStreaming?: boolean;
  onStop?: () => void;
  documents?: StoredDocument[];
  onAttachDocument?: (file: File) => void;
  onRemoveDocument?: (id: string) => void;
  uploadingDocument?: boolean;
  researchAvailable?: boolean;
  webSearchAvailable?: boolean;
}

const ChatInput = ({
  onSend,
  disabled,
  mode,
  onModeChange,
  isStreaming,
  onStop,
  documents = [],
  onAttachDocument,
  onRemoveDocument,
  uploadingDocument,
  researchAvailable,
  webSearchAvailable,
}: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imageIntent, setImageIntent] = useState<ImageIntent>("ask");
  const [preview, setPreview] = useState<string | null>(null);
  const [research, setResearch] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
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
    setImageIntent("ask");
  };

  const clearImage = () => {
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    const value = input.trim();
    // Guard against duplicate submits (double tap / Enter + click).
    if ((!value && !image) || disabled || submittingRef.current) return;
    if (image && imageIntent === "edit" && !value) {
      toast.error("Describe the edit you want for this image.");
      return;
    }
    submittingRef.current = true;
    onSend(value || "What's in this image?", {
      image: image ?? undefined,
      imageIntent,
      research,
    });
    setInput("");
    clearImage();
    setResearch(false);
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

  const placeholder = research
    ? "What should I research?"
    : image
      ? imageIntent === "edit"
        ? "e.g. make the background a sunset..."
        : "Ask anything about this image..."
      : documents.length
        ? "Ask about your documents..."
        : "Type your message...";

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="glass rounded-2xl p-1.5 shadow-lg">
        {documents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2 pt-2">
            {documents.map((doc) => (
              <span
                key={doc.id}
                className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground"
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate">{doc.name}</span>
                {onRemoveDocument && (
                  <button
                    type="button"
                    onClick={() => onRemoveDocument(doc.id)}
                    aria-label={`Remove ${doc.name}`}
                    className="text-muted-foreground/70 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {preview && (
          <div className="flex items-center gap-2 px-2 pt-2 pb-1">
            <img
              src={preview}
              alt="Selected image preview"
              className="h-14 w-14 rounded-lg object-cover border border-border/60"
            />
            <div className="flex-1 min-w-0">
              <div
                role="radiogroup"
                aria-label="What to do with this image"
                className="inline-flex rounded-lg border border-border/60 p-0.5"
              >
                {(["ask", "edit"] as ImageIntent[]).map((intent) => (
                  <button
                    key={intent}
                    type="button"
                    role="radio"
                    aria-checked={imageIntent === intent}
                    onClick={() => setImageIntent(intent)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs transition-colors",
                      imageIntent === intent
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {intent === "ask" ? "Ask about it" : "Edit it"}
                  </button>
                ))}
              </div>
            </div>
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

        <div className="flex items-end gap-1">
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
          <input
            ref={docRef}
            type="file"
            accept=".pdf,.txt,.md,.markdown,.csv,.tsv,.json,.log,.html,.xml,.yml,.yaml,text/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && onAttachDocument) onAttachDocument(file);
              if (docRef.current) docRef.current.value = "";
            }}
          />
          {onAttachDocument && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Attach a document"
              disabled={disabled || uploadingDocument}
              onClick={() => docRef.current?.click()}
              className="h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground"
            >
              {uploadingDocument ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Attach an image"
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
            placeholder={placeholder}
            disabled={disabled}
            enterKeyHint="enter"
            autoComplete="off"
            className="min-h-[52px] max-h-[160px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base sm:text-sm placeholder:text-muted-foreground/60"
            rows={1}
          />
          {isStreaming && onStop ? (
            <Button
              type="button"
              size="icon"
              onClick={onStop}
              aria-label="Stop generating"
              className="h-11 w-11 rounded-xl bg-secondary text-foreground hover:bg-secondary/80"
            >
              <Square className="w-4 h-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              aria-label="Send message"
              disabled={(!input.trim() && !image) || disabled}
              className="h-11 w-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <ModelSelector value={mode} onChange={onModeChange} disabled={isStreaming} />
          {researchAvailable && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={research}
              onClick={() => setResearch((prev) => !prev)}
              disabled={isStreaming}
              className={cn(
                "h-9 gap-1.5 rounded-lg px-2.5 text-xs",
                research
                  ? "bg-primary/15 text-primary hover:bg-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              Research
            </Button>
          )}
        </div>
      </div>
      <p className="hidden sm:block text-xs text-muted-foreground/70 text-center mt-2">
        {research
          ? webSearchAvailable
            ? "Research runs multiple searches and answers with sources"
            : "Research will read your attached documents and answer with citations"
          : "Enter to send, Shift + Enter for a new line — attach documents or images for context"}
      </p>
    </form>
  );
};

export default ChatInput;
