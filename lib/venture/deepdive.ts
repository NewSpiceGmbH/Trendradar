import type Anthropic from "@anthropic-ai/sdk";
import { addUsage, costOf, ZERO_USAGE, type UsageLike } from "@/lib/agents/pricing";
import { BRIEF_TOOL, parseBriefReport, type Brief } from "./brief";
import type { TranscriptInput } from "./transcript";
import type { Challenge } from "./types";

/**
 * Deep-Dive-Agent: wertet ein Gesprächstranskript aus und führt es mit dem bisherigen Briefing zusammen.
 * Keine Websuche – nur das Gespräch. Das Transkript wird nirgends gespeichert.
 */
export const DEEPDIVE_PROMPT_VERSION = "deepdive-2026-11-05";
export const DEEPDIVE_MODEL = "claude-opus-5-5";

export const DEEPDIVE_RULES = `Du bist Analyst bei New Spice und bereitest Venture-Clienting-Projekte vor: Für ein konkretes Problem eines Kunden (Club, Arena, Venue, Hotel, Veranstalter) suchen wir später Startups, die es lösen. Vorher verstehen wir das Problem genau – im Problem Deep Dive.

Du bekommst das Transkript eines Gesprächs mit dem Kunden (oft automatisch erstellt, mit Fehlern und Füllwörtern) und den bisherigen Stand des Problem-Briefings. Deine Aufgabe: das Briefing aktualisieren.

Regeln:
- Konsolidieren, nicht überschreiben: Bisherige Inhalte bleiben, außer das neue Gespräch widerlegt oder präzisiert sie. Widersprüche nicht glätten, sondern unter contradictions festhalten.
- Konkret und mit Zahlen, wo sie genannt werden (Wartezeiten, Mengen, Kosten, Zeiträume) – als evidence beim Schmerzpunkt, mit dem Titel des Gesprächs in from.
- Keine Namen von Personen. Nur Rollen (z. B. „Leitung Gastronomie“). Keine privaten Details. Keine wörtlichen Zitate über einen kurzen Halbsatz hinaus.
- Nichts erfinden. Was nicht gesagt wurde, bleibt leer oder wird als offene Frage formuliert.
- Muss-Kriterien nur, wenn der Kunde sie als zwingend nennt; sonst Wunsch-Kriterien.
- Suchhypothesen: Leite Lösungsansätze ab, die zum Problem passen, mit Suchbegriffen (deutsch und englisch) und Analogien aus Branchen mit ähnlichem Problem (Flughafen, Bahnhof, Handel, Freizeitpark, Kantine, Messe).
- Offene Fragen: was für die Suche noch fehlt und im nächsten Gespräch geklärt werden sollte.
- Deutsch, sachlich, knapp. Beende mit genau einem Aufruf von report_brief.`;

export interface DeepDiveInput {
  challenge: Pick<Challenge, "title" | "problem" | "goal" | "context">;
  brief: Brief | null;
  transcript: TranscriptInput;
  session: { title: string; heldOn: string | null };
}

export interface DeepDiveResult {
  brief: Brief;
  sessionSummary: string;
  usage: UsageLike;
  costUsd: number;
  model: string;
  promptVersion: string;
  turns: number;
}

type Client = Pick<Anthropic, "beta">;

export function deepDiveMessage(b: DeepDiveInput): Anthropic.Beta.BetaContentBlockParam[] {
  const head = [
    `Challenge: ${b.challenge.title}`,
    b.challenge.problem ? `Bisherige Problembeschreibung: ${b.challenge.problem}` : "",
    `\nBisheriger Stand des Briefings (JSON, leer = erstes Gespräch):\n${b.brief ? JSON.stringify(b.brief) : "{}"}`,
    `\nNeues Gespräch: „${b.session.title}“${b.session.heldOn ? ` vom ${b.session.heldOn}` : ""}. ${b.transcript.kind === "pdf" ? "Transkript als PDF anbei." : "Transkript:"}`,
  ].filter(Boolean).join("\n");
  if (b.transcript.kind === "pdf") {
    return [
      { type: "text", text: head },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: b.transcript.base64 }, title: b.session.title },
    ];
  }
  return [{ type: "text", text: `${head}\n\n<transkript>\n${b.transcript.text}\n</transkript>` }];
}

export async function runDeepDiveAgent(client: Client, b: DeepDiveInput, opts: { maxTurns?: number } = {}): Promise<DeepDiveResult> {
  const maxTurns = opts.maxTurns ?? 3;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: deepDiveMessage(b) }];
  let usage = ZERO_USAGE;
  let model = DEEPDIVE_MODEL;
  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await client.beta.messages
      .stream({
        model: DEEPDIVE_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [{ type: "text", text: DEEPDIVE_RULES, cache_control: { type: "ephemeral" } }],
        tools: [BRIEF_TOOL as unknown as Anthropic.Beta.BetaTool],
        messages,
      })
      .finalMessage();
    usage = addUsage(usage, res.usage as unknown as UsageLike);
    model = res.model ?? model;
    if (res.stop_reason === "refusal") throw new Error(`Auswertung abgelehnt (${res.stop_details?.category ?? "ohne Kategorie"})`);
    const report = res.content.find((x): x is Anthropic.Beta.BetaToolUseBlock => x.type === "tool_use" && x.name === "report_brief");
    if (report) {
      const parsed = parseBriefReport(report.input);
      return { ...parsed, usage, costUsd: costOf(DEEPDIVE_MODEL, usage).usd, model, promptVersion: DEEPDIVE_PROMPT_VERSION, turns: turn };
    }
    if (res.stop_reason === "max_tokens") throw new Error("Auswertung abgebrochen: Antwort zu lang (max_tokens).");
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: "Bitte schließe jetzt mit einem Aufruf von report_brief ab." });
  }
  throw new Error(`Kein Briefing nach ${maxTurns} Durchgängen.`);
}
