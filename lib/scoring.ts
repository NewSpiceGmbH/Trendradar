// Bewertungslogik des Trendradars. Muss identisch zur View `trend_positions`
// (supabase/migrations/0001_init.sql) und zu scoreOf()/view()/layout() im Prototyp sein.
// lib/scoring.test.ts prüft beides. Änderungen nur nach Rücksprache (siehe CLAUDE.md).

export type Perspective = "GLOBAL" | "EU";
export type Horizon = "0–2" | "3–5" | "6–10";
export type Zone = "KICKOFF" | "WARMUP" | "SCOUTING";
export type ClusterCode = "A" | "B" | "C" | "D" | "E" | "F" | "G";

/** Scores 1–5 in der Reihenfolge der Kriterien 1–6. */
export type Scores = readonly [number, number, number, number, number, number];

/** Business Impact, CX Impact, Strategic Fit, Market Readiness, Innovation Potential, Feasibility */
export const WEIGHTS: Scores = [0.25, 0.2, 0.2, 0.15, 0.1, 0.1];
export const MARKET_READINESS = 3; // Index von Kriterium 4
export const KICKOFF_THRESHOLD = 3.5;

export const CLUSTER_KEYS: readonly ClusterCode[] = ["A", "B", "C", "D", "E", "F", "G"];
export const ZONE_KEYS: readonly Zone[] = ["KICKOFF", "WARMUP", "SCOUTING"];

/** Eingabe je Trend. EU-Werte nur, wenn sie von GLOBAL abweichen. */
export interface ScoringInput {
  number: number;
  cluster: ClusterCode;
  mandatory: boolean;
  global: { horizon: Horizon; scores: Scores };
  eu?: { horizon?: Horizon | null; scores?: Partial<Record<number, number>> | Scores | null } | null;
}

export interface TrendView {
  scores: Scores;
  horizon: Horizon;
  total: number;
  zone: Zone;
}

/**
 * Gewichtete Summe, auf zwei Nachkommastellen gerundet (kaufmännisch, wie `round(numeric, 2)`).
 * Rechnet in Tausendsteln als Ganzzahl, damit keine Gleitkomma-Effekte die Rundung verfälschen.
 */
export function scoreOf(scores: Scores, weights: Scores = WEIGHTS): number {
  const milli = scores.reduce((sum, s, i) => sum + s * Math.round(weights[i] * 1000), 0);
  return Math.round(milli / 10) / 100;
}

export function zoneOf(scores: Scores, horizon: Horizon, total: number, mandatory: boolean): Zone {
  if (horizon === "6–10" || scores[MARKET_READINESS] <= 2) return "SCOUTING";
  if (horizon === "0–2" && (total >= KICKOFF_THRESHOLD || mandatory)) return "KICKOFF";
  return "WARMUP";
}

/** Werte eines Trends in einer Perspektive. EU übernimmt je Kriterium bzw. Horizont GLOBAL, wo nichts abweicht. */
export function view(t: ScoringInput, perspective: Perspective, weights: Scores = WEIGHTS): TrendView {
  let scores = t.global.scores;
  let horizon = t.global.horizon;
  if (perspective === "EU" && t.eu) {
    const eu = t.eu.scores;
    if (eu) {
      scores = scores.map((s, i) => (Array.isArray(eu) ? eu[i] : (eu as Partial<Record<number, number>>)[i + 1]) ?? s) as unknown as Scores;
    }
    horizon = t.eu.horizon ?? horizon;
  }
  const total = scoreOf(scores, weights);
  return { scores, horizon, total, zone: zoneOf(scores, horizon, total, t.mandatory) };
}

// ───────────── Anordnung der Dots in der Arena (layout() im Prototyp) ─────────────

export const ARENA = {
  cx: 560,
  cy: 400,
  /** horizontale Streckung der Ellipse */
  sx: 1.22,
  rings: { KICKOFF: [78, 172], WARMUP: [172, 266], SCOUTING: [266, 345] } as Record<Zone, readonly [number, number]>,
  /** Winkel je Cluster-Segment in Grad */
  segment: 360 / CLUSTER_KEYS.length,
  /** Abstand zum Segmentrand in Grad */
  pad: 5,
} as const;

export interface DotPosition extends TrendView {
  /** Radius des Dots, wächst mit Business Impact */
  r: number;
  ang: number;
  rad: number;
  x: number;
  y: number;
}

/**
 * Position jedes Trends in der Arena: Segment = Cluster, Ring = Zone. Innerhalb eines Feldes
 * sortiert nach total absteigend, dann Nummer aufsteigend; radial versetzt, damit sich Dots nicht überdecken.
 */
export function layout(trends: readonly ScoringInput[], perspective: Perspective, weights: Scores = WEIGHTS) {
  const views = new Map(trends.map((t) => [t.number, view(t, perspective, weights)]));
  const pos: Record<number, DotPosition> = {};

  CLUSTER_KEYS.forEach((c, ci) => {
    for (const z of ZONE_KEYS) {
      const group = trends
        .filter((t) => t.cluster === c && views.get(t.number)!.zone === z)
        .sort((a, b) => views.get(b.number)!.total - views.get(a.number)!.total || a.number - b.number);
      const [r0, r1] = ARENA.rings[z];
      const width = r1 - r0;
      const start = -90 + ci * ARENA.segment;

      group.forEach((t, i) => {
        const v = views.get(t.number)!;
        const ang = start + ARENA.pad + ((ARENA.segment - 2 * ARENA.pad) * (i + 0.5)) / group.length;
        let f: number;
        if (group.length <= 2) f = i === 0 ? 0.36 : 0.64;
        else if (group.length <= 4) f = i % 2 === 0 ? 0.3 : 0.7;
        else f = [0.2, 0.5, 0.8][i % 3];
        const rad = r0 + width * f;
        const a = (ang * Math.PI) / 180;
        pos[t.number] = {
          ...v,
          r: 8 + (v.scores[0] - 1) * 2.4,
          ang,
          rad,
          x: ARENA.cx + rad * ARENA.sx * Math.cos(a),
          y: ARENA.cy + rad * Math.sin(a),
        };
      });
    }
  });
  return pos;
}

/** Score mit Dezimalkomma, wie in der Oberfläche („3,85“). */
export function formatScore(total: number): string {
  return total.toFixed(2).replace(".", ",");
}
