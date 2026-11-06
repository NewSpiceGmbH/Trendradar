/**
 * Ampel eines Projekts im Cockpit (Übergabe Abschnitt 2). Werktage = Montag bis Freitag, ohne Feiertage.
 *
 * Rot:   Frist überschritten, oder unsere Rückmeldung länger als N Werktage offen.
 * Gelb:  Frist in höchstens N Werktagen, oder Kundenrückmeldung länger als N Werktage offen.
 * Grün:  sonst.   Grau: abgeschlossen oder abgebrochen.
 * Rot blinkt, bis das Problem gelöst ist; Gelb nur, bis die Redaktion das Projekt angesehen hat.
 */
import type { ProjectStatus } from "./types";

export type SignalLevel = "red" | "yellow" | "green" | "done";

export interface ProjectSignal {
  level: SignalLevel;
  /** Grund in wenigen Worten, steht immer neben der Ampel */
  reason: string;
  blink: boolean;
  waitingOn: "uns" | "Kunde" | null;
  waitingSince: string | null;
  nextDeadline: { title: string; dueDate: string } | null;
}

export interface SignalInput {
  status: ProjectStatus;
  editorSeenAt: string | null;
  milestones: { title: string; dueDate: string | null; doneAt: string | null }[];
  /** letzte Nachricht des Kunden bzw. der Redaktion (ohne interne Notizen) */
  lastCustomerAt: string | null;
  lastTeamAt: string | null;
}

const DAY = 86_400_000;
const dayOf = (d: Date | string) => {
  const x = new Date(typeof d === "string" ? d : d.getTime());
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};
const isWorkday = (t: number) => { const w = new Date(t).getUTCDay(); return w !== 0 && w !== 6; };

/** Werktage nach `from` bis einschließlich `to` (0, wenn to nicht nach from liegt) */
export function workdaysBetween(from: Date | string, to: Date | string): number {
  let n = 0;
  for (let t = dayOf(from) + DAY; t <= dayOf(to); t += DAY) if (isWorkday(t)) n++;
  return n;
}

/** Datum n Werktage nach `from` (n < 0: davor), als YYYY-MM-DD */
export function addWorkdays(from: Date | string, n: number): string {
  let t = dayOf(from);
  const step = n < 0 ? -DAY : DAY;
  for (let left = Math.abs(n); left > 0; ) { t += step; if (isWorkday(t)) left--; }
  return new Date(t).toISOString().slice(0, 10);
}

const days = (n: number) => `${n} T.`;

export function projectSignal(p: SignalInput, now: Date, workdays = 3): ProjectSignal {
  const open = p.milestones.filter((m) => m.dueDate && !m.doneAt).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const next = open[0] ? { title: open[0].title, dueDate: open[0].dueDate! } : null;
  const c = p.lastCustomerAt ? Date.parse(p.lastCustomerAt) : 0;
  const tm = p.lastTeamAt ? Date.parse(p.lastTeamAt) : 0;
  const waitingOn = c > tm ? "uns" : tm > 0 ? "Kunde" : null;
  const waitingSince = c > tm ? p.lastCustomerAt : tm > 0 ? p.lastTeamAt : null;
  const base = { waitingOn, waitingSince, nextDeadline: next } as const;

  if (p.status === "completed" || p.status === "cancelled") {
    return { ...base, level: "done", reason: p.status === "completed" ? "abgeschlossen" : "abgebrochen", blink: false, waitingOn: null, waitingSince: null };
  }
  const today = dayOf(now);
  const waited = waitingSince ? workdaysBetween(waitingSince, now) : 0;

  // Rot
  if (next && dayOf(next.dueDate) < today) {
    return { ...base, level: "red", reason: `${next.title} überfällig · ${days(workdaysBetween(next.dueDate, now))}`, blink: true };
  }
  if (waitingOn === "uns" && waited > workdays) {
    return { ...base, level: "red", reason: `Unsere Antwort fehlt · ${days(waited)}`, blink: true };
  }
  // Gelb – blinkt, bis die Redaktion nach Beginn des Gelb-Zustands hingesehen hat
  const seen = p.editorSeenAt ? Date.parse(p.editorSeenAt) : 0;
  if (next && workdaysBetween(now, next.dueDate) <= workdays) {
    const since = Date.parse(addWorkdays(next.dueDate, -workdays));
    const left = workdaysBetween(now, next.dueDate);
    return { ...base, level: "yellow", reason: `${next.title} ${left === 0 ? "heute" : `in ${days(left)}`}`, blink: seen < since };
  }
  if (waitingOn === "Kunde" && waited > workdays) {
    const since = Date.parse(addWorkdays(waitingSince!, workdays + 1));
    return { ...base, level: "yellow", reason: `Kunde antwortet nicht · ${days(waited)}`, blink: seen < since };
  }
  return { ...base, level: "green", reason: "im Plan", blink: false };
}

const ORDER: Record<SignalLevel, number> = { red: 0, yellow: 1, green: 2, done: 3 };
export const bySignal = (a: { signal: ProjectSignal }, b: { signal: ProjectSignal }) => ORDER[a.signal.level] - ORDER[b.signal.level];
