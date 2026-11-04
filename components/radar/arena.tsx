"use client";

import { useRef, useState } from "react";
import { ARENA, CLUSTER_KEYS, ZONE_KEYS, type Perspective, type Zone } from "@/lib/scoring";
import type { RadarData, RadarTrend } from "@/lib/radar/types";
import { ORIGIN_LABEL, clusterFg, clusterVar, fmt, moved, type Positions } from "@/lib/radar/view";

const { cx: CX, cy: CY, sx: SX, rings: RINGS, segment: SEG } = ARENA;
// Auf 2 Nachkommastellen runden: Server und Browser rechnen Winkelfunktionen minimal unterschiedlich (Hydration-Abgleich)
const r2 = (v: number) => Math.round(v * 100) / 100;
const pt = (r: number, a: number): [number, number] => [r2(CX + r * SX * Math.cos((a * Math.PI) / 180)), r2(CY + r * Math.sin((a * Math.PI) / 180))];

function wedge(r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
  return `M${x0},${y0} A${r2(r1 * SX)},${r1} 0 0 1 ${x1},${y1} L${x2},${y2} A${r2(r0 * SX)},${r0} 0 0 0 ${x3},${y3}Z`;
}

/** Clustername auf zwei Zeilen: Umbruch am Leerzeichen, das der Mitte am nächsten liegt */
function labelLines(name: string): [string, string] {
  let best = -1;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === " " && (best < 0 || Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2))) best = i;
  }
  return best < 0 ? [name, ""] : [name.slice(0, best), name.slice(best + 1)];
}

const TIERS: Record<Zone, string> = { KICKOFF: "var(--tier1)", WARMUP: "var(--tier2)", SCOUTING: "var(--tier3)" };

interface Props {
  data: RadarData;
  pos: Positions;
  persp: Perspective;
  visible: Set<number>;
  selected: number | null;
  onSelect: (n: number) => void;
}

export function Arena({ data, pos, persp, visible, selected, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ t: RadarTrend; x: number; y: number } | null>(null);
  const P = pos[persp];

  function showTip(t: RadarTrend, clientX: number, clientY: number) {
    const r = box.current!.getBoundingClientRect();
    setTip({ t, x: Math.min(clientX - r.left + 14, r.width - 300), y: Math.min(clientY - r.top + 14, r.height - 140) });
  }

  const clusterName = Object.fromEntries(data.clusters.map((c) => [c.code, c.name]));
  const r0 = RINGS.KICKOFF[0], w = r0 * SX * 1.3, h = r0 * 1.15;

  return (
    <div ref={box} className="relative">
      <svg viewBox="-80 0 1280 830" className="block h-auto w-full" role="group" aria-label="Arena: sieben Cluster als Segmente, drei Spielphasen als Ringe (innen Anstoß, außen Scouting)">
        {/* Ringe */}
        {(["SCOUTING", "WARMUP", "KICKOFF"] as Zone[]).map((z) => (
          <ellipse key={z} cx={CX} cy={CY} rx={RINGS[z][1] * SX} ry={RINGS[z][1]} fill={TIERS[z]} stroke="var(--line)" strokeWidth={1.4} />
        ))}
        {/* Segmente */}
        {CLUSTER_KEYS.map((c, i) => {
          const a0 = -90 + i * SEG, a1 = a0 + SEG, m = a0 + SEG / 2;
          const [xa, ya] = pt(RINGS.KICKOFF[0], a0), [xb, yb] = pt(RINGS.SCOUTING[1], a0);
          const [lx, ly] = pt(385, m);
          const cs = Math.cos((m * Math.PI) / 180);
          const anchor = Math.abs(cs) < 0.25 ? "middle" : cs > 0 ? "start" : "end";
          const dy = Math.sin((m * Math.PI) / 180) > 0.9 ? 10 : 0;
          const [l1, l2] = labelLines(clusterName[c] ?? c);
          return (
            <g key={c}>
              <path d={wedge(RINGS.KICKOFF[0], RINGS.SCOUTING[1], a0, a1)} fill={clusterVar(c)} fillOpacity={0.05} />
              <path d={wedge(RINGS.SCOUTING[1] + 5, RINGS.SCOUTING[1] + 12, a0 + 1.2, a1 - 1.2)} fill={clusterVar(c)} />
              <line x1={xa} y1={ya} x2={xb} y2={yb} stroke="var(--line)" strokeWidth={1.4} strokeDasharray="6 5" />
              <text x={lx} y={ly - 6 + dy} textAnchor={anchor} className="fill-ink font-display text-[20px] font-extrabold">
                {c} · {l1}
              </text>
              {l2 && (
                <text x={lx} y={ly + 16 + dy} textAnchor={anchor} className="fill-muted text-[18px]">
                  {l2}
                </text>
              )}
            </g>
          );
        })}
        {/* Spielfeld */}
        <ellipse cx={CX} cy={CY} rx={r0 * SX} ry={r0} fill="var(--surface)" stroke="var(--line)" strokeWidth={1.4} />
        <g fill="none" stroke="var(--pitch-line)" strokeWidth={1.5}>
          <rect x={CX - w / 2} y={CY - h / 2} width={w} height={h} rx={4} fill="var(--pitch)" />
          <line x1={CX} y1={CY - h / 2} x2={CX} y2={CY + h / 2} />
          <circle cx={CX} cy={CY} r={h * 0.22} />
          <rect x={CX - w / 2} y={CY - h * 0.27} width={w * 0.13} height={h * 0.54} />
          <rect x={CX + w / 2 - w * 0.13} y={CY - h * 0.27} width={w * 0.13} height={h * 0.54} />
        </g>
        <text x={CX} y={CY + h / 2 + 18} textAnchor="middle" className="fill-muted text-[13px] font-bold uppercase tracking-[0.12em]">
          2027–2035
        </text>
        {ZONE_KEYS.map((z) => {
          const r = RINGS[z][1] - 7;
          return (
            <g key={z}>
              <path id={`ring-${z}`} d={`M ${CX - r * SX} ${CY} A ${r * SX} ${r} 0 0 1 ${CX + r * SX} ${CY}`} fill="none" />
              <text className="fill-muted text-[13px] font-bold uppercase tracking-[0.14em]">
                <textPath href={`#ring-${z}`} startOffset="50%" textAnchor="middle">
                  {data.zones[z]?.name}
                </textPath>
              </text>
            </g>
          );
        })}
        {/* Trends */}
        {data.trends.map((t) => {
          const p = P[t.number];
          const isSel = selected === t.number;
          const isMoved = moved(pos, t.number);
          const dim = !visible.has(t.number);
          return (
            <g
              key={t.number}
              role="button"
              tabIndex={dim ? -1 : 0}
              aria-label={`${t.number} ${t.name}, Score ${fmt(p.total)}, ${data.zones[p.zone].name}${isMoved ? ", Europa und Global unterschiedlich" : ""}`}
              aria-pressed={isSel}
              className="cursor-pointer outline-none transition-[transform,opacity] duration-700 ease-[cubic-bezier(.3,.8,.3,1)] focus-visible:[&>circle]:stroke-accent"
              style={{ transform: `translate(${p.x}px, ${p.y}px)`, opacity: dim ? 0.12 : 1 }}
              onClick={() => onSelect(t.number)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(t.number);
                }
              }}
              onMouseEnter={(e) => showTip(t, e.clientX, e.clientY)}
              onMouseMove={(e) => showTip(t, e.clientX, e.clientY)}
              onMouseLeave={() => setTip(null)}
              onFocus={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                showTip(t, r.right, r.top);
              }}
              onBlur={() => setTip(null)}
            >
              <circle
                r={p.r}
                fill={clusterVar(t.cluster)}
                stroke={isSel ? "var(--ink)" : isMoved ? "var(--accent)" : "var(--bg)"}
                strokeWidth={isSel ? 3.2 : isMoved ? 3 : 2}
                strokeDasharray={isMoved && !isSel ? "3 2" : undefined}
              />
              <text y={4.5} textAnchor="middle" className="pointer-events-none font-display text-[14px] font-extrabold" style={{ fill: clusterFg(t.cluster) }}>
                {t.number}
              </text>
            </g>
          );
        })}
      </svg>

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 flex w-[290px] flex-col gap-1 rounded-xl border border-line bg-surface p-3 text-sm shadow-xl"
          style={{ left: Math.max(6, tip.x), top: Math.max(6, tip.y) }}
        >
          <b className="text-ink">
            {tip.t.number} · {tip.t.name}
          </b>
          <span>{tip.t.description}</span>
          <span className="text-xs text-muted">
            {data.focus.find((f) => f.code === tip.t.focus)?.name} · {tip.t.subtopic} · Signale: {ORIGIN_LABEL[tip.t.origin]}
            <br />
            Score {fmt(P[tip.t.number].total)} · {data.zones[P[tip.t.number].zone].name} · {P[tip.t.number].horizon} Jahre
            {moved(pos, tip.t.number) ? " · Europa ≠ Global" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
