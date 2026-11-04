import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ziel des Magic-Links: tauscht den Code gegen eine Sitzung und leitet weiter.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/radar";
  // nur relative Ziele, sonst wäre der Link ein offener Redirect
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/radar";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, origin));
  }
  return NextResponse.redirect(new URL("/login?fehler=Der+Login-Link+ist+ungültig+oder+abgelaufen.", origin));
}
