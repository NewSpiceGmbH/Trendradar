/**
 * Notion-Seiten lesen (z. B. Meeting-Notizen mit KI-Zusammenfassung) – für den Problem Deep Dive.
 * Über die offizielle API mit einer internen Integration: Token als Secret NOTION_TOKEN, die Seite (oder ein
 * übergeordneter Bereich) muss in Notion mit der Integration geteilt sein. Nur Lesen, nichts wird geschrieben.
 */
export const NOTION_VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";
const MAX_BLOCKS = 3000;
const MAX_DEPTH = 6;

export class NotionError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "NotionError";
  }
}

/** Seiten-ID aus einem Notion-Link (mit oder ohne Bindestriche, mit Titel davor, mit ?v= oder #…) */
export function notionPageId(url: string): string | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (!/(^|\.)notion\.(so|site|com)$/i.test(u.hostname)) return null;
  // bei Links auf einen Block (…#abc) zählt die Seite im Pfad
  const hex = u.pathname.replace(/-/g, "").match(/[0-9a-f]{32}(?=[^0-9a-f]*$)/i)?.[0] ?? u.searchParams.get("p")?.replace(/-/g, "").match(/^[0-9a-f]{32}$/i)?.[0];
  if (!hex) return null;
  const h = hex.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Alle Notion-Links aus einem Text (einer pro Zeile oder dazwischen) */
export const notionLinks = (text: string) => [...new Set(text.match(/https:\/\/[^\s<>"']*notion\.(so|site|com)\/[^\s<>"']+/gi) ?? [])];

type RichText = { plain_text?: string }[];
type Block = { id: string; type: string; has_children?: boolean; [k: string]: unknown };

const plain = (rt: unknown) => (Array.isArray(rt) ? (rt as RichText).map((t) => t.plain_text ?? "").join("") : "");

/** Ein Block als Textzeile (Markdown-ähnlich); unbekannte Typen mit rich_text werden trotzdem gelesen */
export function blockText(b: Block, depth: number): string {
  const v = (b[b.type] ?? {}) as Record<string, unknown>;
  const text = plain(v.rich_text ?? v.text);
  const pad = "  ".repeat(Math.max(0, depth));
  switch (b.type) {
    case "heading_1": return `\n# ${text}`;
    case "heading_2": return `\n## ${text}`;
    case "heading_3": return `\n### ${text}`;
    case "bulleted_list_item": return `${pad}- ${text}`;
    case "numbered_list_item": return `${pad}1. ${text}`;
    case "to_do": return `${pad}- [${v.checked ? "x" : " "}] ${text}`;
    case "quote": return `> ${text}`;
    case "callout": return `> ${text}`;
    case "code": return text ? `\`\`\`\n${text}\n\`\`\`` : "";
    case "divider": return "---";
    case "child_page": return `\n## ${String(v.title ?? "Unterseite")}`;
    case "table_row": return Array.isArray(v.cells) ? `| ${(v.cells as unknown[]).map(plain).join(" | ")} |` : "";
    case "unsupported": return "";
    default: return text ? `${pad}${text}` : "";
  }
}

export interface NotionPage {
  id: string;
  title: string;
  url: string | null;
  createdTime: string | null;
  editedTime: string | null;
  text: string;
  /** Blöcke, die die Schnittstelle nicht herausgibt (z. B. manche KI-Blöcke) */
  unsupported: number;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

async function call<T>(fetcher: Fetcher, token: string, path: string): Promise<T> {
  const res = await fetcher(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404 || res.status === 403) {
    throw new NotionError("Notion-Seite nicht gefunden – bitte in Notion über ••• → Verbindungen die Integration „Trendradar“ hinzufügen.", res.status);
  }
  if (res.status === 401) throw new NotionError("Der Notion-Schlüssel (NOTION_TOKEN) ist ungültig.", 401);
  if (res.status === 429) throw new NotionError("Notion bremst gerade (zu viele Anfragen). Bitte gleich noch einmal.", 429);
  if (!res.ok) throw new NotionError(`Notion antwortet mit ${res.status}.`, res.status);
  return (await res.json()) as T;
}

function pageTitle(page: { properties?: Record<string, { type: string; title?: RichText }> }): string {
  const prop = Object.values(page.properties ?? {}).find((p) => p.type === "title");
  return plain(prop?.title).trim() || "Notion-Seite";
}

/** Seite mit allen Unterblöcken als Text lesen */
export async function readNotionPage(url: string, opts: { token?: string; fetcher?: Fetcher } = {}): Promise<NotionPage> {
  const token = opts.token ?? process.env.NOTION_TOKEN;
  if (!token) throw new NotionError("Notion ist noch nicht verbunden: NOTION_TOKEN fehlt in Vercel.");
  const id = notionPageId(url);
  if (!id) throw new NotionError("Das ist kein Link auf eine Notion-Seite.");
  const fetcher = opts.fetcher ?? fetch;

  const page = await call<{ id: string; url?: string; created_time?: string; last_edited_time?: string; properties?: Record<string, { type: string; title?: RichText }> }>(fetcher, token, `/pages/${id}`);
  const lines: string[] = [];
  let count = 0;
  let unsupported = 0;
  const walk = async (blockId: string, depth: number): Promise<void> => {
    let cursor: string | undefined;
    do {
      const q = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
      const r = await call<{ results: Block[]; has_more: boolean; next_cursor: string | null }>(fetcher, token, `/blocks/${blockId}/children?${q}`);
      for (const b of r.results) {
        if (++count > MAX_BLOCKS) return;
        if (b.type === "unsupported") unsupported++;
        const t = blockText(b, depth);
        if (t) lines.push(t);
        // Unterseiten nicht mitlesen (eigene Seiten), alles andere schon – auch Toggles und Spalten
        if (b.has_children && b.type !== "child_page" && b.type !== "child_database" && depth < MAX_DEPTH) await walk(b.id, depth + 1);
      }
      cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
    } while (cursor && count <= MAX_BLOCKS);
  };
  await walk(id, 0);
  return {
    id, title: pageTitle(page), url: page.url ?? null, createdTime: page.created_time ?? null, editedTime: page.last_edited_time ?? null,
    text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), unsupported,
  };
}
