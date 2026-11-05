import type { Lane } from "@/lib/agents/types";
import type { Signal } from "./types";

const DAY = 86_400_000;

/** Bereich einer Meldung; ohne Angabe (vor Migration 0008 oder ohne Scout) gilt Sport & Hospitality */
export const laneOf = (s: Pick<Signal, "lane">): Lane => s.lane ?? "sport_hospitality";

/**
 * Lagebild eines Bereichs: die wichtigsten Meldungen zuerst.
 * Aus den letzten 14 Tagen nach Relevanz, dann nach Fundzeit; ältere danach, neueste zuerst. Verworfene nie.
 */
export function laneBoard(signals: Signal[], lane: Lane, now: Date = new Date(), limit = 6) {
  const mine = signals.filter((s) => laneOf(s) === lane && s.status !== "dismissed");
  const age = (s: Signal) => now.getTime() - Date.parse(s.foundAt);
  const recent = (s: Signal) => age(s) < 14 * DAY;
  const sorted = [...mine].sort((a, b) => {
    if (recent(a) !== recent(b)) return recent(a) ? -1 : 1;
    if (recent(a) && (b.relevance ?? 0) !== (a.relevance ?? 0)) return (b.relevance ?? 0) - (a.relevance ?? 0);
    return Date.parse(b.foundAt) - Date.parse(a.foundAt);
  });
  return {
    items: sorted.slice(0, limit),
    fresh: mine.filter((s) => age(s) < 7 * DAY).length,
    open: mine.filter((s) => !s.publishedAt).length,
    total: mine.length,
  };
}
