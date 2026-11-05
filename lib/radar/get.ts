import "server-only";

import type { Viewer } from "@/lib/auth/viewer";
import { isFixtureMode } from "@/lib/auth/personas";
import { createClient } from "@/lib/supabase/server";
import { fixtureTicker, fixtureTrendsForRadar } from "@/lib/admin/fixture-repo";
import { fixtureRaw } from "./fixtures";
import { mapRadar } from "./raw";
import { loadRadar } from "./load";
import type { RadarData } from "./types";

/** Radar-Daten für den Nutzer. Premium-Inhalte kommen nur an, wenn RLS sie freigibt. */
export async function getRadarData(viewer: Viewer): Promise<RadarData> {
  if (isFixtureMode()) {
    // Testmodus: Änderungen aus dem Redaktions-Backend (Speicher im Prozess) gleich im Radar sehen
    const raw = fixtureRaw({ premium: viewer.hasPremium });
    return mapRadar({ ...raw, trends: fixtureTrendsForRadar(raw.trends), ticker: fixtureTicker() });
  }
  return loadRadar(await createClient(), { premium: viewer.hasPremium });
}
