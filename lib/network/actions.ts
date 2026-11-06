"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/admin/actions";
import { isFixtureMode } from "@/lib/auth/personas";
import { getViewer } from "@/lib/auth/viewer";
import { runCategorySuggestions } from "./run";
import { getNetworkRepo, type CategoryInput, type NewMember, type OfferInput, type ReferenceInput } from "./store";
import { PARTNER_TYPES, type CategoryPayload } from "./types";

/** Server-Aktionen der Netzwerk-Datenbank. Rolle prüfen, Repo mit den Rechten der Redaktion (RLS) nutzen. */

async function guard() {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (!v.isEditor) throw new Error("Nur für die Redaktion.");
  return v;
}

const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });
const orNull = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
const refresh = () => revalidatePath("/admin", "layout");

export async function createMember(m: NewMember): Promise<ActionResult & { memberId?: string }> {
  try {
    const v = await guard();
    if (!m.name.trim()) return { ok: false, error: "Bitte einen Namen angeben." };
    const types = m.partnerTypes.filter((t) => PARTNER_TYPES.includes(t));
    if (!types.length) return { ok: false, error: "Bitte mindestens einen Partner-Typ wählen." };
    const website = orNull(m.website);
    if (website && !/^https?:\/\//.test(website)) return { ok: false, error: "Die Website muss mit http:// oder https:// beginnen." };
    const id = await (await getNetworkRepo()).createMember({ ...m, name: m.name.trim(), website, partnerTypes: types }, v.id);
    refresh();
    return { ok: true, message: "Eintrag angelegt.", memberId: id };
  } catch (e) {
    return fail(e);
  }
}

export async function setPublished(id: string, published: boolean): Promise<ActionResult> {
  try {
    await guard();
    const repo = await getNetworkRepo();
    if (published) {
      const found = await repo.member(id);
      if (!found) return { ok: false, error: "Eintrag nicht gefunden." };
      if (!found.member.tagline?.trim() && !found.member.solution?.trim()) {
        return { ok: false, error: "Für „öffentlich“ braucht der Eintrag mindestens einen Satz zur Organisation (unter „Bearbeiten“)." };
      }
    }
    await repo.setPublished(id, published);
    refresh();
    return { ok: true, message: published ? "Öffentlich: Kunden sehen die öffentlichen Angaben." : "Nur intern sichtbar." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCategory(id: string | null, c: CategoryInput): Promise<ActionResult & { categoryId?: string }> {
  try {
    const v = await guard();
    if (!c.name.trim()) return { ok: false, error: "Bitte einen Namen angeben." };
    const cid = await (await getNetworkRepo()).saveCategory(id, {
      name: c.name.trim(), description: orNull(c.description), archived: c.archived,
      trendNumbers: [...new Set(c.trendNumbers.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b),
    }, v.id);
    refresh();
    return { ok: true, message: id ? "Kategorie gespeichert." : "Kategorie angelegt.", categoryId: cid };
  } catch (e) {
    return fail(e);
  }
}

export async function saveOffer(id: string | null, memberId: string, o: OfferInput): Promise<ActionResult> {
  try {
    await guard();
    if (!o.title.trim()) return { ok: false, error: "Bitte das Angebot benennen." };
    await (await getNetworkRepo()).saveOffer(id, memberId, { title: o.title.trim(), description: orNull(o.description), categoryIds: [...new Set(o.categoryIds)] });
    refresh();
    return { ok: true, message: "Angebot gespeichert." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOffer(id: string): Promise<ActionResult> {
  try {
    await guard();
    await (await getNetworkRepo()).deleteOffer(id);
    refresh();
    return { ok: true, message: "Angebot entfernt." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveReference(id: string | null, memberId: string, r: ReferenceInput): Promise<ActionResult> {
  try {
    await guard();
    if (!r.client.trim()) return { ok: false, error: "Bitte angeben, wo oder bei wem." };
    await (await getNetworkRepo()).saveReference(id, memberId, {
      client: r.client.trim(), period: orNull(r.period), result: orNull(r.result), url: orNull(r.url), published: r.published,
    });
    refresh();
    return { ok: true, message: "Referenz gespeichert." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteReference(id: string): Promise<ActionResult> {
  try {
    await guard();
    await (await getNetworkRepo()).deleteReference(id);
    refresh();
    return { ok: true, message: "Referenz entfernt." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveInterests(memberId: string, categoryIds: string[]): Promise<ActionResult> {
  try {
    await guard();
    await (await getNetworkRepo()).setInterests(memberId, [...new Set(categoryIds)]);
    refresh();
    return { ok: true, message: "Interessen gespeichert." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCustomerOrg(memberId: string, orgId: string | null): Promise<ActionResult> {
  try {
    await guard();
    await (await getNetworkRepo()).setCustomerOrg(memberId, orgId || null);
    refresh();
    return { ok: true, message: orgId ? "Als Kunde verknüpft." : "Verknüpfung entfernt." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Vorschlag des Netzwerk-Managers entscheiden. Bei einer Kategorie legt „Übernehmen“/„Anpassen“ die Kategorie an
 * (oder nutzt eine gleichnamige) und ordnet sie den genannten Mitgliedern zu: am ersten Angebot, sonst als neues Angebot.
 */
export async function decideSuggestion(id: string, decision: "accept" | "adjust" | "dismiss", adjusted?: CategoryPayload): Promise<ActionResult> {
  try {
    const v = await guard();
    const repo = await getNetworkRepo();
    const s = (await repo.suggestions("pending")).find((x) => x.id === id);
    if (!s) return { ok: false, error: "Über diesen Vorschlag ist bereits entschieden." };
    if (decision === "dismiss") {
      await repo.decideSuggestion(id, "dismissed", undefined, v.id);
      refresh();
      return { ok: true, message: "Verworfen." };
    }
    if (s.kind !== "category") return { ok: false, error: "Diese Art von Vorschlag lässt sich noch nicht übernehmen (folgt mit dem Netzwerk-Manager, Schritt 6)." };
    const p = (decision === "adjust" && adjusted ? adjusted : s.payload) as unknown as CategoryPayload;
    const name = String(p.name ?? "").trim();
    if (!name) return { ok: false, error: "Bitte einen Namen angeben." };
    const cats = await repo.categories();
    const same = cats.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    const trendNumbers = [...new Set((p.trend_numbers ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
    const categoryId = same
      ? await repo.saveCategory(same.id, { ...same, archived: false, trendNumbers: [...new Set([...same.trendNumbers, ...trendNumbers])].sort((a, b) => a - b) }, v.id)
      : await repo.saveCategory(null, { name, description: orNull(p.description), trendNumbers, archived: false }, v.id);
    const memberIds = [...new Set(p.member_ids ?? [])];
    if (memberIds.length) {
      const [members, offers] = await Promise.all([repo.members(), repo.offers()]);
      for (const mid of memberIds) {
        const m = members.find((x) => x.id === mid);
        if (!m) continue;
        const first = offers.filter((o) => o.memberId === mid).sort((a, b) => a.position - b.position)[0];
        if (first) {
          if (!first.categoryIds.includes(categoryId)) await repo.saveOffer(first.id, mid, { ...first, categoryIds: [...first.categoryIds, categoryId] });
        } else {
          await repo.saveOffer(null, mid, { title: m.tagline?.slice(0, 120) || m.name, description: null, categoryIds: [categoryId] });
        }
      }
    }
    await repo.decideSuggestion(id, decision === "adjust" ? "adjusted" : "accepted", decision === "adjust" ? { ...p, name, trend_numbers: trendNumbers } : undefined, v.id);
    refresh();
    return { ok: true, message: `Kategorie „${name}“ ${same ? "ergänzt" : "angelegt"}${memberIds.length ? ` und ${memberIds.length} ${memberIds.length === 1 ? "Eintrag" : "Einträgen"} zugeordnet` : ""}.` };
  } catch (e) {
    return fail(e);
  }
}

/** Netzwerk-Manager: Kategorienliste vorschlagen lassen (läuft nach der Antwort im Hintergrund weiter) */
export async function runCategoriesNow(): Promise<ActionResult> {
  try {
    const v = await guard();
    if (isFixtureMode()) return { ok: false, error: "Im Testmodus gibt es keine echten Läufe (kein API-Schlüssel, keine Datenbank). Die Beispielvorschläge zeigen das Ergebnis." };
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY ist in Vercel noch nicht hinterlegt." };
    after(async () => {
      const r = await runCategorySuggestions({ userId: v.id });
      console.log(`Netzwerk-Manager (Kategorien): ${r.status}${"reason" in r ? ` – ${r.reason}` : ""}${"error" in r ? ` – ${r.error}` : ""}`);
    });
    return { ok: true, message: "Netzwerk-Manager gestartet. Meist 1–3 Minuten, dann erscheinen die Vorschläge hier – Seite neu laden." };
  } catch (e) {
    return fail(e);
  }
}
