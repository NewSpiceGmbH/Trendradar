import type Anthropic from "@anthropic-ai/sdk";
import { REPORT_TOOL, parseReport, type Finding } from "./findings";
import { addUsage, costOf, ZERO_USAGE, type UsageLike } from "./pricing";
import { SCOUT_PROMPT_VERSION, SCOUT_RULES, trendList, type TrendRef } from "./prompts/scout";
import { REGION_LABEL, VERTICAL_LABEL, type Channel, type Scout, type Tip } from "./types";

/**
 * Scout-Agent: ein Lauf = eine Agentenschleife über die Claude-API mit Websuche und Webabruf (serverseitig bei Anthropic).
 * Abschluss immer über das Werkzeug report_findings mit festem Schema. Keine Datenbankzugriffe hier – das macht run.ts.
 */

export interface Candidate {
  title: string;
  url: string;
  source: string;
  published?: string | null;
}

export interface BriefingInput {
  scout: Scout;
  channels: Channel[];
  trends: TrendRef[];
  candidates: Candidate[];
  tips: Tip[];
  knownUrls: string[];
  since: Date;
  today: Date;
}

const list = (xs: string[]) => (xs.length ? xs.join(", ") : "–");
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Auftrag des einzelnen Scouts (variabler Teil des Prompts) */
export function buildBriefing(b: BriefingInput): string {
  const s = b.scout;
  const watch = b.trends.filter((t) => s.watchTrends.includes(t.number));
  const sites = b.channels.filter((c) => c.active && (c.kind === "website" || c.kind === "linkedin") && c.url);
  const lines = [
    `Du bist „${s.name}“${s.role ? ` (${s.role})` : ""}${s.shirtNumber ? `, Rückennummer ${s.shirtNumber}` : ""}.`,
    `Heute ist ${day(b.today)}. Suche nach Signalen seit ${day(b.since)}.`,
    "",
    `Auftrag der Redaktion:\n${s.briefing || "(kein Freitext)"}`,
    "",
    `Revier:`,
    `- Branchen: ${list(s.verticals.map((v) => VERTICAL_LABEL[v]))}`,
    `- Regionen: ${list(s.regions.map((r) => REGION_LABEL[r]))}`,
    `- Cluster: ${list(s.clusters)}`,
    `- Zielgruppe: ${s.audience === "vip" ? "Hospitality (VIP, Logen, Business)" : s.audience === "public" ? "Public (normale Ränge)" : "Hospitality und Public"}`,
    `- Stichwörter: ${list(s.keywords)}`,
    `- Nicht melden: ${list(s.exclusions)}`,
    `- Sprachen der Quellen: ${list(s.languages)}`,
    watch.length ? `- Beobachtungsliste: ${watch.map((t) => `#${t.number} ${t.name}`).join(", ")}` : "",
    "",
    sites.length ? `Bevorzugte Quellen (Startseiten, bei Bedarf mit Webabruf lesen):\n${sites.map((c) => `- ${c.name}: ${c.url}${c.access !== "open" ? " (teils nur mit Abo – frei zugängliche Inhalte nutzen)" : ""}`).join("\n")}` : "",
    b.candidates.length ? `\nNeue Einträge aus angedockten Feeds und Kanälen (prüfen, nur Relevantes melden):\n${b.candidates.map((c) => `- [${c.source}] ${c.title} – ${c.url}${c.published ? ` (${c.published})` : ""}`).join("\n")}` : "",
    b.tips.length ? `\nTipps der Redaktion (vorrangig auswerten, from_tip setzen):\n${b.tips.map((t) => `- ${t.url}${t.note ? ` – Notiz: ${t.note}` : ""}`).join("\n")}` : "",
    b.knownUrls.length ? `\nBereits bekannte Adressen (nicht erneut melden):\n${b.knownUrls.slice(0, 80).map((u) => `- ${u}`).join("\n")}` : "",
    "",
    `Liefere höchstens ${s.maxSignals} Meldungen mit mindestens Evidenz ${s.minEvidence === "A" ? "A" : s.minEvidence === "B" ? "B (A oder B)" : "C"}.${s.deliverMedia ? " Füge passende Videos oder rechtlich saubere Bilder hinzu, wenn es sie gibt." : " Ohne Medien."}`,
    `Schließe mit report_findings ab.`,
  ];
  return lines.filter((l) => l !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}

export interface ScoutResult {
  findings: Finding[];
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

/** Führt den Agenten aus. `client` wird injiziert, damit Tests ohne echte API laufen. */
export async function runScoutAgent(client: Client, b: BriefingInput, opts: { maxTurns?: number } = {}): Promise<ScoutResult> {
  const s = b.scout;
  const maxTurns = opts.maxTurns ?? 8;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: buildBriefing(b) }];
  let usage = ZERO_USAGE;
  let model = s.model;

  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await client.beta.messages
      .stream({
        model: s.model,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: s.effort },
        // stabiler Teil zuerst und gecacht: Regeln und Trendliste ändern sich selten
        system: [{ type: "text", text: `${SCOUT_RULES}\n\n${trendList(b.trends)}`, cache_control: { type: "ephemeral" } }],
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: s.maxSearches },
          // Webabruf nur für Adressen, die im Gespräch vorkommen (Quellen, Feeds, Tipps, Suchergebnisse)
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: Math.max(5, s.maxSearches) },
          REPORT_TOOL as unknown as Anthropic.Beta.BetaTool,
        ],
        messages,
      })
      .finalMessage();

    usage = addUsage(usage, res.usage as unknown as UsageLike);
    model = res.model ?? model;

    if (res.stop_reason === "refusal") throw new Error(`Lauf abgelehnt (${res.stop_details?.category ?? "ohne Kategorie"})`);
    const report = res.content.find((c): c is Anthropic.Beta.BetaToolUseBlock => c.type === "tool_use" && c.name === "report_findings");
    if (report) {
      const parsed = parseReport(report.input);
      const { usd, searches } = costOf(s.model, usage);
      return { ...parsed, usage, costUsd: usd, searches, model, promptVersion: SCOUT_PROMPT_VERSION, turns: turn };
    }

    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "pause_turn") continue; // Server-Werkzeuge laufen noch: Turn fortsetzen
    if (res.stop_reason === "max_tokens") throw new Error("Lauf abgebrochen: Antwort zu lang (max_tokens).");
    // Ende ohne Bericht: einmal freundlich auf den Abschluss hinweisen
    messages.push({ role: "user", content: "Bitte schließe jetzt mit einem Aufruf von report_findings ab." });
  }
  throw new Error(`Kein Bericht nach ${maxTurns} Durchgängen.`);
}
