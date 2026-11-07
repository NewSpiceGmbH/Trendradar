import { z } from "zod";
import { DETAIL_FIELDS, PARTNER_TYPES, type PartnerType } from "@/lib/network/types";
import { MATURITY_ORDER } from "@/lib/venture/types";

/** Bewerbungsformular: Prüfung der Eingaben (Client und Server nutzen dieselbe Logik) */

export const MAX_PITCH_BYTES = 15 * 1024 * 1024;
/** Wer etwas anbietet, kann Angebot und Referenzen angeben */
export const OFFER_TYPES: PartnerType[] = ["solution_provider", "caterer", "operator"];

const text = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen.`);
const optional = (max: number) => text(max).transform((v) => (v ? v : null)).nullable().optional();

export const applicationSchema = z.object({
  partnerType: z.enum(PARTNER_TYPES as [PartnerType, ...PartnerType[]], { message: "Bitte einen Partner-Typ wählen." }),
  orgName: text(200).min(1, "Bitte den Namen der Organisation angeben."),
  contactName: text(200).min(1, "Bitte Ihren Namen angeben."),
  contactRole: optional(200),
  email: z.email("Bitte eine gültige E-Mail-Adresse angeben.").max(320),
  website: z.string().trim().max(500).transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v || null))
    .refine((v) => v == null || /^https?:\/\/[^\s/.]+\.[^\s]+$/i.test(v), "Bitte eine gültige Website angeben.").nullable().optional(),
  founded: z.coerce.number().int().min(1800, "Gründungsjahr prüfen.").max(new Date().getFullYear(), "Gründungsjahr prüfen.").nullable().optional(),
  details: z.record(z.string(), text(300)).default({}),
  offer: optional(4000),
  offerCategoryIds: z.array(z.string().uuid().or(z.string().regex(/^cat-[\w-]+$/))).max(3, "Bitte höchstens 3 Kategorien wählen.").default([]),
  maturity: z.enum(MATURITY_ORDER as [string, ...string[]]).nullable().optional(),
  referencesText: optional(4000),
  message: optional(4000),
  privacy: z.literal(true, { message: "Bitte die Datenschutzhinweise bestätigen." }),
}).superRefine((v, ctx) => {
  if (v.partnerType === "solution_provider" && !v.founded) {
    ctx.addIssue({ code: "custom", path: ["founded"], message: "Bitte das Gründungsjahr angeben." });
  }
  if (v.partnerType === "solution_provider" && !v.offer) {
    ctx.addIssue({ code: "custom", path: ["offer"], message: "Bitte kurz beschreiben, was Sie anbieten." });
  }
});
export type ApplicationInput = z.infer<typeof applicationSchema>;

/** Nur die Felder des gewählten Typs übernehmen (keine fremden Schlüssel speichern) */
export function cleanDetails(type: PartnerType, details: Record<string, string>): Record<string, string> {
  const keys = new Set(DETAIL_FIELDS[type].map((f) => f.key));
  return Object.fromEntries(Object.entries(details).filter(([k, v]) => keys.has(k) && v.trim()).map(([k, v]) => [k, v.trim()]));
}

/** FormData → Objekt für das Schema */
export function fromFormData(fd: FormData) {
  const s = (k: string) => (fd.get(k) == null ? undefined : String(fd.get(k)));
  const details: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("details.") && typeof v === "string") details[k.slice(8)] = v;
  return {
    partnerType: s("partnerType"), orgName: s("orgName") ?? "", contactName: s("contactName") ?? "", contactRole: s("contactRole"),
    email: (s("email") ?? "").trim().toLowerCase(), website: s("website") ?? "", founded: s("founded") ? s("founded") : null, details,
    offer: s("offer"), offerCategoryIds: fd.getAll("offerCategoryIds").map(String), maturity: s("maturity") || null,
    referencesText: s("referencesText"), message: s("message"), privacy: fd.get("privacy") === "on" ? true : undefined,
  };
}

/** Ist die Datei ein PDF? (Größe und Kopfbytes, nicht nur Endung) */
export function checkPdf(name: string, size: number, head: Uint8Array): string | null {
  if (size > MAX_PITCH_BYTES) return "Das Pitchdeck ist größer als 15 MB.";
  if (!/\.pdf$/i.test(name)) return "Bitte das Pitchdeck als PDF hochladen.";
  const sig = [0x25, 0x50, 0x44, 0x46]; // %PDF
  if (head.length < 4 || sig.some((b, i) => head[i] !== b)) return "Die Datei ist kein gültiges PDF.";
  return null;
}
