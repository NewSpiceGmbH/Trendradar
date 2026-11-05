import type Anthropic from "@anthropic-ai/sdk";
import { addUsage, costOf, ZERO_USAGE, type UsageLike } from "@/lib/agents/pricing";
import { buildChallengeBriefing, ventureSystem, VENTURE_PROMPT_VERSION, type ChallengeBriefing } from "./prompt";
import { parseVentureReport, VENTURE_REPORT_TOOL, type ReportedCandidate } from "./report";

/**
 * Venture-Clienting-Agent: ein Lauf je Challenge. Agentenschleife über die Claude-API mit Websuche und Webabruf
 * (serverseitig bei Anthropic), Abschluss über report_startups. Keine Datenbankzugriffe hier – das macht run.ts.
 */
export interface VentureResult {
  strategy: string;
  candidates: ReportedCandidate[];
  notes: string;
  rejected: number;
  usage: UsageLike;
  costUsd: number;
  searches: number;
  model: string;
  promptVersion: string;
  turns: number;
}

type Client = Pick<Anthropic, "beta">;

export async function runVentureAgent(client: Client, b: ChallengeBriefing, opts: { maxTurns?: number } = {}): Promise<VentureResult> {
  const c = b.challenge;
  const maxTurns = opts.maxTurns ?? 10;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: buildChallengeBriefing(b) }];
  let usage = ZERO_USAGE;
  let model = c.model;

  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await client.beta.messages
      .stream({
        model: c.model,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: c.effort },
        system: [{ type: "text", text: ventureSystem(b.trends), cache_control: { type: "ephemeral" } }],
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: c.maxSearches },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: Math.max(8, c.maxSearches) },
          VENTURE_REPORT_TOOL as unknown as Anthropic.Beta.BetaTool,
        ],
        messages,
      })
      .finalMessage();

    usage = addUsage(usage, res.usage as unknown as UsageLike);
    model = res.model ?? model;

    if (res.stop_reason === "refusal") throw new Error(`Lauf abgelehnt (${res.stop_details?.category ?? "ohne Kategorie"})`);
    const report = res.content.find((x): x is Anthropic.Beta.BetaToolUseBlock => x.type === "tool_use" && x.name === "report_startups");
    if (report) {
      const parsed = parseVentureReport(report.input);
      const { usd, searches } = costOf(c.model, usage);
      return { ...parsed, usage, costUsd: usd, searches, model, promptVersion: VENTURE_PROMPT_VERSION, turns: turn };
    }

    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "pause_turn") continue; // Server-Werkzeuge laufen noch: Turn fortsetzen
    if (res.stop_reason === "max_tokens") throw new Error("Lauf abgebrochen: Antwort zu lang (max_tokens).");
    messages.push({ role: "user", content: "Bitte schließe jetzt mit einem Aufruf von report_startups ab." });
  }
  throw new Error(`Kein Bericht nach ${maxTurns} Durchgängen.`);
}
