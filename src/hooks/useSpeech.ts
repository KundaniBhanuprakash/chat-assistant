import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { speak } from "@/lib/voice/speech";

/** One reply plays at a time; starting another stops the current one. */
export const useSpeech = () => {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setSpeakingId(null);
  }, []);

  const play = useCallback(
    async (id: string, content: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setSpeakingId(id);
      try {
        await speak(content, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error(error instanceof Error ? error.message : "Read aloud failed.");
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setSpeakingId(null);
        }
      }
    },
    []
  );

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { speakingId, play, stop };
};
