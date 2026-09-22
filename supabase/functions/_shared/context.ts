/**
 * Server-side context assembly.
 *
 * Gathers the pieces that personalise a reply — standing instructions,
 * saved memories, project instructions and relevant document excerpts —
 * and turns them into system-prompt text. Everything is read with the
 * service client but always scoped to the authenticated user's id.
 */

// deno-lint-ignore no-explicit-any
type Client = any;

export interface AssembledContext {
  /** Extra system prompt text, or "" when there is nothing to add. */
  text: string;
  /** Names of documents that actually contributed excerpts. */
  documentNames: string[];
  memoryCount: number;
}

const MAX_MEMORIES = 40;
const MAX_DOC_CHARS = 8000;

export const assembleContext = async (
  service: Client,
  userId: string,
  opts: {
    query: string;
    projectId?: string | null;
    documentIds?: string[] | null;
    useMemory?: boolean;
  }
): Promise<AssembledContext> => {
  const parts: string[] = [];
  const documentNames: string[] = [];
  let memoryCount = 0;

  // Standing instructions + memory toggle
  const { data: settings } = await service
    .from("user_settings")
    .select("custom_instructions, memory_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  const instructions = (settings?.custom_instructions ?? "").trim();
  if (instructions) {
    parts.push(
      "Standing preferences from the user (follow unless they conflict with safety or accuracy):\n" +
        instructions.slice(0, 2000)
    );
  }

  const memoryEnabled = settings?.memory_enabled !== false && opts.useMemory !== false;
  if (memoryEnabled) {
    const { data: memories } = await service
      .from("user_memories")
      .select("content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_MEMORIES);

    const lines = (memories ?? [])
      .map((m: { content: string }) => `- ${m.content}`)
      .filter(Boolean);
    memoryCount = lines.length;
    if (lines.length) {
      parts.push(
        "Things you remember about this user. Use them only when relevant; never repeat them back " +
          "unprompted:\n" +
          lines.join("\n")
      );
    }
  }

  // Project instructions
  if (opts.projectId) {
    const { data: project } = await service
      .from("projects")
      .select("name, instructions")
      .eq("id", opts.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (project) {
      const extra = (project.instructions ?? "").trim();
      parts.push(
        `This conversation belongs to the project "${project.name}".` +
          (extra ? ` Project instructions:\n${extra.slice(0, 2000)}` : "")
      );
    }
  }

  // Document excerpts (full-text retrieval over the user's own documents)
  const documentIds = opts.documentIds?.length ? opts.documentIds : null;
  if (documentIds && opts.query.trim()) {
    const { data: chunks, error } = await service.rpc("search_document_chunks", {
      p_user_id: userId,
      p_query: opts.query.slice(0, 500),
      p_document_ids: documentIds,
      p_limit: 6,
    });

    let rows = error ? [] : chunks ?? [];

    // Nothing matched the wording of the question — fall back to the opening
    // of each attached document so the model still sees the material.
    if (rows.length === 0) {
      const { data: head } = await service
        .from("document_chunks")
        .select("document_id, chunk_index, content, documents(name)")
        .eq("user_id", userId)
        .in("document_id", documentIds)
        .order("chunk_index", { ascending: true })
        .limit(4);
      rows = (head ?? []).map(
        (r: { document_id: string; chunk_index: number; content: string; documents?: { name?: string } }) => ({
          document_id: r.document_id,
          document_name: r.documents?.name ?? "document",
          chunk_index: r.chunk_index,
          content: r.content,
        })
      );
    }

    let used = 0;
    const excerpts: string[] = [];
    for (const row of rows) {
      const name = row.document_name ?? "document";
      const body = String(row.content ?? "");
      if (used + body.length > MAX_DOC_CHARS) break;
      used += body.length;
      if (!documentNames.includes(name)) documentNames.push(name);
      excerpts.push(`[${name} · part ${Number(row.chunk_index) + 1}]\n${body}`);
    }

    if (excerpts.length) {
      parts.push(
        "Excerpts from documents the user attached. Answer from these when they are relevant and " +
          "cite the document name in your reply. If the excerpts do not contain the answer, say so " +
          "instead of guessing:\n\n" +
          excerpts.join("\n\n---\n\n")
      );
    }
  }

  return { text: parts.join("\n\n"), documentNames, memoryCount };
};

/**
 * Pulls `[[remember: ...]]` notes out of an assistant reply.
 * Returns the cleaned text plus the facts to store.
 */
export const extractMemories = (text: string): { clean: string; facts: string[] } => {
  const facts: string[] = [];
  const clean = text.replace(/\[\[remember:\s*([^\]]{3,300})\]\]/gi, (_m, fact: string) => {
    facts.push(fact.trim());
    return "";
  });
  return { clean, facts };
};
