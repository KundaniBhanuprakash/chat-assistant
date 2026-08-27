import { useState } from "react";
import { MessageSquare, Plus, Trash2, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  loading: boolean;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onSignOut: () => void;
  userEmail?: string;
}

const ChatSidebar = ({
  conversations,
  currentConversationId,
  loading,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onSignOut,
  userEmail,
}: ChatSidebarProps) => {
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);

  return (
    <nav
      aria-label="Conversations"
      className="w-[min(16rem,85vw)] h-full min-h-0 flex flex-col bg-sidebar border-r border-sidebar-border pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <Button
          onClick={onNewChat}
          className="w-full min-h-11 bg-primary hover:bg-primary/90 gap-2"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1 px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="sr-only">Loading conversations</span>
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">
            No conversations yet. Start a new chat!
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <div
                  className={cn(
                    "group flex items-center gap-2 pl-3 pr-1 py-1 rounded-lg transition-colors",
                    currentConversationId === conv.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    aria-current={currentConversationId === conv.id ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 min-h-11 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-sm truncate">{conv.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(conv)}
                    aria-label={`Delete conversation ${conv.title}`}
                    className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md hover:bg-destructive/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-8 h-8 flex-shrink-0 rounded-full bg-primary/20 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="text-xs font-medium text-primary">
              {userEmail?.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-xs text-muted-foreground truncate flex-1">{userEmail}</span>
        </div>
        <Button
          variant="ghost"
          onClick={onSignOut}
          className="w-full min-h-11 justify-start gap-2 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title}" and all of its messages will be permanently deleted. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDeleteConversation(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
};

export default ChatSidebar;
