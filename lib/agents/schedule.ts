import type { Scout } from "./types";

/**
 * Wann ist ein Scout dran? Der Zeitplan läuft stündlich (vercel.json); maßgeblich ist die Uhrzeit in Berlin.
 * Ein Scout läuft höchstens einmal pro Kalendertag (bzw. Woche).
 */
const TZ = "Europe/Berlin";

export function berlinParts(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday };
}

export function isDue(s: Pick<Scout, "active" | "cadence" | "runHour" | "runWeekday" | "lastRunAt">, now: Date): boolean {
  if (!s.active || s.cadence === "manual") return false;
  const n = berlinParts(now);
  if (n.hour < s.runHour) return false;
  if (s.cadence === "weekly" && n.weekday !== (s.runWeekday ?? 1)) return false;
  if (!s.lastRunAt) return true;
  const last = new Date(s.lastRunAt);
  if (s.cadence === "weekly") return now.getTime() - last.getTime() > 6 * 86_400_000 && berlinParts(last).date !== n.date;
  return berlinParts(last).date !== n.date;
}

/** Suchzeitraum: seit dem letzten Lauf, höchstens 14 Tage zurück, mindestens 2 Tage */
export function searchSince(lastRunAt: string | null, now: Date): Date {
  const twoDays = new Date(now.getTime() - 2 * 86_400_000);
  const max = new Date(now.getTime() - 14 * 86_400_000);
  if (!lastRunAt) return new Date(now.getTime() - 7 * 86_400_000);
  const last = new Date(lastRunAt);
  return last < max ? max : last > twoDays ? twoDays : last;
}

export const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
