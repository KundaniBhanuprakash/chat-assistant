import { useEffect, useState } from "react";
import { Brain, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Memory, UserSettings } from "@/hooks/useUserSettings";
import type { Project } from "@/hooks/useProjects";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: UserSettings;
  memories: Memory[];
  onSaveSettings: (patch: Partial<UserSettings>) => void;
  onAddMemory: (content: string) => void;
  onDeleteMemory: (id: string) => void;
  onClearMemories: () => void;
  projects: Project[];
  currentProject: Project | null;
  onUpdateProject: (id: string, patch: Partial<Project>) => void;
  onDeleteProject: (id: string) => void;
}

const SettingsDialog = ({
  open,
  onOpenChange,
  settings,
  memories,
  onSaveSettings,
  onAddMemory,
  onDeleteMemory,
  onClearMemories,
  projects,
  currentProject,
  onUpdateProject,
  onDeleteProject,
}: SettingsDialogProps) => {
  const [instructions, setInstructions] = useState(settings.custom_instructions);
  const [newMemory, setNewMemory] = useState("");
  const [projectInstructions, setProjectInstructions] = useState(
    currentProject?.instructions ?? ""
  );

  useEffect(() => {
    setInstructions(settings.custom_instructions);
  }, [settings.custom_instructions, open]);

  useEffect(() => {
    setProjectInstructions(currentProject?.instructions ?? "");
  }, [currentProject, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Tell the assistant how you like to work, and manage what it remembers.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="instructions">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="project">Project</TabsTrigger>
          </TabsList>

          <TabsContent value="instructions" className="space-y-3 pt-4">
            <Label htmlFor="custom-instructions">
              How should the assistant respond? These apply to every conversation.
            </Label>
            <Textarea
              id="custom-instructions"
              value={instructions}
              maxLength={2000}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. I'm a product designer. Keep answers short and practical, and use British English."
              className="min-h-[140px]"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {instructions.length}/2000 characters
              </span>
              <Button
                className="min-h-11"
                onClick={() => onSaveSettings({ custom_instructions: instructions })}
              >
                Save
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="memory" className="space-y-3 pt-4">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div className="pr-4">
                <Label htmlFor="memory-toggle" className="text-sm">
                  Remember things about me
                </Label>
                <p className="text-xs text-muted-foreground">
                  The assistant saves useful facts and uses them in later chats.
                </p>
              </div>
              <Switch
                id="memory-toggle"
                checked={settings.memory_enabled}
                onCheckedChange={(checked) => onSaveSettings({ memory_enabled: checked })}
              />
            </div>

            <div className="flex gap-2">
              <Input
                value={newMemory}
                maxLength={300}
                onChange={(e) => setNewMemory(e.target.value)}
                placeholder="Add something to remember..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newMemory.trim()) {
                    e.preventDefault();
                    onAddMemory(newMemory);
                    setNewMemory("");
                  }
                }}
              />
              <Button
                variant="secondary"
                className="min-h-11"
                disabled={!newMemory.trim()}
                onClick={() => {
                  onAddMemory(newMemory);
                  setNewMemory("");
                }}
              >
                Add
              </Button>
            </div>

            <ScrollArea className="h-56 rounded-lg border border-border/60 p-2">
              {memories.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing remembered yet.
                </p>
              ) : (
                <ul className="space-y-1">
                  {memories.map((memory) => (
                    <li
                      key={memory.id}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                    >
                      <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-sm">{memory.content}</span>
                      <button
                        type="button"
                        onClick={() => onDeleteMemory(memory.id)}
                        aria-label={`Forget: ${memory.content}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>

            {memories.length > 0 && (
              <Button variant="ghost" className="min-h-11 text-destructive" onClick={onClearMemories}>
                <Trash2 className="mr-2 h-4 w-4" />
                Forget everything
              </Button>
            )}
          </TabsContent>

          <TabsContent value="project" className="space-y-3 pt-4">
            {!currentProject ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {projects.length
                  ? "Choose a project in the sidebar to edit its instructions."
                  : "Create a project in the sidebar to group chats and documents together."}
              </p>
            ) : (
              <>
                <Label htmlFor="project-instructions">
                  Instructions for "{currentProject.name}"
                </Label>
                <Textarea
                  id="project-instructions"
                  value={projectInstructions}
                  maxLength={2000}
                  onChange={(e) => setProjectInstructions(e.target.value)}
                  placeholder="e.g. This project is a mobile banking app. Always consider accessibility."
                  className="min-h-[140px]"
                />
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    className="min-h-11 text-destructive"
                    onClick={() => {
                      onDeleteProject(currentProject.id);
                      onOpenChange(false);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete project
                  </Button>
                  <Button
                    className="min-h-11"
                    onClick={() =>
                      onUpdateProject(currentProject.id, { instructions: projectInstructions })
                    }
                  >
                    Save
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
