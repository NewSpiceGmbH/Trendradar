"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { isFixtureMode } from "@/lib/auth/personas";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/actions";
import { runScout } from "./run";
import { getScoutingRepo } from "./store";
import type { Channel, Scout, ScoutingSettings } from "./types";

/** Server-Aktionen des Scouting-Bereichs. Rolle prüfen, Repo mit den Rechten der Redaktion (RLS) nutzen. */

async function guard() {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (!v.isEditor) throw new Error("Nur für die Redaktion.");
  return v;
}

async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    await guard();
    const r = await fn();
    revalidatePath("/admin", "layout");
    return r ?? { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

export async function saveScout(id: string | null, s: Omit<Scout, "id" | "lastRunAt" | "key">): Promise<ActionResult & { scoutId?: string }> {
  try {
    await guard();
    if (!s.name.trim()) return { ok: false, error: "Bitte einen Namen angeben." };
    if (!s.briefing.trim()) return { ok: false, error: "Bitte einen Auftrag formulieren." };
    if (!s.verticals.length) return { ok: false, error: "Bitte mindestens eine Branche wählen." };
    if (!s.channelIds.length) return { ok: false, error: "Bitte mindestens eine Quelle zuordnen." };
    const scoutId = await (await getScoutingRepo()).saveScout(id, { ...s, keywords: clean(s.keywords), exclusions: clean(s.exclusions) });
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Gespeichert.", scoutId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setScoutActive(scout: Scout, active: boolean): Promise<ActionResult> {
  return run(async () => {
    const { id, lastRunAt: _l, key: _k, ...rest } = scout;
    void _l; void _k;
    await (await getScoutingRepo()).saveScout(id, { ...rest, active });
    return { ok: true, message: active ? `${scout.name} ist im Einsatz.` : `${scout.name} pausiert.` };
  });
}

export async function saveChannel(id: string | null, c: Omit<Channel, "id" | "key">): Promise<ActionResult> {
  return run(async () => {
    if (!c.name.trim()) return { ok: false, error: "Bitte einen Namen angeben." };
    if (c.kind !== "web_search" && c.kind !== "upload" && !(c.url && /^https?:\/\//.test(c.url))) return { ok: false, error: "Bitte eine Adresse (https://…) angeben." };
    if (c.secretRef && !/^[A-Z][A-Z0-9_]{2,63}$/.test(c.secretRef)) {
      return { ok: false, error: "Zugangsdaten nie direkt eintragen – nur den Namen der Umgebungsvariable in Vercel, z. B. YOUTUBE_API_KEY." };
    }
    const domains = clean(c.domains.map((d) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase()));
    await (await getScoutingRepo()).saveChannel(id, { ...c, domains });
    return { ok: true, message: "Quelle gespeichert." };
  });
}

export async function addTip(url: string, note: string, scoutId: string | null): Promise<ActionResult> {
  return run(async () => {
    const v = await guard();
    if (!/^https?:\/\/\S+$/.test(url.trim())) return { ok: false, error: "Bitte einen vollständigen Link einfügen." };
    await (await getScoutingRepo()).addTip(url.trim(), note.trim() || null, scoutId, v.id);
    return { ok: true, message: "Tipp eingereicht. Der Scout wertet ihn beim nächsten Lauf aus." };
  });
}

export async function saveSettings(s: ScoutingSettings): Promise<ActionResult> {
  return run(async () => {
    if (!(s.monthlyBudgetUsd >= 0)) return { ok: false, error: "Bitte ein gültiges Budget angeben." };
    await (await getScoutingRepo()).saveSettings(s);
    return { ok: true, message: s.paused ? "Alle Scouts pausiert." : "Gespeichert." };
  });
}

/** Lauf sofort starten; läuft nach der Antwort im Hintergrund weiter (Ergebnis im Protokoll) */
export async function runScoutNow(scoutId: string): Promise<ActionResult> {
  return run(async () => {
    const v = await guard();
    if (isFixtureMode()) return { ok: false, error: "Im Testmodus gibt es keine echten Läufe (kein API-Schlüssel, keine Datenbank)." };
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY ist in Vercel noch nicht hinterlegt." };
    after(async () => {
      await runScout(scoutId, { userId: v.id });
    });
    return { ok: true, message: "Lauf gestartet. Ergebnis in ein paar Minuten im Liveticker und im Protokoll." };
  });
}

/** Medium freigeben: nur mit geklärtem Recht (die Datenbank prüft das zusätzlich) */
export async function approveMedia(mediaId: string, rights: "embed" | "press" | "cc" | "own" | "unclear", credit: string | null, approved: boolean): Promise<ActionResult> {
  return run(async () => {
    if (isFixtureMode()) return { ok: false, error: "Im Testmodus gibt es keine Medien." };
    if (approved && rights === "unclear") return { ok: false, error: "Erst die Rechte klären." };
    const db = await createClient();
    const { error } = await db.from("signal_media").update({ rights, credit, approved }).eq("id", mediaId);
    if (error) return { ok: false, error: error.message.includes("rights_before_approval") ? "Erst die Rechte klären." : error.message };
    return { ok: true };
  });
}
