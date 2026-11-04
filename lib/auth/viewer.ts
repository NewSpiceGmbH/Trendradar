import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PERSONAS, isFixtureMode, type PersonaKey } from "./personas";

export interface OrgAccess {
  id: string;
  name: string;
  tier: "basic" | "premium";
  role: "owner" | "member";
  accessFrom: string;
  accessUntil: string | null;
  active: boolean;
  /** Tage bis zum Ablauf, null = unbefristet */
  daysLeft: number | null;
}

export interface Viewer {
  id: string;
  email: string;
  name: string;
  platformRole: "admin" | "editor" | "none";
  isEditor: boolean;
  orgs: OrgAccess[];
  /** erste Org mit gültigem Zugang (Premium bevorzugt) */
  activeOrg: OrgAccess | null;
  /** darf den Radar sehen (Redaktion oder aktive Org) – maßgeblich bleibt RLS */
  hasAccess: boolean;
  hasPremium: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

function buildViewer(base: Omit<Viewer, "isEditor" | "activeOrg" | "hasAccess" | "hasPremium" | "orgs">, orgs: Omit<OrgAccess, "active" | "daysLeft">[]): Viewer {
  const d = today();
  const withState: OrgAccess[] = orgs.map((o) => ({
    ...o,
    active: d >= o.accessFrom && (o.accessUntil == null || d <= o.accessUntil),
    daysLeft: o.accessUntil == null ? null : daysBetween(d, o.accessUntil),
  }));
  const active = withState.filter((o) => o.active).sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "premium" ? -1 : 1));
  const isEditor = base.platformRole === "admin" || base.platformRole === "editor";
  return {
    ...base,
    isEditor,
    orgs: withState,
    activeOrg: active[0] ?? null,
    hasAccess: isEditor || active.length > 0,
    hasPremium: isEditor || active.some((o) => o.tier === "premium"),
  };
}

/** Der eingeloggte Nutzer oder null. Pro Anfrage nur einmal geladen. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Zugang hängt von Sitzung und heutigem Datum ab: immer zur Anfragezeit auswerten
  await connection();
  if (isFixtureMode()) return fixtureViewer((await cookies()).get("fixture_persona")?.value as PersonaKey | undefined);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("display_name, platform_role").eq("id", userId).maybeSingle(),
    supabase
      .from("memberships")
      .select("role, organizations ( id, name, tier, access_from, access_until )")
      .eq("user_id", userId),
  ]);

  type Row = { role: "owner" | "member"; organizations: { id: string; name: string; tier: "basic" | "premium"; access_from: string; access_until: string | null } | null };
  const email = (claims?.claims?.email as string | undefined) ?? "";
  return buildViewer(
    { id: userId, email, name: profile?.display_name ?? email, platformRole: profile?.platform_role ?? "none" },
    ((memberships ?? []) as unknown as Row[])
      .filter((m) => m.organizations)
      .map((m) => ({
        id: m.organizations!.id,
        name: m.organizations!.name,
        tier: m.organizations!.tier,
        role: m.role,
        accessFrom: m.organizations!.access_from,
        accessUntil: m.organizations!.access_until,
      })),
  );
});

// ───────── Testmodus ohne Datenbank ─────────
function fixtureViewer(key: PersonaKey | undefined): Viewer | null {
  const p = PERSONAS.find((x) => x.key === key);
  if (!p) return null;
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const base = { id: `fixture-${p.key}`, email: p.email, name: p.label };
  switch (p.key) {
    case "redaktion":
      return buildViewer({ ...base, platformRole: "admin" }, []);
    case "owner":
    case "member":
      return buildViewer({ ...base, platformRole: "none" }, [
        { id: "a", name: "Kunde A", tier: "basic", role: p.key, accessFrom: inDays(-300), accessUntil: inDays(21) },
      ]);
    case "premium":
      return buildViewer({ ...base, platformRole: "none" }, [
        { id: "p", name: "Kunde P", tier: "premium", role: "member", accessFrom: inDays(-30), accessUntil: null },
      ]);
    case "abgelaufen":
      return buildViewer({ ...base, platformRole: "none" }, [
        { id: "x", name: "Kunde X", tier: "premium", role: "member", accessFrom: inDays(-400), accessUntil: inDays(-1) },
      ]);
  }
}
