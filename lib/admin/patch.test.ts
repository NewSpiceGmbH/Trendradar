import { describe, expect, it } from "vitest";
import { emptySnapshot } from "./labels";
import { applyPatch, changedFields, positionOf, proposalPatch } from "./patch";

// Muss sich wie apply_trend_patch()/approve_proposal() in Migration 0006 verhalten (siehe tests/db/redaktion.test.sql).

const base = () => {
  const t = emptySnapshot(10);
  t.fields.name = "Bar- & Küchenrobotik";
  t.scores.GLOBAL = [3, 3, 3, 3, 3, 3].map((score, i) => ({ criterion: i + 1, score, rationale: null }));
  t.scores.EU = [{ criterion: 4, score: 2, rationale: null }];
  t.perspectives = { GLOBAL: { horizon: "3–5", note: null }, EU: { horizon: "6–10", note: "DSGVO" } };
  return t;
};

describe("applyPatch", () => {
  it("ändert nur die genannten Felder", () => {
    const t = applyPatch(base(), { fields: { risks: "neu" } });
    expect(t.fields.risks).toBe("neu");
    expect(t.fields.name).toBe("Bar- & Küchenrobotik");
    expect(changedFields(base(), t)).toEqual(["risks"]);
  });

  it("ersetzt die Scores einer Perspektive vollständig", () => {
    const t = applyPatch(base(), { scores: { EU: [{ criterion: 1, score: 5 }] } });
    expect(t.scores.EU).toEqual([{ criterion: 1, score: 5 }]);
    expect(t.scores.GLOBAL).toHaveLength(6);
  });

  it("löscht die Europa-Abweichung mit null", () => {
    const t = applyPatch(base(), { perspectives: { EU: null }, scores: { EU: [] } });
    expect(t.perspectives.EU).toBeNull();
    expect(positionOf(t, "EU").zone).toBe(positionOf(t, "GLOBAL").zone);
  });

  it("lehnt Scores außerhalb 1–5 ab und lässt das Original unverändert", () => {
    const t = base();
    expect(() => applyPatch(t, { scores: { GLOBAL: [{ criterion: 1, score: 9 }] } })).toThrow();
    expect(t.scores.GLOBAL[0].score).toBe(3);
  });
});

describe("proposalPatch", () => {
  it("score_change mit Horizont und Begründung → EU-Abweichung, Trend wandert", () => {
    const scores = [4, 4, 4, 3, 3, 3].map((score, i) => ({ criterion: i + 1, score, rationale: "x" }));
    const patch = proposalPatch("score_change", { perspective: "EU", horizon: "3–5", eu_note: "Pilot", scores })!;
    const t = applyPatch(base(), patch);
    expect(t.perspectives.EU).toEqual({ horizon: "3–5", note: "Pilot" });
    expect(positionOf(base(), "EU").zone).toBe("SCOUTING");
    expect(positionOf(t, "EU").zone).toBe("WARMUP");
  });

  it("attach_signal ohne Textergänzung ändert den Trend nicht", () => {
    expect(proposalPatch("attach_signal", { signal_id: "x", publish: true })).toBeNull();
  });
});
