import { describe, expect, it } from "vitest";
import { runVentureAgent } from "./agent";
import { buildChallengeBriefing } from "./prompt";
import { parseVentureReport } from "./report";
import { CRITERIA, type Challenge } from "./types";

const challenge: Challenge = {
  id: "c1", title: "Wartezeit am Bierstand", problem: "In der Halbzeit stehen Gäste 12 Minuten an.", goal: "Unter 4 Minuten.",
  context: "Bundesliga-Stadion, 40 Stände.", audience: "public", journeyStages: ["stadion"], trendNumbers: [24, 25], regions: ["DACH", "EU"],
  minMaturity: "pilot", mustHaves: ["DSGVO-konform"], exclusions: ["Firma X"], leads: ["https://example.org/tipp"], timeframe: "Saison 2027/28",
  budget: null, status: "draft", maxCandidates: 5, maxSearches: 10, maxCostUsd: 3, model: "claude-opus-5-5", effort: "high", lastRunAt: null, createdAt: "",
};

const candidate = {
  name: "QueueLess", website: "https://queueless.example", country: "DE", founded: 2021, stage: "market", funding: "Seed, 6 Mio. €",
  summary: "Kamerabasierte Kasse erkennt Produkte auf dem Tablett, der Gast zahlt kontaktlos.", approach: "Aus Kantinen übertragen.",
  scores: CRITERIA.map((c) => ({ criterion: c.key, score: 4, rationale: "Belegt durch Fallstudie.", source_url: "https://queueless.example/case" })),
  recommendation: "shortlist", must_have_gaps: [], open_questions: ["Wie schnell bei 40 Ständen?"],
  sources: [{ url: "https://queueless.example", title: "Website" }], uncertain: false,
};

const msg = (stop_reason: string, content: unknown[]) => ({
  model: "claude-opus-5-5", stop_reason, stop_details: null, content,
  usage: { input_tokens: 20_000, output_tokens: 2_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 4 } },
});
const mockClient = (responses: unknown[]) => {
  const calls: unknown[] = [];
  return { calls, client: { beta: { messages: { stream: (p: unknown) => { calls.push(structuredClone(p)); return { finalMessage: async () => responses.shift() }; } } } } as never };
};

describe("Venture-Agent", () => {
  it("baut den Auftrag aus der Challenge", () => {
    const text = buildChallengeBriefing({ challenge, trends: [{ number: 24, name: "Mobile Order & In-Seat", cluster: "D" }], known: [{ name: "Alt GmbH", domain: "alt.example" }], today: new Date("2026-11-05") });
    expect(text).toContain("Wartezeit am Bierstand");
    expect(text).toContain("In der Halbzeit stehen Gäste 12 Minuten an.");
    expect(text).toContain("- DSGVO-konform");
    expect(text).toContain("Mindestreife: Pilot läuft");
    expect(text).toContain("#24 Mobile Order & In-Seat");
    expect(text).toContain("https://example.org/tipp");
    expect(text).toContain("Alt GmbH (alt.example)");
    expect(text).toContain("höchstens 5 Kandidaten");
  });

  it("verwirft Kandidaten ohne Quelle, behält die anderen", () => {
    const r = parseVentureReport({ strategy: "s", notes: "n", candidates: [candidate, { ...candidate, name: "Ohne Quelle", sources: [] }, { foo: 1 }] });
    expect(r.candidates.map((c) => c.name)).toEqual(["QueueLess"]);
    expect(r.rejected).toBe(2);
  });

  it("macht „unknown“ beim Reifegrad zu null", () => {
    const r = parseVentureReport({ strategy: "s", notes: "n", candidates: [{ ...candidate, stage: "unknown" }] });
    expect(r.candidates[0].stage).toBeNull();
  });

  it("läuft bis zum Bericht weiter, auch über pause_turn, und rechnet Kosten", async () => {
    const { client, calls } = mockClient([
      msg("pause_turn", [{ type: "text", text: "suche …" }]),
      msg("tool_use", [{ type: "tool_use", id: "t", name: "report_startups", input: { strategy: "Kassen ohne Schlange", notes: "ok", candidates: [candidate] } }]),
    ]);
    const r = await runVentureAgent(client, { challenge, trends: [], known: [], today: new Date("2026-11-05") });
    expect(r.turns).toBe(2);
    expect(r.candidates).toHaveLength(1);
    expect(r.strategy).toBe("Kassen ohne Schlange");
    expect(r.searches).toBe(8);
    expect(r.costUsd).toBeGreaterThan(0);
    const first = calls[0] as { tools: { name: string; max_uses?: number }[]; system: { cache_control?: unknown }[] };
    expect(first.tools.map((t) => t.name)).toEqual(["web_search", "web_fetch", "report_startups"]);
    expect(first.tools[0].max_uses).toBe(10);
    expect(first.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("bricht bei Ablehnung ab", async () => {
    const { client } = mockClient([{ ...msg("refusal", []), stop_details: { category: "cyber" } }]);
    await expect(runVentureAgent(client, { challenge, trends: [], known: [], today: new Date() })).rejects.toThrow(/abgelehnt/);
  });
});
