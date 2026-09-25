/**
 * The assistant can append `[[remember: ...]]` notes to a reply. They are
 * stripped from what the user sees and saved as memories instead.
 */
export const extractMemories = (text: string): { clean: string; facts: string[] } => {
  const facts: string[] = [];
  const clean = text
    .replace(/\[\[remember:\s*([^\]]{3,300})\]\]/gi, (_match, fact: string) => {
      facts.push(fact.trim());
      return "";
    })
    .trimEnd();
  return { clean, facts };
};
