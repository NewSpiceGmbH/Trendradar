import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { addUsage, costOf, ZERO_USAGE, type UsageLike } from "@/lib/agents/pricing";
import type { CategoryPayload } from "./types";

/**
 * Netzwerk-Manager, erste Aufgabe: aus den vorhandenen Mitgliedern und den Kandidaten aus Challenges eine Liste von
 * Angebotskategorien vorschlagen (etwa 30–40), je Kategorie mit Trends und den Mitgliedern, die sie anbieten.
 * Keine Websuche – Grundlage sind nur die Einträge. Ergebnis sind Vorschläge; die Redaktion entscheidet.
 */
export const NETWORK_PROMPT_VERSION = "network-categories-2026-11-06";
export const NETWORK_MODEL = "claude-opus-5-5";

export const CATEGORY_RULES = `Du bist der Netzwerk-Manager von New Spice. New Spice pflegt eine Netzwerk-Datenbank mit Mitgliedern aus Sport, Hospitality und Live Entertainment: Solution Provider (Startups und etablierte Anbieter), Vereine, Betreiber, Caterer, Multiplikatoren und Investoren.

Aufgabe: Schlage eine Liste von Angebotskategorien vor. Eine Angebotskategorie beschreibt, WAS angeboten oder gesucht wird (z. B. „Kassensysteme“, „Zapfsysteme“, „Bestell-Apps“, „Sensorik“, „Energiespeicher“, „Mehrweg“), nicht wer es anbietet und nicht für wen.

Regeln:
- Etwa 30–40 Kategorien, höchstens 40. Lieber eine Kategorie weniger als zwei, die dasselbe meinen.
- Name: kurz, deutsch, im Plural oder als Sammelbegriff, ohne Markennamen (2–3 Wörter). Gängige englische Fachbegriffe nur, wenn es kein übliches deutsches Wort gibt.
- Beschreibung: ein kurzer Satz, was dazugehört (und was nicht), damit die Redaktion Grenzfälle zuordnen kann.
- Trends: nur Nummern aus der mitgelieferten Trendliste, die wirklich zur Kategorie passen (0–4). Lieber keine als eine erzwungene Zuordnung.
- Mitglieder: nur IDs aus der Liste der Mitglieder, die diese Kategorie nach ihren Angaben anbieten. Kandidaten aus Challenges haben keine ID; sie dienen nur als Hinweis, welche Kategorien gebraucht werden.
- Bestehende Kategorien (falls genannt) nicht noch einmal vorschlagen.
- Begründung je Kategorie: ein Satz, worauf der Vorschlag beruht (welche Einträge, welches Muster). Nichts erfinden.
- Deutsch, sachlich. Beende mit genau einem Aufruf von report_categories.`;

export const CATEGORY_TOOL = {
  name: "report_categories",
  description: "Liefert die vorgeschlagenen Angebotskategorien. Genau einmal am Ende aufrufen.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["categories", "notes"],
    properties: {
      notes: { type: "string", description: "Kurze Anmerkung zum Vorgehen und zu Grenzfällen (1–3 Sätze)" },
      categories: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description", "trend_numbers", "member_ids", "rationale"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            trend_numbers: { type: "array", items: { type: "integer" } },
            member_ids: { type: "array", items: { type: "string" } },
            rationale: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export interface CategoryBriefing {
  members: { id: string; name: string; types: string[]; text: string; tags: string[] }[];
  candidates: { name: string; text: string }[];
  trends: { number: number; name: string }[];
  existing: string[];
}

export interface ProposedCategory extends CategoryPayload {
  rationale: string;
}

const reportSchema = z.object({
  notes: z.string().max(2000).default(""),
  categories: z.array(z.object({
    name: z.string(),
    description: z.string().default(""),
    trend_numbers: z.array(z.number().int()).default([]),
    member_ids: z.array(z.string()).default([]),
    rationale: z.string().default(""),
  })),
});

/**
 * Antwort prüfen und bereinigen: nur bekannte Trends und Mitglieder, keine Dubletten (auch nicht zu bestehenden
 * Kategorien), Begründung Pflicht, höchstens 40.
 */
export function parseCategoryReport(input: unknown, b: Pick<CategoryBriefing, "members" | "trends" | "existing">): { categories: ProposedCategory[]; notes: string; rejected: number } {
  const r = reportSchema.parse(input);
  const trends = new Set(b.trends.map((t) => t.number));
  const members = new Set(b.members.map((m) => m.id));
  const seen = new Set(b.existing.map((n) => n.trim().toLowerCase()));
  const out: ProposedCategory[] = [];
  let rejected = 0;
  for (const c of r.categories) {
    const name = c.name.replace(/\s+/g, " ").trim().slice(0, 60);
    const key = name.toLowerCase();
    if (!name || !c.rationale.trim() || seen.has(key) || out.length >= 40) { rejected++; continue; }
    seen.add(key);
    out.push({
      name,
      description: c.description.trim() || null,
      trend_numbers: [...new Set(c.trend_numbers.filter((n) => trends.has(n)))].sort((a, b) => a - b).slice(0, 4),
      member_ids: [...new Set(c.member_ids.filter((id) => members.has(id)))],
      rationale: c.rationale.trim().slice(0, 600),
    });
  }
  return { categories: out, notes: r.notes.trim(), rejected };
}

export function categoryMessage(b: CategoryBriefing): string {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return [
    `Trendliste (Nummer – Name):\n${b.trends.map((t) => `#${t.number} – ${t.name}`).join("\n")}`,
    b.existing.length ? `\nBestehende Kategorien (nicht erneut vorschlagen): ${b.existing.join(", ")}` : "\nEs gibt noch keine Kategorien.",
    `\nMitglieder (${b.members.length}):\n${b.members.map((m) => `- [${m.id}] ${m.name} (${m.types.join(", ")}): ${clip(m.text || "ohne Beschreibung", 400)}${m.tags.length ? ` · Schlagwörter: ${m.tags.join(", ")}` : ""}`).join("\n") || "(keine)"}`,
    `\nKandidaten aus Challenges (${b.candidates.length}, nur als Hinweis):\n${b.candidates.map((c) => `- ${c.name}: ${clip(c.text, 300)}`).join("\n") || "(keine)"}`,
  ].join("\n");
}

type Client = Pick<Anthropic, "beta">;

export interface CategoryResult {
  categories: ProposedCategory[];
  notes: string;
  rejected: number;
  usage: UsageLike;
  costUsd: number;
  model: string;
  promptVersion: string;
  turns: number;
}

export async function runCategoryAgent(client: Client, b: CategoryBriefing, opts: { maxTurns?: number } = {}): Promise<CategoryResult> {
  const maxTurns = opts.maxTurns ?? 3;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: categoryMessage(b) }];
  let usage = ZERO_USAGE;
  let model = NETWORK_MODEL;
  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await client.beta.messages
      .stream({
        model: NETWORK_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [{ type: "text", text: CATEGORY_RULES, cache_control: { type: "ephemeral" } }],
        tools: [CATEGORY_TOOL as unknown as Anthropic.Beta.BetaTool],
        messages,
      })
      .finalMessage();
    usage = addUsage(usage, res.usage as unknown as UsageLike);
    model = res.model ?? model;
    if (res.stop_reason === "refusal") throw new Error(`Vorschlag abgelehnt (${res.stop_details?.category ?? "ohne Kategorie"})`);
    const report = res.content.find((x): x is Anthropic.Beta.BetaToolUseBlock => x.type === "tool_use" && x.name === "report_categories");
    if (report) {
      const parsed = parseCategoryReport(report.input, b);
      return { ...parsed, usage, costUsd: costOf(NETWORK_MODEL, usage).usd, model, promptVersion: NETWORK_PROMPT_VERSION, turns: turn };
    }
    if (res.stop_reason === "max_tokens") throw new Error("Abgebrochen: Antwort zu lang (max_tokens).");
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: "Bitte schließe jetzt mit einem Aufruf von report_categories ab." });
  }
  throw new Error(`Keine Kategorien nach ${maxTurns} Durchgängen.`);
}
