import "server-only";

import { fixtureRaw } from "@/lib/radar/fixtures";
import type { Horizon } from "@/lib/scoring";
import type { RawRadar, RawTrend } from "@/lib/radar/raw";
import { audienceOf } from "@/lib/stadium/audience";
import { stageOf } from "@/lib/stadium/journey";
import { applyPatch, proposalPatch, snapshotOf } from "./patch";
import type { AdminRepo } from "./repo";
import type { AdminTrend, Lookups, Proposal, Signal, TeamMember, TrendPatch, Version } from "./types";

/**
 * Redaktions-Backend im lokalen Testmodus (RADAR_FIXTURES=1, nie auf Vercel): Zustand im Speicher des
 * Server-Prozesses, aufgebaut aus seed/*.json. Bildet edit_trend/approve_proposal … aus Migration 0006 nach.
 * Beispielvorschläge und -meldungen sind als solche gekennzeichnet und verweisen auf example.org.
 */

interface Store {
  trends: AdminTrend[];
  versions: Version[];
  proposals: Proposal[];
  signals: Signal[];
  team: TeamMember[];
  lookups: Lookups;
  nextVersion: number;
}

const g = globalThis as unknown as { __trendradarAdmin?: Store };

function initStore(): Store {
  const raw = fixtureRaw({ premium: true });
  const subtopics = raw.subtopics.map((s, i) => ({ id: i + 1, focusCode: s.focus_code, name: s.name }));
  const trends: AdminTrend[] = raw.trends.map((t) => {
    const persp = (p: "GLOBAL" | "EU") => {
      const row = t.trend_perspectives.find((x) => x.perspective === p);
      return row ? { horizon: row.horizon as Horizon | null, note: row.note } : null;
    };
    const scores = (p: "GLOBAL" | "EU") => t.trend_scores.filter((s) => s.perspective === p).map((s) => ({ criterion: s.criterion, score: s.score, rationale: null }));
    return {
      id: t.id,
      updatedAt: null,
      fields: {
        number: t.number, name: t.name, cluster_code: t.cluster_code, focus_code: t.focus_code,
        subtopic_id: subtopics.find((s) => s.focusCode === t.focus_code && s.name === t.subtopics?.name)?.id ?? null,
        origin: t.origin as AdminTrend["fields"]["origin"], description: t.description, use_cases: t.use_cases,
        best_practice: t.best_practice, signals_summary: t.signals_summary, opportunities: t.opportunities, risks: t.risks,
        evidence: t.evidence as AdminTrend["fields"]["evidence"], uncertain: t.uncertain, mandatory: t.mandatory,
        status: "published", journey_stage: stageOf(t.number), audience: audienceOf(t.number),
      },
      scores: { GLOBAL: scores("GLOBAL"), EU: scores("EU") },
      perspectives: { GLOBAL: persp("GLOBAL"), EU: persp("EU") },
      relevance: Object.fromEntries(t.trend_relevance.map((r) => [r.industry_code, r.relevance])),
    };
  });

  const id = (n: number) => trends.find((t) => t.fields.number === n)!.id;
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const B = "[Beispiel] ";

  const signals: Signal[] = [
    { id: "sig-1", title: `${B}Bundesliga-Club testet Bestellung am Platz per App`, summary: "Beispielmeldung für den Testmodus. Ein Club lässt Getränke direkt an den Sitz liefern.", url: "https://example.org/beispiel/mobile-order", publisher: "Beispielmedium", publishedOn: null, status: "new", trendId: null, foundAt: ago(3), publishedAt: null, example: true },
    { id: "sig-2", title: `${B}Arena setzt auf Batteriespeicher für Flutlicht`, summary: "Beispielmeldung für den Testmodus.", url: "https://example.org/beispiel/speicher", publisher: "Beispielmedium", publishedOn: null, status: "assigned", trendId: id(34), foundAt: ago(20), publishedAt: null, example: true },
    { id: "sig-3", title: `${B}Neue Studie zu Fan-Anreise mit ÖPNV`, summary: "Beispielmeldung für den Testmodus.", url: "https://example.org/beispiel/oepnv", publisher: "Beispielverband", publishedOn: null, status: "assigned", trendId: id(32), foundAt: ago(48), publishedAt: ago(30), example: true },
  ];

  const proposals: Proposal[] = [
    {
      id: "prop-1", kind: "score_change", targetTrendId: id(10), example: true, agent: "scorer", status: "pending", createdAt: ago(2),
      reviewedAt: null, reviewedBy: null, reviewNote: null, sourceIds: [],
      rationale: `${B}Mehrere Piloten in DACH deuten auf höhere Marktreife in Europa hin.`,
      payload: {
        perspective: "EU", horizon: "3–5", eu_note: "Beispiel: erste Piloten in DACH, Mitbestimmung geklärt.",
        scores: [
          { criterion: 1, score: 4, rationale: "Spürbare Personalentlastung" }, { criterion: 2, score: 3, rationale: "Gäste merken wenig" },
          { criterion: 3, score: 4, rationale: "Passt zu Effizienzzielen" }, { criterion: 4, score: 3, rationale: "Piloten laufen" },
          { criterion: 5, score: 4, rationale: "Sichtbare Innovation" }, { criterion: 6, score: 3, rationale: "Umbau nötig" },
        ],
      },
    },
    {
      id: "prop-2", kind: "update_trend", targetTrendId: id(26), example: true, agent: "analyst", status: "pending", createdAt: ago(5),
      reviewedAt: null, reviewedBy: null, reviewNote: null, sourceIds: [],
      rationale: `${B}Risiken um Abhängigkeit von Zahlungsanbietern ergänzen.`,
      payload: { fields: { risks: "Ausfälle ohne Bargeld-Rückfallebene, Abhängigkeit von wenigen Zahlungsanbietern, Gebühren." } },
    },
    {
      id: "prop-3", kind: "new_trend", targetTrendId: null, example: true, agent: "analyst", status: "pending", createdAt: ago(9),
      reviewedAt: null, reviewedBy: null, reviewNote: null, sourceIds: [],
      rationale: `${B}Zwei unabhängige Signale zu buchbaren Parkplätzen mit Ladesäule.`,
      payload: {
        fields: {
          name: "Smart Parking & E-Laden", cluster_code: "D", focus_code: "INF", origin: "EU", evidence: "B", journey_stage: "anreise", audience: "both",
          description: "Parkplatz vorab buchen, am Stadion laden und automatisch bezahlen.",
          use_cases: "Buchbare Stellplätze mit Ticket, Ladesäulen mit Lastmanagement, Kennzeichenerkennung.",
        },
        scores: { GLOBAL: [1, 2, 3, 4, 5, 6].map((c, i) => ({ criterion: c, score: [3, 4, 3, 4, 2, 4][i], rationale: "Beispiel" })) },
        perspectives: { GLOBAL: { horizon: "0–2", note: null } },
        relevance: { SPORT: 3, HOSPITALITY: 1, LIVE: 3 },
      },
    },
    {
      id: "prop-4", kind: "attach_signal", targetTrendId: id(24), example: true, agent: "analyst", status: "pending", createdAt: ago(3),
      reviewedAt: null, reviewedBy: null, reviewNote: null, sourceIds: [],
      rationale: `${B}Die Meldung zur Bestellung am Platz gehört zu Mobile Order.`,
      payload: { signal_id: "sig-1", publish: true },
    },
  ];

  return {
    trends,
    versions: [],
    proposals,
    signals,
    team: [{ id: "fixture-redaktion", email: "redaktion@demo.newspice.de", displayName: "Redaktion (Demo)", role: "admin" }],
    nextVersion: 1,
    lookups: {
      clusters: raw.clusters.map((c) => ({ code: c.code, name: c.name })),
      focus: raw.focus_fields.map((f) => ({ code: f.code, name: f.name })),
      subtopics,
      industries: raw.industries.map((i) => ({ code: i.code, name: i.name })),
      criteria: raw.criteria.map((c) => ({ idx: c.idx, name: c.name, weight: Number(c.weight) })),
      zones: Object.fromEntries(raw.zones.map((z) => [z.code, { name: z.name }])),
      sources: Object.fromEntries(raw.sources.map((s) => [s.id, { title: s.title, publisher: s.publisher, url: s.url }])),
      people: { "fixture-redaktion": "Redaktion (Demo)" },
    },
  };
}

const store = () => (g.__trendradarAdmin ??= initStore());
const USER = "fixture-redaktion";

function edit(s: Store, trendId: number, patch: TrendPatch, proposalId: string | null = null) {
  const i = s.trends.findIndex((t) => t.id === trendId);
  if (i < 0) throw new Error("Trend nicht gefunden.");
  const next = applyPatch(s.trends[i], patch); // wirft bei ungültigen Scores – dann ändert sich nichts
  s.versions.unshift({ id: s.nextVersion++, trendId, snapshot: snapshotOf(s.trends[i]), changedBy: USER, proposalId, createdAt: new Date().toISOString() });
  s.trends[i] = { ...next, updatedAt: new Date().toISOString() };
}

function create(s: Store, patch: TrendPatch): number {
  const id = Math.max(...s.trends.map((t) => t.id)) + 1;
  const number = patch.fields?.number ?? Math.max(...s.trends.map((t) => t.fields.number)) + 1;
  const base: AdminTrend = {
    id, updatedAt: new Date().toISOString(),
    fields: {
      number, name: "", cluster_code: "A", focus_code: "FAN", subtopic_id: null, origin: "GLOBAL", description: "", use_cases: null,
      best_practice: null, signals_summary: null, opportunities: null, risks: null, evidence: "C", uncertain: false, mandatory: false,
      status: "draft", journey_stage: "stadion", audience: "both",
    },
    scores: { GLOBAL: [], EU: [] }, perspectives: { GLOBAL: null, EU: null }, relevance: {},
  };
  s.trends.push(applyPatch(base, { ...patch, fields: { ...patch.fields, number, status: "draft" } }));
  return id;
}

export function fixtureRepo(): AdminRepo {
  return {
    async lookups() { return store().lookups; },
    async trends() { return structuredClone(store().trends).sort((a, b) => a.fields.number - b.fields.number); },
    async versions(trendId) { return structuredClone(store().versions.filter((v) => v.trendId === trendId)); },
    async proposals() { return structuredClone(store().proposals); },
    async signals() { return structuredClone(store().signals); },
    async runs() { return []; },
    async team() { return structuredClone(store().team); },

    async editTrend(trendId, patch) { edit(store(), trendId, patch); },
    async createTrend(patch) { return create(store(), patch); },
    async restoreVersion(versionId) {
      const s = store();
      const v = s.versions.find((x) => x.id === versionId);
      if (!v) throw new Error("Version nicht gefunden.");
      if (!("fields" in v.snapshot)) throw new Error("Dieser Eintrag ist die Neuanlage und lässt sich nicht wiederherstellen.");
      const { number: _n, ...fields } = v.snapshot.fields;
      void _n;
      edit(s, v.trendId, { ...v.snapshot, fields });
    },
    async approve(id, payload, note) {
      const s = store();
      const p = s.proposals.find((x) => x.id === id);
      if (!p) throw new Error("Vorschlag nicht gefunden.");
      if (p.status !== "pending") throw new Error("Dieser Vorschlag wurde bereits bearbeitet.");
      const pl = payload ?? p.payload;
      let tid = p.targetTrendId;
      if (p.kind === "new_trend") {
        tid = create(s, pl as TrendPatch);
        const t = s.trends.find((x) => x.id === tid)!;
        t.fields.status = "published";
        s.versions.unshift({ id: s.nextVersion++, trendId: tid, snapshot: {}, changedBy: USER, proposalId: id, createdAt: new Date().toISOString() });
      } else {
        if (tid == null) throw new Error("Der Vorschlag nennt keinen Trend.");
        if (p.kind === "attach_signal") {
          const sig = s.signals.find((x) => x.id === pl.signal_id);
          if (sig) {
            sig.trendId = tid;
            sig.status = "assigned";
            if (pl.publish) sig.publishedAt = new Date().toISOString();
          }
        }
        const patch = proposalPatch(p.kind, pl);
        if (patch) edit(s, tid, patch, id);
      }
      Object.assign(p, { status: "approved", payload: pl, targetTrendId: tid, reviewedAt: new Date().toISOString(), reviewedBy: USER, reviewNote: note ?? null });
      return tid;
    },
    async reject(id, note) {
      if (!note.trim()) throw new Error("Bitte eine Begründung angeben.");
      const p = store().proposals.find((x) => x.id === id && x.status === "pending");
      if (!p) throw new Error("Dieser Vorschlag ist nicht mehr offen.");
      Object.assign(p, { status: "rejected", reviewedAt: new Date().toISOString(), reviewedBy: USER, reviewNote: note });
    },
    async assignSignal(id, trendId) {
      const sig = store().signals.find((x) => x.id === id);
      if (!sig) throw new Error("Meldung nicht gefunden.");
      Object.assign(sig, trendId == null ? { trendId: null, status: "new", publishedAt: null } : { trendId, status: "assigned" });
    },
    async publishSignal(id, publish) {
      const sig = store().signals.find((x) => x.id === id);
      if (!sig) throw new Error("Meldung nicht gefunden.");
      if (publish && sig.trendId == null) throw new Error("Eine Meldung braucht einen Trend, bevor sie im Ticker erscheint.");
      Object.assign(sig, publish ? { publishedAt: new Date().toISOString(), status: "assigned" } : { publishedAt: null });
    },
    async dismissSignal(id) {
      const sig = store().signals.find((x) => x.id === id);
      if (sig) Object.assign(sig, { status: "dismissed", publishedAt: null });
    },
    async setRole() {
      throw new Error("Rollen lassen sich im Testmodus nicht vergeben.");
    },
  };
}

/** Testmodus: freigegebene Meldungen aus dem Backend-Speicher für den Liveticker im Stadion */
export function fixtureTicker(): NonNullable<RawRadar["ticker"]> {
  return store().signals
    .filter((s) => s.publishedAt && s.trendId != null && s.status !== "dismissed")
    .map((s) => ({ id: s.id, trend_id: s.trendId, title: s.title, summary: s.summary, url: s.url, publisher: s.publisher, published_on: s.publishedOn, published_at: s.publishedAt }));
}

/** Testmodus: veröffentlichte Trends aus dem Backend-Speicher für den Radar (falls dort schon bearbeitet wurde) */
export function fixtureTrendsForRadar(seed: RawTrend[]): RawTrend[] {
  const s = g.__trendradarAdmin;
  if (!s) return seed;
  const bySeed = new Map(seed.map((t) => [t.id, t]));
  return s.trends
    .filter((t) => t.fields.status === "published")
    .map((t) => {
      const base = bySeed.get(t.id);
      const sub = s.lookups.subtopics.find((x) => x.id === t.fields.subtopic_id);
      return {
        id: t.id, number: t.fields.number, name: t.fields.name, cluster_code: t.fields.cluster_code, focus_code: t.fields.focus_code,
        origin: t.fields.origin, description: t.fields.description, use_cases: t.fields.use_cases, best_practice: t.fields.best_practice,
        signals_summary: t.fields.signals_summary, opportunities: t.fields.opportunities, risks: t.fields.risks, evidence: t.fields.evidence,
        uncertain: t.fields.uncertain, mandatory: t.fields.mandatory, journey_stage: t.fields.journey_stage, audience: t.fields.audience,
        subtopics: sub ? { name: sub.name } : null,
        trend_perspectives: (["GLOBAL", "EU"] as const).flatMap((p) => (t.perspectives[p] ? [{ perspective: p, ...t.perspectives[p]! }] : [])),
        trend_scores: (["GLOBAL", "EU"] as const).flatMap((p) => t.scores[p].map((x) => ({ perspective: p, criterion: x.criterion, score: x.score }))),
        trend_relevance: Object.entries(t.relevance).map(([industry_code, relevance]) => ({ industry_code, relevance })),
        trend_sources: base?.trend_sources ?? [],
        trend_partners: base?.trend_partners ?? [],
        trend_premium: base?.trend_premium ?? null,
      };
    });
}
