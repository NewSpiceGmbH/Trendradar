"use server";

import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { origin } from "@/lib/auth/actions";
import { isFixtureMode } from "@/lib/auth/personas";
import { mailConfigured, sendMail } from "@/lib/mail/send";
import { applicationReceivedMail, confirmApplicationMail } from "@/lib/mail/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { fixtureSubmit } from "./fixture";
import { applicationSchema, checkPdf, cleanDetails, fromFormData, OFFER_TYPES } from "./form";
import { buildPrecheck, findDuplicates, hostOf } from "./precheck";

/**
 * Öffentliches Bewerbungsformular. Es wird kein Konto angelegt. Geschrieben wird serverseitig mit dem Secret-Key, weil
 * Besucher ohne Login keine Rechte in der Datenbank haben (bewusst: keine öffentliche Schreibregel). Schutz: Fangfeld,
 * Rate-Limit je IP (gehasht) und E-Mail-Adresse, Bestätigung der E-Mail-Adresse (sobald der Mailversand eingerichtet ist).
 */
export type SubmitState =
  | { status: "idle" }
  | { status: "error"; message: string; fields?: Record<string, string> }
  | { status: "sent"; confirm: boolean };

const LIMIT_PER_IP_HOUR = 5;
const LIMIT_PER_EMAIL_DAY = 3;

async function ipHash() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || "unbekannt";
  const salt = process.env.RATE_LIMIT_SALT ?? process.env.SUPABASE_SECRET_KEY ?? "trendradar";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Website erreichbar? Nur öffentliche Adressen (keine IPs, kein localhost), kurzer Timeout, Antwort wird nicht gelesen. */
async function reachable(url: string | null | undefined): Promise<boolean | null> {
  const host = hostOf(url);
  if (!url || !host) return null;
  if (/^(\d+\.){3}\d+$|^\[|:|^localhost$|\.(local|internal|lan)$/.test(host)) return false;
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(5000), headers: { "user-agent": "NewSpice-Trendradar-Vorpruefung" } });
      await res.body?.cancel();
      if (res.status < 500 && res.status !== 405) return res.status < 400 || res.status === 403;
    } catch {
      // nächster Versuch
    }
  }
  return false;
}

export async function submitApplication(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  // Fangfeld: für Menschen unsichtbar; Bots füllen es aus → still „Danke“ zeigen, nichts speichern
  if (String(fd.get("homepage") ?? "").trim()) return { status: "sent", confirm: false };

  const parsed = applicationSchema.safeParse(fromFormData(fd));
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
    return { status: "error", message: "Bitte die markierten Angaben prüfen.", fields };
  }
  const v = parsed.data;
  const offers = OFFER_TYPES.includes(v.partnerType);
  const file = fd.get("pitchDeck");
  const pdf = v.partnerType === "solution_provider" && file instanceof File && file.size > 0 ? file : null;
  let pdfBytes: Uint8Array | null = null;
  if (pdf) {
    pdfBytes = new Uint8Array(await pdf.arrayBuffer());
    const err = checkPdf(pdf.name, pdf.size, pdfBytes.slice(0, 5));
    if (err) return { status: "error", message: err, fields: { pitchDeck: err } };
  }
  const row = {
    partner_type: v.partnerType, org_name: v.orgName, contact_name: v.contactName, contact_role: v.contactRole ?? null, email: v.email,
    website: v.website ?? null, founded: v.founded ?? null, details: cleanDetails(v.partnerType, v.details),
    offer: offers ? v.offer ?? null : null, offer_category_ids: offers ? v.offerCategoryIds : [],
    maturity: v.partnerType === "solution_provider" ? v.maturity ?? null : null, references_text: offers ? v.referencesText ?? null : null,
    message: v.message ?? null, privacy_accepted_at: new Date().toISOString(),
  };

  if (isFixtureMode()) {
    fixtureSubmit({
      partnerType: row.partner_type, orgName: row.org_name, contactName: row.contact_name, contactRole: row.contact_role, email: row.email,
      website: row.website, founded: row.founded, details: row.details, offer: row.offer, offerCategoryIds: row.offer_category_ids,
      maturity: row.maturity as never, referencesText: row.references_text, pitchDeckPath: pdf ? "beispiel/upload.pdf" : null, message: row.message,
      precheck: buildPrecheck({ email: row.email, website: row.website, reachable: null, duplicates: [] }),
    });
    return { status: "sent", confirm: false };
  }

  const db = createAdminClient();
  const hash = await ipHash();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [byIp, byMail] = await Promise.all([
    db.from("applications").select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("created_at", hourAgo),
    db.from("applications").select("id", { count: "exact", head: true }).ilike("email", v.email).gte("created_at", dayAgo),
  ]);
  if (byIp.error || byMail.error) return { status: "error", message: "Das Formular ist gerade nicht verfügbar. Bitte später erneut versuchen." };
  if ((byIp.count ?? 0) >= LIMIT_PER_IP_HOUR || (byMail.count ?? 0) >= LIMIT_PER_EMAIL_DAY) {
    return { status: "error", message: "Zu viele Bewerbungen in kurzer Zeit. Bitte später erneut versuchen." };
  }

  // Vorprüfung: Website, E-Mail-Domain, Dubletten in Datenbank, Kunden und offenen Bewerbungen (markiert, entscheidet nicht)
  const host = hostOf(row.website);
  // für Filter in der Abfrage nur harmlose Zeichen (keine Kommas, Klammern, Anführungszeichen, Platzhalter)
  const term = row.org_name.normalize("NFKC").replace(/[^\p{L}\p{N} &-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  const safeHost = host && /^[a-z0-9.-]+$/.test(host) ? host : null;
  const nameFilter = term.length >= 3 ? `name.ilike.%${term}%` : null;
  const memberFilter = [safeHost ? `domain.eq.${safeHost}` : null, nameFilter].filter(Boolean).join(",");
  const [ok, members, orgs, apps] = await Promise.all([
    reachable(row.website),
    memberFilter ? db.from("startups").select("id, name, domain").or(memberFilter).limit(20) : Promise.resolve({ data: [] as { id: string; name: string; domain: string | null }[] }),
    term.length >= 3 ? db.from("organizations").select("id, name").ilike("name", `%${term}%`).limit(20) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    db.from("applications").select("id, org_name, website").in("status", ["new", "on_hold", "unconfirmed"]).limit(500),
  ]);
  const pool = [
    ...(members.data ?? []).map((m) => ({ kind: "member" as const, id: m.id as string, name: m.name as string, domain: m.domain as string | null })),
    ...(orgs.data ?? []).map((o) => ({ kind: "org" as const, id: o.id as string, name: o.name as string })),
    ...(apps.data ?? []).map((a) => ({ kind: "application" as const, id: a.id as string, name: a.org_name as string, website: a.website as string | null })),
  ];
  const precheck = buildPrecheck({ email: row.email, website: row.website, reachable: ok, duplicates: findDuplicates({ orgName: row.org_name, website: row.website }, pool) });

  let pitchPath: string | null = null;
  if (pdf && pdfBytes) {
    pitchPath = `${randomUUID()}/pitchdeck.pdf`;
    const up = await db.storage.from("applications").upload(pitchPath, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (up.error) return { status: "error", message: "Das Pitchdeck konnte nicht hochgeladen werden. Bitte erneut versuchen oder ohne Pitchdeck senden." };
  }

  const confirm = mailConfigured();
  const ins = await db.from("applications").insert({
    ...row, pitch_deck_path: pitchPath, precheck, ip_hash: hash, status: confirm ? "unconfirmed" : "new",
  }).select("confirm_token").single();
  if (ins.error) return { status: "error", message: "Die Bewerbung konnte nicht gespeichert werden. Bitte später erneut versuchen." };

  if (confirm) {
    const link = `${await origin()}/bewerben/bestaetigen/${ins.data.confirm_token}`;
    const mail = confirmApplicationMail(row.contact_name, link);
    const r = await sendMail({ to: row.email, ...mail });
    if (!r.sent) {
      // Bestätigung nicht zustellbar: Bewerbung trotzdem in den Eingang, damit nichts verloren geht
      await db.from("applications").update({ status: "new" }).eq("confirm_token", ins.data.confirm_token);
      console.error(`Bewerbung: Bestätigungsmail fehlgeschlagen – ${"error" in r ? r.error : r.reason}`);
      return { status: "sent", confirm: false };
    }
  }
  return { status: "sent", confirm };
}

/** Bestätigungslink: erst per Knopf (nicht beim bloßen Öffnen, das tun auch Mail-Scanner) */
export async function confirmApplication(token: string): Promise<{ ok: boolean }> {
  if (isFixtureMode() || !/^[a-f0-9]{48}$/.test(token)) return { ok: false };
  const db = createAdminClient();
  const { data, error } = await db.from("applications")
    .update({ status: "new", email_confirmed_at: new Date().toISOString() })
    .eq("confirm_token", token).eq("status", "unconfirmed").select("email, contact_name").maybeSingle();
  if (error || !data) return { ok: false };
  await sendMail({ to: data.email as string, ...applicationReceivedMail((data.contact_name as string | null) ?? "") });
  return { ok: true };
}
