"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getAdminRepo } from "./repo";
import type { TrendPatch } from "./types";

/**
 * Server-Aktionen des Redaktions-Backends. Jede prüft die Rolle (maßgeblich bleibt RLS in der Datenbank)
 * und gibt einen Status für die Oberfläche zurück statt zu werfen.
 */
export type ActionResult = { ok: true; message?: string; id?: number } | { ok: false; error: string };

async function guard(admin = false) {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (!v.isEditor || (admin && v.platformRole !== "admin")) throw new Error(admin ? "Nur für Admins." : "Nur für die Redaktion.");
  return v;
}

async function run(fn: () => Promise<ActionResult | void>, admin = false): Promise<ActionResult> {
  try {
    await guard(admin);
    const r = await fn();
    revalidatePath("/admin", "layout");
    revalidatePath("/radar");
    return r ?? { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function approveProposal(id: string, payload: Record<string, unknown> | null, note: string | null): Promise<ActionResult> {
  return run(async () => {
    const repo = await getAdminRepo();
    const tid = await repo.approve(id, payload, note?.trim() || null);
    return { ok: true, message: "Freigegeben und veröffentlicht.", id: tid ?? undefined };
  });
}

export async function rejectProposal(id: string, note: string): Promise<ActionResult> {
  return run(async () => {
    if (!note.trim()) return { ok: false, error: "Bitte eine Begründung angeben." };
    await (await getAdminRepo()).reject(id, note.trim());
    return { ok: true, message: "Abgelehnt." };
  });
}

export async function saveTrend(trendId: number | null, patch: TrendPatch): Promise<ActionResult> {
  return run(async () => {
    const repo = await getAdminRepo();
    if (trendId == null) {
      const id = await repo.createTrend(patch);
      const created = (await repo.trends()).find((t) => t.id === id);
      return { ok: true, message: "Als Entwurf angelegt.", id: created?.fields.number ?? id };
    }
    await repo.editTrend(trendId, patch);
    return { ok: true, message: "Gespeichert. Der vorherige Stand liegt in der Versionshistorie." };
  });
}

export async function restoreVersion(versionId: number): Promise<ActionResult> {
  return run(async () => {
    await (await getAdminRepo()).restoreVersion(versionId);
    return { ok: true, message: "Version wiederhergestellt." };
  });
}

export async function assignSignal(id: string, trendId: number | null): Promise<ActionResult> {
  return run(async () => {
    await (await getAdminRepo()).assignSignal(id, trendId);
  });
}

export async function publishSignal(id: string, publish: boolean): Promise<ActionResult> {
  return run(async () => {
    const v = await guard();
    await (await getAdminRepo()).publishSignal(id, publish, v.id);
    return { ok: true, message: publish ? "Im Liveticker veröffentlicht." : "Aus dem Liveticker genommen." };
  });
}

/** Live-Feed im Cockpit: Meldung mit dem gewählten Trend in den Ticker */
export async function publishToTicker(id: string, trendId: number): Promise<ActionResult> {
  return run(async () => {
    const v = await guard();
    const repo = await getAdminRepo();
    await repo.assignSignal(id, trendId);
    await repo.publishSignal(id, true, v.id);
    revalidatePath("/radar");
    revalidatePath("/news");
    return { ok: true, message: "Im Ticker." };
  });
}

export async function dismissSignal(id: string): Promise<ActionResult> {
  return run(async () => {
    await (await getAdminRepo()).dismissSignal(id);
  });
}

export async function setRole(email: string, role: "admin" | "editor" | "none"): Promise<ActionResult> {
  return run(async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben." };
    await (await getAdminRepo()).setRole(email.trim(), role);
    return { ok: true, message: role === "none" ? "Zugang zur Redaktion entfernt." : "Rolle vergeben." };
  }, true);
}
