/**
 * Minimaler RSS-/Atom-Leser für Quellenkanäle vom Typ „rss“: liefert Titel, Link und Datum neuer Einträge.
 * Bewusst ohne Abhängigkeit; Inhalte der Artikel liest der Scout bei Bedarf selbst (Webabruf).
 */
export interface FeedItem {
  title: string;
  url: string;
  published: string | null;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
};

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const url = tag(b, "link") ?? tag(b, "guid");
    const title = tag(b, "title");
    if (url && title && /^https?:\/\//.test(url)) items.push({ title, url, published: tag(b, "pubDate") ?? tag(b, "dc:date") });
  }
  for (const m of xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) {
    const b = m[0];
    const link = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ?? b.match(/<link[^>]*href=["']([^"']+)["']/i);
    const title = tag(b, "title");
    if (link && title) items.push({ title, url: decode(link[1]), published: tag(b, "updated") ?? tag(b, "published") });
  }
  return items;
}

/** Nur Einträge seit einem Zeitpunkt (ohne Datum: behalten), höchstens `limit` */
export function recentItems(items: FeedItem[], since: Date, limit = 15): FeedItem[] {
  return items
    .filter((i) => {
      if (!i.published) return true;
      const t = Date.parse(i.published);
      return Number.isNaN(t) || t >= since.getTime();
    })
    .slice(0, limit);
}
