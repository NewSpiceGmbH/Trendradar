"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/admin/actions";
import { addTip, runScoutNow, saveSettings, setScoutActive } from "@/lib/agents/actions";
import { REGION_LABEL, VERTICAL_LABEL, type Scout, type ScoutingSettings } from "@/lib/agents/types";
import { Badge, btn, input } from "./ui";

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const act = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  return { msg, busy, act };
}

const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) =>
  m ? <p role="status" className={`text-sm ${m.ok ? "text-ink" : "text-[var(--cA)]"}`}>{m.text}</p> : null;

const usd = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

const CADENCE = { daily: "täglich", weekly: "wöchentlich", manual: "nur per Klick" } as const;
const WEEKDAY = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function ScoutCard({ scout, stats, channelNames, apiReady }: {
  scout: Scout;
  stats: { runs: number; costUsd: number; signals: number; published: number; lastError: string | null } | undefined;
  channelNames: string[];
  apiReady: boolean;
}) {
  const { msg, busy, act } = useAction();
  const quote = stats && stats.signals ? Math.round((stats.published / stats.signals) * 100) : null;
  return (
    <article className="glass-strong flex flex-col gap-4 rounded-[var(--radius-card)] p-5">
      <header className="flex items-start gap-4">
        <span className={`num grid size-12 shrink-0 place-items-center rounded-full text-xl ${scout.active ? "bg-ink text-bg" : "border border-line text-muted"}`} aria-label={`Rückennummer ${scout.shirtNumber ?? "–"}`}>
          {scout.shirtNumber ?? "–"}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="!text-xl">{scout.name}</h2>
          <p className="text-sm text-muted">{scout.role}</p>
        </div>
        <Badge tone={scout.active ? "neutral" : "muted"}>{scout.active ? "im Einsatz" : "pausiert"}</Badge>
      </header>
      <p className="line-clamp-3 text-sm text-text">{scout.briefing}</p>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {scout.verticals.map((v) => <Badge key={v}>{VERTICAL_LABEL[v]}</Badge>)}
        {scout.regions.map((r) => <Badge key={r} tone="muted">{REGION_LABEL[r]}</Badge>)}
        {scout.audience !== "both" && <Badge tone="muted">{scout.audience === "vip" ? "VIP" : "Public"}</Badge>}
      </div>
      <p className="text-xs text-muted">Quellen: {channelNames.join(" · ") || "–"}</p>
      <dl className="grid grid-cols-4 gap-2 border-y border-line py-3 text-sm">
        <div><dt className="text-xs text-muted">Takt</dt><dd className="text-ink">{CADENCE[scout.cadence]}{scout.cadence !== "manual" ? `, ${scout.cadence === "weekly" ? `${WEEKDAY[scout.runWeekday ?? 1]} ` : ""}${scout.runHour} Uhr` : ""}</dd></div>
        <div><dt className="text-xs text-muted">Läufe</dt><dd className="num text-ink">{stats?.runs ?? 0}</dd></div>
        <div><dt className="text-xs text-muted">Trefferquote</dt><dd className="num text-ink" title="Anteil freigegebener Meldungen">{quote == null ? "–" : `${quote} %`}</dd></div>
        <div><dt className="text-xs text-muted">Kosten</dt><dd className="num text-ink">{usd(stats?.costUsd ?? 0)}</dd></div>
      </dl>
      {stats?.lastError && <p className="text-xs text-[var(--cA)]">Letzter Lauf fehlgeschlagen: {stats.lastError}</p>}
      <Msg m={msg} />
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/scouting/${scout.id}`} className={btn.ghost}>Bearbeiten</Link>
        <button type="button" disabled={busy} onClick={() => act(() => setScoutActive(scout, !scout.active))} className={btn.ghost}>
          {scout.active ? "Pausieren" : "Einsetzen"}
        </button>
        <button type="button" disabled={busy || !apiReady} onClick={() => act(() => runScoutNow(scout.id))} className={btn.primary} title={apiReady ? undefined : "Claude-API-Schlüssel fehlt"}>
          Lauf starten
        </button>
      </div>
    </article>
  );
}

export function SettingsForm({ settings, spent }: { settings: ScoutingSettings; spent: number }) {
  const { msg, busy, act } = useAction();
  const [budget, setBudget] = useState(String(settings.monthlyBudgetUsd));
  const pct = settings.monthlyBudgetUsd ? Math.min(100, Math.round((spent / settings.monthlyBudgetUsd) * 100)) : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow !text-muted">Verbraucht diesen Monat</p>
          <p className="num text-3xl text-ink">{usd(spent)} <span className="text-base text-muted">von {usd(settings.monthlyBudgetUsd)}</span></p>
        </div>
        <Badge tone={settings.paused ? "warn" : "neutral"}>{settings.paused ? "Not-Aus aktiv" : "läuft"}</Badge>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunk" aria-hidden><div className="h-full bg-ink" style={{ width: `${pct}%` }} /></div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); act(() => saveSettings({ monthlyBudgetUsd: Number(budget), paused: settings.paused })); }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="eyebrow !text-muted">Monatsbudget ($)</span>
          <input type="number" min={0} step={10} value={budget} onChange={(e) => setBudget(e.target.value)} className={`${input} w-32`} />
        </label>
        <button disabled={busy} className={btn.ghost}>Speichern</button>
        <button type="button" disabled={busy} onClick={() => act(() => saveSettings({ monthlyBudgetUsd: settings.monthlyBudgetUsd, paused: !settings.paused }))} className={btn.danger}>
          {settings.paused ? "Scouting fortsetzen" : "Not-Aus: alle pausieren"}
        </button>
      </form>
      <Msg m={msg} />
    </div>
  );
}

export function TipForm({ scouts }: { scouts: Pick<Scout, "id" | "name">[] }) {
  const { msg, busy, act } = useAction();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [scoutId, setScoutId] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(async () => {
          const r = await addTip(url, note, scoutId || null);
          if (r.ok) { setUrl(""); setNote(""); }
          return r;
        });
      }}
    >
      <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/posts/…" aria-label="Link" className={input} />
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Worum geht es? (hilft, wenn der Beitrag nicht öffentlich ist)" aria-label="Notiz" className={input} />
      <div className="flex flex-wrap gap-2">
        <select value={scoutId} onChange={(e) => setScoutId(e.target.value)} aria-label="Scout" className={`${input} w-auto`}>
          <option value="">Nächster Scout im Einsatz</option>
          {scouts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button disabled={busy} className={btn.primary}>Tipp einreichen</button>
      </div>
      <Msg m={msg} />
    </form>
  );
}
