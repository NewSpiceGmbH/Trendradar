import "server-only";

import type { Viewer } from "@/lib/auth/viewer";
import { isFixtureMode } from "@/lib/auth/personas";
import { createClient } from "@/lib/supabase/server";
import { fixtureRadar } from "./fixtures";
import { loadRadar } from "./load";
import type { RadarData } from "./types";

/** Radar-Daten für den Nutzer. Premium-Inhalte kommen nur an, wenn RLS sie freigibt. */
export async function getRadarData(viewer: Viewer): Promise<RadarData> {
  if (isFixtureMode()) return fixtureRadar({ premium: viewer.hasPremium });
  return loadRadar(await createClient(), { premium: viewer.hasPremium });
}
