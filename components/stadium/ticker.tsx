"use client";

import { useEffect, useMemo, useState } from "react";
import type { RadarData, TickerItem } from "@/lib/radar/types";
import { dayLabel, filterByTopics, hostOf, isFresh } from "@/lib/stadium/ticker";

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
  data, items, onSelectTrend, showTrend = true, onHover, active = null,
}: {
  data: RadarData; items: TickerItem[]; onSelectTrend?: (n: number) => void; showTrend?: boolean;
  /** Trend im Stadion hervorheben, solange die Meldung unter dem Mauszeiger ist */
  onHover?: (n: number | null) => void;
  /** im Stadion gewählter Trend: dessen Meldungen werden markiert */
  active?: number | null;
}) {
  const byNumber = new Map(data.trends.map((t) => [t.number, t]));
  return (
    <ol className="flex flex-col">
      {items.map((n) => {
        const t = byNumber.get(n.trend);
        return (
          <li
            key={n.id}
            onMouseEnter={onHover ? () => onHover(n.trend) : undefined}
            onMouseLeave={onHover ? () => onHover(null) : undefined}
            className={`flex flex-col gap-1.5 border-b border-line py-3 last:border-0 ${active === n.trend ? "-mx-3 rounded-xl border-transparent bg-sunk px-3" : ""}`}
          >
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

const TOPICS_KEY = "trendradar.ticker-themen";

/** Gewählte Themen (Cluster) für den Ticker; bleibt im Browser gespeichert */
function useTopics(valid: string[]) {
  const [topics, setTopics] = useState<Set<string>>(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(TOPICS_KEY) ?? "[]") as string[];
      return new Set(v.filter((c) => valid.includes(c)));
    } catch { return new Set(); }
  });
  const update = (next: Set<string>) => {
    setTopics(next);
    try { window.localStorage.setItem(TOPICS_KEY, JSON.stringify([...next])); } catch { /* privates Fenster */ }
  };
  return [topics, update] as const;
}

/**
 * Liveticker als feste Spalte rechts neben dem Stadion (ab Tablet-Breite quer).
 * Filter nach Themen; Hover hebt den Trend im Stadion hervor, Klick fliegt hin.
 */
export function TickerColumn({
  data, onSelectTrend, onHover, active, editor = false,
}: {
  data: RadarData; onSelectTrend: (n: number) => void; onHover: (n: number | null) => void; active: number | null; editor?: boolean;
}) {
  const clusterOf = useMemo(() => {
    const m = new Map(data.trends.map((t) => [t.number, t.cluster as string]));
    return (n: number) => m.get(n);
  }, [data]);
  const [topics, setTopics] = useTopics(data.clusters.map((c) => c.code));
  const [choosing, setChoosing] = useState(false);
  const items = filterByTopics(data.ticker, clusterOf, topics);
  const fresh = data.ticker.filter((x) => isFresh(x)).length;
  const countIn = (c: string) => data.ticker.filter((i) => clusterOf(i.trend) === c).length;
  const toggle = (c: string) => {
    const next = new Set(topics);
    if (next.has(c)) next.delete(c); else next.add(c);
    setTopics(next);
  };

  return (
    <section aria-label="Liveticker" className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 border-b border-line px-5 pb-4 pt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow flex items-center gap-2 !text-ink">
            <span className="stadium-live size-2 rounded-full bg-ink" aria-hidden />
            Liveticker
          </p>
          {fresh > 0 && <span className="text-xs text-muted"><span className="num text-ink">{fresh}</span> neu in 7 Tagen</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={!topics.size}
            onClick={() => setTopics(new Set())}
            className={`rounded-[var(--radius-pill)] px-3 py-1 text-xs font-bold ${!topics.size ? "bg-ink text-bg" : "border border-line text-ink hover:bg-sunk"}`}
          >
            Alle Themen
          </button>
          {[...topics].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              aria-label={`Thema ${data.clusters.find((x) => x.code === c)?.name} entfernen`}
              className="flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-ink px-3 py-1 text-xs font-bold text-bg"
            >
              <span className="inline-block size-2 rounded-full" style={{ background: `var(--c${c})` }} />
              {data.clusters.find((x) => x.code === c)?.name}
              <span aria-hidden>×</span>
            </button>
          ))}
          <button
            type="button"
            aria-expanded={choosing}
            onClick={() => setChoosing((v) => !v)}
            className="rounded-[var(--radius-pill)] border border-line px-3 py-1 text-xs font-bold text-ink hover:bg-sunk"
          >
            {choosing ? "Fertig" : "Themen wählen"}
          </button>
        </div>
        {choosing && (
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">Themen, die Sie interessieren</legend>
            {data.clusters.map((c) => (
              <label key={c.code} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-sunk">
                <input type="checkbox" checked={topics.has(c.code)} onChange={() => toggle(c.code)} className="accent-[var(--ink)]" />
                <span className="inline-block size-2.5 rounded-full" style={{ background: `var(--c${c.code})` }} />
                <span className="flex-1 text-ink">{c.name}</span>
                <span className="num text-xs text-muted">{countIn(c.code)}</span>
              </label>
            ))}
          </fieldset>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5" aria-live="polite">
        {items.length ? (
          <NewsList data={data} items={items} onSelectTrend={onSelectTrend} onHover={onHover} active={active} />
        ) : (
          <p className="py-6 text-sm text-muted">
            {data.ticker.length
              ? "Zu diesen Themen gibt es noch keine Meldung. Weitere Themen wählen oder „Alle Themen“."
              : editor
                ? "Noch keine Meldung freigegeben. Im Backend unter Liveticker veröffentlichen – dann erscheint sie hier."
                : "Noch keine Meldungen. Sobald unsere Scouts etwas finden und die Redaktion es geprüft hat, erscheint es hier."}
          </p>
        )}
      </div>
      <p className="border-t border-line px-5 py-3 text-xs text-muted">Von unseren Scouts gefunden, von der Redaktion geprüft. Links führen zur Originalquelle.</p>
    </section>
  );
}
