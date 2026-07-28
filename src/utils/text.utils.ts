export const sanitizeImageQuery = (value: string): string =>
  value
    .replace(/[<>{}\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

export const normalizeSearchText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/-/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const countOccurrences = (value: string, needle: string): number =>
  value.split(needle).length - 1;

export const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };

    return entities[character] ?? character;
  });