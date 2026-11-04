// Testdaten aus seed/*.json im Format der Supabase-Antwort – für Unit-Tests, Playwright und
// lokale Sichtprüfung ohne Datenbank (RADAR_FIXTURES=1). Nie in Produktion verwenden.
import trends from "@/seed/trends.json";
import clusters from "@/seed/clusters.json";
import focus from "@/seed/focus.json";
import crit from "@/seed/crit.json";
import weights from "@/seed/weights.json";
import zones from "@/seed/zones.json";
import ind from "@/seed/ind.json";
import ins from "@/seed/ins.json";
import sources from "@/seed/sources.json";
import partners from "@/seed/partners.json";
import trendPartners from "@/seed/trend_partners.json";
import { mapRadar, type RawRadar } from "./raw";
import type { RadarData } from "./types";

type SeedTrend = {
  id: number; n: string; c: string; fo: string; st: string; orig: string; d: string; use: string; bp: string;
  sig: string; opp: string; risk: string; ev: string; unc?: boolean; comp?: boolean; rel: number[];
  tta: string; sc: number[]; src: string[]; eu?: { tta?: string; sc?: number[]; note?: string; src?: string[] };
};

const IND_CODES: Record<string, string> = { Sport: "SPORT", Hospitality: "HOSPITALITY", "Live Entertainment": "LIVE" };

export function fixtureRaw(opts: { premium: boolean }): RawRadar {
  const tp = trendPartners as Record<string, string[]>;
  return {
    trends: (trends as SeedTrend[]).map((t) => ({
      id: t.id,
      number: t.id,
      name: t.n,
      cluster_code: t.c,
      focus_code: t.fo,
      origin: t.orig,
      description: t.d,
      use_cases: t.use,
      best_practice: t.bp,
      signals_summary: t.sig,
      opportunities: t.opp,
      risks: t.risk,
      evidence: t.ev,
      uncertain: !!t.unc,
      mandatory: !!t.comp,
      subtopics: { name: t.st },
      trend_perspectives: [
        { perspective: "GLOBAL" as const, horizon: t.tta, note: null },
        ...(t.eu ? [{ perspective: "EU" as const, horizon: t.eu.tta ?? null, note: t.eu.note ?? null }] : []),
      ],
      trend_scores: [
        ...t.sc.map((score, i) => ({ perspective: "GLOBAL" as const, criterion: i + 1, score })),
        ...(t.eu?.sc ?? []).map((score, i) => ({ perspective: "EU" as const, criterion: i + 1, score })),
      ],
      trend_relevance: t.rel.map((relevance, i) => ({ industry_code: IND_CODES[(ind as string[])[i]], relevance })),
      trend_sources: [
        ...t.src.map((source_id) => ({ source_id, perspective: "GLOBAL" as const })),
        ...(t.eu?.src ?? []).map((source_id) => ({ source_id, perspective: "EU" as const })),
      ],
      trend_partners: (tp[String(t.id)] ?? []).map((partner_key, position) => ({ partner_key, position })),
      trend_premium: null,
    })),
    clusters: Object.entries(clusters as Record<string, { n: string }>).map(([code, v], position) => ({ code, name: v.n, position })),
    focus_fields: Object.entries(focus as Record<string, { n: string; d: string }>).map(([code, v]) => ({ code, name: v.n, description: v.d })),
    subtopics: Object.entries(focus as Record<string, { st: string[] }>).flatMap(([focus_code, v]) =>
      v.st.map((name, position) => ({ focus_code, name, position })),
    ),
    industries: (ind as string[]).map((name, position) => ({ code: IND_CODES[name], name, position })),
    criteria: (crit as string[]).map((name, i) => ({ idx: i + 1, name, weight: (weights as number[])[i] })),
    zones: Object.entries(zones as Record<string, { n: string; s: string }>).map(([code, v]) => ({ code, name: v.n, tagline: v.s })),
    insights: (ins as [string, string][]).map(([title, body], position) => ({ title, body, position })),
    sources: Object.entries(sources as Record<string, { t: string; p: string; d: string; u: string }>).map(([id, s]) => ({
      id, title: s.t, publisher: s.p, published_label: s.d, url: s.u,
    })),
    partners: Object.entries(partners as Record<string, { n: string; r: string; kb?: boolean; s: string[] }>).map(([key, p]) => ({
      key, name: p.n, role: p.r, knowledge_base: !!p.kb, partner_sources: p.s.map((source_id) => ({ source_id })),
    })),
    cases: [],
    premium: opts.premium,
  };
}

export function fixtureRadar(opts: { premium: boolean }): RadarData {
  return mapRadar(fixtureRaw(opts));
}
