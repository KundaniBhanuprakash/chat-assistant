import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import ChatMessage from "./ChatMessage";
import ChatInput, { type SendOptions } from "./ChatInput";
import TypingIndicator from "./TypingIndicator";
import WelcomeScreen from "./WelcomeScreen";
import ChatSidebar from "./ChatSidebar";
import RateLimitBanner from "./RateLimitBanner";
import SettingsDialog from "./SettingsDialog";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { useConversations } from "@/hooks/useConversations";
import { useProjects } from "@/hooks/useProjects";
import { useDocuments } from "@/hooks/useDocuments";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useAuth } from "@/hooks/useAuth";
import { Menu, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { loadPreferredMode, savePreferredMode, modeLabel, type ChatMode } from "@/lib/models";
import { DEFAULT_CAPABILITIES, fetchCapabilities, type Capabilities } from "@/lib/features";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

const ChatContainer = () => {
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadedMessages, setLoadedMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<ChatMode>(() => loadPreferredMode());
  const [capabilities, setCapabilities] = useState<Capabilities>(DEFAULT_CAPABILITIES);

  useEffect(() => {
    let active = true;
    fetchCapabilities().then((caps) => {
      if (active) setCapabilities(caps);
    });
    return () => {
      active = false;
    };
  }, []);

  const {
    projects,
    currentProjectId,
    currentProject,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
  } = useProjects(user?.id);

  const {
    conversations,
    currentConversationId,
    loading: conversationsLoading,
    createConversation,
    createBranch,
    loadMessages,
    saveMessage,
    deleteConversation,
    deleteMessage: deleteMessageRow,
    selectConversation,
    startNewChat,
  } = useConversations(user?.id, currentProjectId);

  const { documents, uploading, addDocument, removeDocument, attachOrphansToConversation } =
    useDocuments(user?.id, currentConversationId, currentProjectId);

  const { settings, memories, saveSettings, addMemory, deleteMemory, clearMemories } =
    useUserSettings(user?.id);

  const documentIds = useMemo(() => documents.map((d) => d.id), [documents]);

  const handleRememberFacts = useCallback(
    (facts: string[]) => {
      if (!settings.memory_enabled) return;
      facts.forEach((fact) => void addMemory(fact, "auto"));
    },
    [addMemory, settings.memory_enabled]
  );

  const handleCreateConversation = useCallback(
    async (firstMessage: string) => {
      const id = await createConversation(firstMessage);
      if (id) await attachOrphansToConversation(id);
      return id;
    },
    [createConversation, attachOrphansToConversation]
  );

  const {
    messages,
    isStreaming,
    isResearching,
    busy,
    sendMessage,
    deleteMessage,
    stopGeneration,
    regenerate,
    clearMessages,
    rateLimit,
    retryLast,
    canRetry,
  } = useStreamingChat({
    conversationId: currentConversationId,
    userId: user?.id,
    mode,
    projectId: currentProjectId,
    documentIds,
    onCreateConversation: handleCreateConversation,
    onSaveMessage: saveMessage,
    onDeleteMessage: deleteMessageRow,
    onRememberFacts: handleRememberFacts,
    initialMessages: loadedMessages,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, busy, scrollToBottom]);

  // Keep the latest message visible when the mobile keyboard opens/resizes.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => scrollToBottom();
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [scrollToBottom]);

  // Load messages when conversation changes
  useEffect(() => {
    let cancelled = false;
    const loadConversationMessages = async () => {
      if (currentConversationId) {
        const msgs = await loadMessages(currentConversationId);
        if (!cancelled) setLoadedMessages(msgs);
      } else if (!cancelled) {
        setLoadedMessages([]);
      }
    };
    loadConversationMessages();
    return () => {
      cancelled = true;
    };
  }, [currentConversationId, loadMessages]);

  const handleModeChange = useCallback((next: ChatMode) => {
    setMode(next);
    savePreferredMode(next);
  }, []);

  const handleNewChat = useCallback(() => {
    startNewChat();
    clearMessages();
    setLoadedMessages([]);
    if (isMobile) setSidebarOpen(false);
  }, [startNewChat, clearMessages, isMobile]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      selectConversation(id);
      if (isMobile) setSidebarOpen(false);
    },
    [selectConversation, isMobile]
  );

  const handleSelectProject = useCallback(
    (id: string | null) => {
      selectProject(id);
      startNewChat();
      clearMessages();
      setLoadedMessages([]);
    },
    [selectProject, startNewChat, clearMessages]
  );

  const handleSend = useCallback(
    (content: string, options?: SendOptions) => {
      void sendMessage(content, options ?? {});
    },
    [sendMessage]
  );

  /**
   * Editing an earlier message copies everything before it into a new
   * conversation, so the original thread stays intact.
   */
  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const index = messages.findIndex((m) => m.id === messageId);
      if (index === -1) return;
      const history = messages.slice(0, index);
      const branchId = await createBranch(history, newContent);
      if (!branchId) return;
      setLoadedMessages(history);
      await sendMessage(newContent, { conversationIdOverride: branchId });
    },
    [messages, createBranch, sendMessage]
  );

  const handleSignOut = async () => {
    await signOut();
  };

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const headerSubtitle = currentProject
    ? `${currentProject.name} · ${modeLabel(mode)}`
    : modeLabel(mode);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <>
          {isMobile && (
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          <div className={isMobile ? "fixed left-0 top-0 h-dvh z-50" : "h-full"}>
            <ChatSidebar
              conversations={conversations}
              currentConversationId={currentConversationId}
              loading={conversationsLoading}
              onSelectConversation={handleSelectConversation}
              onNewChat={handleNewChat}
              onDeleteConversation={deleteConversation}
              onSignOut={handleSignOut}
              userEmail={user?.email}
              projects={projects}
              currentProjectId={currentProjectId}
              onSelectProject={handleSelectProject}
              onCreateProject={(name) => void createProject(name)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full max-w-4xl mx-auto w-full">
        {/* Header */}
        <header className="flex-shrink-0 py-3 px-3 sm:px-4 border-b border-border/50 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? "Hide conversations" : "Show conversations"}
              aria-expanded={sidebarOpen}
              className="min-h-11 min-w-11 text-muted-foreground hover:text-foreground"
            >
              {sidebarOpen && isMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="text-lg font-medium text-foreground truncate leading-tight">
                AI Assistant
              </h1>
              <p className="text-xs text-muted-foreground truncate">{headerSubtitle}</p>
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <main
          ref={messagesContainerRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 py-6"
          aria-live="polite"
          aria-busy={busy}
        >
          {messages.length === 0 ? (
            <WelcomeScreen onPromptClick={(prompt) => handleSend(prompt)} />
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  createdAt={message.createdAt}
                  onDelete={() => void deleteMessage(message.id)}
                  onRegenerate={
                    !busy && message.id === lastAssistantId ? () => void regenerate() : undefined
                  }
                  onEdit={
                    message.role === "user" && !busy
                      ? (content) => void handleEditMessage(message.id, content)
                      : undefined
                  }
                />
              ))}

              {isStreaming && <TypingIndicator />}
              {isResearching && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Researching — planning questions, gathering sources and writing an answer…
                </p>
              )}
              {canRetry && !busy && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={retryLast}
                    className="min-h-11 gap-2"
                    aria-label="Retry sending the last message"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry last message
                  </Button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Rate Limit Banner */}
        {rateLimit.isLimited && <RateLimitBanner retryAfter={rateLimit.retryAfter} />}

        {/* Input Area */}
        <footer className="flex-shrink-0 p-3 sm:p-4 border-t border-border/50 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ChatInput
            onSend={handleSend}
            disabled={busy || rateLimit.isLimited}
            mode={mode}
            onModeChange={handleModeChange}
            isStreaming={isStreaming}
            onStop={stopGeneration}
            documents={documents}
            onAttachDocument={(file) => void addDocument(file)}
            onRemoveDocument={(id) => void removeDocument(id)}
            uploadingDocument={uploading}
            researchAvailable={capabilities.deepResearch}
            webSearchAvailable={capabilities.webSearch}
          />
        </footer>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        memories={memories}
        onSaveSettings={(patch) => void saveSettings(patch)}
        onAddMemory={(content) => void addMemory(content)}
        onDeleteMemory={(id) => void deleteMemory(id)}
        onClearMemories={() => void clearMemories()}
        projects={projects}
        currentProject={currentProject}
        onUpdateProject={(id, patch) => void updateProject(id, patch)}
        onDeleteProject={(id) => void deleteProject(id)}
      />
    </div>
  );
};

export default ChatContainer;
