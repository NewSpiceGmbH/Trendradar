"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/admin/actions";
import { isFixtureMode } from "@/lib/auth/personas";
import { getViewer } from "@/lib/auth/viewer";
import { challengeFieldsFromBrief, briefSchema, type Brief } from "./brief";
import { notionLinks, notionPageId } from "@/lib/notion";
import { NOTION_PLACEHOLDER, runChallenge, runDeepDive, runNotionSessions } from "./run";
import { cleanText, fromFile, MAX_TRANSCRIPT_CHARS, MAX_UPLOAD_BYTES, type TranscriptInput } from "./transcript";
import { domainOf } from "./scoring";
import { getVentureRepo, type ChallengeInput, type StartupInput } from "./store";
import type { CandidateStatus, StartupPrivate } from "./types";

/** Server-Aktionen für Venture Clienting. Rolle prüfen, Repo mit den Rechten der Redaktion (RLS) nutzen. */

async function guard() {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (!v.isEditor) throw new Error("Nur für die Redaktion.");
  return v;
}

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
const orNull = (s: string | null) => (s?.trim() ? s.trim() : null);

export async function saveChallenge(id: string | null, c: ChallengeInput): Promise<ActionResult & { challengeId?: string }> {
  try {
    const v = await guard();
    if (!c.title.trim()) return { ok: false, error: "Bitte einen Titel angeben." };
    if (c.problem.trim().length < 20) return { ok: false, error: "Bitte das Problem in ein, zwei Sätzen beschreiben – daraus leitet der Agent die Suche ab." };
    const challengeId = await (await getVentureRepo()).saveChallenge(id, {
      ...c, title: c.title.trim(), mustHaves: clean(c.mustHaves), exclusions: clean(c.exclusions), leads: clean(c.leads),
      timeframe: orNull(c.timeframe), budget: orNull(c.budget),
    }, v.id);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Gespeichert.", challengeId };
  } catch (e) {
    return fail(e);
  }
}

/** Lauf sofort starten; läuft nach der Antwort im Hintergrund weiter (Ergebnis an der Challenge) */
export async function runChallengeNow(challengeId: string): Promise<ActionResult> {
  try {
    const v = await guard();
    if (isFixtureMode()) return { ok: false, error: "Im Testmodus gibt es keine echten Läufe (kein API-Schlüssel, keine Datenbank). Die Beispielkandidaten zeigen das Ergebnis." };
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY ist in Vercel noch nicht hinterlegt." };
    const c = await (await getVentureRepo()).challenge(challengeId);
    if (!c) return { ok: false, error: "Challenge nicht gefunden." };
    if (c.problem.trim().length < 20) return { ok: false, error: "Erst das Problem beschreiben, dann suchen." };
    after(async () => {
      const r = await runChallenge(challengeId, { userId: v.id });
      console.log(`Venture ${challengeId}: ${r.status}${"reason" in r ? ` – ${r.reason}` : ""}${"error" in r ? ` – ${r.error}` : ""}`);
    });
    return { ok: true, message: "Suche gestartet. Meist 3–10 Minuten, dann erscheinen die Kandidaten hier – Seite neu laden." };
  } catch (e) {
    return fail(e);
  }
}

export async function decideCandidate(candidateId: string, decision: Exclude<CandidateStatus, "pending">, note: string | null): Promise<ActionResult & { startupId?: string | null }> {
  try {
    await guard();
    const startupId = await (await getVentureRepo()).decide(candidateId, decision, orNull(note));
    revalidatePath("/admin", "layout");
    const message = decision === "qualified" ? "In die Startup-Datenbank aufgenommen." : decision === "watch" ? "Auf Beobachten gesetzt." : "Abgelehnt.";
    return { ok: true, message, startupId };
  } catch (e) {
    return fail(e);
  }
}

export async function saveStartup(id: string, s: StartupInput, priv: StartupPrivate): Promise<ActionResult> {
  try {
    await guard();
    if (!s.name.trim()) return { ok: false, error: "Bitte einen Namen angeben." };
    if (s.website && !domainOf(s.website)) return { ok: false, error: "Die Website ist keine gültige Adresse." };
    if (s.published && !s.tagline?.trim() && !s.solution?.trim()) return { ok: false, error: "Für die Veröffentlichung braucht das Profil mindestens einen Satz zur Lösung." };
    if (priv.contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(priv.contactEmail)) return { ok: false, error: "Die Kontakt-E-Mail ist ungültig." };
    if (priv.pitchDeckUrl && !/^https:\/\//.test(priv.pitchDeckUrl)) return { ok: false, error: "Pitchdeck bitte als https-Link." };
    await (await getVentureRepo()).saveStartup(id, {
      ...s, name: s.name.trim(), tags: clean(s.tags), website: orNull(s.website), tagline: orNull(s.tagline), solution: orNull(s.solution),
      useCases: orNull(s.useCases), referenceCustomers: orNull(s.referenceCustomers), funding: orNull(s.funding), teamSize: orNull(s.teamSize),
      country: orNull(s.country), city: orNull(s.city), logoUrl: orNull(s.logoUrl),
    }, {
      contactName: orNull(priv.contactName), contactRole: orNull(priv.contactRole), contactEmail: orNull(priv.contactEmail),
      pricing: orNull(priv.pricing), pitchDeckUrl: orNull(priv.pitchDeckUrl), notes: orNull(priv.notes),
    });
    revalidatePath("/admin", "layout");
    revalidatePath("/radar");
    return { ok: true, message: s.published ? "Gespeichert und im Radar veröffentlicht." : "Gespeichert." };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────── Problem Deep Dive ─────────────────────────

/**
 * Gespräch hinzufügen: Text einfügen oder Datei (Notion-Export) hochladen. Das Transkript geht nur an den Agenten
 * und wird nicht gespeichert – gespeichert werden Titel, Datum, Kurzfassung und das konsolidierte Briefing.
 */
export async function addDeepDive(challengeId: string, form: FormData): Promise<ActionResult> {
  try {
    const v = await guard();
    const title = String(form.get("title") ?? "").trim();
    const heldOn = String(form.get("heldOn") ?? "").trim() || null;
    const pasted = cleanText(String(form.get("text") ?? ""));
    const file = form.get("file");
    if (!title) return { ok: false, error: "Bitte dem Gespräch einen Titel geben, z. B. „Gespräch mit der Gastronomie“." };
    let transcript: TranscriptInput;
    let fileName: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Die Datei ist größer als 4 MB. Bitte als Text exportieren oder einfügen." };
      transcript = fromFile(file.name, file.type, new Uint8Array(await file.arrayBuffer()));
      fileName = file.name;
    } else if (pasted.length >= 200) {
      transcript = { kind: "text", text: pasted };
    } else {
      return { ok: false, error: "Bitte das Transkript einfügen (mindestens ein paar Absätze) oder eine Datei hochladen." };
    }
    if (transcript.kind === "text" && transcript.text.length > MAX_TRANSCRIPT_CHARS) return { ok: false, error: "Das Transkript ist sehr lang. Bitte in mehrere Gespräche aufteilen." };
    if (transcript.kind === "text" && transcript.text.length < 200) return { ok: false, error: "In der Datei steht kaum Text." };
    if (isFixtureMode()) {
      await (await getVentureRepo()).addSession(challengeId, { title, heldOn, source: fileName ? "upload" : "paste", fileName, charCount: transcript.kind === "text" ? transcript.text.length : null }, v.id);
      revalidatePath("/admin", "layout");
      return { ok: false, error: "Im Testmodus wird nicht ausgewertet (kein API-Schlüssel). Das Beispiel-Briefing zeigt das Ergebnis." };
    }
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY ist in Vercel noch nicht hinterlegt." };
    const sessionId = await (await getVentureRepo()).addSession(challengeId, {
      title, heldOn, source: fileName ? "upload" : "paste", fileName, charCount: transcript.kind === "text" ? transcript.text.length : null,
    }, v.id);
    after(async () => {
      const r = await runDeepDive(sessionId, transcript, { userId: v.id });
      console.log(`Deep Dive ${sessionId}: ${r.status}${"error" in r ? ` – ${r.error}` : ""}`);
    });
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Wird ausgewertet – meist 1–3 Minuten. Danach Seite neu laden: Das Briefing ist dann aktualisiert." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDeepDive(id: string): Promise<ActionResult> {
  try {
    await guard();
    await (await getVentureRepo()).deleteSession(id);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Gespräch entfernt. Das Briefing bleibt, wie es ist." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveBrief(challengeId: string, brief: Brief): Promise<ActionResult> {
  try {
    await guard();
    const parsed = briefSchema.safeParse(brief);
    if (!parsed.success) return { ok: false, error: "Das Briefing ist unvollständig oder zu lang." };
    await (await getVentureRepo()).saveBrief(challengeId, parsed.data);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Briefing gespeichert." };
  } catch (e) {
    return fail(e);
  }
}

/** Briefing als Scouting-Grundlage in die Challenge übernehmen (Problem, Ziel, Kontext, Muss-Kriterien, Ausschlüsse, Rahmen) */
export async function applyBrief(challengeId: string): Promise<ActionResult> {
  try {
    const v = await guard();
    const repo = await getVentureRepo();
    const c = await repo.challenge(challengeId);
    if (!c?.brief) return { ok: false, error: "Es gibt noch kein Briefing." };
    const { id: _i, lastRunAt: _l, createdAt: _c, brief, briefUpdatedAt: _b, ...input } = c;
    void _i; void _l; void _c; void _b;
    await repo.saveChallenge(challengeId, { ...input, ...challengeFieldsFromBrief(brief) }, v.id);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "In die Challenge übernommen. Der Venture-Agent nutzt jetzt das ganze Briefing – inklusive Suchhypothesen und offener Fragen." };
  } catch (e) {
    return fail(e);
  }
}

/** Notion-Links (Meeting-Notizen) als Gespräche hinzufügen; der Agent liest die Seiten selbst */
export async function addNotionLinks(challengeId: string, text: string): Promise<ActionResult> {
  try {
    const v = await guard();
    const links = notionLinks(text).filter((l) => notionPageId(l));
    if (!links.length) return { ok: false, error: "Bitte einen Link auf eine Notion-Seite einfügen (in Notion: ••• → Link kopieren)." };
    if (links.length > 10) return { ok: false, error: "Bitte höchstens 10 Seiten auf einmal." };
    const repo = await getVentureRepo();
    if (isFixtureMode()) {
      for (const l of links) await repo.addSession(challengeId, { title: "Notion-Seite", heldOn: null, source: "notion", sourceUrl: l, fileName: null, charCount: null }, v.id);
      revalidatePath("/admin", "layout");
      return { ok: false, error: "Im Testmodus wird Notion nicht gelesen. Das Beispiel-Briefing zeigt das Ergebnis." };
    }
    if (!process.env.NOTION_TOKEN) return { ok: false, error: "Notion ist noch nicht verbunden: In Vercel fehlt das Secret NOTION_TOKEN (Notion-Integration)." };
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY ist in Vercel noch nicht hinterlegt." };
    const ids: string[] = [];
    for (const l of links) ids.push(await repo.addSession(challengeId, { title: NOTION_PLACEHOLDER, heldOn: null, source: "notion", sourceUrl: l, fileName: null, charCount: null }, v.id));
    after(async () => {
      const r = await runNotionSessions(ids, { userId: v.id });
      console.log(`Deep Dive Notion: ${r.map((x) => `${x.id} ${x.status}${x.error ? ` – ${x.error}` : ""}`).join("; ")}`);
    });
    revalidatePath("/admin", "layout");
    return { ok: true, message: `${links.length === 1 ? "Die Seite wird" : `${links.length} Seiten werden`} gelesen und ausgewertet – meist 1–3 Minuten je Seite. Danach Seite neu laden.` };
  } catch (e) {
    return fail(e);
  }
}

/** Notion-Gespräch erneut einlesen, z. B. wenn die Meeting-Notiz ergänzt wurde */
export async function rereadNotion(sessionId: string): Promise<ActionResult> {
  try {
    const v = await guard();
    const { sourceUrl } = await (await getVentureRepo()).resetSession(sessionId);
    if (isFixtureMode()) return { ok: false, error: "Im Testmodus wird Notion nicht gelesen." };
    if (!sourceUrl) return { ok: false, error: "Dieses Gespräch hat keinen Notion-Link." };
    if (!process.env.NOTION_TOKEN) return { ok: false, error: "Notion ist noch nicht verbunden (NOTION_TOKEN fehlt)." };
    after(async () => { await runNotionSessions([sessionId], { userId: v.id }); });
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Wird neu eingelesen." };
  } catch (e) {
    return fail(e);
  }
}
