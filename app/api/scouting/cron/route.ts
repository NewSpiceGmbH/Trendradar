import { cronAuthorized } from "@/lib/agents/cron-auth";
import { dueScouts } from "@/lib/agents/run";

/**
 * Stündlich (vercel.json): welche Scouts sind laut Zeitplan dran? Jeder bekommt einen eigenen Funktionsaufruf,
 * damit lange Läufe sich nicht gegenseitig die Laufzeit nehmen.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Nicht berechtigt", { status: 401 });
  const due = await dueScouts();
  const origin = new URL(req.url).origin;
  const started = await Promise.all(
    due.map(async (id) => {
      const res = await fetch(`${origin}/api/scouting/run/${id}`, { method: "POST", headers: { authorization: req.headers.get("authorization")! } });
      return { id, status: res.status };
    }),
  );
  return Response.json({ due: due.length, started });
}
