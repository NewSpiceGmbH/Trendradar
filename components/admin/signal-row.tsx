"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignSignal, dismissSignal, publishSignal, type ActionResult } from "@/lib/admin/actions";
import { approveMedia } from "@/lib/agents/actions";
import type { Signal, SignalMedia } from "@/lib/admin/types";
import { Badge, ExampleTag, btn, input } from "./ui";

const KIND: Record<string, string> = { launch: "Start", pilot: "Pilot", study: "Studie", regulation: "Regulierung", deal: "Deal", event: "Event", video: "Video", other: "Sonstiges" };
const RIGHTS: Record<SignalMedia["rights"], string> = { embed: "eingebettet", press: "Pressebild", cc: "freie Lizenz", own: "eigenes Material", unclear: "Rechte unklar" };

/** Video oder Bild zu einer Meldung: Rechte klären und für Kunden freigeben */
function MediaItem({ m }: { m: SignalMedia }) {
  const router = useRouter();
  const [rights, setRights] = useState<SignalMedia["rights"]>(m.rights);
  const [credit, setCredit] = useState(m.credit ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const save = (approved: boolean) =>
    start(async () => {
      if (rights === "unclear" && approved) return setError("Erst die Rechte klären.");
      const r = await approveMedia(m.id, rights, credit || null, approved);
      if (!r.ok) setError(r.error);
      else { setError(null); router.refresh(); }
    });
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{m.kind === "video" ? "Video" : "Bild"}</Badge>
        <a href={m.url} target="_blank" rel="noopener noreferrer" className="truncate">{m.title ?? m.url}</a>
        <Badge tone={m.approved ? "neutral" : "muted"}>{m.approved ? "freigegeben" : RIGHTS[m.rights]}</Badge>
      </div>
      {m.kind === "video" && m.embedUrl && (
        <iframe src={m.embedUrl} title={m.title ?? "Video"} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen className="aspect-video w-full max-w-md rounded-lg border-0" />
      )}
      {m.kind === "image" && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={rights} onChange={(e) => setRights(e.target.value as SignalMedia["rights"])} aria-label="Rechte" className={`${input} w-auto`}>
            {(["unclear", "press", "cc", "own"] as const).map((r) => <option key={r} value={r}>{RIGHTS[r]}</option>)}
          </select>
          <input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Bildnachweis" aria-label="Bildnachweis" className={`${input} w-48`} />
          {m.license && <span className="text-xs text-muted">Angabe des Scouts: {m.license}</span>}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => save(!m.approved)} className={m.approved ? btn.ghost : btn.primary}>{m.approved ? "Zurückziehen" : "Für Kunden freigeben"}</button>
      </div>
      {error && <p role="alert" className="text-xs text-[var(--cA)]">{error}</p>}
    </li>
  );
}

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
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{signal.publisher ?? new URL(signal.url).hostname} · gefunden {found}{signal.scoutName ? ` · Scout ${signal.scoutName}` : ""}</span>
          {signal.kind && <Badge tone="muted">{KIND[signal.kind] ?? signal.kind}</Badge>}
          {signal.evidence && <Badge tone="muted">Evidenz {signal.evidence}</Badge>}
          {signal.pressRelease && <Badge tone="muted">Pressemitteilung</Badge>}
        </span>
        {signal.summary && <p className="text-sm text-text">{signal.summary}</p>}
        {!!signal.media?.length && <ul className="mt-2 flex flex-col gap-2">{signal.media.map((m) => <MediaItem key={m.id} m={m} />)}</ul>}
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
