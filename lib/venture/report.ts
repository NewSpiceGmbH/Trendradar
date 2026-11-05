import { z } from "zod";
import { CRITERIA } from "./types";

/**
 * Ausgabe eines Venture-Clienting-Laufs. Claude liefert sie über das Werkzeug `report_startups` (strict);
 * hier zusätzlich mit Zod geprüft. Ungültige Einzelkandidaten werden verworfen, nicht der ganze Lauf.
 */
const nullableString = { type: ["string", "null"] } as const;
const CRITERION_KEYS = CRITERIA.map((c) => c.key);

export const VENTURE_REPORT_TOOL = {
  name: "report_startups",
  description: "Liefert die vorevaluierten Startups zur Challenge. Genau einmal am Ende aufrufen, auch wenn nichts Passendes gefunden wurde (dann leere Liste).",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["strategy", "candidates", "notes"],
    properties: {
      strategy: { type: "string", description: "Suchstrategie in 2–4 Sätzen: Lösungsansätze, Suchbegriffe, Analogien aus anderen Branchen" },
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "website", "country", "founded", "stage", "funding", "summary", "approach", "scores", "recommendation", "must_have_gaps", "open_questions", "sources", "uncertain"],
          properties: {
            name: { type: "string" },
            website: { type: ["string", "null"], description: "Offizielle Website (https://…)" },
            country: nullableString,
            founded: { type: ["integer", "null"] },
            stage: { type: "string", enum: ["idea", "prototype", "pilot", "market", "scale", "unknown"], description: "Reifegrad; unknown, wenn nicht belegt" },
            funding: { type: ["string", "null"], description: "z. B. „Seed, 6 Mio. € (2025)“ – nur wenn belegt" },
            summary: { type: "string", description: "Was die Lösung tut, 2–3 Sätze auf Deutsch, eigene Worte" },
            approach: { type: ["string", "null"], description: "Wie sie das Problem der Challenge löst; bei Analogie: woher (z. B. Flughafen)" },
            scores: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["criterion", "score", "rationale", "source_url"],
                properties: {
                  criterion: { type: "string", enum: CRITERION_KEYS },
                  score: { type: "integer", enum: [1, 2, 3, 4, 5] },
                  rationale: { type: "string", description: "Begründung in einem Satz" },
                  source_url: { type: ["string", "null"], description: "Beleg für die Bewertung" },
                },
              },
            },
            recommendation: { type: "string", enum: ["shortlist", "watch", "no_fit"] },
            must_have_gaps: { type: "array", items: { type: "string" }, description: "Muss-Kriterien, die nicht erfüllt oder nicht belegt sind" },
            open_questions: { type: "array", items: { type: "string" }, description: "Fragen fürs Erstgespräch" },
            sources: {
              type: "array",
              items: { type: "object", additionalProperties: false, required: ["url", "title"], properties: { url: { type: "string" }, title: nullableString } },
            },
            uncertain: { type: "boolean", description: "true, wenn wesentliche Angaben nicht belegt sind" },
          },
        },
      },
      notes: { type: "string", description: "Kurzer Bericht an die Redaktion: was gesucht wurde, was auffiel, Lücken im Markt" },
    },
  },
} as const;

const url = z.string().url().refine((u) => /^https?:\/\//.test(u), "nur http(s)");

export const candidateSchema = z.object({
  name: z.string().min(2).max(120),
  website: url.nullable().catch(null),
  country: z.string().max(60).nullable(),
  founded: z.number().int().min(1990).max(2100).nullable().catch(null),
  stage: z.enum(["idea", "prototype", "pilot", "market", "scale"]).nullable().catch(null), // „unknown“ → null
  funding: z.string().max(200).nullable(),
  summary: z.string().min(20).max(1200),
  approach: z.string().max(1200).nullable(),
  scores: z.array(z.object({
    criterion: z.enum(CRITERION_KEYS as [string, ...string[]]),
    score: z.number().int().min(1).max(5),
    rationale: z.string().min(3).max(600),
    source_url: url.nullable().catch(null),
  })).min(1),
  recommendation: z.enum(["shortlist", "watch", "no_fit"]),
  must_have_gaps: z.array(z.string().max(300)).max(10),
  open_questions: z.array(z.string().max(300)).max(10),
  sources: z.array(z.object({ url, title: z.string().nullable() })).min(1, "mindestens eine Quelle").max(10),
  uncertain: z.boolean(),
});

export type ReportedCandidate = z.infer<typeof candidateSchema>;

export function parseVentureReport(input: unknown): { strategy: string; candidates: ReportedCandidate[]; notes: string; rejected: number } {
  const r = z.object({ strategy: z.string(), candidates: z.array(z.unknown()), notes: z.string() }).parse(input);
  const candidates: ReportedCandidate[] = [];
  let rejected = 0;
  for (const c of r.candidates) {
    const p = candidateSchema.safeParse(c);
    if (p.success) candidates.push(p.data);
    else rejected++;
  }
  return { strategy: r.strategy, candidates, notes: r.notes, rejected };
}
