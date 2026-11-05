import { describe, expect, it } from "vitest";
import { EMPTY_BRIEF } from "./brief";
import { deepDiveMessage, runDeepDiveAgent } from "./deepdive";

const input = { challenge: { title: "Bierstand", problem: "Schlangen", goal: "", context: "" }, brief: null, transcript: { kind: "text" as const, text: "Wir warten 12 Minuten." }, session: { title: "Gespräch 1", heldOn: "2026-11-04" } };
const msg = (stop_reason: string, content: unknown[]) => ({
  model: "claude-opus-5-5", stop_reason, stop_details: null, content,
  usage: { input_tokens: 30_000, output_tokens: 3_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0 } },
});

describe("Deep-Dive-Agent", () => {
  it("schickt Text im Transkript-Block, PDF als Dokument", () => {
    const t = deepDiveMessage(input);
    expect(t[0]).toMatchObject({ type: "text" });
    expect((t[0] as { text: string }).text).toContain("<transkript>\nWir warten 12 Minuten.\n</transkript>");
    expect((t[0] as { text: string }).text).toContain("„Gespräch 1“ vom 2026-11-04");
    const p = deepDiveMessage({ ...input, transcript: { kind: "pdf", base64: "JVBERi0=" } });
    expect(p[1]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
  });

  it("liefert das Briefing und die Kosten", async () => {
    const calls: unknown[] = [];
    const client = { beta: { messages: { stream: (p: unknown) => { calls.push(p); return { finalMessage: async () => msg("tool_use", [{ type: "tool_use", id: "t", name: "report_brief", input: { brief: { ...EMPTY_BRIEF, summary: "Kasse ist der Engpass." }, session_summary: "Kurz." } }]) }; } } } } as never;
    const r = await runDeepDiveAgent(client, input);
    expect(r.brief.summary).toBe("Kasse ist der Engpass.");
    expect(r.sessionSummary).toBe("Kurz.");
    expect(r.costUsd).toBeGreaterThan(0);
    expect((calls[0] as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual(["report_brief"]);
  });
});
