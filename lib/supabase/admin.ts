import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Client mit Service-Role-/Secret-Key: umgeht RLS.
 * Nur für Agenten-Jobs, Admin-Aktionen (z. B. Nutzer für Einladungen anlegen) und E-Mail-Versand.
 * Niemals verwenden, um Kunden Daten anzuzeigen. `server-only` verhindert den Import im Browser.
 */
export function createAdminClient() {
  const { url } = publicEnv();
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY (oder SUPABASE_SERVICE_ROLE_KEY) fehlt");
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}
