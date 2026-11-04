"use client";

import { useState, type ReactNode } from "react";
import type { Perspective, Zone } from "@/lib/scoring";
import type { RadarData, RadarTrend } from "@/lib/radar/types";
import { ORIGIN_LABEL, clusterFg, clusterVar, fmt, moved, type Positions } from "@/lib/radar/view";
import { AUDIENCE_LABEL, audienceOf } from "@/lib/stadium/audience";
import { STAGE, stageOf } from "@/lib/stadium/journey";
import { USE_CASES, type UseCaseKey } from "@/lib/stadium/usecases";

/**
 * Ebene 3: Detailansicht eines Trends als Glas-Panel über der Szene.
 * Oben Grafiken (Kriterien, Phase EU/Global, Branchenrelevanz), darunter Text in Reitern – wenig auf den ersten Blick,
 * mehr auf Klick. Unten Wege zum Weitererkunden (verwandte Trends, Szenen).
 */

const SHORT = ["Business", "Experience", "Fit", "Reife", "Innovation", "Umsetzung"];

/** Netzdiagramm der sechs Kriterien: Europa als Fläche, Global gestrichelt (nur wenn abweichend) */
function Spider({ eu, global, cluster, labels }: { eu: number[]; global: number[]; cluster: string; labels: string[] }) {
  const size = 260, c = size / 2, R = 92;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 6;
    return [c + Math.cos(a) * R * (v / 5), c + Math.sin(a) * R * (v / 5)] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(",")).join(" ");
  const differs = eu.some((v, i) => v !== global[i]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px]" role="img" aria-label={`Kriterien: ${labels.map((l, i) => `${l} ${eu[i]}`).join(", ")}`}>
      {[1, 2, 3, 4, 5].map((r) => (
        <polygon key={r} points={poly(Array(6).fill(r))} fill="none" stroke="var(--line)" strokeWidth={r === 5 ? 1.2 : 0.8} />
      ))}
      {Array.from({ length: 6 }, (_, i) => {
        const [x, y] = pt(i, 5);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" strokeWidth={0.8} />;
      })}
      {differs && <polygon points={poly(global)} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 3" />}
      <polygon points={poly(eu)} fill={cluster} fillOpacity={0.28} stroke={cluster} strokeWidth={2} strokeLinejoin="round" />
      {eu.map((v, i) => {
        const [x, y] = pt(i, v);
        return <circle key={i} cx={x} cy={y} r={3.2} fill={cluster} />;
      })}
      {labels.map((l, i) => {
        const [x, y] = pt(i, 6.15);
        return (
          <text key={l} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-muted text-[10px] font-bold">
            {l} <tspan className="fill-ink">{eu[i]}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

/** Phasenleiste Scouting → Aufwärmen → Anstoß mit Europa (gefüllt) und Global (Ring) */
function PhaseTrack({ data, eu, global }: { data: RadarData; eu: { zone: Zone; total: number }; global: { zone: Zone; total: number } }) {
  const order: Zone[] = ["SCOUTING", "WARMUP", "KICKOFF"];
  const x = (v: { zone: Zone; total: number }) => (order.indexOf(v.zone) + Math.min(0.9, Math.max(0.1, (v.total - 1) / 4))) / 3;
  const same = eu.zone === global.zone && Math.abs(eu.total - global.total) < 0.01;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-4 grid h-1.5 grid-cols-3 gap-1">
          {order.map((z) => (
            <span key={z} className={`rounded-full ${z === "KICKOFF" ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
        {!same && (
          <span
            className="absolute top-2.5 size-4 -translate-x-1/2 rounded-full border-2 border-muted bg-bg"
            style={{ left: `${x(global) * 100}%` }}
            title={`Global: ${data.zones[global.zone].name}`}
          />
        )}
        <span
          className="absolute top-2 size-5 -translate-x-1/2 rounded-full border-2 border-bg bg-ink shadow"
          style={{ left: `${x(eu) * 100}%` }}
          title={`Europa: ${data.zones[eu.zone].name}`}
        />
      </div>
      <div className="grid grid-cols-3 text-xs text-muted">
        {order.map((z) => (
          <span key={z} className={z === "KICKOFF" ? "text-right" : z === "WARMUP" ? "text-center" : ""}>{data.zones[z].name}</span>
        ))}
      </div>
      <p className="flex flex-wrap gap-x-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-ink" /> Europa {fmt(eu.total)}</span>
        {!same && <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full border-2 border-muted" /> Global {fmt(global.total)}</span>}
      </p>
    </div>
  );
}

function SourceLine({ data, id }: { data: RadarData; id: string }) {
  const s = data.sources[id];
  if (!s) return <li className="text-muted">[{id}]</li>;
  return (
    <li className="flex flex-col">
      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">{s.title}</a>
      <span className="text-xs text-muted">{s.publisher} · {s.publishedLabel ?? "o. D."}</span>
    </li>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="eyebrow !text-muted">{title}</p>
      <p className="text-ink">{children}</p>
    </div>
  );
}

type Tab = "anwendung" | "markt" | "partner" | "quellen" | "empfehlung";

interface Props {
  data: RadarData;
  trend: RadarTrend;
  pos: Positions;
  persp: Perspective;
  onClose: () => void;
  onOpen: (n: number) => void;
  onOpenScene: (k: UseCaseKey, n: number) => void;
}

export function TrendDetail({ data, trend: t, pos, persp, onClose, onOpen, onOpenScene }: Props) {
  const [tab, setTab] = useState<Tab>("anwendung");
  const [copied, setCopied] = useState(false);
  const v = pos[persp][t.number];
  const eu = pos.EU[t.number], gl = pos.GLOBAL[t.number];
  const cluster = data.clusters.find((c) => c.code === t.cluster);
  const focus = data.focus.find((f) => f.code === t.focus);
  const knowledgeBase = t.sourceIds.length === 0 || t.uncertain;
  const numbers = data.trends.map((x) => x.number).sort((a, b) => a - b);
  const idx = numbers.indexOf(t.number);
  const prev = numbers[idx - 1], next = numbers[idx + 1];

  // verwandt: gleicher Ort der Journey oder gleicher Cluster, nach Score
  const related = data.trends
    .filter((x) => x.number !== t.number && (stageOf(x.number) === stageOf(t.number) || x.cluster === t.cluster))
    .sort((a, b) => pos[persp][b.number].total - pos[persp][a.number].total)
    .slice(0, 4);
  const scenes = USE_CASES.flatMap((u) => u.hotspots.filter((h) => h.trend === t.number).map((h) => ({ u, h })));
  const allSources = [...t.sourceIds, ...(t.eu?.sourceIds ?? []).filter((s) => !t.sourceIds.includes(s))];

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "anwendung", label: "Anwendung", show: !!(t.useCases || t.bestPractice) },
    { key: "markt", label: "Markt", show: !!(t.signals || t.opportunities || t.risks) },
    { key: "partner", label: "Partner", show: t.partnerKeys.length > 0 },
    { key: "quellen", label: `Quellen (${allSources.length})`, show: true },
    { key: "empfehlung", label: "Empfehlung", show: true },
  ];
  const visibleTabs = tabs.filter((x) => x.show);
  const active = visibleTabs.some((x) => x.key === tab) ? tab : visibleTabs[0].key;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* Zwischenablage nicht verfügbar */ }
  };

  const btn = "glass rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-bold text-ink hover:brightness-110 disabled:opacity-30";

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="trend-detail-title"
      className="glass-strong absolute inset-2 z-30 flex flex-col overflow-hidden rounded-[var(--radius-card)] sm:inset-auto sm:bottom-6 sm:right-6 sm:top-[76px] sm:w-[min(680px,calc(100%-3rem))]"
    >
      {/* Kopfleiste */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
        <button type="button" onClick={onClose} className={btn}>← Zurück</button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={share} className={btn} aria-live="polite">{copied ? "Link kopiert" : "Link teilen"}</button>
          <button type="button" onClick={() => prev && onOpen(prev)} disabled={!prev} className={btn} aria-label="Vorheriger Trend">‹</button>
          <button type="button" onClick={() => next && onOpen(next)} disabled={!next} className={btn} aria-label="Nächster Trend">›</button>
        </div>
      </div>

      <div className="flex flex-col gap-7 overflow-y-auto px-5 py-6 sm:px-8">
        {/* Titel */}
        <header className="flex items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <span className="num grid size-12 shrink-0 place-items-center rounded-full text-xl" style={{ background: clusterVar(t.cluster), color: clusterFg(t.cluster) }}>
              {t.number}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="eyebrow !text-muted">{t.cluster} · {cluster?.name}</p>
              <h2 id="trend-detail-title" className="!text-[clamp(26px,3vw,36px)]">{t.name}</h2>
              <p className="flex flex-wrap gap-x-3 text-sm text-muted">
                <span>{data.zones[v.zone].name} · {v.horizon} Jahre</span>
                <span>{STAGE[stageOf(t.number)].name}</span>
                <span>{AUDIENCE_LABEL[audienceOf(t.number)]}</span>
              </p>
            </div>
          </div>
          <p className="flex shrink-0 flex-col items-end">
            <span className="num text-5xl leading-none text-ink">{fmt(v.total)}</span>
            <span className="text-xs text-muted">Score {persp === "EU" ? "Europa" : "Global"}</span>
          </p>
        </header>

        <p className="text-lg text-ink">{t.description}</p>

        {/* Grafiken */}
        <div className="grid items-center gap-6 sm:grid-cols-[280px_minmax(0,1fr)]">
          <Spider eu={eu.scores as unknown as number[]} global={gl.scores as unknown as number[]} cluster={clusterVar(t.cluster)} labels={SHORT} />
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="eyebrow !text-muted">Spielphase</p>
              <PhaseTrack data={data} eu={eu} global={gl} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="eyebrow !text-muted">Relevanz je Branche</p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {data.industries.map((ind, i) => (
                  <li key={ind.code} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-3">
                    <span>{ind.name}</span>
                    <span className="grid grid-cols-3 gap-1" aria-label={`Relevanz ${t.relevance[i]} von 3`}>
                      {[1, 2, 3].map((k) => (
                        <span key={k} className={`h-1.5 rounded-full ${k <= t.relevance[i] ? "bg-ink" : "bg-line"}`} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="flex flex-wrap gap-1.5 text-xs">
              {[focus?.name && `${focus.name}${t.subtopic ? ` · ${t.subtopic}` : ""}`, `Signale ${ORIGIN_LABEL[t.origin]}`, `Evidenz ${t.evidence}`, t.mandatory && "Pflicht", knowledgeBase && "Wissensbasis, zu validieren"]
                .filter(Boolean)
                .map((x) => (
                  <span key={x as string} className="rounded-[var(--radius-pill)] border border-line px-2.5 py-0.5 text-text">{x}</span>
                ))}
            </p>
          </div>
        </div>

        {t.eu?.note && (
          <div className="flex flex-col gap-1 rounded-xl border border-line p-4 text-sm">
            <p className="eyebrow">Warum Europa anders ist</p>
            <p className="text-ink">{t.eu.note}</p>
            {moved(pos, t.number) && <p className="text-muted">Global {data.zones[gl.zone].name}, in Europa {data.zones[eu.zone].name}.</p>}
          </div>
        )}

        {/* Reiter */}
        <div className="flex flex-col gap-4">
          <div role="tablist" aria-label="Details" className="flex flex-wrap gap-1 border-b border-line">
            {visibleTabs.map((x) => (
              <button
                key={x.key}
                role="tab"
                type="button"
                aria-selected={active === x.key}
                onClick={() => setTab(x.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold ${active === x.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="flex flex-col gap-4 text-sm">
            {active === "anwendung" && (
              <>
                {t.useCases && <Block title="Anwendungsfälle">{t.useCases}</Block>}
                {t.bestPractice && <Block title="Best Practices">{t.bestPractice}</Block>}
              </>
            )}
            {active === "markt" && (
              <>
                {t.signals && <Block title="Markt- und Innovationssignale">{t.signals}</Block>}
                <div className="grid gap-4 sm:grid-cols-2">
                  {t.opportunities && <Block title="Chancen">{t.opportunities}</Block>}
                  {t.risks && <Block title="Risiken">{t.risks}</Block>}
                </div>
              </>
            )}
            {active === "partner" && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {t.partnerKeys.map((k) => {
                  const pa = data.partners[k];
                  if (!pa) return null;
                  return (
                    <li key={k} className="flex flex-col rounded-xl border border-line p-3">
                      <b className="text-ink">{pa.name}</b>
                      <span>{pa.role}</span>
                      {pa.knowledgeBase && <span className="text-xs text-muted">Wissensbasis, zu validieren</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {active === "quellen" && (
              allSources.length ? (
                <ul className="flex flex-col gap-3">{allSources.map((s) => <SourceLine key={s} data={data} id={s} />)}</ul>
              ) : (
                <p className="text-muted">Keine verlinkte Primärquelle – Evidenz C, Validierung erforderlich.</p>
              )
            )}
            {active === "empfehlung" && (
              data.premium ? (
                <div className="flex flex-col gap-2 rounded-xl border-l-4 border-accent p-4">
                  <b className="text-ink">Handlungsempfehlung</b>
                  <span>{t.premium?.recommendation ?? "Für diesen Trend ist noch keine Empfehlung gepflegt."}</span>
                  {t.premium?.whyPrioritized && <span className="text-muted">{t.premium.whyPrioritized}</span>}
                  {data.cases.filter((c) => c.trendNumbers.includes(t.number)).map((c) => (
                    <span key={c.id}><b className="text-ink">Umgesetzt mit New Spice:</b> {c.title}{c.result ? ` – ${c.result}` : ""}</span>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1 rounded-xl border border-dashed border-line p-4 text-muted">
                  <b className="text-ink">Premium</b>
                  Konkrete Empfehlung, Priorisierung und umgesetzte New-Spice-Cases zu diesem Trend sind im Premium-Bereich freigeschaltet.
                </div>
              )
            )}
          </div>
        </div>

        {/* Weiter erkunden */}
        {(scenes.length > 0 || related.length > 0) && (
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <p className="eyebrow !text-muted">Weiter erkunden</p>
            <div className="flex flex-wrap gap-2">
              {scenes.map(({ u, h }) => (
                <button key={`${u.key}-${h.key}`} type="button" onClick={() => onOpenScene(u.key, t.number)} className="rounded-[var(--radius-pill)] bg-ink px-4 py-1.5 text-sm font-bold text-bg hover:opacity-90">
                  In der Szene „{u.name}“ ansehen
                </button>
              ))}
              {related.map((r) => (
                <button key={r.number} type="button" onClick={() => onOpen(r.number)} className={`${btn} flex items-center gap-2 !font-normal`}>
                  <span className="inline-block size-2 rounded-full" style={{ background: clusterVar(r.cluster) }} />
                  <span className="num text-muted">{r.number}</span> {r.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

