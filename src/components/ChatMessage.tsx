import { cn } from "@/lib/utils";
import { Bot, User, ThumbsUp, ThumbsDown, Copy, Check, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import StoredImage from "./StoredImage";
import { IMAGE_MARKER_REGEX } from "@/lib/chatImages";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  onDelete?: () => void;
}

type Reaction = "up" | "down" | null;

type Block =
  | { type: "text"; value: string }
  | { type: "code"; value: string; lang?: string }
  | { type: "image"; value: string };

/** Split content into image markers, plain text and fenced code blocks (no extra deps). */
const parseBlocks = (content: string): Block[] => {
  const blocks: Block[] = [];
  const fence = /```([a-zA-Z0-9+#-]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  const pushText = (value: string) => {
    const images = /\[\[image:([^\]]+)\]\]/g;
    let cursor = 0;
    let m: RegExpExecArray | null;
    while ((m = images.exec(value)) !== null) {
      if (m.index > cursor) blocks.push({ type: "text", value: value.slice(cursor, m.index) });
      blocks.push({ type: "image", value: m[1] });
      cursor = images.lastIndex;
    }
    if (cursor < value.length) blocks.push({ type: "text", value: value.slice(cursor) });
  };

  while ((match = fence.exec(content)) !== null) {
    if (match.index > last) pushText(content.slice(last, match.index));
    blocks.push({ type: "code", value: match[2] ?? "", lang: match[1] || undefined });
    last = fence.lastIndex;
  }
  if (last < content.length) pushText(content.slice(last));
  return blocks.filter((b) => b.type !== "text" || b.value.trim().length > 0);
};

/** Text shown when copying: image markers are not useful on the clipboard. */
const plainText = (content: string) => content.replace(IMAGE_MARKER_REGEX, "").trim();


const copyText = async (text: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    return true;
  } catch {
    return false;
  }
};

const CodeBlock = ({ value, lang }: { value: string; lang?: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (await copyText(value)) {
      setCopied(true);
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="relative my-2 rounded-xl border border-border/60 bg-background/60">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code block"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code>{value.replace(/\n$/, "")}</code>
      </pre>
    </div>
  );
};

const ChatMessage = ({ role, content, onDelete }: ChatMessageProps) => {
  const isUser = role === "user";
  const [reaction, setReaction] = useState<Reaction>(null);
  const [copied, setCopied] = useState(false);
  const blocks = useMemo(() => parseBlocks(content), [content]);

  const handleReaction = (type: "up" | "down") => {
    setReaction((prev) => (prev === type ? null : type));
  };

  const handleCopy = async () => {
    if (await copyText(plainText(content))) {

      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy");
    }
  };

  return (
    <div
      className={cn(
        "flex gap-2 sm:gap-3 animate-fade-in group",
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
        aria-hidden="true"
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={cn("flex min-w-0 flex-col gap-1", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "message-bubble min-w-0 overflow-hidden",
            isUser ? "message-user" : "message-assistant"
          )}
        >
          <span className="sr-only">{isUser ? "You said:" : "Assistant said:"}</span>
          {blocks.map((block, i) =>
            block.type === "code" ? (
              <CodeBlock key={i} value={block.value} lang={block.lang} />
            ) : block.type === "image" ? (
              <StoredImage
                key={i}
                path={block.value}
                alt={isUser ? "Image you shared" : "Edited image"}
              />
            ) : (
              <p
                key={i}
                className="text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
              >
                {block.value.replace(/^\n+|\n+$/g, "")}
              </p>
            )
          )}
        </div>
        <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200">
          {!isUser && (
            <>
              <button
                onClick={handleCopy}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  copied
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                aria-label="Copy message to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => handleReaction("up")}
                aria-pressed={reaction === "up"}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  reaction === "up"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                aria-label="Mark response as helpful"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleReaction("down")}
                aria-pressed={reaction === "down"}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  reaction === "down"
                    ? "bg-destructive/20 text-destructive"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                aria-label="Mark response as not helpful"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-destructive/20 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Delete this message"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default ChatMessage;
