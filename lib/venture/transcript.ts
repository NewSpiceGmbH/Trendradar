/**
 * Transkripte aus Notion & Co. für den Deep-Dive-Agenten vorbereiten. Text, Markdown und HTML werden zu Text;
 * PDFs gehen unverändert als Dokument an Claude (keine eigene Auswertung nötig).
 */
export const MAX_TRANSCRIPT_CHARS = 400_000;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type TranscriptInput = { kind: "text"; text: string } | { kind: "pdf"; base64: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML-Export (z. B. aus Notion) zu lesbarem Text */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Text säubern: Steuerzeichen raus, Leerzeilen zusammenfassen */
export function cleanText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function fromFile(name: string, mime: string, bytes: Uint8Array): TranscriptInput {
  const lower = name.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return { kind: "pdf", base64: Buffer.from(bytes).toString("base64") };
  const raw = new TextDecoder("utf-8").decode(bytes);
  if (mime === "text/html" || lower.endsWith(".html") || lower.endsWith(".htm")) return { kind: "text", text: cleanText(htmlToText(raw)) };
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".markdown") || mime.startsWith("text/")) return { kind: "text", text: cleanText(raw) };
  throw new Error("Bitte Text, Markdown, HTML oder PDF hochladen (z. B. den Export aus Notion).");
}
