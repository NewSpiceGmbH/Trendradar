import "server-only";

import { isFixtureMode } from "./personas";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Eine Einladung anhand ihres Tokens prüfen. Läuft mit dem Secret-Key, weil der Gast noch kein Konto hat –
 * gibt aber nur preis, was der Link ohnehin verrät (Organisation, eingeladene Adresse, Gültigkeit).
 */
export interface InviteInfo {
  orgName: string;
  email: string;
  role: "owner" | "member";
  valid: boolean;
  reason: "ok" | "accepted" | "expired" | "unknown";
}

export async function lookupInvitation(token: string): Promise<InviteInfo | null> {
  if (isFixtureMode() || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
  const db = createAdminClient();
  const { data } = await db.from("invitations").select("email, role, expires_at, accepted_at, organizations ( name )").eq("token", token).maybeSingle();
  if (!data) return null;
  const reason = data.accepted_at ? "accepted" : Date.parse(data.expires_at as string) < Date.now() ? "expired" : "ok";
  return {
    orgName: ((data.organizations as { name?: string } | null)?.name) ?? "Ihre Organisation",
    email: data.email as string, role: data.role as InviteInfo["role"], valid: reason === "ok", reason,
  };
}
