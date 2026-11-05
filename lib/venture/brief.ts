import { z } from "zod";

/**
 * Problem-Briefing aus dem Deep Dive. Der Deep-Dive-Agent liefert es über das Werkzeug `report_brief` (strict),
 * die Redaktion bearbeitet es, dann wird es zur Scouting-Grundlage der Challenge.
 * Nur Rollen, keine Namen von Personen.
 */
export const CONSTRAINT_TOPICS = ["technik", "betrieb", "budget", "zeit", "datenschutz", "sonstiges"] as const;
export const CONSTRAINT_LABEL: Record<(typeof CONSTRAINT_TOPICS)[number], string> = {
  technik: "Technik", betrieb: "Betrieb", budget: "Budget", zeit: "Zeit", datenschutz: "Datenschutz", sonstiges: "Sonstiges",
};

const str = z.string().max(4000);
const list = z.array(z.string().min(1).max(600)).max(30);

export const briefSchema = z.object({
  summary: str,
  problem: str,
  current_process: str,
  context: str,
  root_causes: list,
  pain_points: z.array(z.object({ text: z.string().min(1).max(600), evidence: z.string().max(300).nullable(), from: z.string().max(200).nullable() })).max(30),
  stakeholders: z.array(z.object({ role: z.string().min(1).max(200), interest: z.string().max(400) })).max(20),
  goal: str,
  success_criteria: list,
  must_haves: list,
  nice_to_haves: list,
  exclusions: list,
  constraints: z.array(z.object({ topic: z.enum(CONSTRAINT_TOPICS), text: z.string().min(1).max(600) })).max(30),
  existing_systems: list,
  search_hypotheses: z.array(z.object({ approach: z.string().min(1).max(400), keywords: z.array(z.string().max(80)).max(15), analogies: z.array(z.string().max(120)).max(10) })).max(12),
  open_questions: list,
  contradictions: list,
  timeframe: z.string().max(200).nullable(),
  budget: z.string().max(200).nullable(),
});
export type Brief = z.infer<typeof briefSchema>;

export const EMPTY_BRIEF: Brief = {
  summary: "", problem: "", current_process: "", context: "", root_causes: [], pain_points: [], stakeholders: [], goal: "",
  success_criteria: [], must_haves: [], nice_to_haves: [], exclusions: [], constraints: [], existing_systems: [],
  search_hypotheses: [], open_questions: [], contradictions: [], timeframe: null, budget: null,
};

const s = { type: "string" } as const;
const ns = { type: ["string", "null"] } as const;
const arr = (items: object, description?: string) => ({ type: "array", items, ...(description ? { description } : {}) });

export const BRIEF_TOOL = {
  name: "report_brief",
  description: "Liefert das konsolidierte Problem-Briefing (bisheriger Stand plus neues Gespräch). Genau einmal am Ende aufrufen.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["brief", "session_summary"],
    properties: {
      session_summary: { type: "string", description: "Kurzfassung nur dieses Gesprächs in 2–4 Sätzen, ohne Namen" },
      brief: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(EMPTY_BRIEF),
        properties: {
          summary: { type: "string", description: "Das Problem in 2–4 Sätzen, so dass ein Außenstehender es versteht" },
          problem: { type: "string", description: "Was ist heute das Problem – konkret, mit Zahlen, wo genannt" },
          current_process: { type: "string", description: "Wie läuft es heute ab (Ist-Prozess)" },
          context: { type: "string", description: "Venue, Größe, Zielgruppe, Besonderheiten" },
          root_causes: arr(s, "Vermutete oder belegte Ursachen"),
          pain_points: arr({
            type: "object", additionalProperties: false, required: ["text", "evidence", "from"],
            properties: { text: s, evidence: { type: ["string", "null"], description: "Zahl oder Beleg aus dem Gespräch, z. B. „12 Minuten“" }, from: { type: ["string", "null"], description: "Titel des Gesprächs, aus dem es stammt" } },
          }),
          stakeholders: arr({ type: "object", additionalProperties: false, required: ["role", "interest"], properties: { role: { type: "string", description: "Rolle, nie ein Name" }, interest: s } }),
          goal: { type: "string", description: "Was soll erreicht werden" },
          success_criteria: arr(s, "Messbare Erfolgskriterien (KPIs)"),
          must_haves: arr(s, "Zwingende Anforderungen an eine Lösung"),
          nice_to_haves: arr(s),
          exclusions: arr(s, "Was nicht in Frage kommt (Ansätze, Anbieter, Bedingungen)"),
          constraints: arr({ type: "object", additionalProperties: false, required: ["topic", "text"], properties: { topic: { type: "string", enum: [...CONSTRAINT_TOPICS] }, text: s } }),
          existing_systems: arr(s, "Vorhandene Systeme und Partner, an die angebunden werden muss"),
          search_hypotheses: arr({
            type: "object", additionalProperties: false, required: ["approach", "keywords", "analogies"],
            properties: { approach: { type: "string", description: "Lösungsansatz" }, keywords: arr(s, "Suchbegriffe, deutsch und englisch"), analogies: arr(s, "Branchen mit ähnlichem Problem, z. B. Flughafen, Handel") },
          }, "Hypothesen für die Startup-Suche"),
          open_questions: arr(s, "Was im Gespräch offen blieb – für das nächste Gespräch"),
          contradictions: arr(s, "Widersprüche zwischen Gesprächen oder Aussagen"),
          timeframe: ns,
          budget: ns,
        },
      },
    },
  },
} as const;

export function parseBriefReport(input: unknown): { brief: Brief; sessionSummary: string } {
  const r = z.object({ brief: briefSchema, session_summary: z.string().max(2000) }).parse(input);
  return { brief: r.brief, sessionSummary: r.session_summary };
}

/** Ein Briefing aus der Datenbank lesen; unvollständige oder alte Stände werden mit Leerwerten aufgefüllt */
export function readBrief(raw: unknown): Brief | null {
  if (!raw || typeof raw !== "object") return null;
  const merged = { ...EMPTY_BRIEF, ...(raw as Record<string, unknown>) };
  const p = briefSchema.safeParse(merged);
  return p.success ? p.data : null;
}

const block = (title: string, xs: string[]) => (xs.length ? `${title}:\n${xs.map((x) => `- ${x}`).join("\n")}` : "");

/** Felder der Challenge aus dem Briefing (Übernahme als Scouting-Grundlage) */
export function challengeFieldsFromBrief(b: Brief) {
  const problem = [b.summary, b.problem, b.current_process && `Heute: ${b.current_process}`].filter(Boolean).join("\n\n");
  const goal = [b.goal, block("Erfolgskriterien", b.success_criteria)].filter(Boolean).join("\n\n");
  const context = [
    b.context,
    b.stakeholders.length ? `Beteiligte: ${b.stakeholders.map((x) => `${x.role}${x.interest ? ` (${x.interest})` : ""}`).join("; ")}` : "",
    b.existing_systems.length ? `Vorhandene Systeme: ${b.existing_systems.join(", ")}` : "",
  ].filter(Boolean).join("\n");
  return {
    problem, goal, context, mustHaves: b.must_haves, exclusions: b.exclusions,
    ...(b.timeframe ? { timeframe: b.timeframe } : {}), ...(b.budget ? { budget: b.budget } : {}),
  };
}

/** Zusätzlicher Auftrag an den Venture-Agenten: was über die Challenge-Felder hinaus im Deep Dive herauskam */
export function briefForScouting(b: Brief): string {
  return [
    "Ergebnis des Problem Deep Dive (aus Gesprächen mit dem Kunden, von der Redaktion geprüft):",
    block("Ursachen", b.root_causes),
    b.pain_points.length ? `Schmerzpunkte:\n${b.pain_points.map((p) => `- ${p.text}${p.evidence ? ` (${p.evidence})` : ""}`).join("\n")}` : "",
    block("Wunsch-Kriterien (nicht zwingend)", b.nice_to_haves),
    b.constraints.length ? `Rahmenbedingungen:\n${b.constraints.map((c) => `- ${CONSTRAINT_LABEL[c.topic]}: ${c.text}`).join("\n")}` : "",
    block("Vorhandene Systeme (Anbindung nötig)", b.existing_systems),
    b.search_hypotheses.length
      ? `Suchhypothesen (Ausgangspunkt, nicht abschließend):\n${b.search_hypotheses.map((h) => `- ${h.approach}${h.keywords.length ? ` – Suchbegriffe: ${h.keywords.join(", ")}` : ""}${h.analogies.length ? ` – Analogien: ${h.analogies.join(", ")}` : ""}`).join("\n")}`
      : "",
    block("Offene Fragen (bei Kandidaten mitbedenken)", b.open_questions),
  ].filter(Boolean).join("\n\n");
}

// ───────────────────────── Bearbeiten als Zeilen ─────────────────────────
// Im Editor stehen Listen als eine Zeile je Eintrag; Teile mit „|“ getrennt, Begriffe mit Komma.

const parts = (line: string) => line.split("|").map((x) => x.trim());
const csv = (s: string | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const nonEmpty = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

export const linesOf = (xs: string[]) => xs.join("\n");
export const listFrom = (text: string) => nonEmpty(text);

export const painLines = (xs: Brief["pain_points"]) => xs.map((p) => [p.text, p.evidence ?? "", p.from ?? ""].join(" | ").replace(/( \| )+$/, "")).join("\n");
export const painFrom = (text: string): Brief["pain_points"] =>
  nonEmpty(text).map((l) => { const [t, e, f] = parts(l); return { text: t, evidence: e || null, from: f || null }; }).filter((p) => p.text);

export const stakeLines = (xs: Brief["stakeholders"]) => xs.map((s) => (s.interest ? `${s.role} | ${s.interest}` : s.role)).join("\n");
export const stakeFrom = (text: string): Brief["stakeholders"] => nonEmpty(text).map((l) => { const [r, i] = parts(l); return { role: r, interest: i ?? "" }; }).filter((s) => s.role);

export const constraintLines = (xs: Brief["constraints"]) => xs.map((c) => `${CONSTRAINT_LABEL[c.topic]}: ${c.text}`).join("\n");
export function constraintFrom(text: string): Brief["constraints"] {
  const byLabel = new Map(CONSTRAINT_TOPICS.map((t) => [CONSTRAINT_LABEL[t].toLowerCase(), t]));
  return nonEmpty(text).map((l) => {
    const m = l.match(/^([^:]{2,20}):\s*(.+)$/);
    const topic = m ? byLabel.get(m[1].trim().toLowerCase()) : undefined;
    return topic ? { topic, text: m![2].trim() } : { topic: "sonstiges" as const, text: l };
  });
}

export const hypoLines = (xs: Brief["search_hypotheses"]) => xs.map((h) => [h.approach, h.keywords.join(", "), h.analogies.join(", ")].join(" | ").replace(/( \| )+$/, "")).join("\n");
export const hypoFrom = (text: string): Brief["search_hypotheses"] =>
  nonEmpty(text).map((l) => { const [a, k, an] = parts(l); return { approach: a, keywords: csv(k), analogies: csv(an) }; }).filter((h) => h.approach);
