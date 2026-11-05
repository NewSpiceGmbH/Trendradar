/**
 * Medien zu Meldungen. Videos werden nur eingebettet (YouTube ohne Cookies, Vimeo) – nie heruntergeladen oder neu
 * hochgeladen. Bilder kommen nur mit Rechtestatus; „unklar“ zeigt die App Kunden nie (siehe Migration 0007).
 */
export interface MediaInput {
  kind: "video" | "image";
  url: string;
  title?: string | null;
  credit?: string | null;
  license?: string | null;
  rights_hint?: "press" | "cc" | "unclear" | null;
}

export interface MediaRow {
  kind: "video" | "image";
  url: string;
  embed_url: string | null;
  title: string | null;
  credit: string | null;
  license: string | null;
  rights: "embed" | "press" | "cc" | "unclear";
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
      return m ? m[1] : null;
    }
  } catch { /* keine URL */ }
  return null;
}

export function vimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)vimeo\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(\d{6,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Datenbankzeile aus der Agentenausgabe; null, wenn das Medium nicht zulässig ist */
export function toMediaRow(m: MediaInput): MediaRow | null {
  if (!/^https:\/\//.test(m.url)) return null;
  const base = { url: m.url, title: m.title ?? null, credit: m.credit ?? null, license: m.license ?? null };
  if (m.kind === "video") {
    const yt = youtubeId(m.url);
    if (yt && /^[\w-]{6,20}$/.test(yt)) return { ...base, kind: "video", embed_url: `https://www.youtube-nocookie.com/embed/${yt}`, rights: "embed" };
    const vi = vimeoId(m.url);
    if (vi) return { ...base, kind: "video", embed_url: `https://player.vimeo.com/video/${vi}`, rights: "embed" };
    return null; // andere Videoquellen nur als Link in der Meldung
  }
  const rights = m.rights_hint === "press" || m.rights_hint === "cc" ? m.rights_hint : "unclear";
  return { ...base, kind: "image", embed_url: null, rights };
}
