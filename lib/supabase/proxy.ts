import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/** Erneuert die Supabase-Sitzung bei jeder Anfrage und gibt die Antwort samt Cookies zurück. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = publicEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // getClaims() prüft das JWT und löst bei Bedarf die Erneuerung aus. Zwischen Client-Erzeugung
  // und diesem Aufruf keine weitere Logik einfügen.
  const { data } = await supabase.auth.getClaims();
  return { response, claims: data?.claims ?? null };
}
