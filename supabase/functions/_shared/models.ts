/**
 * Context Talk Agent — model routing layer.
 *
 * The frontend never names a concrete model. It sends a capability "mode"
 * and the server resolves that to a provider + model id. This keeps model
 * choice, provider keys and cost policy entirely server-side, and lets us
 * add providers later without touching the client.
 */

export type ChatMode =
  | "auto"
  | "fast"
  | "reasoning"
  | "creative"
  | "coding"
  | "vision"
  | "research";

export const CHAT_MODES: ChatMode[] = [
  "auto",
  "fast",
  "reasoning",
  "creative",
  "coding",
  "vision",
  "research",
];

export interface ResolvedModel {
  /** Provider key — today only the Lovable AI gateway is wired up. */
  provider: "lovable-gateway";
  /** Exact gateway model id. */
  model: string;
  /** Sampling temperature, or undefined to use the model default. */
  temperature?: number;
  /** Extra system guidance appended for this mode. */
  systemSuffix?: string;
}

const BASE_SYSTEM =
  "You are Context Talk Agent, a helpful, accurate AI assistant. " +
  "Use Markdown. Put code in fenced blocks with a language tag. " +
  "Be clear and direct. If you are unsure or lack current information, say so " +
  "plainly instead of guessing. Never invent sources, citations or data.";

const MODE_MODELS: Record<Exclude<ChatMode, "auto">, ResolvedModel> = {
  fast: {
    provider: "lovable-gateway",
    model: "google/gemini-3.1-flash-lite",
    systemSuffix: "Answer concisely. Prefer short, direct replies.",
  },
  reasoning: {
    provider: "lovable-gateway",
    model: "google/gemini-3.1-pro-preview",
    systemSuffix:
      "Think the problem through carefully and lay out your reasoning in a structured way before the conclusion.",
  },
  creative: {
    provider: "lovable-gateway",
    model: "google/gemini-3.7-flash",
    temperature: 1.0,
    systemSuffix: "Be imaginative and expressive while staying accurate about facts.",
  },
  coding: {
    provider: "lovable-gateway",
    model: "google/gemini-3.5-flash",
    systemSuffix:
      "You are acting as a senior software engineer. Give complete, runnable code with correct imports, " +
      "explain trade-offs briefly, and point out bugs, edge cases and security issues you notice.",
  },
  vision: {
    provider: "lovable-gateway",
    model: "google/gemini-2.5-pro",
    systemSuffix: "Describe precisely what is actually visible. Never guess at unreadable detail.",
  },
  research: {
    provider: "lovable-gateway",
    model: "google/gemini-2.5-pro",
    systemSuffix:
      "Give thorough, well-organised answers with clear structure. State the limits of your knowledge " +
      "and flag anything that would need up-to-date sources to verify.",
  },
};

const CODE_HINTS =
  /\b(code|function|class|bug|error|stack ?trace|compile|refactor|typescript|javascript|python|java\b|c\+\+|c#|golang|rust|sql|regex|api|npm|git|debug|exception|async|component)\b/i;
const REASONING_HINTS =
  /\b(why|prove|analyse|analyze|compare|trade-?off|architecture|design|strategy|step by step|explain in detail|derive|calculate|optimi[sz]e|plan)\b/i;
const CREATIVE_HINTS =
  /\b(write|story|poem|caption|slogan|brainstorm|idea|creative|script|tagline|name ideas)\b/i;

/**
 * Cost-aware automatic routing: cheap model for short/simple turns,
 * stronger models only when the request actually warrants it.
 */
export const routeAuto = (lastUserMessage: string, hasImage: boolean): ChatMode => {
  if (hasImage) return "vision";
  const text = lastUserMessage.trim();
  if (CODE_HINTS.test(text)) return "coding";
  if (REASONING_HINTS.test(text) || text.length > 600) return "reasoning";
  if (CREATIVE_HINTS.test(text)) return "creative";
  if (text.length < 200) return "fast";
  return "fast";
};

export const resolveModel = (
  mode: ChatMode,
  lastUserMessage: string,
  hasImage: boolean
): { mode: Exclude<ChatMode, "auto">; resolved: ResolvedModel } => {
  const effective = mode === "auto" ? routeAuto(lastUserMessage, hasImage) : mode;
  return { mode: effective, resolved: MODE_MODELS[effective] };
};

export const buildSystemPrompt = (resolved: ResolvedModel, customInstructions?: string) => {
  const parts = [BASE_SYSTEM];
  if (resolved.systemSuffix) parts.push(resolved.systemSuffix);
  if (customInstructions && customInstructions.trim()) {
    parts.push(
      "The user has provided these standing preferences. Follow them unless they conflict with " +
        `safety or accuracy:\n${customInstructions.trim().slice(0, 2000)}`
    );
  }
  return parts.join("\n\n");
};

export const isChatMode = (value: unknown): value is ChatMode =>
  typeof value === "string" && (CHAT_MODES as string[]).includes(value);
