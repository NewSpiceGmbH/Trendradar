import { view, type Horizon, type Perspective, type Scores, type ScoringInput, type TrendView } from "@/lib/scoring";
import type { AdminTrend, Proposal, ProposalKind, ScoreItem, TrendPatch, TrendSnapshot } from "./types";

/**
 * Patch-Logik wie apply_trend_patch() / approve_proposal() in Migration 0006 – für die Vorschau
 * („wie sieht der Trend nach der Freigabe aus?“) und für den lokalen Testmodus ohne Datenbank.
 * Änderungen hier immer zusammen mit der Migration und tests/db/redaktion.test.sql.
 */

export const clone = <T>(v: T): T => structuredClone(v);

export function applyPatch<T extends TrendSnapshot>(t: T, p: TrendPatch): T {
  const out = clone(t);
  if (p.fields) out.fields = { ...out.fields, ...p.fields };
  for (const [persp, items] of Object.entries(p.scores ?? {}) as [keyof TrendSnapshot["scores"], TrendSnapshot["scores"]["GLOBAL"]][]) {
    for (const s of items) {
      if (!Number.isInteger(s.score) || s.score < 1 || s.score > 5) throw new Error(`Score ${s.score} außerhalb 1–5`);
    }
    out.scores[persp] = [...items].sort((a, b) => a.criterion - b.criterion);
  }
  for (const [persp, row] of Object.entries(p.perspectives ?? {}) as [keyof TrendSnapshot["perspectives"], TrendSnapshot["perspectives"]["GLOBAL"]][]) {
    out.perspectives[persp] = row ? { horizon: row.horizon, note: row.note } : null;
  }
  if (p.relevance) out.relevance = { ...p.relevance };
  return out;
}

/** Vorschlag in einen Patch übersetzen (nur Arten, die einen bestehenden Trend ändern) */
export function proposalPatch(kind: ProposalKind, payload: Record<string, unknown>): TrendPatch | null {
  switch (kind) {
    case "update_trend":
      return payload as TrendPatch;
    case "score_change": {
      const persp = (payload.perspective as "GLOBAL" | "EU") ?? "GLOBAL";
      const patch: TrendPatch = { scores: { [persp]: (payload.scores as ScoreItem[]) ?? [] } };
      if ("horizon" in payload || "eu_note" in payload) {
        patch.perspectives = { [persp]: { horizon: (payload.horizon as Horizon) ?? null, note: (payload.eu_note as string) ?? null } };
      }
      return patch;
    }
    case "attach_signal":
      return payload.fields ? { fields: payload.fields as TrendPatch["fields"] } : null;
    default:
      return null;
  }
}

export function snapshotOf(t: AdminTrend): TrendSnapshot {
  return clone({ fields: t.fields, scores: t.scores, perspectives: t.perspectives, relevance: t.relevance });
}

/** Eingabe für die Bewertungslogik; fehlen Scores, gilt 1 (Entwurf) */
export function toScoringInput(t: TrendSnapshot): ScoringInput {
  const g = [1, 2, 3, 4, 5, 6].map((c) => t.scores.GLOBAL.find((s) => s.criterion === c)?.score ?? 1) as unknown as Scores;
  const eu = t.scores.EU.length ? Object.fromEntries(t.scores.EU.map((s) => [s.criterion, s.score])) : null;
  const euRow = t.perspectives.EU;
  return {
    number: t.fields.number,
    cluster: t.fields.cluster_code as ScoringInput["cluster"],
    mandatory: t.fields.mandatory,
    global: { horizon: (t.perspectives.GLOBAL?.horizon ?? "3–5") as Horizon, scores: g },
    eu: eu || euRow ? { horizon: euRow?.horizon ?? null, scores: eu } : null,
  };
}

export const positionOf = (t: TrendSnapshot, persp: Perspective, weights?: Scores): TrendView =>
  view(toScoringInput(t), persp, weights);

/** Felder, die sich zwischen zwei Ständen unterscheiden (für den Vorher/Nachher-Vergleich) */
export function changedFields(a: TrendSnapshot, b: TrendSnapshot): (keyof TrendSnapshot["fields"])[] {
  return (Object.keys(b.fields) as (keyof TrendSnapshot["fields"])[]).filter((k) => a.fields[k] !== b.fields[k]);
}

export const KIND_LABEL: Record<ProposalKind, string> = {
  new_trend: "Neuer Trend",
  update_trend: "Trend ergänzen",
  score_change: "Bewertung ändern",
  new_source: "Neue Quelle",
  attach_signal: "Meldung zuordnen",
};

export const isPending = (p: Proposal) => p.status === "pending";
