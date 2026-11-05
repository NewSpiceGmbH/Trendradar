// Zeilen, wie sie aus Supabase kommen (Spaltennamen der Tabellen). Supabase-Loader und Testdaten
// liefern beide dieses Format; mapRadar() macht daraus RadarData. So gibt es nur ein Mapping.
import type { RadarData, RadarTrend } from "./types";
import type { Horizon, Scores, Zone } from "@/lib/scoring";

type Persp = "GLOBAL" | "EU";

export interface RawTrend {
  id: number;
  number: number;
  name: string;
  cluster_code: string;
  focus_code: string;
  origin: string;
  description: string;
  use_cases: string | null;
  best_practice: string | null;
  signals_summary: string | null;
  opportunities: string | null;
  risks: string | null;
  evidence: string;
  uncertain: boolean;
  mandatory: boolean;
  /** ab Migration 0006; fehlt vorher (dann gilt die Zuordnung aus lib/stadium) */
  journey_stage?: string | null;
  audience?: string | null;
  subtopics: { name: string } | null;
  trend_perspectives: { perspective: Persp; horizon: string | null; note: string | null }[];
  trend_scores: { perspective: Persp; criterion: number; score: number }[];
  trend_relevance: { industry_code: string; relevance: number }[];
  trend_sources: { source_id: string; perspective: Persp }[];
  trend_partners: { partner_key: string; position: number }[];
  trend_premium: { recommendation: string | null; why_prioritized: string | null } | null;
}

export interface RawRadar {
  trends: RawTrend[];
  clusters: { code: string; name: string; position: number }[];
  focus_fields: { code: string; name: string; description: string | null }[];
  subtopics: { focus_code: string; name: string; position: number }[];
  industries: { code: string; name: string; position: number }[];
  criteria: { idx: number; name: string; weight: number | string }[];
  zones: { code: string; name: string; tagline: string }[];
  insights: { title: string; body: string; position: number }[];
  sources: { id: string; title: string; publisher: string | null; published_label: string | null; url: string }[];
  partners: { key: string; name: string; role: string | null; knowledge_base: boolean; partner_sources: { source_id: string }[] }[];
  /** freigegebene Meldungen (signals mit published_at); fehlt vor Migration 0006 */
  ticker?: { id: string; trend_id: number | null; title: string; summary: string | null; url: string; publisher: string | null; published_on: string | null; published_at: string | null }[];
  cases: { id: string; client: string; year: string | null; title: string; solution: string | null; result: string | null; case_trends: { trend_id: number }[] }[];
  premium: boolean;
}

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

export function mapRadar(raw: RawRadar): RadarData {
  const industries = [...raw.industries].sort(byPos);
  const numberById = new Map(raw.trends.map((t) => [t.id, t.number]));

  const trends: RadarTrend[] = raw.trends
    .map((t) => {
      const g = t.trend_perspectives.find((p) => p.perspective === "GLOBAL");
      const e = t.trend_perspectives.find((p) => p.perspective === "EU");
      const gScores = t.trend_scores
        .filter((s) => s.perspective === "GLOBAL")
        .sort((a, b) => a.criterion - b.criterion)
        .map((s) => s.score);
      const euScores = t.trend_scores.filter((s) => s.perspective === "EU");
      const euSources = t.trend_sources.filter((s) => s.perspective === "EU").map((s) => s.source_id);
      const hasEu = !!e || euScores.length > 0 || euSources.length > 0;
      const rel = new Map(t.trend_relevance.map((r) => [r.industry_code, r.relevance]));

      return {
        number: t.number,
        name: t.name,
        cluster: t.cluster_code as RadarTrend["cluster"],
        focus: t.focus_code as RadarTrend["focus"],
        subtopic: t.subtopics?.name ?? null,
        origin: t.origin as RadarTrend["origin"],
        description: t.description,
        useCases: t.use_cases,
        bestPractice: t.best_practice,
        signals: t.signals_summary,
        opportunities: t.opportunities,
        risks: t.risks,
        evidence: t.evidence as RadarTrend["evidence"],
        uncertain: t.uncertain,
        mandatory: t.mandatory,
        journey: (t.journey_stage ?? null) as RadarTrend["journey"],
        audience: (t.audience ?? null) as RadarTrend["audience"],
        relevance: industries.map((i) => rel.get(i.code) ?? 0),
        global: { horizon: (g?.horizon ?? "3–5") as Horizon, scores: gScores as unknown as Scores },
        eu: hasEu
          ? {
              horizon: (e?.horizon ?? null) as Horizon | null,
              scores: euScores.length ? Object.fromEntries(euScores.map((s) => [s.criterion, s.score])) : null,
              note: e?.note ?? null,
              sourceIds: euSources,
            }
          : null,
        sourceIds: t.trend_sources.filter((s) => s.perspective === "GLOBAL").map((s) => s.source_id),
        partnerKeys: [...t.trend_partners].sort(byPos).map((p) => p.partner_key),
        premium: t.trend_premium
          ? { recommendation: t.trend_premium.recommendation, whyPrioritized: t.trend_premium.why_prioritized }
          : null,
      };
    })
    .sort((a, b) => a.number - b.number);

  const subtopics = [...raw.subtopics].sort(byPos);
  return {
    trends,
    clusters: [...raw.clusters].sort(byPos).map((c) => ({ code: c.code as RadarTrend["cluster"], name: c.name })),
    focus: (["HOS", "INF", "FAN"] as const)
      .map((code) => raw.focus_fields.find((f) => f.code === code))
      .filter((f): f is RawRadar["focus_fields"][number] => !!f)
      .map((f) => ({
        code: f.code as RadarTrend["focus"],
        name: f.name,
        description: f.description,
        subtopics: subtopics.filter((s) => s.focus_code === f.code).map((s) => s.name),
      })),
    industries: industries.map((i) => ({ code: i.code as RadarData["industries"][number]["code"], name: i.name })),
    criteria: [...raw.criteria].sort((a, b) => a.idx - b.idx).map((c) => ({ idx: c.idx, name: c.name, weight: Number(c.weight) })),
    zones: Object.fromEntries(raw.zones.map((z) => [z.code, { name: z.name, tagline: z.tagline }])) as Record<Zone, { name: string; tagline: string }>,
    insights: [...raw.insights].sort(byPos).map((i) => ({ title: i.title, body: i.body })),
    sources: Object.fromEntries(
      raw.sources.map((s) => [s.id, { id: s.id, title: s.title, publisher: s.publisher, publishedLabel: s.published_label, url: s.url }]),
    ),
    partners: Object.fromEntries(
      raw.partners.map((p) => [
        p.key,
        { key: p.key, name: p.name, role: p.role, knowledgeBase: p.knowledge_base, sourceIds: p.partner_sources.map((s) => s.source_id) },
      ]),
    ),
    cases: raw.cases.map((c) => ({
      id: c.id,
      client: c.client,
      year: c.year,
      title: c.title,
      solution: c.solution,
      result: c.result,
      trendNumbers: c.case_trends.map((ct) => numberById.get(ct.trend_id)).filter((n): n is number => n != null),
    })),
    ticker: (raw.ticker ?? [])
      .filter((s) => s.published_at && s.trend_id != null && numberById.has(s.trend_id))
      .sort((a, b) => (b.published_at! < a.published_at! ? -1 : b.published_at! > a.published_at! ? 1 : 0))
      .map((s) => ({
        id: s.id, trend: numberById.get(s.trend_id!)!, title: s.title, summary: s.summary, url: s.url,
        publisher: s.publisher, publishedOn: s.published_on, publishedAt: s.published_at!,
      })),
    premium: raw.premium,
  };
}
