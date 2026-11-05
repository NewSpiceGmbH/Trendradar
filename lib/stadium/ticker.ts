import type { TickerItem } from "@/lib/radar/types";

/** So lange gilt eine Meldung als neu (Punkt im Stadion pulsiert, Laufzeile zeigt sie) */
export const FRESH_DAYS = 7;

export const isFresh = (item: TickerItem, now: Date = new Date()) =>
  now.getTime() - new Date(item.publishedAt).getTime() < FRESH_DAYS * 86_400_000;

/** Meldungen je Trendnummer, neueste zuerst (Eingang ist bereits sortiert) */
export function newsByTrend(items: TickerItem[]): Map<number, TickerItem[]> {
  const m = new Map<number, TickerItem[]>();
  for (const i of items) m.set(i.trend, [...(m.get(i.trend) ?? []), i]);
  return m;
}

const BERLIN = "Europe/Berlin";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: BERLIN });

/** „heute“, „gestern“ oder „5. Nov.“ (mit Jahr, wenn nicht das laufende) – in deutscher Zeit */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const k = dayKey(d);
  if (k === dayKey(now)) return "heute";
  if (k === dayKey(new Date(now.getTime() - 86_400_000))) return "gestern";
  const sameYear = k.slice(0, 4) === dayKey(now).slice(0, 4);
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: BERLIN });
}

/** Hostname für die Quellenangabe, ohne „www.“ */
export const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

/** Meldungen auf die gewählten Themen (Cluster) beschränken; leere Auswahl = alle */
export function filterByTopics(items: TickerItem[], clusterOf: (trend: number) => string | undefined, topics: ReadonlySet<string>): TickerItem[] {
  if (!topics.size) return items;
  return items.filter((i) => {
    const c = clusterOf(i.trend);
    return c != null && topics.has(c);
  });
}
