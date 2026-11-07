import "server-only";

import { connection } from "next/server";
import { isFixtureMode } from "@/lib/auth/personas";
import { fixtureNetwork } from "@/lib/network/fixture";
import { createAdminClient } from "@/lib/supabase/admin";

/** Angebotskategorien für das öffentliche Formular (nur Name und ID, keine Mitglieder, keine Trends) */
export async function publicCategories(): Promise<{ id: string; name: string }[]> {
  await connection();
  if (isFixtureMode()) return (await fixtureNetwork().categories()).filter((c) => !c.archived).map(({ id, name }) => ({ id, name }));
  try {
    const { data } = await createAdminClient().from("offer_categories").select("id, name").eq("archived", false).order("name");
    return (data ?? []) as { id: string; name: string }[];
  } catch {
    return [];
  }
}
