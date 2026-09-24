import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface Memory {
  id: string;
  content: string;
  source: string;
  created_at: string;
}

export interface UserSettings {
  custom_instructions: string;
  memory_enabled: boolean;
}

const DEFAULTS: UserSettings = { custom_instructions: "", memory_enabled: true };

/** Standing instructions plus the facts the assistant remembers about you. */
export const useUserSettings = (userId: string | undefined) => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [{ data: row }, { data: memoryRows }] = await Promise.all([
      supabase
        .from("user_settings")
        .select("custom_instructions, memory_enabled")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_memories")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setSettings(row ? { ...DEFAULTS, ...row } : DEFAULTS);
    setMemories((memoryRows ?? []) as Memory[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      if (!userId) return;
      const next = { ...settings, ...patch };
      setSettings(next);
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: userId, ...next }, { onConflict: "user_id" });
      if (error) {
        console.error("Could not save settings:", error.message);
        toast.error("Could not save your settings");
        return;
      }
      toast.success("Settings saved");
    },
    [userId, settings]
  );

  const addMemory = useCallback(
    async (content: string, source = "manual") => {
      const text = content.trim().slice(0, 300);
      if (!userId || !text) return;
      const { data, error } = await supabase
        .from("user_memories")
        .insert({ user_id: userId, content: text, source })
        .select()
        .single();
      if (error || !data) {
        toast.error("Could not save that memory");
        return;
      }
      setMemories((prev) => [data as Memory, ...prev]);
      if (source === "manual") toast.success("Saved to memory");
    },
    [userId]
  );

  const deleteMemory = useCallback(async (id: string) => {
    const { error } = await supabase.from("user_memories").delete().eq("id", id);
    if (error) {
      toast.error("Could not remove that memory");
      return;
    }
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearMemories = useCallback(async () => {
    if (!userId) return;
    const { error } = await supabase.from("user_memories").delete().eq("user_id", userId);
    if (error) {
      toast.error("Could not clear your memories");
      return;
    }
    setMemories([]);
    toast.success("Memory cleared");
  }, [userId]);

  return {
    settings,
    memories,
    loading,
    saveSettings,
    addMemory,
    deleteMemory,
    clearMemories,
    refreshSettings: refresh,
  };
};
