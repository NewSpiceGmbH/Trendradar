/**
 * Zielgruppe eines Trends: Hospitality (VIP, Logen, Business Seats) oder Public (normale Ränge) – oder beide.
 * Startwert der Zuordnung, später ein Feld, das die Redaktion pflegt (trends.audience).
 */
export type Audience = "vip" | "public" | "both";
export type AudienceFilter = "all" | "vip" | "public";

export const AUDIENCE_LABEL: Record<Audience, string> = { vip: "Hospitality", public: "Public", both: "Hospitality & Public" };
export const FILTER_LABEL: Record<AudienceFilter, string> = { all: "Alle", vip: "Hospitality", public: "Public" };

const VIP = [6, 9, 13, 16, 22, 33];
const PUBLIC = [3, 17, 19, 24, 25, 26, 28, 29, 30, 32, 44];

// Werte aus der Datenbank (trends.audience) haben Vorrang vor dem Startwert oben
const fromData = new Map<number, Audience>();
export function registerAudience(trends: { number: number; audience: Audience | null }[]) {
  fromData.clear();
  for (const t of trends) if (t.audience) fromData.set(t.number, t.audience);
}

export function audienceOf(n: number): Audience {
  const d = fromData.get(n);
  if (d) return d;
  if (VIP.includes(n)) return "vip";
  if (PUBLIC.includes(n)) return "public";
  return "both";
}

/** Passt ein Trend zum gewählten Filter? „Beide“ passt immer. */
export const matchesAudience = (n: number, f: AudienceFilter) => f === "all" || audienceOf(n) === "both" || audienceOf(n) === f;
