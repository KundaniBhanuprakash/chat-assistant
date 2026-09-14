/**
 * Client-side view of the assistant's capability modes.
 *
 * The client only ever sends a mode name — the server decides which provider
 * and model actually serves the request. Keep this list in sync with
 * supabase/functions/_shared/models.ts.
 */

export type ChatMode =
  | "auto"
  | "fast"
  | "reasoning"
  | "creative"
  | "coding"
  | "vision"
  | "research";

export interface ModeOption {
  id: ChatMode;
  label: string;
  description: string;
}

export const MODE_OPTIONS: ModeOption[] = [
  {
    id: "auto",
    label: "Context Talk Auto",
    description: "Picks the right model for each question",
  },
  { id: "fast", label: "Fast", description: "Quick answers for everyday questions" },
  { id: "reasoning", label: "Reasoning", description: "Careful, step-by-step thinking" },
  { id: "creative", label: "Creative", description: "Writing, ideas and brainstorming" },
  { id: "coding", label: "Coding", description: "Code, debugging and reviews" },
  { id: "vision", label: "Vision", description: "Understanding images and screenshots" },
  { id: "research", label: "Research", description: "Long, well-structured answers" },
];

const STORAGE_KEY = "cta.chat.mode";

export const isChatMode = (value: unknown): value is ChatMode =>
  typeof value === "string" && MODE_OPTIONS.some((m) => m.id === value);

export const loadPreferredMode = (): ChatMode => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isChatMode(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
};

export const savePreferredMode = (mode: ChatMode) => {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* storage unavailable — preference simply isn't remembered */
  }
};

export const modeLabel = (mode: ChatMode) =>
  MODE_OPTIONS.find((m) => m.id === mode)?.label ?? "Context Talk Auto";
