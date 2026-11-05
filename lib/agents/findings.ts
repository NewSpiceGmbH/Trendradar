import { z } from "zod";

/**
 * Ausgabe eines Scout-Laufs. Claude liefert sie über das Werkzeug `report_findings` (strict: das Schema wird
 * eingehalten); hier zusätzlich mit Zod geprüft, bevor etwas gespeichert wird (docs/agents.md).
 */

const nullableString = { type: ["string", "null"] } as const;

export const REPORT_TOOL = {
  name: "report_findings",
  description:
    "Liefert das Ergebnis des Scouting-Laufs. Genau einmal am Ende aufrufen, auch wenn nichts Neues gefunden wurde (dann mit leerer Liste).",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["signals", "notes"],
    properties: {
      signals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "summary", "url", "publisher", "published_on", "kind", "press_release", "suggested_trends", "evidence", "relevance", "from_tip", "media"],
          properties: {
            title: { type: "string", description: "Deutsche Überschrift, höchstens 120 Zeichen, eigene Worte" },
            summary: { type: "string", description: "2–3 Sätze auf Deutsch, eigene Zusammenfassung, keine Zitate" },
            url: { type: "string", description: "Erreichbare URL der Originalquelle" },
            publisher: nullableString,
            published_on: { type: ["string", "null"], description: "Datum YYYY-MM-DD, falls bekannt" },
            kind: { type: "string", enum: ["launch", "pilot", "study", "regulation", "deal", "event", "video", "other"] },
            press_release: { type: "boolean", description: "Pressemitteilung eines Anbieters" },
            suggested_trends: { type: "array", items: { type: "integer" }, description: "Passende Trendnummern (#), höchstens 3" },
            evidence: { type: "string", enum: ["A", "B", "C"] },
            relevance: { type: "integer", enum: [1, 2, 3], description: "Bedeutung für das Revier des Scouts, 3 = hoch" },
            from_tip: { type: ["string", "null"], description: "URL des eingereichten Tipps, falls die Meldung daraus stammt" },
            media: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["kind", "url", "title", "credit", "license", "rights_hint"],
                properties: {
                  kind: { type: "string", enum: ["video", "image"] },
                  url: { type: "string", description: "Video: YouTube-/Vimeo-Link. Bild: direkte Bild-URL aus einem Pressebereich oder unter freier Lizenz" },
                  title: nullableString,
                  credit: { type: ["string", "null"], description: "Bildnachweis / Urheber" },
                  license: { type: ["string", "null"], description: "z. B. „Pressebild, honorarfrei mit Nachweis“, „CC BY 4.0“" },
                  rights_hint: { type: "string", enum: ["press", "cc", "unclear"] },
                },
              },
            },
          },
        },
      },
      notes: { type: "string", description: "Kurzer Bericht an die Redaktion: was gesucht wurde, was auffiel, Lücken" },
    },
  },
} as const;

const media = z.object({
  kind: z.enum(["video", "image"]),
  url: z.string().url(),
  title: z.string().nullable(),
  credit: z.string().nullable(),
  license: z.string().nullable(),
  rights_hint: z.enum(["press", "cc", "unclear"]),
});

export const findingSchema = z.object({
  title: z.string().min(5).max(200),
  summary: z.string().min(20).max(1200),
  url: z.string().url().refine((u) => /^https?:\/\//.test(u), "nur http(s)"),
  publisher: z.string().nullable(),
  published_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  kind: z.enum(["launch", "pilot", "study", "regulation", "deal", "event", "video", "other"]),
  press_release: z.boolean(),
  suggested_trends: z.array(z.number().int()).max(5),
  evidence: z.enum(["A", "B", "C"]),
  relevance: z.number().int().min(1).max(3),
  from_tip: z.string().nullable(),
  media: z.array(media).max(6),
});

export const reportSchema = z.object({
  signals: z.array(z.unknown()),
  notes: z.string(),
});

export type Finding = z.infer<typeof findingSchema>;

/** Prüft die Ausgabe; ungültige Einzelmeldungen werden verworfen statt den ganzen Lauf scheitern zu lassen */
export function parseReport(input: unknown): { findings: Finding[]; notes: string; rejected: number } {
  const r = reportSchema.parse(input);
  const findings: Finding[] = [];
  let rejected = 0;
  for (const s of r.signals) {
    const p = findingSchema.safeParse(s);
    if (p.success) findings.push(p.data);
    else rejected++;
  }
  return { findings, notes: r.notes, rejected };
}
