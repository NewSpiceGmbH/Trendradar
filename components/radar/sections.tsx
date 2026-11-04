"use client";

import { useState } from "react";
import { CLUSTER_KEYS, type Perspective } from "@/lib/scoring";
import type { RadarData, RadarTrend } from "@/lib/radar/types";
import { CRITERIA_SHORT, ORIGIN_LABEL, clusterFg, clusterVar, fmt, type Positions } from "@/lib/radar/view";
import { ZonePill } from "./zone-pill";
import { Button } from "./ui";

const Badge = ({ t, size = "size-7 text-xs" }: { t: RadarTrend; size?: string }) => (
  <span className={`num inline-grid shrink-0 place-items-center rounded-full ${size}`} style={{ background: clusterVar(t.cluster), color: clusterFg(t.cluster) }}>
    {t.number}
  </span>
);

// ───────────── Anzeigetafel ─────────────
export function Board({ data, pos, persp }: { data: RadarData; pos: Positions; persp: Perspective }) {
  const count = (z: string) => data.trends.filter((t) => pos[persp][t.number].zone === z).length;
  const movedCount = data.trends.filter((t) => pos.EU[t.number].zone !== pos.GLOBAL[t.number].zone).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {[
          ["Trends", data.trends.length, false],
          [data.zones.KICKOFF.name, count("KICKOFF"), true],
          [data.zones.WARMUP.name, count("WARMUP"), false],
          [data.zones.SCOUTING.name, count("SCOUTING"), false],
        ].map(([label, n, hi]) => (
          <div key={String(label)} className={`flex flex-col gap-1 p-4 ${hi ? "bg-accent text-on-accent" : "border-r border-line last:border-r-0"}`}>
            <b className={`num text-4xl leading-none ${hi ? "" : "text-ink"}`}>{n}</b>
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">{label}</span>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">
        Perspektive {persp === "EU" ? "Europa / DACH" : "Global"} · {movedCount} Trends werden in Europa anders eingeordnet als global.
      </p>
    </div>
  );
}

// ───────────── Vergleich ─────────────
export function Compare({ data, pos, persp, ids, onClear, onSelect }: { data: RadarData; pos: Positions; persp: Perspective; ids: number[]; onClear: () => void; onSelect: (n: number) => void }) {
  const ts = ids.map((n) => data.trends.find((t) => t.number === n)!).filter(Boolean);
  if (!ts.length)
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-line p-5">
        <h3 className="!text-xl">Trendvergleich</h3>
        <p className="mt-1 text-sm text-muted">Bis zu drei Trends über „Zum Vergleich hinzufügen“ in der Trendkarte auswählen.</p>
      </div>
    );
  const rows: [string, (t: RadarTrend) => React.ReactNode][] = [
    ["Cluster", (t) => `${t.cluster} · ${data.clusters.find((c) => c.code === t.cluster)?.name}`],
    ["Fokusfeld", (t) => `${data.focus.find((f) => f.code === t.focus)?.name} · ${t.subtopic}`],
    ["Signalherkunft", (t) => ORIGIN_LABEL[t.origin]],
    ["Score Europa", (t) => <span className="flex items-center gap-2"><b className="num text-ink">{fmt(pos.EU[t.number].total)}</b><ZonePill zone={pos.EU[t.number].zone} name={data.zones[pos.EU[t.number].zone].name} /></span>],
    ["Score Global", (t) => <span className="flex items-center gap-2"><span className="num">{fmt(pos.GLOBAL[t.number].total)}</span><ZonePill zone={pos.GLOBAL[t.number].zone} name={data.zones[pos.GLOBAL[t.number].zone].name} /></span>],
    ...data.criteria.map((c, i) => [c.name, (t: RadarTrend) => <span className="num">{pos[persp][t.number].scores[i]}</span>] as [string, (t: RadarTrend) => React.ReactNode]),
    ["Horizont", (t) => `${pos[persp][t.number].horizon} Jahre`],
    ["Evidenz", (t) => t.evidence],
    ...(data.premium ? [["Empfehlung", (t: RadarTrend) => t.premium?.recommendation ?? "–"] as [string, (t: RadarTrend) => React.ReactNode]] : []),
  ];
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="!text-xl">Trendvergleich</h3>
        <Button ghost onClick={onClear}>Vergleich leeren</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr>
              <th className="w-44" />
              {ts.map((t) => (
                <th key={t.number} className="p-2 text-left align-top">
                  <button type="button" onClick={() => onSelect(t.number)} className="flex items-center gap-2 text-left font-bold text-ink hover:underline">
                    <Badge t={t} /> {t.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label} className="border-t border-line">
                <td className="p-2 text-muted">{label}</td>
                {ts.map((t) => (
                  <td key={t.number} className="p-2">{f(t)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────── Alle Trendnummern ─────────────
export function Legend({ data, pos, persp, visible, onSelect }: { data: RadarData; pos: Positions; persp: Perspective; visible: Set<number>; onSelect: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <h3 className="!text-xl">Alle Trendnummern</h3>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {CLUSTER_KEYS.map((c) => (
          <div key={c} className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <i aria-hidden className="size-2.5 rounded-full" style={{ background: clusterVar(c) }} />
              {c} · {data.clusters.find((x) => x.code === c)?.name}
            </p>
            <ol className="flex flex-col gap-0.5">
              {data.trends.filter((t) => t.cluster === c).map((t) => (
                <li key={t.number}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.number)}
                    className={`grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1 py-0.5 text-left text-sm hover:bg-sunk ${visible.has(t.number) ? "" : "opacity-35"}`}
                  >
                    <span className="num text-muted">{t.number}</span>
                    <span className="truncate text-ink">{t.name}</span>
                    <ZonePill zone={pos[persp][t.number].zone} name={data.zones[pos[persp][t.number].zone].name} />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────── Fokus-Matrix ─────────────
export function FocusMatrix({ data, pos, persp, onSelect }: { data: RadarData; pos: Positions; persp: Perspective; onSelect: (n: number) => void }) {
  const P = pos[persp];
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-[180px_repeat(3,minmax(0,1fr))] gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line">
        <div className="bg-surface p-3 text-xs text-muted">Cluster \ Fokusfeld</div>
        {data.focus.map((f) => {
          const ts = data.trends.filter((t) => t.focus === f.code);
          const ko = ts.filter((t) => P[t.number].zone === "KICKOFF").length;
          const avg = ts.reduce((s, t) => s + P[t.number].total, 0) / (ts.length || 1);
          return (
            <div key={f.code} className="flex flex-col gap-0.5 bg-surface p-3">
              <h3 className="!text-lg">{f.name}</h3>
              <span className="text-xs text-muted">{f.description}</span>
              <span className="num text-xs font-normal text-muted">
                {ts.length} Trends · {ko} {data.zones.KICKOFF.name} · Ø {fmt(avg)}
              </span>
            </div>
          );
        })}
        {CLUSTER_KEYS.map((c) => (
          <div key={c} className="contents">
            <div className="flex items-start gap-2 bg-surface p-3 text-sm font-bold text-ink">
              <i aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: clusterVar(c) }} />
              {c} · {data.clusters.find((x) => x.code === c)?.name}
            </div>
            {data.focus.map((f) => {
              const g = data.trends.filter((t) => t.cluster === c && t.focus === f.code).sort((a, b) => P[b.number].total - P[a.number].total);
              return (
                <div key={f.code} className="bg-bg p-2">
                  <ul className="flex flex-col gap-1">
                    {g.map((t) => (
                      <li key={t.number}>
                        <button type="button" onClick={() => onSelect(t.number)} className="flex w-full items-start gap-2 rounded-lg p-1.5 text-left hover:bg-surface">
                          <Badge t={t} />
                          <span className="flex min-w-0 flex-col">
                            <span className="text-sm text-ink">{t.name}</span>
                            <span className="text-xs text-muted">
                              {t.subtopic} · <span className="num font-normal">{fmt(P[t.number].total)}</span> · {data.zones[P[t.number].zone].name}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────── Trenddatenbank + CSV ─────────────
type SortKey = "number" | "name" | "cluster" | "total" | "eu" | "global" | `c${number}` | "horizon";

export function TrendTable({ data, pos, persp, visible, onSelect }: { data: RadarData; pos: Positions; persp: Perspective; visible: Set<number>; onSelect: (n: number) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "total", dir: -1 });
  const [msg, setMsg] = useState("");
  const P = pos[persp];
  const val = (t: RadarTrend, k: SortKey): number | string => {
    if (k === "number") return t.number;
    if (k === "name") return t.name;
    if (k === "cluster") return t.cluster;
    if (k === "total") return P[t.number].total;
    if (k === "eu") return pos.EU[t.number].total;
    if (k === "global") return pos.GLOBAL[t.number].total;
    if (k === "horizon") return P[t.number].horizon;
    return P[t.number].scores[Number(k.slice(1))];
  };
  const rows = data.trends
    .filter((t) => visible.has(t.number))
    .sort((a, b) => {
      const x = val(a, sort.key), y = val(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : a.number - b.number) * sort.dir;
    });
  const cols: [SortKey, string][] = [
    ["number", "#"], ["name", "Trend"], ["cluster", "Cluster"], ["total", "Score"], ["eu", "Europa"], ["global", "Global"],
    ...CRITERIA_SHORT.map((s, i) => [`c${i}` as SortKey, s] as [SortKey, string]), ["horizon", "Horizont"],
  ];
  const head = (k: SortKey, label: string) => (
    <th key={k} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="whitespace-nowrap p-2 text-left">
      <button type="button" className="font-bold text-ink hover:underline" onClick={() => setSort({ key: k, dir: sort.key === k ? ((-sort.dir) as 1 | -1) : k === "name" || k === "number" ? 1 : -1 })}>
        {label} {sort.key === k ? (sort.dir === 1 ? "↑" : "↓") : ""}
      </button>
    </th>
  );

  function download() {
    const blob = new Blob(["﻿" + toCsv(data, pos)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trendradar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg(`CSV mit ${data.trends.length} Trends erstellt (Semikolon, für Excel geeignet).`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={download}>CSV herunterladen</Button>
        <span className="text-sm text-muted" role="status">{msg || `${rows.length} von ${data.trends.length} Trends · Filter und Perspektive aus der Arena gelten auch hier.`}</span>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-surface">
            <tr>
              {cols.map(([k, l]) => head(k, l))}
              <th className="p-2 text-left">Phase</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.number} tabIndex={0} onClick={() => onSelect(t.number)} onKeyDown={(e) => e.key === "Enter" && onSelect(t.number)} className="cursor-pointer border-t border-line hover:bg-surface focus-visible:bg-surface">
                <td className="num p-2 text-muted">{t.number}</td>
                <td className="p-2 text-ink">{t.name}</td>
                <td className="p-2">
                  <span className="inline-flex items-center gap-1.5"><i aria-hidden className="size-2.5 rounded-full" style={{ background: clusterVar(t.cluster) }} />{t.cluster}</span>
                </td>
                <td className="num p-2 text-ink">{fmt(P[t.number].total)}</td>
                <td className="num p-2 font-normal">{fmt(pos.EU[t.number].total)}</td>
                <td className="num p-2 font-normal">{fmt(pos.GLOBAL[t.number].total)}</td>
                {P[t.number].scores.map((s, i) => (
                  <td key={i} className="num p-2 font-normal">{s}</td>
                ))}
                <td className="whitespace-nowrap p-2">{P[t.number].horizon} J.</td>
                <td className="p-2"><ZonePill zone={P[t.number].zone} name={data.zones[P[t.number].zone].name} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function toCsv(data: RadarData, pos: Positions): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = [
    "Nr", "Trend", "Fokusfeld", "Unterthema", "Cluster", "Signalherkunft",
    "Phase Europa", "Score Europa", "Horizont Europa", "Phase Global", "Score Global", "Horizont Global",
    ...data.criteria.map((c) => c.name), "Evidenz", "Unsicher", "Europa-Einordnung",
    ...data.industries.map((i) => `Relevanz ${i.name}`),
    "Beschreibung", "Anwendungsfälle", "Best Practices", "Signale", "Chancen", "Risiken",
    ...(data.premium ? ["Handlungsempfehlung"] : []), "Lösungen & Partner", "Quellen",
  ];
  const rows = data.trends.map((t) => {
    const e = pos.EU[t.number], g = pos.GLOBAL[t.number];
    return [
      t.number, t.name, data.focus.find((f) => f.code === t.focus)?.name, t.subtopic,
      `${t.cluster} ${data.clusters.find((c) => c.code === t.cluster)?.name}`, ORIGIN_LABEL[t.origin],
      data.zones[e.zone].name, fmt(e.total), e.horizon, data.zones[g.zone].name, fmt(g.total), g.horizon,
      ...t.global.scores, t.evidence, t.uncertain ? "ja" : "nein", t.eu?.note ?? "", ...t.relevance,
      t.description, t.useCases, t.bestPractice, t.signals, t.opportunities, t.risks,
      ...(data.premium ? [t.premium?.recommendation ?? ""] : []),
      t.partnerKeys.map((k) => data.partners[k]?.name).join(", "),
      t.sourceIds.map((s) => data.sources[s]?.url).join(" "),
    ];
  });
  return [head, ...rows].map((r) => r.map(q).join(";")).join("\n");
}

// ───────────── Premium ─────────────
const LOCK = (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export function Paywall() {
  const tiles = [
    ["Top 10 Strategic Trends", "Rangfolge für Europa mit Begründung der Priorität und Handlungsempfehlung."],
    ["Cross-Industry Opportunities", "Konvergenz-Chancen mit Opportunity Matrix und konkreten Lösungspartnern."],
    ["Handlungsempfehlungen", "Roadmap 2027–2028, 2029–2031 und 2032–2035 mit Trendbezug."],
    ["Umgesetzt mit New Spice", "Konkrete Use Cases aus Projekten von New Spice, verknüpft mit den Trends."],
  ];
  return (
    <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center gap-2 rounded-[var(--radius-pill)] border border-line px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">
          {LOCK} Premium-Bereich
        </span>
        <h3>Vom Trend zur Entscheidung</h3>
        <p className="max-w-prose">Diese Kapitel übersetzen die Arena in Prioritäten, Chancen, Roadmap und erprobte Lösungen. Sie sind für Premium-Kunden freigeschaltet – Freischaltung über Ihre Ansprechperson bei New Spice.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([h, p]) => (
          <div key={h} className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-4">
            <b className="text-ink">{h}</b>
            <p className="text-sm text-muted">{p}</p>
            <div aria-hidden className="mt-2 flex flex-col gap-1.5">
              {[88, 70, 80].map((w) => <i key={w} className="h-2 rounded-full bg-sunk" style={{ width: `${w}%` }} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PremiumArea({ data, pos, onSelect }: { data: RadarData; pos: Positions; onSelect: (n: number) => void }) {
  const top = [...data.trends].sort((a, b) => pos.EU[b.number].total - pos.EU[a.number].total || a.number - b.number).slice(0, 10);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h3>Top 10 Strategic Trends für Europa</h3>
        <ol className="grid gap-3 sm:grid-cols-2">
          {top.map((t, i) => (
            <li key={t.number}>
              <button type="button" onClick={() => onSelect(t.number)} className="flex w-full items-start gap-4 rounded-xl border border-line bg-surface p-4 text-left hover:border-muted">
                <span className="num text-3xl leading-none text-accent-ink">{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <b className="text-ink">{t.name}</b>
                    <span className="num text-ink">{fmt(pos.EU[t.number].total)}</span>
                  </span>
                  <ZonePill zone={pos.EU[t.number].zone} name={data.zones[pos.EU[t.number].zone].name} />
                  <span className="text-sm">{t.premium?.whyPrioritized ?? t.premium?.recommendation ?? "Begründung der Priorität folgt durch die Redaktion."}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-3">
        <h3>Umgesetzt mit New Spice</h3>
        {data.cases.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.cases.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
                <span className="text-xs text-muted">{c.client}{c.year ? ` · ${c.year}` : ""}</span>
                <b className="text-ink">{c.title}</b>
                {c.solution && <span className="text-sm">{c.solution}</span>}
                {c.result && <span className="text-sm text-ink">{c.result}</span>}
                <span className="text-xs text-muted">Trends {c.trendNumbers.map((n) => `#${n}`).join(", ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Hier erscheinen umgesetzte New-Spice-Projekte, sobald die Redaktion sie veröffentlicht.</p>
        )}
      </div>
      <p className="text-sm text-muted">Chancenfelder (Opportunity Matrix) und Roadmap folgen, sobald die Inhalte modelliert sind.</p>
    </div>
  );
}

// ───────────── Methodik & Quellen ─────────────
export function Method({ data }: { data: RadarData }) {
  const box = "flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5";
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className={box}>
        <h3 className="!text-xl">Kriterien und Gewichtung</h3>
        <table className="text-sm">
          <tbody>
            {data.criteria.map((c) => (
              <tr key={c.idx} className="border-t border-line first:border-t-0">
                <td className="py-1.5">{c.name}</td>
                <td className="num py-1.5 text-right text-ink">{Math.round(c.weight * 100)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-muted">Jedes Kriterium 1–5, Gesamtscore als gewichtete Summe. Time-to-Adoption separat: 0–2, 3–5 oder 6–10 Jahre.</p>
      </div>
      <div className={box}>
        <h3 className="!text-xl">Drei Spielphasen</h3>
        <div className="flex flex-col gap-2 text-sm">
          <p><ZonePill zone="KICKOFF" name={data.zones.KICKOFF.name} /> Jetzt umsetzen: Horizont 0–2 und Score ≥ 3,5 – oder gesetzliche Pflicht.</p>
          <p><ZonePill zone="WARMUP" name={data.zones.WARMUP.name} /> Kompetenzen, Partner und Piloten aufbauen: alle übrigen Trends.</p>
          <p><ZonePill zone="SCOUTING" name={data.zones.SCOUTING.name} /> Systematisch beobachten: Horizont 6–10 oder Market Readiness ≤ 2.</p>
        </div>
      </div>
      <div className={box}>
        <h3 className="!text-xl">Europa-Perspektive</h3>
        <p className="text-sm">Für Trends mit überwiegend US-Signalen werden Market Readiness, Umsetzbarkeit und Time-to-Adoption zusätzlich für Europa und DACH bewertet: DSGVO, EU AI Act, Mitbestimmung, Fankultur. Der Schalter Europa / Global verschiebt die Punkte; gestrichelte Ränder markieren Trends, die anders eingeordnet sind.</p>
      </div>
      <div className={box}>
        <h3 className="!text-xl">Aufbau der Arena</h3>
        <p className="text-sm"><b className="text-ink">Sektor</b> = Cluster A–G. <b className="text-ink">Ring</b> = Spielphase: innen {data.zones.KICKOFF.name}, Mitte {data.zones.WARMUP.name}, außen {data.zones.SCOUTING.name}. Innerhalb eines Feldes im Uhrzeigersinn nach Score absteigend. <b className="text-ink">Punktgröße</b> = Business Impact.</p>
      </div>
      <div className={box}>
        <h3 className="!text-xl">Fokusfelder</h3>
        <div className="flex flex-col gap-2 text-sm">
          {data.focus.map((f) => (
            <p key={f.code}><b className="text-ink">{f.name}</b>: {f.subtopics.join(", ")}.</p>
          ))}
        </div>
      </div>
      <div className={box}>
        <h3 className="!text-xl">Evidenz</h3>
        <p className="text-sm">A = durch Primärquellen belegt, B = teilweise belegt, C = Wissensbasis, nicht verifiziert. Trends ohne verlinkte Quelle sind als „Wissensbasis, zu validieren“ gekennzeichnet. <span className="text-muted">(Definition vorläufig, wird mit der Redaktion bestätigt.)</span></p>
      </div>
    </div>
  );
}

export function Sources({ data }: { data: RadarData }) {
  const used = new Map<string, number[]>();
  for (const t of data.trends) for (const s of [...t.sourceIds, ...(t.eu?.sourceIds ?? [])]) used.set(s, [...(used.get(s) ?? []), t.number]);
  const list = Object.values(data.sources).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)) || a.id.localeCompare(b.id));
  return (
    <ol className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
      {list.map((s) => (
        <li key={s.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 border-t border-line pt-2">
          <span className="num text-muted">{s.id}</span>
          <span className="flex flex-col">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{s.title}</a>
            <span className="text-xs text-muted">
              {s.publisher} · {s.publishedLabel ?? "o. D."}
              {used.get(s.id) ? ` · Trends ${[...new Set(used.get(s.id))].map((n) => `#${n}`).join(", ")}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

