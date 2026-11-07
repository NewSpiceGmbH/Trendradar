import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PERSONAS, isFixtureMode, type PersonaKey } from "./personas";

/** Zugangsart der Organisation (Migration 0015): Kunde, Partner (Multiplikator), Investor, Solution Provider */
export type OrgKind = "customer" | "partner" | "investor" | "provider";

export interface OrgAccess {
  id: string;
  name: string;
  tier: "basic" | "premium";
  kind: OrgKind;
  /** Eintrag in der Netzwerk-Datenbank (bei Solution Providern: das eigene Profil) */
  networkMemberId: string | null;
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
  /** darf den Radar sehen (Redaktion oder aktive Org, die kein reiner Solution Provider ist) – maßgeblich bleibt RLS */
  hasAccess: boolean;
  hasPremium: boolean;
  /** Projekte anfragen: nur Kunden */
  canRequestProjects: boolean;
  /** Kontakte empfehlen: Partner (Multiplikatoren) */
  canRecommend: boolean;
  /** eigenes Profil eines Solution Providers (aktive Provider-Org) */
  providerMemberId: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

type Derived = "isEditor" | "activeOrg" | "hasAccess" | "hasPremium" | "orgs" | "canRequestProjects" | "canRecommend" | "providerMemberId";
function buildViewer(base: Omit<Viewer, Derived>, orgs: Omit<OrgAccess, "active" | "daysLeft">[]): Viewer {
  const d = today();
  const withState: OrgAccess[] = orgs.map((o) => ({
    ...o,
    active: d >= o.accessFrom && (o.accessUntil == null || d <= o.accessUntil),
    daysLeft: o.accessUntil == null ? null : daysBetween(d, o.accessUntil),
  }));
  const activeAll = withState.filter((o) => o.active);
  // Radar-Zugang: alle aktiven Orgs außer reinen Solution Providern; Kunden vor Partnern/Investoren, Premium zuerst
  const rank = (o: OrgAccess) => (o.kind === "customer" ? 0 : 1) * 2 + (o.tier === "premium" ? 0 : 1);
  const active = activeAll.filter((o) => o.kind !== "provider").sort((a, b) => rank(a) - rank(b));
  const isEditor = base.platformRole === "admin" || base.platformRole === "editor";
  return {
    ...base,
    isEditor,
    orgs: withState,
    activeOrg: active[0] ?? null,
    hasAccess: isEditor || active.length > 0,
    hasPremium: isEditor || active.some((o) => o.tier === "premium"),
    canRequestProjects: active.some((o) => o.kind === "customer"),
    canRecommend: activeAll.some((o) => o.kind === "partner"),
    providerMemberId: activeAll.find((o) => o.kind === "provider" && o.networkMemberId)?.networkMemberId ?? null,
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

  const orgsOf = (cols: string) => supabase.from("memberships").select(`role, organizations ( ${cols} )`).eq("user_id", userId);
  const [{ data: profile }, first] = await Promise.all([
    supabase.from("profiles").select("display_name, platform_role").eq("id", userId).maybeSingle(),
    orgsOf("id, name, tier, access_from, access_until, kind, network_member_id"),
  ]);
  // vor Migration 0015 gibt es kind/network_member_id noch nicht: dann alle Orgs als Kunden
  const memberships = first.error && /kind|network_member_id/.test(first.error.message)
    ? (await orgsOf("id, name, tier, access_from, access_until")).data
    : first.data;

  type Row = { role: "owner" | "member"; organizations: { id: string; name: string; tier: "basic" | "premium"; access_from: string; access_until: string | null; kind?: OrgKind; network_member_id?: string | null } | null };
  const email = (claims?.claims?.email as string | undefined) ?? "";
  return buildViewer(
    { id: userId, email, name: profile?.display_name ?? email, platformRole: profile?.platform_role ?? "none" },
    ((memberships ?? []) as unknown as Row[])
      .filter((m) => m.organizations)
      .map((m) => ({
        id: m.organizations!.id,
        name: m.organizations!.name,
        tier: m.organizations!.tier,
        kind: m.organizations!.kind ?? "customer",
        networkMemberId: m.organizations!.network_member_id ?? null,
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
        { id: "a", name: "Kunde A", tier: "basic", kind: "customer", networkMemberId: null, role: p.key, accessFrom: inDays(-300), accessUntil: inDays(21) },
      ]);
    case "premium":
      return buildViewer({ ...base, platformRole: "none" }, [
        { id: "p", name: "Kunde P", tier: "premium", kind: "customer", networkMemberId: null, role: "member", accessFrom: inDays(-30), accessUntil: null },
      ]);
    case "abgelaufen":
      return buildViewer({ ...base, platformRole: "none" }, [
        { id: "x", name: "Kunde X", tier: "premium", kind: "customer", networkMemberId: null, role: "member", accessFrom: inDays(-400), accessUntil: inDays(-1) },
      ]);
    case "partner":
      return buildViewer({ ...base, platformRole: "none" }, [
        { id: "org-verband", name: "Verband Sportstätten", tier: "basic", kind: "partner", networkMemberId: "nw-verband", role: "owner", accessFrom: inDays(-5), accessUntil: inDays(25) },
      ]);
    case "investor":
      return buildViewer({ ...base, platformRole: "none" }, [
        { id: "org-ventures", name: "Ventures", tier: "basic", kind: "investor", networkMemberId: "nw-ventures", role: "owner", accessFrom: inDays(-5), accessUntil: inDays(25) },
      ]);
    case "provider":
      return buildViewer({ ...base, platformRole: "none" }, [
        { id: "org-tapflow", name: "TapFlow", tier: "basic", kind: "provider", networkMemberId: "fx-st-2", role: "owner", accessFrom: inDays(-5), accessUntil: inDays(25) },
      ]);
  }
}
