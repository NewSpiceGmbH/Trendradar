"use client";

import { useEffect, useState } from "react";
import type { RadarData, TickerItem } from "@/lib/radar/types";
import { dayLabel, hostOf, isFresh } from "@/lib/stadium/ticker";

/**
 * Laufzeile unten im Stadion: zeigt reihum die neuesten Meldungen, Klick öffnet den Liveticker.
 * Ohne Meldungen erscheint sie nicht.
 */
export function TickerStrip({ items, open, onOpen, editor = false }: { items: TickerItem[]; open: boolean; onOpen: () => void; editor?: boolean }) {
  const latest = items.slice(0, 5);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (latest.length < 2 || open) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % latest.length), 6000);
    return () => window.clearInterval(id);
  }, [latest.length, open]);
  if (!latest.length) {
    // Kunden sehen ohne Meldungen nichts; die Redaktion bekommt einen Hinweis, wo der Ticker erscheint
    if (!editor) return null;
    return (
      <a href="/admin/ticker" className="glass pointer-events-auto rounded-[var(--radius-pill)] px-4 py-1.5 text-sm text-muted no-underline hover:text-ink">
        Liveticker: noch keine Meldung freigegeben – nur für die Redaktion sichtbar →
      </a>
    );
  }
  const cur = latest[i % latest.length];
  const fresh = items.filter((x) => isFresh(x)).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      aria-label={`Liveticker öffnen, ${items.length} Meldungen`}
      className="glass pointer-events-auto flex min-w-0 max-w-full items-center gap-3 rounded-[var(--radius-pill)] py-1.5 pl-2 pr-4 text-left text-sm hover:brightness-110 sm:max-w-[520px]"
    >
      <span className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] bg-ink px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-bg">
        <span className="stadium-live size-1.5 rounded-full bg-bg" aria-hidden />
        Live{fresh ? ` · ${fresh}` : ""}
      </span>
      <span key={cur.id} className="stadium-ticker-in min-w-0 truncate text-ink">
        <span className="text-muted">{dayLabel(cur.publishedAt)} · </span>
        {cur.title}
      </span>
    </button>
  );
}

/** Liste von Meldungen – im Ticker-Panel und im Tab „News“ der Detailansicht */
export function NewsList({
  data, items, onSelectTrend, showTrend = true,
}: { data: RadarData; items: TickerItem[]; onSelectTrend?: (n: number) => void; showTrend?: boolean }) {
  const byNumber = new Map(data.trends.map((t) => [t.number, t]));
  return (
    <ol className="flex flex-col">
      {items.map((n) => {
        const t = byNumber.get(n.trend);
        return (
          <li key={n.id} className="flex flex-col gap-1.5 border-b border-line py-3 last:border-0">
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span className={isFresh(n) ? "font-bold text-ink" : ""}>{dayLabel(n.publishedAt)}</span>
              <span aria-hidden>·</span>
              <span>{n.publisher ?? hostOf(n.url)}</span>
            </p>
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-bold leading-snug text-ink no-underline hover:underline">
              {n.title}
              <span className="sr-only"> (öffnet die Quelle in einem neuen Tab)</span>
              <span aria-hidden className="ml-1 text-muted">↗</span>
            </a>
            {n.summary && <p className="line-clamp-3 text-sm">{n.summary}</p>}
            {showTrend && t && onSelectTrend && (
              <button
                type="button"
                onClick={() => onSelectTrend(t.number)}
                className="flex items-center gap-1.5 self-start rounded-[var(--radius-pill)] border border-line px-2.5 py-0.5 text-xs font-bold text-ink hover:bg-sunk"
              >
                <span className="inline-block size-2 rounded-full" style={{ background: `var(--c${t.cluster})` }} />
                #{t.number} {t.name}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Liveticker als Seitenpanel */
export function TickerPanel({
  data, onSelectTrend, onClose,
}: { data: RadarData; onSelectTrend: (n: number) => void; onClose: () => void }) {
  const fresh = data.ticker.filter((x) => isFresh(x)).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow !text-muted">Liveticker</p>
        <button type="button" onClick={onClose} aria-label="Liveticker schließen" className="-mr-1 -mt-1 rounded-full px-2 text-lg text-muted hover:text-ink">×</button>
      </div>
      <h2 className="!text-[26px]">Neu aus dem Scouting</h2>
      <p className="text-sm">
        {fresh ? <><span className="num text-ink">{fresh}</span> {fresh === 1 ? "neue Meldung" : "neue Meldungen"} in den letzten 7 Tagen. </> : null}
        Von unseren Scouts gefunden, von der Redaktion geprüft. Trend anklicken, um ihn im Stadion zu sehen.
      </p>
      <NewsList data={data} items={data.ticker} onSelectTrend={onSelectTrend} />
    </div>
  );
}
