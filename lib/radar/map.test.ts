import { describe, expect, it } from "vitest";
import seedTrends from "@/seed/trends.json";
import { view, type Scores } from "@/lib/scoring";
import { fixtureRadar } from "./fixtures";

const data = fixtureRadar({ premium: false });

describe("mapRadar (über die Testdaten)", () => {
  it("liefert alle Stammdaten", () => {
    expect(data.trends).toHaveLength(44);
    expect(data.clusters.map((c) => c.code)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(data.focus.map((f) => f.code)).toEqual(["HOS", "INF", "FAN"]);
    expect(data.criteria.map((c) => c.weight)).toEqual([0.25, 0.2, 0.2, 0.15, 0.1, 0.1]);
    expect(Object.keys(data.sources)).toHaveLength(85);
    expect(Object.keys(data.partners)).toHaveLength(43);
    expect(data.zones.KICKOFF.name).toBe("Anstoß");
  });

  it("ergibt für jeden Trend dieselbe Einordnung wie der Seed", () => {
    for (const s of seedTrends as { id: number; tta: string; sc: number[]; comp?: boolean; c: string; eu?: { tta?: string; sc?: number[] } }[]) {
      const t = data.trends.find((x) => x.number === s.id)!;
      for (const p of ["GLOBAL", "EU"] as const) {
        const o = p === "EU" && s.eu ? s.eu : {};
        const expected = view(
          { number: s.id, cluster: s.c as "A", mandatory: !!s.comp, global: { horizon: (o.tta ?? s.tta) as "0–2", scores: (o.sc ?? s.sc) as unknown as Scores } },
          "GLOBAL",
        );
        const ours = view({ number: t.number, cluster: t.cluster, mandatory: t.mandatory, global: t.global, eu: t.eu }, p);
        expect([t.number, p, ours.total, ours.zone]).toEqual([s.id, p, expected.total, expected.zone]);
      }
    }
  });
});
