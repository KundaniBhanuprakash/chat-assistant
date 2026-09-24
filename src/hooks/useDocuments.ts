import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  MAX_DOCUMENT_BYTES,
  SUPPORTED_DOCUMENT_HINT,
  isSupportedDocument,
  saveDocument,
  type StoredDocument,
} from "@/lib/documents";

/**
 * Documents the user has added. Documents attached to the open conversation
 * are used as context automatically; project documents follow the project.
 */
export const useDocuments = (
  userId: string | undefined,
  conversationId: string | null,
  projectId: string | null
) => {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setDocuments([]);
      return;
    }
    let query = supabase
      .from("documents")
      .select("id, name, mime_type, char_count, created_at, conversation_id, project_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (conversationId && projectId) {
      query = query.or(`conversation_id.eq.${conversationId},project_id.eq.${projectId}`);
    } else if (conversationId) {
      query = query.eq("conversation_id", conversationId);
    } else if (projectId) {
      query = query.eq("project_id", projectId);
    } else {
      query = query.is("conversation_id", null).is("project_id", null);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Could not load documents:", error.message);
      return;
    }
    setDocuments((data ?? []) as StoredDocument[]);
  }, [userId, conversationId, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addDocument = useCallback(
    async (file: File) => {
      if (!userId) return null;
      if (!isSupportedDocument(file)) {
        toast.error(`That file type isn't supported yet. Try ${SUPPORTED_DOCUMENT_HINT}.`);
        return null;
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        toast.error("That file is larger than 10MB.");
        return null;
      }

      setUploading(true);
      try {
        const doc = await saveDocument(file, userId, { conversationId, projectId });
        if (!doc) {
          toast.error("No readable text was found in that file.");
          return null;
        }
        setDocuments((prev) => [doc, ...prev]);
        toast.success(`${doc.name} is ready to use`);
        return doc;
      } catch (err) {
        console.error("Document upload failed:", err);
        toast.error("Could not read that file. Please try another one.");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [userId, conversationId, projectId]
  );

  const removeDocument = useCallback(async (id: string) => {
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) {
      toast.error("Could not remove that document");
      return;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    toast.success("Document removed");
  }, []);

  /** Re-home documents added before the conversation existed. */
  const attachOrphansToConversation = useCallback(
    async (newConversationId: string) => {
      if (!userId) return;
      await supabase
        .from("documents")
        .update({ conversation_id: newConversationId })
        .eq("user_id", userId)
        .is("conversation_id", null)
        .is("project_id", null);
    },
    [userId]
  );

  return { documents, uploading, addDocument, removeDocument, refresh, attachOrphansToConversation };
};
