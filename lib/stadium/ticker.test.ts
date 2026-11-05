import { describe, expect, it } from "vitest";
import type { TickerItem } from "@/lib/radar/types";
import { dayLabel, filterByTopics, hostOf, isFresh, newsByTrend, unseenItems } from "./ticker";

const item = (id: string, trend: number, publishedAt: string): TickerItem =>
  ({ id, trend, title: id, summary: null, url: "https://www.example.org/a", publisher: null, publishedOn: null, publishedAt });

describe("Liveticker", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  it("beschriftet Tage in deutscher Zeit", () => {
    expect(dayLabel("2026-11-05T06:00:00Z", now)).toBe("heute");
    expect(dayLabel("2026-11-04T23:30:00Z", now)).toBe("heute"); // 00:30 in Berlin
    expect(dayLabel("2026-11-04T12:00:00Z", now)).toBe("gestern");
    expect(dayLabel("2026-10-28T12:00:00Z", now)).toBe("28. Okt.");
    expect(dayLabel("2025-10-28T12:00:00Z", now)).toBe("28. Okt. 2025");
  });
  it("erkennt neue Meldungen und gruppiert je Trend", () => {
    const a = item("a", 24, "2026-11-04T12:00:00Z"), b = item("b", 24, "2026-10-01T12:00:00Z"), c = item("c", 32, "2026-11-01T12:00:00Z");
    expect(isFresh(a, now)).toBe(true);
    expect(isFresh(b, now)).toBe(false);
    expect(newsByTrend([a, c, b]).get(24)?.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("kürzt die Quelle auf den Host", () => {
    expect(hostOf("https://www.stadionwelt.de/news/x")).toBe("stadionwelt.de");
    expect(hostOf("kein link")).toBe("kein link");
  });
  it("filtert nach Themen (Cluster)", () => {
    const items = [item("a", 24, "2026-11-04T12:00:00Z"), item("b", 34, "2026-11-04T12:00:00Z")];
    const cluster = (n: number) => ({ 24: "A", 34: "F" } as Record<number, string>)[n];
    expect(filterByTopics(items, cluster, new Set()).map((x) => x.id)).toEqual(["a", "b"]);
    expect(filterByTopics(items, cluster, new Set(["F"])).map((x) => x.id)).toEqual(["b"]);
    expect(filterByTopics(items, cluster, new Set(["B"]))).toEqual([]);
  });
  it("erkennt ungesehene Meldungen", () => {
    const a = item("a", 24, "2026-11-05T08:00:00Z"), b = item("b", 24, "2026-11-03T08:00:00Z"), c = item("c", 24, "2026-09-01T08:00:00Z");
    expect(unseenItems([a, b, c], null, now).map((x) => x.id)).toEqual(["a", "b"]);
    expect(unseenItems([a, b, c], "2026-11-04T00:00:00Z", now).map((x) => x.id)).toEqual(["a"]);
    expect(unseenItems([a, b, c], "2026-11-05T08:00:00Z", now)).toEqual([]);
  });
});
