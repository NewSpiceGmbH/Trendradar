"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/admin/actions";
import { origin } from "@/lib/auth/actions";
import { getViewer } from "@/lib/auth/viewer";
import { getVentureRepo } from "@/lib/venture/store";
import { getProjectsRepo } from "./store";
import { MAX_FILE_BYTES, type CustomerStatus, type Member, type OrgInput, type ProjectPatch, type ProjectRequest, type ShortlistPatch } from "./types";

/** Server-Aktionen für Kunden und Projekte. Rechte prüft die Datenbank (RLS); hier nur Vorprüfung und Meldungen. */

async function viewer() {
  const v = await getViewer();
  if (!v) redirect("/login");
  return v;
}
async function editor() {
  const v = await viewer();
  if (!v.isEditor) throw new Error("Nur für die Redaktion.");
  return v;
}
const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const orNull = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
const refresh = () => {
  revalidatePath("/admin", "layout");
  revalidatePath("/projekte", "layout");
};

// ───────────────────────── Kundenverwaltung ─────────────────────────

export async function saveOrg(id: string | null, o: OrgInput): Promise<ActionResult & { orgId?: string }> {
  try {
    await editor();
    if (!o.name.trim()) return { ok: false, error: "Bitte einen Namen angeben." };
    if (!Number.isInteger(o.seats) || o.seats < 1) return { ok: false, error: "Mindestens ein Sitzplatz." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.accessFrom)) return { ok: false, error: "Bitte ein Startdatum angeben." };
    if (o.accessUntil && o.accessUntil < o.accessFrom) return { ok: false, error: "Das Ende liegt vor dem Start." };
    const orgId = await (await getProjectsRepo(await viewer())).saveOrg(id, { ...o, name: o.name.trim(), accessUntil: o.accessUntil || null });
    refresh();
    return { ok: true, message: "Gespeichert.", orgId };
  } catch (e) {
    return fail(e);
  }
}

/** Einladung anlegen. Der Link wird angezeigt; der E-Mail-Versand folgt mit eigenem SMTP-Dienst (Resend). */
export async function inviteToOrg(orgId: string, email: string, role: Member["role"]): Promise<ActionResult & { link?: string }> {
  try {
    const v = await editor();
    const parsed = z.email().safeParse(email.trim().toLowerCase());
    if (!parsed.success) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben." };
    const token = await (await getProjectsRepo(v)).invite(orgId, parsed.data, role, v.id);
    refresh();
    return { ok: true, message: "Einladung angelegt. Link kopieren und an die Person schicken.", link: `${await origin()}/invite/${token}` };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  try { await (await getProjectsRepo(await editor())).revokeInvite(id); refresh(); return { ok: true, message: "Einladung zurückgezogen." }; } catch (e) { return fail(e); }
}

export async function removeMember(orgId: string, userId: string): Promise<ActionResult> {
  try { await (await getProjectsRepo(await editor())).removeMember(orgId, userId); refresh(); return { ok: true, message: "Zugang entfernt." }; } catch (e) { return fail(e); }
}

// ───────────────────────── Projekte ─────────────────────────

export async function requestProject(r: ProjectRequest, orgId?: string): Promise<ActionResult & { projectId?: string }> {
  try {
    const v = await viewer();
    const target = orgId ?? v.activeOrg?.id;
    if (!target) return { ok: false, error: "Für eine Anfrage braucht es einen aktiven Kundenzugang." };
    if (!r.title.trim()) return { ok: false, error: "Bitte einen kurzen Titel angeben." };
    if (r.request.trim().length < 20) return { ok: false, error: "Bitte beschreiben Sie das Anliegen in ein, zwei Sätzen." };
    const projectId = await (await getProjectsRepo(v)).requestProject(target, {
      title: r.title.trim(), request: r.request.trim(), goal: r.goal.trim(), venue: orNull(r.venue), timeframe: orNull(r.timeframe), budget: orNull(r.budget),
    }, v.id);
    refresh();
    return { ok: true, message: "Anfrage gesendet. Ihre Ansprechperson bei New Spice meldet sich.", projectId };
  } catch (e) {
    return fail(e);
  }
}

export async function saveProject(id: string, p: ProjectPatch): Promise<ActionResult> {
  try {
    const v = await editor();
    if (p.status === "completed") return { ok: false, error: "Abschließen bitte über „Projekt abschließen“ – dort wird das Ergebnis festgehalten." };
    await (await getProjectsRepo(v)).saveProject(id, p);
    refresh();
    return { ok: true, message: "Gespeichert." };
  } catch (e) {
    return fail(e);
  }
}

/** Aus der Anfrage eine Challenge für den Venture-Agenten machen und mit dem Projekt verknüpfen */
export async function challengeFromProject(projectId: string): Promise<ActionResult & { challengeId?: string }> {
  try {
    const v = await editor();
    const repo = await getProjectsRepo(v);
    const d = await repo.project(projectId);
    if (!d) return { ok: false, error: "Projekt nicht gefunden." };
    if (d.project.challengeId) return { ok: true, challengeId: d.project.challengeId };
    const p = d.project;
    const challengeId = await (await getVentureRepo()).saveChallenge(null, {
      title: p.title, problem: p.request, goal: p.goal, context: [p.orgName && `Kunde: ${p.orgName}`, p.venue].filter(Boolean).join(" · "),
      audience: "both", journeyStages: [], trendNumbers: [], regions: ["DACH", "EU"], minMaturity: "pilot", mustHaves: ["DSGVO-konform"],
      exclusions: [], leads: [], timeframe: p.timeframe, budget: p.budget, status: "draft", maxCandidates: 8, maxSearches: 15, maxCostUsd: 3,
      model: "claude-opus-5-5", effort: "high",
    }, v.id);
    await repo.saveProject(projectId, { challengeId, status: p.status === "requested" ? "scoping" : p.status });
    refresh();
    return { ok: true, message: "Challenge angelegt.", challengeId };
  } catch (e) {
    return fail(e);
  }
}

export async function addMilestone(projectId: string, title: string, dueDate: string | null): Promise<ActionResult> {
  try {
    if (!title.trim()) return { ok: false, error: "Bitte einen Titel angeben." };
    await (await getProjectsRepo(await editor())).addMilestone(projectId, title.trim(), dueDate || null);
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function setMilestoneDone(id: string, done: boolean): Promise<ActionResult> {
  try { await (await getProjectsRepo(await editor())).setMilestoneDone(id, done); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function deleteMilestone(id: string): Promise<ActionResult> {
  try { await (await getProjectsRepo(await editor())).deleteMilestone(id); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function postUpdate(projectId: string, body: string, internal: boolean): Promise<ActionResult> {
  try {
    const v = await viewer();
    if (!body.trim()) return { ok: false, error: "Bitte eine Nachricht schreiben." };
    if (internal && !v.isEditor) return { ok: false, error: "Interne Notizen nur für die Redaktion." };
    await (await getProjectsRepo(v)).addUpdate(projectId, body.trim(), internal, v.id);
    refresh();
    return { ok: true, message: internal ? "Interne Notiz gespeichert." : "Nachricht gesendet." };
  } catch (e) { return fail(e); }
}

export async function addToShortlist(projectId: string, startupId: string, rationale: string): Promise<ActionResult> {
  try {
    if (!startupId) return { ok: false, error: "Bitte ein Startup wählen." };
    await (await getProjectsRepo(await editor())).addToShortlist(projectId, startupId, orNull(rationale));
    refresh();
    return { ok: true, message: "Zur Shortlist hinzugefügt – noch nicht für den Kunden freigegeben." };
  } catch (e) { return fail(e); }
}
export async function updateShortlist(projectId: string, startupId: string, p: ShortlistPatch): Promise<ActionResult> {
  try { await (await getProjectsRepo(await editor())).updateShortlist(projectId, startupId, p); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function removeFromShortlist(projectId: string, startupId: string): Promise<ActionResult> {
  try { await (await getProjectsRepo(await editor())).removeFromShortlist(projectId, startupId); refresh(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function respondShortlist(projectId: string, startupId: string, status: Exclude<CustomerStatus, "selected">, note: string | null): Promise<ActionResult> {
  try { await (await getProjectsRepo(await viewer())).respond(projectId, startupId, status, orNull(note)); refresh(); return { ok: true, message: "Danke für die Rückmeldung." }; } catch (e) { return fail(e); }
}

export async function completeProject(projectId: string, outcome: "success" | "no_success", note: string): Promise<ActionResult> {
  try {
    const n = await (await getProjectsRepo(await editor())).complete(projectId, outcome, orNull(note));
    refresh();
    revalidatePath("/radar");
    return { ok: true, message: outcome === "success" ? `Abgeschlossen. ${n === 1 ? "Ein Startup ist" : `${n} Startups sind`} jetzt „New Spice approved“.` : "Abgeschlossen." };
  } catch (e) { return fail(e); }
}

// ───────────────────────── Dokumente ─────────────────────────

/** Eintrag anlegen (RLS prüft den Zugriff); die Datei lädt danach der Browser mit den Rechten des Nutzers hoch */
export async function createDocument(projectId: string, file: { name: string; size: number; mime: string | null }, internal: boolean): Promise<ActionResult & { docId?: string; path?: string; stored?: boolean }> {
  try {
    const v = await viewer();
    if (!file.name.trim()) return { ok: false, error: "Die Datei hat keinen Namen." };
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: "Die Datei ist größer als 50 MB." };
    if (internal && !v.isEditor) return { ok: false, error: "Interne Dokumente nur für die Redaktion." };
    const { id, path } = await (await getProjectsRepo(v)).createDocument(projectId, file, internal, v.id);
    refresh();
    // Testmodus: kein Speicher, nur der Eintrag
    return { ok: true, docId: id, path, stored: process.env.RADAR_FIXTURES !== "1" };
  } catch (e) { return fail(e); }
}
export async function deleteDocument(id: string): Promise<ActionResult> {
  try { await (await getProjectsRepo(await viewer())).deleteDocument(id); refresh(); return { ok: true, message: "Dokument gelöscht." }; } catch (e) { return fail(e); }
}
export async function documentUrl(id: string): Promise<ActionResult & { url?: string }> {
  try {
    const url = await (await getProjectsRepo(await viewer())).documentUrl(id);
    return url ? { ok: true, url } : { ok: false, error: "Im Testmodus gibt es keine Dateien – nur die Einträge." };
  } catch (e) { return fail(e); }
}
