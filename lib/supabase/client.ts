"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/** Supabase-Client für Client Components. Arbeitet mit der Sitzung des Nutzers, RLS gilt. */
export function createClient() {
  const { url, key } = publicEnv();
  return createBrowserClient(url, key);
}
