import { after } from "next/server";
import { cronAuthorized } from "@/lib/agents/cron-auth";
import { runScout } from "@/lib/agents/run";

// Ein Scout-Lauf mit Websuche dauert meist 2–8 Minuten; die Arbeit läuft nach der Antwort weiter.
// 800 s ist das Maximum im Vercel-Pro-Tarif (Fluid Compute).
export const maxDuration = 800;

export async function POST(req: Request, ctx: RouteContext<"/api/scouting/run/[id]">) {
  if (!cronAuthorized(req)) return new Response("Nicht berechtigt", { status: 401 });
  const { id } = await ctx.params;
  after(async () => {
    const r = await runScout(id);
    console.log(`Scout ${id}: ${r.status}${"reason" in r ? ` – ${r.reason}` : ""}${"error" in r ? ` – ${r.error}` : ""}`);
  });
  return Response.json({ accepted: id }, { status: 202 });
}
