import { supabase } from "@/integrations/supabase/client";

export const CHAT_IMAGE_BUCKET = "chat-images";

/** Marker embedded in message content that points at a stored image. */
export const imageMarker = (path: string) => `[[image:${path}]]`;

export const IMAGE_MARKER_REGEX = /\[\[image:([^\]]+)\]\]/g;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const uploadChatImage = async (file: File, userId: string): Promise<string | null> => {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/upload-${crypto.randomUUID()}.${ext || "png"}`;
  const { error } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type || "image/png" });
  if (error) {
    console.error("Image upload failed:", error.message);
    return null;
  }
  return path;
};

export const getChatImageUrl = async (path: string): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) {
    console.error("Signed URL failed:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
};
