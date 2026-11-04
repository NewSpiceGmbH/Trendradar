import { layout, type DotPosition, type Perspective, type ScoringInput, type Scores } from "@/lib/scoring";
import type { RadarData, RadarTrend } from "./types";

export const toInput = (t: RadarTrend): ScoringInput => ({
  number: t.number,
  cluster: t.cluster,
  mandatory: t.mandatory,
  global: t.global,
  eu: t.eu ? { horizon: t.eu.horizon, scores: t.eu.scores } : null,
});

export type Positions = Record<Perspective, Record<number, DotPosition>>;

export function positions(data: RadarData): Positions {
  const inputs = data.trends.map(toInput);
  const weights = data.criteria.map((c) => c.weight) as unknown as Scores;
  return { EU: layout(inputs, "EU", weights), GLOBAL: layout(inputs, "GLOBAL", weights) };
}

/** Trend liegt in Europa in einer anderen Spielphase als global */
export const moved = (pos: Positions, n: number) => pos.EU[n].zone !== pos.GLOBAL[n].zone;

export const ORIGIN_LABEL = { EU: "Europa", US: "USA", GLOBAL: "Global" } as const;
export const PERSPECTIVE_LABEL = { EU: "Europa / DACH", GLOBAL: "Global" } as const;
export const HORIZONS = ["0–2", "3–5", "6–10"] as const;

export const fmt = (n: number) => n.toFixed(2).replace(".", ",");
export const clusterVar = (c: string) => `var(--c${c})`;
export const clusterFg = (c: string) => `var(--c${c}-fg)`;

/** Kurzbezeichnungen der Kriterien für Tabellenköpfe (wie im Prototyp) */
export const CRITERIA_SHORT = ["BI", "CX", "Fit", "Reife", "Innov.", "Umsetzb."];
