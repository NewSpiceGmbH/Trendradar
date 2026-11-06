import type { Member, MemberRow, MemberStatus, Offer, OfferCategory, PartnerType } from "./types";

/** Reine Logik der Netzwerk-Datenbank (Liste, Filter, abgeleitete Trends) – ohne Datenbank, testbar */

/**
 * Trends eines Mitglieds: aus den Angebotskategorien seiner Angebote (archivierte Kategorien zählen nicht), dazu die
 * bisherige direkte Zuordnung aus der Startup-Datenbank (trend_numbers), bis die Einträge klassifiziert sind.
 */
export function memberTrends(member: Pick<Member, "trendNumbers">, categoryIds: string[], categories: OfferCategory[]): number[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const fromCats = categoryIds.flatMap((id) => {
    const c = byId.get(id);
    return c && !c.archived ? c.trendNumbers : [];
  });
  return [...new Set([...fromCats, ...member.trendNumbers])].sort((a, b) => a - b);
}

export function buildRows(members: Member[], offers: Offer[], categories: OfferCategory[]): MemberRow[] {
  const byMember = new Map<string, Offer[]>();
  for (const o of offers) byMember.set(o.memberId, [...(byMember.get(o.memberId) ?? []), o]);
  return members.map((m) => {
    const own = byMember.get(m.id) ?? [];
    const categoryIds = [...new Set(own.flatMap((o) => o.categoryIds))];
    return { member: m, categoryIds, trends: memberTrends(m, categoryIds, categories), offerCount: own.length };
  });
}

export interface MemberFilter {
  type?: PartnerType | null;
  category?: string | null;
  offers?: boolean;
  startup?: boolean;
  /** ohne Angabe: alle außer archivierten */
  status?: MemberStatus | null;
  q?: string;
}

/** Suche: Name, Kurzbeschreibung, Kategorie oder Trendnummer („24“ oder „#24“) */
export function matchesQuery(row: MemberRow, q: string, categories: OfferCategory[]): boolean {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  const num = /^#?(\d{1,2})$/.exec(term);
  if (num) return row.trends.includes(Number(num[1]));
  const names = categories.filter((c) => row.categoryIds.includes(c.id)).map((c) => c.name);
  const m = row.member;
  return [m.name, m.tagline, m.solution, m.domain, ...names, ...m.tags].some((x) => x?.toLowerCase().includes(term));
}

export function filterRows(rows: MemberRow[], f: MemberFilter, categories: OfferCategory[]): MemberRow[] {
  return rows.filter((r) => {
    const m = r.member;
    if (f.status ? m.status !== f.status : m.status === "archived") return false;
    if (f.type && !m.partnerTypes.includes(f.type)) return false;
    if (f.category && !r.categoryIds.includes(f.category)) return false;
    if (f.offers && r.offerCount === 0) return false;
    if (f.startup && !m.isStartup) return false;
    return matchesQuery(r, f.q ?? "", categories);
  });
}

/** Zahl je Partner-Typ (ohne archivierte), für die Filterknöpfe */
export function countByType(rows: MemberRow[]): Record<PartnerType, number> {
  const out = { solution_provider: 0, club: 0, operator: 0, caterer: 0, multiplier: 0, investor: 0 } as Record<PartnerType, number>;
  for (const r of rows) if (r.member.status !== "archived") for (const t of r.member.partnerTypes) out[t]++;
  return out;
}

/** Zahl der Mitglieder (ohne archivierte) je Kategorie */
export function countByCategory(rows: MemberRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) if (r.member.status !== "archived") for (const id of r.categoryIds) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** Untertitel in der Liste: Merkmal Startup bzw. die wichtigste Angabe je Typ */
export function subtitle(m: Member): string {
  if (m.partnerTypes.includes("solution_provider")) return m.isStartup ? "Startup" : m.isPartner ? "Partner" : "Anbieter";
  const d = m.details ?? {};
  return [d.league, d.venue, d.venue_type, d.capacity, d.focus, d.network, d.gastro_type].filter(Boolean).slice(0, 2).join(", ");
}
