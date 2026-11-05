"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/admin/actions";
import { isFixtureMode } from "@/lib/auth/personas";
import { getViewer } from "@/lib/auth/viewer";
import { runChallenge } from "./run";
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
