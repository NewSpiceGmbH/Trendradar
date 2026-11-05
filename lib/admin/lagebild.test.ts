import { describe, expect, it } from "vitest";
import { laneBoard, laneOf } from "./lagebild";
import type { Signal } from "./types";

const now = new Date("2026-11-05T12:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const sig = (id: string, p: Partial<Signal>): Signal => ({
  id, title: id, summary: null, url: `https://example.org/${id}`, publisher: null, publishedOn: null, status: "new",
  trendId: null, foundAt: ago(1), publishedAt: null, ...p,
});

describe("Lagebild", () => {
  it("ordnet Meldungen ohne Bereich Sport & Hospitality zu", () => {
    expect(laneOf({ lane: undefined })).toBe("sport_hospitality");
    expect(laneOf({ lane: "startup_tech" })).toBe("startup_tech");
  });

  it("zeigt Wichtiges aus den letzten 14 Tagen zuerst, Verworfenes nie", () => {
    const list = [
      sig("alt-wichtig", { lane: "startup_tech", relevance: 3, foundAt: ago(30) }),
      sig("neu-mittel", { lane: "startup_tech", relevance: 2, foundAt: ago(1) }),
      sig("neu-wichtig", { lane: "startup_tech", relevance: 3, foundAt: ago(3) }),
      sig("verworfen", { lane: "startup_tech", relevance: 3, status: "dismissed" }),
      sig("anderer-bereich", { lane: "cross_industry", relevance: 3 }),
    ];
    const b = laneBoard(list, "startup_tech", now);
    expect(b.items.map((s) => s.id)).toEqual(["neu-wichtig", "neu-mittel", "alt-wichtig"]);
    expect(b.fresh).toBe(2);
    expect(b.total).toBe(3);
  });

  it("zählt offene Meldungen ohne Freigabe", () => {
    const b = laneBoard([sig("a", { publishedAt: ago(1) }), sig("b", {})], "sport_hospitality", now);
    expect(b.open).toBe(1);
  });
});
