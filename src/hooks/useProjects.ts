import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface Project {
  id: string;
  name: string;
  instructions: string;
  created_at: string;
  updated_at: string;
}

const STORAGE_KEY = "cta.project";

export const useProjects = (userId: string | undefined) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("Could not load projects:", error.message);
      return;
    }
    setProjects((data ?? []) as Project[]);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectProject = useCallback((id: string | null) => {
    setCurrentProjectId(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const createProject = useCallback(
    async (name: string) => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: userId, name: name.trim().slice(0, 80) || "Untitled project" })
        .select()
        .single();
      if (error || !data) {
        toast.error("Could not create that project");
        return null;
      }
      setProjects((prev) => [data as Project, ...prev]);
      selectProject(data.id);
      toast.success(`Project "${data.name}" created`);
      return data as Project;
    },
    [userId, selectProject]
  );

  const updateProject = useCallback(async (id: string, patch: Partial<Project>) => {
    const { data, error } = await supabase
      .from("projects")
      .update({ name: patch.name, instructions: patch.instructions })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      toast.error("Could not save the project");
      return;
    }
    setProjects((prev) => prev.map((p) => (p.id === id ? (data as Project) : p)));
    toast.success("Project saved");
  }, []);

  const deleteProject = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) {
        toast.error("Could not delete that project");
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setCurrentProjectId((prev) => (prev === id ? null : prev));
      toast.success("Project deleted. Its conversations were kept.");
    },
    []
  );

  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;

  return {
    projects,
    currentProjectId: currentProject ? currentProjectId : null,
    currentProject,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    refreshProjects: refresh,
  };
};
