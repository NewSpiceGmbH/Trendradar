"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { dismissSignal, publishSignal, publishToTicker } from "@/lib/admin/actions";
import type { Signal } from "@/lib/admin/types";
import { LANE_LABEL, LANES, type Lane } from "@/lib/agents/types";
import { acceptRequest, declineRequest, markProjectSeen } from "@/lib/projects/actions";
import type { ProjectSignal } from "@/lib/projects/signal";
import { PROJECT_PHASES, PROJECT_STATUS_LABEL, type Project } from "@/lib/projects/types";
import { btn, input } from "./ui";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-xs ${m.ok ? "text-ink" : "text-alert"}`}>{m.text}</p> : null);
const BERLIN = "Europe/Berlin";
const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: BERLIN });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: BERLIN });
const rel = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
function ago(iso: string, now: number) {
  const min = Math.round((Date.parse(iso) - now) / 60_000);
  if (Math.abs(min) < 60) return rel.format(min, "minute");
  const h = Math.round(min / 60);
  return Math.abs(h) < 48 ? rel.format(h, "hour") : rel.format(Math.round(h / 24), "day");
}

// ───────────────────────── Ampel ─────────────────────────

const LIGHT = {
  red: { shape: "rounded-md", sign: "!", color: "bg-alert text-alert-fg", label: "Rot" },
  yellow: { shape: "rounded-full", sign: "◷", color: "bg-warn text-warn-fg", label: "Gelb" },
  green: { shape: "rounded-full", sign: "✓", color: "bg-ok text-ok-fg", label: "Grün" },
  done: { shape: "rounded-full", sign: "–", color: "bg-line text-muted", label: "Grau" },
} as const;

export function SignalLight({ s }: { s: ProjectSignal }) {
  const l = LIGHT[s.level];
  const blink = s.blink ? (s.level === "red" ? "signal-fast" : "signal-slow") : "";
  return (
    <span role="img" aria-label={`Ampel ${l.label}: ${s.reason}`} title={s.reason}
      className={`grid size-6 shrink-0 place-items-center text-[11px] font-bold ${l.shape} ${l.color} ${blink}`}>
      <span aria-hidden>{l.sign}</span>
    </span>
  );
}

// ───────────────────────── Projekte ─────────────────────────

export interface ProjectRow {
  project: Project;
  signal: ProjectSignal;
  isNew: boolean;
}

export function ProjectList({ rows }: { rows: ProjectRow[] }) {
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const r of rows) if (r.signal.level !== "done") counts[r.signal.level]++;
  return (
    <section aria-labelledby="projekte" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="projekte" className="!text-2xl">Projekte</h2>
        <p className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1"><span className="grid size-4 place-items-center rounded bg-alert text-[9px] font-bold text-alert-fg" aria-hidden>!</span><span className="num">{counts.red}</span><span className="sr-only">rot</span></span>
          <span className="flex items-center gap-1"><span className="grid size-4 place-items-center rounded-full bg-warn text-[9px] text-warn-fg" aria-hidden>◷</span><span className="num">{counts.yellow}</span><span className="sr-only">gelb</span></span>
          <span className="flex items-center gap-1"><span className="grid size-4 place-items-center rounded-full bg-ok text-[9px] text-ok-fg" aria-hidden>✓</span><span className="num">{counts.green}</span><span className="sr-only">grün</span></span>
          <Link href="/admin/projekte">Alle →</Link>
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((r) => <ProjectItem key={r.project.id} r={r} />)}
        {!rows.length && <li className="py-4 text-sm text-muted">Noch keine Projekte. Neue Anfragen erscheinen unten als Pop-up.</li>}
      </ul>
    </section>
  );
}

function ProjectItem({ r }: { r: ProjectRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const p = r.project;
  const s = seen && r.signal.level === "yellow" ? { ...r.signal, blink: false } : r.signal;
  const toggle = () => {
    setOpen((o) => !o);
    if (!seen && r.signal.level !== "done") {
      setSeen(true);
      void markProjectSeen(p.id).then(() => router.refresh());
    }
  };
  const phase = PROJECT_PHASES.indexOf(p.status);
  return (
    <li className={`py-2.5 ${r.isNew ? "border-l-2 border-ink pl-3" : ""}`}>
      <button type="button" onClick={toggle} aria-expanded={open}
        className="grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 text-left sm:grid-cols-[24px_minmax(0,1fr)_minmax(0,280px)_16px]">
        <SignalLight s={s} />
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          {r.isNew && <span className="eyebrow !text-[10px]">Neu</span>}
          <b className="truncate text-ink">{p.title}</b>
          <span className="text-xs text-muted">{p.orgName}</span>
        </span>
        <span className="hidden truncate text-right text-sm text-text sm:block">{s.reason}</span>
        <span aria-hidden className="text-xs text-muted">{open ? "▴" : "▾"}</span>
      </button>
      <p className="mt-1 pl-9 text-xs text-text sm:hidden">{s.reason}</p>
      {open && (
        <div className="mt-3 flex flex-col gap-3 pl-9 text-sm">
          <ol className="grid grid-cols-6 gap-1" aria-label={`Phase: ${PROJECT_STATUS_LABEL[p.status]}`}>
            {PROJECT_PHASES.map((ph, i) => (
              <li key={ph} className="flex flex-col gap-1">
                <span className={`h-1 rounded-full ${i <= phase ? "bg-ink" : "bg-line"}`} aria-hidden />
                <span className={`text-[10px] leading-tight ${i === phase ? "font-bold text-ink" : "hidden text-muted sm:inline"}`}>{PROJECT_STATUS_LABEL[ph]}</span>
              </li>
            ))}
          </ol>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Nächste Frist</dt><dd className="text-ink">{s.nextDeadline ? `${s.nextDeadline.title} · ${new Date(s.nextDeadline.dueDate).toLocaleDateString("de-DE")}` : "–"}</dd></div>
            <div><dt className="text-xs text-muted">Wartet auf</dt><dd className="text-ink">{s.waitingOn ? `${s.waitingOn === "uns" ? "uns" : "den Kunden"} seit ${new Date(s.waitingSince!).toLocaleDateString("de-DE")}` : "niemanden"}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/projekte/${p.id}`} className={btn.primary}>Projekt öffnen</Link>
            <Link href={`/admin/projekte/${p.id}#nachrichten`} className={btn.ghost}>Nachricht an Kunde</Link>
          </div>
        </div>
      )}
    </li>
  );
}

// ───────────────────────── Anfragen (Pop-up) ─────────────────────────

export function RequestsDock({ requests, now }: { requests: Project[]; now: number }) {
  const router = useRouter();
  // am Desktop offen wie im Entwurf; am Handy erst nach Tippen auf „Eingang“ (verdeckt sonst den Inhalt)
  const [open, setOpen] = useState(requests.length > 0);
  const [explicit, setExplicit] = useState(false);
  const [i, setI] = useState(0);
  const [details, setDetails] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const r = requests[Math.min(i, requests.length - 1)];
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { ok: true, text: res.message ?? "Erledigt." } : { ok: false, text: res.error ?? "Fehler" });
      if (res.ok) { setDeclining(false); setReason(""); setDetails(false); setI(0); router.refresh(); }
    });

  return (
    <>
      <button type="button" onClick={() => { setExplicit(true); setOpen((o) => (explicit ? !o : true)); }} aria-expanded={open} disabled={!requests.length}
        className={`${btn.ghost} !px-3 !py-1.5 text-xs disabled:opacity-50`}>
        Eingang · <span className={`num ${requests.length ? "stadium-live" : ""}`}>{requests.length}</span>
      </button>
      {open && r && (
        <section role="dialog" aria-label="Neue Anfrage"
          className={`glass-strong fixed bottom-4 left-4 z-30 w-[min(400px,calc(100vw-2rem))] flex-col gap-3 rounded-[var(--radius-card)] p-4 lg:left-[288px] ${explicit ? "flex" : "hidden lg:flex"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-ink px-2.5 py-0.5 font-bold uppercase tracking-wider text-bg">
                <span className="stadium-live size-1.5 rounded-full bg-bg" aria-hidden />Anfrage
              </span>
              {requests.length > 1 && (
                <span className="text-muted">{i + 1} von {requests.length} · <button type="button" onClick={() => { setI((i + 1) % requests.length); setDetails(false); setDeclining(false); }} className="font-bold text-ink hover:underline">nächste ›</button></span>
              )}
            </p>
            <button type="button" onClick={() => { setOpen(false); setExplicit(true); }} aria-label="Anfragen schließen" className="text-muted hover:text-ink">✕</button>
          </div>
          <div>
            <p className="font-bold text-ink">{r.title}</p>
            <p className="text-xs text-muted">{r.orgName} · {ago(r.createdAt, now)}</p>
          </div>
          {details && (
            <dl className="flex flex-col gap-1.5 text-sm">
              <div><dt className="text-xs text-muted">Anliegen</dt><dd>{r.request}</dd></div>
              {r.goal && <div><dt className="text-xs text-muted">Ziel</dt><dd>{r.goal}</dd></div>}
              {(r.venue || r.timeframe || r.budget) && <div><dt className="text-xs text-muted">Ort · Zeitraum · Budget</dt><dd>{[r.venue, r.timeframe, r.budget].filter(Boolean).join(" · ")}</dd></div>}
            </dl>
          )}
          {declining ? (
            <div className="flex flex-col gap-2">
              <textarea aria-label="Begründung an den Kunden" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={input}
                placeholder="Kurze Begründung – der Kunde sieht sie im Projekt." />
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => run(() => declineRequest(r.id, reason))} className={btn.danger}>Ablehnung senden</button>
                <button type="button" onClick={() => setDeclining(false)} className={btn.ghost}>Zurück</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy} onClick={() => run(() => acceptRequest(r.id))} className={`${btn.primary} !px-3 !py-1.5`}>✓ Annehmen</button>
              <button type="button" onClick={() => setDetails((d) => !d)} aria-expanded={details} className={`${btn.ghost} !px-3 !py-1.5`}>Details</button>
              <button type="button" onClick={() => setDeclining(true)} className={`${btn.ghost} ml-auto !px-3 !py-1.5`}>Ablehnen</button>
            </div>
          )}
          <Note m={msg} />
        </section>
      )}
    </>
  );
}

// ───────────────────────── Live-Feed ─────────────────────────

export interface TrendOption { id: number; number: number; name: string; cluster: string }

export function LiveFeed({ signals, trends, scouts, now }: { signals: Signal[]; trends: TrendOption[]; scouts: { active: number; total: number }; now: number }) {
  const [lane, setLane] = useState<Lane | "all">("all");
  const list = signals.filter((s) => lane === "all" || (s.lane ?? "sport_hospitality") === lane);
  const byId = useMemo(() => new Map(trends.map((t) => [t.id, t])), [trends]);
  const byNumber = useMemo(() => new Map(trends.map((t) => [t.number, t])), [trends]);
  const open = list.filter((s) => !s.publishedAt).length;
  const noTrend = list.filter((s) => !s.publishedAt && !s.trendId && !(s.suggestedTrends ?? []).some((n) => byNumber.has(n))).length;
  const last = signals[0];
  const today = dayKey(new Date(now).toISOString());
  const yesterday = dayKey(new Date(now - 86_400_000).toISOString());
  const groups: { label: string; items: Signal[] }[] = [];
  for (const s of list) {
    const k = dayKey(s.foundAt);
    const label = k === today ? "Heute" : k === yesterday ? "Gestern" : new Date(s.foundAt).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short", timeZone: BERLIN });
    const g = groups.at(-1);
    if (g?.label === label) g.items.push(s); else groups.push({ label, items: [s] });
  }

  return (
    <section aria-label="Live-Feed" className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 !text-xl">
          <span className="flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-ink px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-bg">
            <span className="stadium-live size-1.5 rounded-full bg-bg" aria-hidden />Live
          </span>
          Meldungen
        </h2>
        {last && <span className="text-xs text-muted">Letzte {ago(last.foundAt, now)} · {time(last.foundAt)}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Bereich">
        {(["all", ...LANES] as const).map((l) => (
          <button key={l} type="button" aria-pressed={lane === l} onClick={() => setLane(l)}
            className={`rounded-[var(--radius-pill)] px-3 py-1 text-xs font-bold ${lane === l ? "bg-ink text-bg" : "border border-line text-ink hover:bg-sunk"}`}>
            {l === "all" ? "Alle" : { sport_hospitality: "Sport & Hosp.", startup_tech: "Startups", cross_industry: "Cross-Industry" }[l]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        <span className="num text-ink">{open}</span> noch nicht im Ticker · <span className="num text-ink">{noTrend}</span> ohne Trend · Scouts: {scouts.active} von {scouts.total} im Einsatz
      </p>
      <div className="flex flex-col gap-1">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col">
            <p className="eyebrow !text-[10px] !text-muted pb-1 pt-3">{g.label}</p>
            <ul className="flex flex-col divide-y divide-line">
              {g.items.map((s) => <FeedItem key={s.id} s={s} trends={trends} byId={byId} byNumber={byNumber} now={now} />)}
            </ul>
          </div>
        ))}
        {!list.length && <p className="py-6 text-sm text-muted">Keine Meldungen in diesem Bereich.</p>}
      </div>
      <Link href="/admin/ticker" className="text-sm">Alle Meldungen im Liveticker →</Link>
    </section>
  );
}

const REL = { 1: "Relevanz niedrig", 2: "Relevanz mittel", 3: "Relevanz hoch" } as const;

function FeedItem({ s, trends, byId, byNumber, now }: { s: Signal; trends: TrendOption[]; byId: Map<number, TrendOption>; byNumber: Map<number, TrendOption>; now: number }) {
  const router = useRouter();
  const suggested = (s.suggestedTrends ?? []).map((n) => byNumber.get(n)).filter((t): t is TrendOption => !!t);
  const initial = (s.trendId ? byId.get(s.trendId) : undefined) ?? suggested[0] ?? null;
  const [trend, setTrend] = useState<TrendOption | null>(initial);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const rel = s.relevance as 1 | 2 | 3 | null | undefined;
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? null : { ok: false, text: r.error ?? "Fehler" });
      if (r.ok) router.refresh();
    });
  const source = s.trendId ? "zugeordnet" : trend && suggested[0]?.id === trend.id ? "vom Scout vorgeschlagen" : trend ? "gewählt" : "kein Vorschlag";
  const hits = q.trim()
    ? trends.filter((t) => `#${t.number} ${t.name}`.toLowerCase().includes(q.trim().toLowerCase().replace(/^#/, ""))).slice(0, 8)
    : suggested.length ? suggested : trends.slice(0, 6);

  return (
    <li className="flex flex-col gap-1.5 py-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="num text-ink">{time(s.foundAt)}</span>
        <span className="rounded-[var(--radius-pill)] border border-line px-2">{LANE_LABEL[s.lane ?? "sport_hospitality"].replace("Sport & Hospitality", "Sport & Hosp.").replace("Startups & Technologie", "Startups")}</span>
        {rel ? <span aria-label={REL[rel]} title={REL[rel]} className="tracking-[0.15em] text-ink">{"●".repeat(rel)}<span className="text-line">{"●".repeat(3 - rel)}</span></span> : null}
        {s.publisher && <span className="truncate">{s.publisher}</span>}
      </p>
      <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-bold leading-snug text-ink no-underline hover:underline">
        {s.title}<span aria-hidden className="ml-1 text-muted">↗</span>
      </a>
      <div className="relative flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => setPicking((v) => !v)} aria-expanded={picking} disabled={!!s.publishedAt}
          className="flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-line px-2.5 py-0.5 font-bold text-ink hover:bg-sunk disabled:cursor-default disabled:hover:bg-transparent">
          {trend ? <><span className="inline-block size-2 rounded-full" style={{ background: `var(--c${trend.cluster})` }} />#{trend.number} {trend.name}</> : "Trend wählen"}
          {!s.publishedAt && <span aria-hidden>▾</span>}
        </button>
        <span className={trend ? "text-muted" : "text-warn"}>{source}</span>
        {picking && (
          <div className="glass-strong absolute left-0 top-full z-20 mt-1 flex w-72 flex-col gap-2 rounded-xl p-2">
            <input autoFocus aria-label="Trend suchen" value={q} onChange={(e) => setQ(e.target.value)} className={`${input} !py-1 text-xs`} placeholder="Trend suchen: Name oder #Nummer" />
            {!q && suggested.length > 0 && <p className="px-1 text-[10px] text-muted">Vorschläge des Scouts</p>}
            <ul className="flex max-h-56 flex-col overflow-y-auto">
              {hits.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => { setTrend(t); setPicking(false); setQ(""); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-sunk ${trend?.id === t.id ? "font-bold text-ink" : ""}`}>
                    <span className="inline-block size-2 rounded-full" style={{ background: `var(--c${t.cluster})` }} />#{t.number} {t.name}
                  </button>
                </li>
              ))}
            </ul>
            <Link href="/admin/trends/neu" className="px-1 text-[11px]">Passt keiner? Als neuen Trend vorschlagen →</Link>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        {s.publishedAt ? (
          <>
            <span className="text-muted">Im Ticker seit {ago(s.publishedAt, now)}</span>
            <button type="button" disabled={busy} onClick={() => run(() => publishSignal(s.id, false))} className="text-muted hover:text-ink">Zurückziehen</button>
          </>
        ) : (
          <>
            <span className="text-muted">{trend ? "noch nicht im Ticker" : "Trend prüfen, bevor es live geht"}</span>
            <span className="flex items-center gap-1.5">
              <button type="button" disabled={busy || !trend} onClick={() => trend && run(() => publishToTicker(s.id, trend.id))} className={`${btn.primary} !px-3 !py-1 text-xs`}>In den Ticker</button>
              <button type="button" disabled={busy} onClick={() => run(() => dismissSignal(s.id))} aria-label={`„${s.title}“ verwerfen`} className={`${btn.ghost} !px-2.5 !py-1 text-xs`}>✕</button>
            </span>
          </>
        )}
      </div>
      <Note m={msg} />
    </li>
  );
}
