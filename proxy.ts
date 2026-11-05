import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// /api/scouting: zeitgesteuerte Aufrufe von Vercel ohne Sitzung – die Routen prüfen CRON_SECRET selbst
const PUBLIC = ["/login", "/auth", "/invite", "/legal", "/api/scouting"];
const isPublic = (path: string) => PUBLIC.some((p) => path === p || path.startsWith(p + "/"));

// Erneuert die Supabase-Sitzung und schickt nicht eingeloggte Besucher zum Login. Das ist nur die
// erste, grobe Schranke – maßgeblich sind RLS in der Datenbank und getViewer() auf jeder Seite.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (process.env.RADAR_FIXTURES === "1" && process.env.VERCEL !== "1") {
    if (!isPublic(path) && !request.cookies.get("fixture_persona")) return toLogin(request);
    return NextResponse.next();
  }

  const { response, claims } = await updateSession(request);
  if (!claims && !isPublic(path)) return toLogin(request);
  return response;
}

function toLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
