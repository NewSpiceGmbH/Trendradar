import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import seedTrends from "@/seed/trends.json";
import { formatScore, layout, scoreOf, view, type ScoringInput, type Scores } from "./scoring";

type SeedTrend = {
  id: number; c: string; comp?: boolean; tta: string; sc: number[];
  eu?: { tta?: string; sc?: number[] };
};
const seed = seedTrends as SeedTrend[];

const toInput = (t: SeedTrend): ScoringInput => ({
  number: t.id,
  cluster: t.c as ScoringInput["cluster"],
  mandatory: !!t.comp,
  global: { horizon: t.tta as ScoringInput["global"]["horizon"], scores: t.sc as unknown as Scores },
  eu: t.eu ? { horizon: (t.eu.tta as ScoringInput["global"]["horizon"]) ?? null, scores: (t.eu.sc as unknown as Scores) ?? null } : null,
});

/** Lädt scoreOf/view/layout samt Konstanten unverändert aus dem Prototyp. */
function loadPrototype() {
  const html = fs.readFileSync("reference/prototype.html", "utf8");
  const pick = (re: RegExp) => {
    const m = re.exec(html);
    if (!m) throw new Error(`Nicht im Prototyp gefunden: ${re}`);
    return m[0];
  };
  const fn = (name: string) => {
    const start = html.indexOf(`function ${name}(`);
    let depth = 0;
    for (let i = html.indexOf("{", start); i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
    }
    throw new Error(name);
  };
  const code = [
    pick(/const W = \[[^\]]*\];/),
    pick(/const CK = \[[^\]]*\];/),
    pick(/const ZK = \[[^\]]*\];/),
    pick(/const RINGS = \{[^;]*\};/),
    pick(/const CX = [^;]*, SEG = [^;]*;/),
    fn("scoreOf"), fn("view"), fn("layout"),
    "({ scoreOf, view, layout })",
  ].join("\n");
  return vm.runInNewContext(code) as {
    view: (t: SeedTrend, p: string) => { sc: number[]; tta: string; total: number; zone: string };
    layout: (t: SeedTrend[], p: string) => Record<number, { total: number; zone: string; r: number; ang: number; rad: number; x: number; y: number }>;
  };
}

const proto = loadPrototype();
const inputs = seed.map(toInput);

describe("scoreOf", () => {
  it("gewichtet und rundet auf zwei Stellen", () => {
    expect(scoreOf([5, 5, 5, 5, 5, 5])).toBe(5);
    expect(scoreOf([4, 4, 3, 3, 2, 4])).toBe(3.45);
    expect(scoreOf([1, 1, 1, 1, 1, 1])).toBe(1);
  });
  it("formatiert mit Dezimalkomma", () => {
    expect(formatScore(3.5)).toBe("3,50");
    expect(formatScore(3.85)).toBe("3,85");
  });
});

describe("view – identisch zum Prototyp", () => {
  it("deckt alle 44 Trends ab", () => expect(seed).toHaveLength(44));

  for (const p of ["GLOBAL", "EU"] as const) {
    it(`liefert für ${p} denselben Score, Horizont und dieselbe Zone`, () => {
      for (const t of seed) {
        const ours = view(toInput(t), p);
        const theirs = proto.view(t, p);
        expect({ n: t.id, total: ours.total, horizon: ours.horizon, zone: ours.zone, sc: [...ours.scores] })
          .toEqual({ n: t.id, total: theirs.total, horizon: theirs.tta, zone: theirs.zone, sc: theirs.sc });
      }
    });
  }

  it("Pflicht-Trends kommen auch unter 3,5 in den Anstoß", () => {
    const base = inputs[0];
    const low: ScoringInput = { ...base, global: { horizon: "0–2", scores: [3, 3, 3, 3, 3, 3] } };
    expect(view(low, "GLOBAL").zone).toBe("WARMUP");
    expect(view({ ...low, mandatory: true }, "GLOBAL").zone).toBe("KICKOFF");
  });

  it("geringe Marktreife schiebt immer ins Scouting", () => {
    const t: ScoringInput = { ...inputs[0], mandatory: true, global: { horizon: "0–2", scores: [5, 5, 5, 2, 5, 5] } };
    expect(view(t, "GLOBAL").zone).toBe("SCOUTING");
  });

  it("EU übernimmt fehlende Einzelwerte aus GLOBAL (wie die SQL-View)", () => {
    const t: ScoringInput = { ...inputs[0], global: { horizon: "3–5", scores: [4, 4, 4, 4, 4, 4] }, eu: { scores: { 4: 2 } } };
    expect(view(t, "EU")).toMatchObject({ scores: [4, 4, 4, 2, 4, 4], horizon: "3–5", zone: "SCOUTING" });
  });
});

describe("layout – identisch zum Prototyp", () => {
  for (const p of ["GLOBAL", "EU"] as const) {
    it(`setzt alle Dots für ${p} an dieselbe Stelle`, () => {
      const ours = layout(inputs, p);
      const theirs = proto.layout(seed, p);
      for (const t of seed) {
        const a = ours[t.id], b = theirs[t.id];
        expect(a.zone).toBe(b.zone);
        for (const k of ["r", "ang", "rad", "x", "y"] as const) expect(a[k]).toBeCloseTo(b[k], 9);
      }
    });
  }
});
