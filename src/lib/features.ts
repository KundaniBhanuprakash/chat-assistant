/**
 * Capability flags.
 *
 * A capability is "available" only when the service it depends on is actually
 * configured on the server. The UI uses this to show an honest
 * "needs configuration" state rather than a button that silently does nothing.
 */

import { supabase } from "@/integrations/supabase/client";

export interface Capabilities {
  chat: boolean;
  imageEdit: boolean;
  imageGeneration: boolean;
  imageUnderstanding: boolean;
  webSearch: boolean;
  deepResearch: boolean;
  voiceInput: boolean;
  voiceOutput: boolean;
  documents: boolean;
  memory: boolean;
  projects: boolean;
  codeExecution: boolean;
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  chat: true,
  imageEdit: true,
  imageGeneration: false,
  imageUnderstanding: true,
  webSearch: false,
  deepResearch: true,
  voiceInput: false,
  voiceOutput: false,
  documents: true,
  memory: true,
  projects: true,
  codeExecution: false,
};

export const fetchCapabilities = async (): Promise<Capabilities> => {
  try {
    const { data, error } = await supabase.functions.invoke("capabilities");
    if (error || !data) return DEFAULT_CAPABILITIES;
    return { ...DEFAULT_CAPABILITIES, ...(data as Partial<Capabilities>) };
  } catch {
    return DEFAULT_CAPABILITIES;
  }
};
