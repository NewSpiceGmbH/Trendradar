import { describe, expect, it } from "vitest";
import { domainOf, guardRecommendation, totalOf } from "./scoring";
import { CRITERIA } from "./types";

describe("Venture-Bewertung", () => {
  it("Gewichte ergeben zusammen 1", () => {
    expect(CRITERIA.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 10);
  });

  it("berechnet den gewichteten Gesamtscore", () => {
    const all = (n: number) => CRITERIA.map((c) => ({ criterion: c.key, score: n }));
    expect(totalOf(all(5))).toBe(5);
    expect(totalOf(all(1))).toBe(1);
    // Problem-Fit 5, Rest 3: 5·0,25 + 3·0,75 = 3,5
    expect(totalOf(all(3).map((s) => (s.criterion === "fit" ? { ...s, score: 5 } : s)))).toBe(3.5);
  });

  it("zählt fehlende Kriterien als 1 und kappt Ausreißer", () => {
    expect(totalOf([{ criterion: "fit", score: 5 }])).toBe(2);
    expect(totalOf(CRITERIA.map((c) => ({ criterion: c.key, score: 9 })))).toBe(5);
  });

  it("sichert die Empfehlung ab", () => {
    expect(guardRecommendation("shortlist", 4.2, [])).toBe("shortlist");
    expect(guardRecommendation("shortlist", 4.2, ["DSGVO unklar"])).toBe("watch");
    expect(guardRecommendation("shortlist", 3.2, [])).toBe("watch");
    expect(guardRecommendation("watch", 2.2, [])).toBe("no_fit");
    expect(guardRecommendation("no_fit", 4.5, [])).toBe("no_fit");
  });

  it("erkennt Dubletten an der Domain", () => {
    expect(domainOf("https://www.QueueLess.io/de/produkt")).toBe("queueless.io");
    expect(domainOf("queueless.io")).toBe("queueless.io");
    expect(domainOf("")).toBeNull();
    expect(domainOf("kein link mit leerzeichen")).toBeNull();
  });
});
