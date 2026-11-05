import { CRITERIA, type CriterionScore, type Recommendation } from "./types";

/** Gewichteter Gesamtscore 1–5, auf zwei Stellen gerundet; fehlende Kriterien zählen als 1 (vorsichtig bewerten) */
export function totalOf(scores: Pick<CriterionScore, "criterion" | "score">[]): number {
  const by = new Map(scores.map((s) => [s.criterion, s.score]));
  const sum = CRITERIA.reduce((acc, c) => acc + Math.min(5, Math.max(1, by.get(c.key) ?? 1)) * c.weight, 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Empfehlung absichern: Die Zahl entscheidet mit, nicht nur das Urteil des Agenten.
 * - unter 2,5 → passt nicht
 * - offene Muss-Kriterien → höchstens beobachten
 * - Shortlist erst ab 3,5
 */
export function guardRecommendation(proposed: Recommendation, total: number, mustHaveGaps: string[]): Recommendation {
  if (total < 2.5) return "no_fit";
  if (proposed === "shortlist" && (mustHaveGaps.length > 0 || total < 3.5)) return "watch";
  return proposed;
}

/** Domain ohne Protokoll, „www.“ und Pfad – zum Erkennen von Dubletten */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export const fmtScore = (n: number) => n.toFixed(2).replace(".", ",");
