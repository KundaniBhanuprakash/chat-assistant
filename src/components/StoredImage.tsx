import { useEffect, useState } from "react";
import { Download, ImageOff, Loader2 } from "lucide-react";
import { getChatImageUrl } from "@/lib/chatImages";

interface StoredImageProps {
  path: string;
  alt?: string;
}

const StoredImage = ({ path, alt = "Image" }: StoredImageProps) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    getChatImageUrl(path).then((signed) => {
      if (cancelled) return;
      if (signed) setUrl(signed);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" />
        Image unavailable
      </div>
    );
  }

  if (!url) {
    return (
      <div className="my-2 flex h-40 w-full max-w-xs items-center justify-center rounded-xl border border-border/60 bg-background/40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading image</span>
      </div>
    );
  }

  return (
    <figure className="my-2">
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="max-h-80 w-auto max-w-full rounded-xl border border-border/60"
      />
      <figcaption className="mt-1">
        <a
          href={url}
          download
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3 w-3" />
          Download
        </a>
      </figcaption>
    </figure>
  );
};

export default StoredImage;
