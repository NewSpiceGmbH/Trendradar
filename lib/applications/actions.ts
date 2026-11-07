"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/admin/actions";
import { origin } from "@/lib/auth/actions";
import { getViewer } from "@/lib/auth/viewer";
import { mailConfigured, sendMail } from "@/lib/mail/send";
import { invitationMail, rejectionMail } from "@/lib/mail/templates";
import { getApplicationsRepo } from "./store";
import { CHANGE_FIELD_LABEL, kindOf, type AcceptOptions, type ChangeField, type ChangeStatus, type HoldReason } from "./types";
import { PARTNER_TYPES, type PartnerType } from "@/lib/network/types";

/** Server-Aktionen für Eingang (Redaktion), Empfehlungen (Partner) und Änderungsanfragen (Solution Provider) */

async function viewerOrLogin() {
  const v = await getViewer();
  if (!v) redirect("/login");
  return v;
}
async function editor() {
  const v = await viewerOrLogin();
  if (!v.isEditor) throw new Error("Nur für die Redaktion.");
  return v;
}
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });
const refresh = () => { revalidatePath("/admin", "layout"); };
const mailNote = (r: { sent: boolean }, what: string) =>
  r.sent ? ` ${what} wurde per E-Mail verschickt.` : mailConfigured() ? ` ${what} konnte nicht verschickt werden – bitte von Hand senden.` : "";

export async function acceptApplication(id: string, o: AcceptOptions): Promise<ActionResult & { link?: string; memberId?: string; mailed?: boolean }> {
  try {
    await editor();
    if (!o.orgName.trim()) return { ok: false, error: "Bitte einen Namen für die Organisation angeben." };
    if (!Number.isInteger(o.seats) || o.seats < 1 || o.seats > 500) return { ok: false, error: "Plätze: 1 bis 500." };
    if (o.months != null && (!Number.isInteger(o.months) || o.months < 1 || o.months > 60)) return { ok: false, error: "Laufzeit: 1 bis 60 Monate oder unbefristet." };
    const repo = await getApplicationsRepo();
    const app = await repo.application(id);
    if (!app) return { ok: false, error: "Bewerbung nicht gefunden." };
    const r = await repo.accept(id, { ...o, orgName: o.orgName.trim() });
    let link: string | undefined;
    let mailed = false;
    if (r.token) {
      link = `${await origin()}/invite/${r.token}`;
      const free = kindOf(app.partnerType) !== "customer" && o.months === 1;
      const res = await sendMail({ to: app.email, ...invitationMail(app.contactName ?? "", o.orgName.trim(), link, free) });
      mailed = res.sent;
    }
    refresh();
    const created = kindOf(app.partnerType) === "customer" ? "Organisation und Eintrag angelegt." : "Eintrag und Zugang angelegt.";
    return { ok: true, message: `${created}${r.token ? mailNote({ sent: mailed }, "Die Einladung") || " Einladungslink kopieren und an die Person schicken." : ""}`, link, memberId: r.memberId, mailed };
  } catch (e) {
    return fail(e);
  }
}

export async function holdApplication(id: string, reason: HoldReason, until: string): Promise<ActionResult> {
  try {
    const v = await editor();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return { ok: false, error: "Bitte ein Datum für die Wiedervorlage wählen." };
    await (await getApplicationsRepo()).hold(id, reason, until, v.id);
    refresh();
    return { ok: true, message: `On hold bis ${new Date(until).toLocaleDateString("de-DE")}. Die Wiedervorlage erscheint im Cockpit.` };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectApplication(id: string, text: string, send: boolean): Promise<ActionResult & { mailText?: string }> {
  try {
    const v = await editor();
    if (text.trim().length < 20) return { ok: false, error: "Bitte einen kurzen Text an den Bewerber angeben." };
    const repo = await getApplicationsRepo();
    const app = await repo.application(id);
    if (!app) return { ok: false, error: "Bewerbung nicht gefunden." };
    await repo.reject(id, text.trim(), v.id);
    const mail = rejectionMail(app.contactName ?? "", text);
    const res = send ? await sendMail({ to: app.email, ...mail }) : { sent: false };
    refresh();
    return { ok: true, message: `Abgelehnt.${send ? mailNote(res, "Die Absage") : ""}`, mailText: res.sent ? undefined : mail.text };
  } catch (e) {
    return fail(e);
  }
}

export async function pitchDeckLink(path: string): Promise<ActionResult & { url?: string }> {
  try {
    await editor();
    const url = await (await getApplicationsRepo()).pitchDeckUrl(path);
    return url ? { ok: true, url } : { ok: false, error: "Im Testmodus gibt es keine Dateien." };
  } catch (e) {
    return fail(e);
  }
}

export async function decideChange(id: string, status: Exclude<ChangeStatus, "open">, value: string | null, note: string | null): Promise<ActionResult> {
  try {
    const v = await editor();
    if (status === "rejected" && !note?.trim()) return { ok: false, error: "Bitte kurz begründen." };
    await (await getApplicationsRepo()).decideChange(id, status, value?.trim() || null, note?.trim() || null, v.id);
    refresh();
    return { ok: true, message: status === "rejected" ? "Abgelehnt." : "Übernommen." };
  } catch (e) {
    return fail(e);
  }
}

/** Partner: Kontakt empfehlen (landet direkt im Eingang der Redaktion) */
export async function recommendContact(input: { partnerType: PartnerType; orgName: string; contactName: string; email: string; website: string; message: string; consent: boolean }): Promise<ActionResult> {
  try {
    const v = await viewerOrLogin();
    if (!v.canRecommend) return { ok: false, error: "Empfehlungen sind Partnern vorbehalten." };
    if (!PARTNER_TYPES.includes(input.partnerType)) return { ok: false, error: "Bitte einen Partner-Typ wählen." };
    if (!input.orgName.trim()) return { ok: false, error: "Bitte die Organisation angeben." };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." };
    if (!input.consent) return { ok: false, error: "Bitte bestätigen, dass der Kontakt mit der Weitergabe einverstanden ist." };
    const site = input.website.trim();
    const website = site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : null;
    await (await getApplicationsRepo()).recommend({
      partnerType: input.partnerType, orgName: input.orgName.trim(), contactName: input.contactName.trim() || null, email: input.email.trim().toLowerCase(),
      website, message: input.message.trim() || null,
    }, v.id);
    revalidatePath("/empfehlen");
    return { ok: true, message: "Danke! Die Empfehlung ist bei New Spice eingegangen." };
  } catch (e) {
    return fail(e);
  }
}

/** Solution Provider: Änderung am eigenen Profil anfragen */
export async function requestChange(field: ChangeField, oldValue: string | null, newValue: string, comment: string): Promise<ActionResult> {
  try {
    const v = await viewerOrLogin();
    if (!v.providerMemberId) return { ok: false, error: "Nur für Solution Provider mit eigenem Profil." };
    if (!(field in CHANGE_FIELD_LABEL)) return { ok: false, error: "Bitte ein Feld wählen." };
    if (!newValue.trim()) return { ok: false, error: "Bitte den gewünschten neuen Inhalt angeben." };
    if (newValue.length > 4000 || comment.length > 2000) return { ok: false, error: "Der Text ist zu lang." };
    await (await getApplicationsRepo()).requestChange(v.providerMemberId, field, oldValue, newValue.trim(), comment.trim() || null, v.id);
    revalidatePath("/profil");
    return { ok: true, message: "Danke! Die Redaktion prüft Ihre Änderung und übernimmt sie." };
  } catch (e) {
    return fail(e);
  }
}
