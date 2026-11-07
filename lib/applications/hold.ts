import { workdaysBetween, type ProjectSignal } from "@/lib/projects/signal";

/**
 * Ampel einer Wiedervorlage (On hold) im Cockpit – gleiche Formen und Schwelle wie bei Projekten:
 * Rot = fällig oder überfällig (blinkt), Gelb = in höchstens N Werktagen fällig, Grün = später.
 */
export function holdSignal(holdUntil: string, now: Date, workdays = 3): ProjectSignal {
  const base = { waitingOn: "uns" as const, waitingSince: null, nextDeadline: { title: "Wiedervorlage", dueDate: holdUntil } };
  const today = now.toISOString().slice(0, 10);
  if (holdUntil <= today) {
    const late = workdaysBetween(holdUntil, now);
    return { ...base, level: "red", reason: late > 0 ? `Wiedervorlage seit ${late} ${late === 1 ? "Werktag" : "Werktagen"} fällig` : "Wiedervorlage heute", blink: true };
  }
  const left = workdaysBetween(now, holdUntil);
  if (left <= workdays) return { ...base, level: "yellow", reason: `Wiedervorlage in ${left} ${left === 1 ? "Werktag" : "Werktagen"}`, blink: false };
  return { ...base, level: "green", reason: `Wiedervorlage am ${new Date(holdUntil).toLocaleDateString("de-DE")}`, blink: false };
}
