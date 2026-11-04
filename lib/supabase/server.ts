import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Supabase-Client für Server Components, Server Actions und Route Handler.
 * Läuft mit der Sitzung des eingeloggten Nutzers, RLS gilt. Pro Anfrage neu erzeugen.
 */
export async function createClient() {
  const { url, key } = publicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // In Server Components dürfen keine Cookies gesetzt werden. Die Sitzung erneuert proxy.ts.
        }
      },
    },
  });
}
