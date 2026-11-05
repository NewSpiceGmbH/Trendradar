"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignSignal, dismissSignal, publishSignal, type ActionResult } from "@/lib/admin/actions";
import type { Signal } from "@/lib/admin/types";
import { ExampleTag, btn, input } from "./ui";

/** Eine Meldung im Liveticker: Trend zuordnen, veröffentlichen/zurückziehen, verwerfen */
export function SignalRow({ signal, trends, found }: { signal: Signal; trends: { id: number; number: number; name: string }[]; found: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const act = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else { setError(null); router.refresh(); }
    });
  const live = !!signal.publishedAt;

  return (
    <li className="grid gap-3 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <a href={signal.url} target="_blank" rel="noopener noreferrer" className="font-bold">{signal.title}</a>
          {signal.example && <ExampleTag />}
        </div>
        <span className="text-xs text-muted">{signal.publisher ?? new URL(signal.url).hostname} · gefunden {found}</span>
        {signal.summary && <p className="text-sm text-text">{signal.summary}</p>}
        {error && <p role="alert" className="text-sm text-[var(--cA)]">{error}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <select
          aria-label="Trend zuordnen"
          value={signal.trendId ?? ""}
          disabled={busy || signal.status === "dismissed"}
          onChange={(e) => act(() => assignSignal(signal.id, e.target.value ? Number(e.target.value) : null))}
          className={input}
        >
          <option value="">Keinem Trend zugeordnet</option>
          {trends.map((t) => <option key={t.id} value={t.id}>#{t.number} {t.name}</option>)}
        </select>
        <div className="flex flex-wrap gap-2">
          {signal.status !== "dismissed" && (
            <button type="button" disabled={busy || (!live && !signal.trendId)} onClick={() => act(() => publishSignal(signal.id, !live))} className={live ? btn.ghost : btn.primary} title={!signal.trendId ? "Erst einem Trend zuordnen" : undefined}>
              {live ? "Aus dem Ticker nehmen" : "Veröffentlichen"}
            </button>
          )}
          {signal.status !== "dismissed" ? (
            <button type="button" disabled={busy} onClick={() => act(() => dismissSignal(signal.id))} className={btn.danger}>Verwerfen</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => act(() => assignSignal(signal.id, null))} className={btn.ghost}>Wiederaufnehmen</button>
          )}
        </div>
      </div>
    </li>
  );
}
