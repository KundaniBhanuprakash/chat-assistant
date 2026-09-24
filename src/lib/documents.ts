/**
 * Document ingestion.
 *
 * Text is extracted in the browser, split into overlapping chunks and stored
 * in the database, where Postgres full-text search makes it retrievable at
 * question time. Nothing is sent to the AI until a chunk is actually relevant.
 */

import { supabase } from "@/integrations/supabase/client";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 150;
const MAX_CHARS = 400_000;

export interface StoredDocument {
  id: string;
  name: string;
  mime_type: string;
  char_count: number;
  created_at: string;
}

const TEXT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "log",
  "html",
  "xml",
  "yml",
  "yaml",
];

export const isSupportedDocument = (file: File) => {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "pdf" || TEXT_EXTENSIONS.includes(ext) || file.type.startsWith("text/");
};

export const SUPPORTED_DOCUMENT_HINT = "PDF, TXT, Markdown, CSV, JSON";

const extractPdfText = async (file: File): Promise<string> => {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push(`[Page ${i}]\n${text}`);
    if (pages.join("").length > MAX_CHARS) break;
  }
  return pages.join("\n\n");
};

export const extractDocumentText = async (file: File): Promise<string> => {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || file.type === "application/pdf") return extractPdfText(file);
  const text = await file.text();
  return text.slice(0, MAX_CHARS);
};

export const chunkText = (text: string): string[] => {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_CHARS, clean.length);
    if (end < clean.length) {
      // Prefer breaking on a paragraph or sentence boundary.
      const window = clean.slice(start, end);
      const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "));
      if (breakAt > CHUNK_CHARS * 0.5) end = start + breakAt + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
};

export const saveDocument = async (
  file: File,
  userId: string,
  opts: { conversationId?: string | null; projectId?: string | null } = {}
): Promise<StoredDocument | null> => {
  const text = await extractDocumentText(file);
  const chunks = chunkText(text);
  if (chunks.length === 0) return null;

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      conversation_id: opts.conversationId ?? null,
      project_id: opts.projectId ?? null,
      name: file.name,
      mime_type: file.type || "text/plain",
      size_bytes: file.size,
      char_count: text.length,
      summary: text.slice(0, 300),
    })
    .select("id, name, mime_type, char_count, created_at")
    .single();

  if (error || !doc) {
    console.error("Document insert failed:", error?.message);
    return null;
  }

  for (let i = 0; i < chunks.length; i += 50) {
    const batch = chunks.slice(i, i + 50).map((content, index) => ({
      document_id: doc.id,
      user_id: userId,
      chunk_index: i + index,
      content,
    }));
    const { error: chunkError } = await supabase.from("document_chunks").insert(batch);
    if (chunkError) {
      console.error("Chunk insert failed:", chunkError.message);
      await supabase.from("documents").delete().eq("id", doc.id);
      return null;
    }
  }

  return doc as StoredDocument;
};
