import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Hält die Supabase-Sitzung frisch. Die Zugriffsprüfung selbst passiert in der Datenbank (RLS)
// und im Data Access Layer – der Proxy ist nur eine erste, grobe Schranke (folgt mit dem Login).
export async function proxy(request: NextRequest) {
  const { response } = await updateSession(request);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
