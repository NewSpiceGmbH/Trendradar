import { describe, expect, it } from "vitest";
import { parseReport } from "./findings";
import { toMediaRow, youtubeId } from "./media";
import { costOf } from "./pricing";
import { parseFeed, recentItems } from "./rss";
import { isDue, searchSince } from "./schedule";
import { buildBriefing, runScoutAgent, type BriefingInput } from "./scout";
import type { Scout } from "./types";

const scout: Scout = {
  id: "s1", key: "fnb", name: "Food & Beverage", role: "Scout Kiosk", shirtNumber: 6, briefing: "Zapftechnik und Pfand.",
  keywords: ["Pfand"], exclusions: ["Werbung"], verticals: ["SPORT"], clusters: ["D"], journeyStages: [], audience: "public",
  regions: ["DACH"], languages: ["de"], watchTrends: [25], cadence: "daily", runHour: 5, runWeekday: null, maxSearches: 10,
  maxCostUsd: 2, maxSignals: 5, deliverMedia: true, minEvidence: "B", model: "claude-opus-5-5", effort: "medium",
  active: true, lastRunAt: null, channelIds: [],
};

const finding = {
  title: "Club testet smarte Pfandautomaten", summary: "Ein Bundesligist stellt Pfandautomaten am Umlauf auf. Becher werden automatisch erkannt.",
  url: "https://example.org/pfand", publisher: "Beispiel", published_on: "2026-11-01", kind: "pilot", press_release: false,
  suggested_trends: [31], evidence: "B", relevance: 3, from_tip: null,
  media: [{ kind: "video", url: "https://www.youtube.com/watch?v=abcdefghijk", title: "Demo", credit: null, license: null, rights_hint: "unclear" }],
};

const base = (): BriefingInput => ({
  scout, channels: [], trends: [{ number: 25, name: "Self-Pour & Smart Schank", cluster: "D" }, { number: 31, name: "Circular Events", cluster: "F" }],
  candidates: [{ title: "Neuer Zapf-Pilot", url: "https://example.org/feed-1", source: "Stadionwelt" }],
  tips: [{ id: "t1", url: "https://www.linkedin.com/posts/beispiel", note: "Spannend", scoutId: null, status: "open", signalId: null, error: null, createdAt: "", processedAt: null }],
  knownUrls: ["https://example.org/alt"], since: new Date("2026-10-29"), today: new Date("2026-11-05"),
});

const msg = (stop_reason: string, content: unknown[], searches = 0) => ({
  model: "claude-opus-5-5", stop_reason, stop_details: null, content,
  usage: { input_tokens: 10_000, output_tokens: 1_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: searches } },
});
const mockClient = (responses: unknown[]) => {
  const calls: unknown[] = [];
  return {
    calls,
    client: { beta: { messages: { stream: (params: unknown) => { calls.push(structuredClone(params)); return { finalMessage: async () => responses.shift() }; } } } } as never,
  };
};

describe("Medien", () => {
  it("bettet YouTube ohne Cookies ein und verwirft fremde Videoquellen", () => {
    expect(youtubeId("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
    expect(toMediaRow({ kind: "video", url: "https://www.youtube.com/watch?v=abcdefghijk" })?.embed_url).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(toMediaRow({ kind: "video", url: "https://vimeo.com/123456789" })?.embed_url).toBe("https://player.vimeo.com/video/123456789");
    expect(toMediaRow({ kind: "video", url: "https://example.org/video.mp4" })).toBeNull();
  });
  it("Bilder ohne geklärtes Recht bleiben „unklar“, http wird verworfen", () => {
    expect(toMediaRow({ kind: "image", url: "https://example.org/a.jpg", rights_hint: "press" })?.rights).toBe("press");
    expect(toMediaRow({ kind: "image", url: "https://example.org/a.jpg" })?.rights).toBe("unclear");
    expect(toMediaRow({ kind: "image", url: "http://example.org/a.jpg", rights_hint: "cc" })).toBeNull();
  });
});

describe("RSS", () => {
  it("liest RSS und Atom und filtert nach Datum", () => {
    const xml = `<rss><channel><item><title><![CDATA[Neu & spannend]]></title><link>https://example.org/1</link><pubDate>Tue, 04 Nov 2026 10:00:00 GMT</pubDate></item>
      <item><title>Alt</title><link>https://example.org/2</link><pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>
      <feed><entry><title>Atom</title><link rel="alternate" href="https://example.org/3"/><updated>2026-11-03T08:00:00Z</updated></entry></feed>`;
    const items = parseFeed(xml);
    expect(items.map((i) => i.title)).toEqual(["Neu & spannend", "Alt", "Atom"]);
    expect(recentItems(items, new Date("2026-10-30")).map((i) => i.url)).toEqual(["https://example.org/1", "https://example.org/3"]);
  });
});

describe("Zeitplan", () => {
  it("läuft einmal pro Tag ab der eingestellten Uhrzeit (Berlin)", () => {
    const at = (iso: string) => new Date(iso);
    expect(isDue(scout, at("2026-11-05T03:30:00Z"))).toBe(false); // 04:30 in Berlin
    expect(isDue(scout, at("2026-11-05T04:10:00Z"))).toBe(true); // 05:10 in Berlin
    expect(isDue({ ...scout, lastRunAt: "2026-11-05T04:12:00Z" }, at("2026-11-05T09:00:00Z"))).toBe(false);
    expect(isDue({ ...scout, active: false }, at("2026-11-05T09:00:00Z"))).toBe(false);
    expect(isDue({ ...scout, cadence: "manual" }, at("2026-11-05T09:00:00Z"))).toBe(false);
  });
  it("sucht seit dem letzten Lauf, mindestens 2 und höchstens 14 Tage", () => {
    const now = new Date("2026-11-05T05:00:00Z");
    expect(searchSince(null, now).toISOString().slice(0, 10)).toBe("2026-10-29");
    expect(searchSince("2026-11-04T05:00:00Z", now).toISOString().slice(0, 10)).toBe("2026-11-03");
    expect(searchSince("2026-01-01T05:00:00Z", now).toISOString().slice(0, 10)).toBe("2026-10-22");
  });
});

describe("Kosten und Ausgabe", () => {
  it("rechnet Token und Websuchen", () => {
    // 100 Tsd. Eingabe × 4 $ + 10 Tsd. Ausgabe × 20 $ pro Mio. + 12 Suchen × 0,01 $ = 0,40 + 0,20 + 0,12
    expect(costOf("claude-opus-5-5", { input_tokens: 100_000, output_tokens: 10_000, server_tool_use: { web_search_requests: 12 } }).usd).toBeCloseTo(0.72, 4);
  });
  it("verwirft ungültige Einzelmeldungen statt des ganzen Berichts", () => {
    const r = parseReport({ signals: [finding, { ...finding, url: "kein-link" }], notes: "ok" });
    expect(r.findings).toHaveLength(1);
    expect(r.rejected).toBe(1);
  });
});

describe("Briefing", () => {
  it("enthält Auftrag, Revier, Beobachtungsliste, Kandidaten, Tipps und bekannte Adressen", () => {
    const b = buildBriefing(base());
    for (const s of ["Zapftechnik und Pfand.", "Sport", "DACH", "#25 Self-Pour & Smart Schank", "https://example.org/feed-1", "https://www.linkedin.com/posts/beispiel", "Notiz: Spannend", "https://example.org/alt", "höchstens 5 Meldungen", "Seit 2026-10-29".toLowerCase()]) {
      expect(b.toLowerCase()).toContain(s.toLowerCase());
    }
  });
});

describe("Agentenschleife", () => {
  it("setzt unterbrochene Turns fort, mahnt den Abschluss an und liefert den Bericht", async () => {
    const report = { type: "tool_use", id: "tu1", name: "report_findings", input: { signals: [finding], notes: "1 Meldung" } };
    const { client, calls } = mockClient([
      msg("pause_turn", [{ type: "text", text: "suche …" }], 5),
      msg("end_turn", [{ type: "text", text: "fertig" }], 3),
      msg("tool_use", [report], 0),
    ]);
    const r = await runScoutAgent(client, base());
    expect(r.findings).toHaveLength(1);
    expect(r.turns).toBe(3);
    expect(r.searches).toBe(8);
    expect(r.costUsd).toBeCloseTo(3 * 0.04 + 3 * 0.02 + 0.08, 4);
    const first = calls[0] as { tools: { name: string; max_uses?: number }[]; fallbacks: string; system: { cache_control?: unknown }[] };
    expect(first.tools.map((t) => t.name)).toEqual(["web_search", "web_fetch", "report_findings"]);
    expect(first.tools[0].max_uses).toBe(10);
    expect(first.fallbacks).toBe("default");
    expect(first.system[0].cache_control).toEqual({ type: "ephemeral" });
    const third = calls[2] as { messages: { role: string; content: unknown }[] };
    expect(third.messages.at(-1)).toEqual({ role: "user", content: "Bitte schließe jetzt mit einem Aufruf von report_findings ab." });
  });
  it("bricht bei Ablehnung und bei zu vielen Durchgängen ab", async () => {
    await expect(runScoutAgent(mockClient([{ ...msg("refusal", []), stop_details: { category: "cyber" } }]).client, base())).rejects.toThrow(/abgelehnt/);
    await expect(runScoutAgent(mockClient([msg("end_turn", []), msg("end_turn", [])]).client, base(), { maxTurns: 2 })).rejects.toThrow(/Kein Bericht/);
  });
});
