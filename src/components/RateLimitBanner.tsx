import { AlertCircle, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface RateLimitBannerProps {
  retryAfter: number;
}

const RateLimitBanner = ({ retryAfter }: RateLimitBannerProps) => {
  const formatTime = (seconds: number) => {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
    return `${seconds}s`;
  };

  return (
    <Alert variant="destructive" className="mx-4 mb-4 bg-destructive/10 border-destructive/30">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center gap-2">
        <span>Too many requests. Please wait</span>
        <span className="inline-flex items-center gap-1 font-mono font-semibold bg-destructive/20 px-2 py-0.5 rounded">
          <Clock className="h-3 w-3" />
          {formatTime(retryAfter)}
        </span>
        <span>before sending another message.</span>
      </AlertDescription>
    </Alert>
  );
};

export default RateLimitBanner;
