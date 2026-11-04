"use client";

import type { Horizon, Perspective, Zone } from "@/lib/scoring";
import { CLUSTER_KEYS, ZONE_KEYS } from "@/lib/scoring";
import type { FocusCode, Origin, RadarData, RadarTrend } from "@/lib/radar/types";
import { HORIZONS, ORIGIN_LABEL, PERSPECTIVE_LABEL, clusterVar } from "@/lib/radar/view";
import type { TrendView } from "@/lib/scoring";
import { Button, Chip } from "./ui";

export interface Filters {
  focus: Set<FocusCode>;
  subtopic: string;
  origin: Set<Origin>;
  zone: Set<Zone>;
  horizon: Set<Horizon>;
  cluster: Set<string>;
  q: string;
}

export const emptyFilters = (): Filters => ({
  focus: new Set(), subtopic: "", origin: new Set(), zone: new Set(), horizon: new Set(), cluster: new Set(), q: "",
});

export const isFiltered = (f: Filters) =>
  !!(f.focus.size || f.subtopic || f.origin.size || f.zone.size || f.horizon.size || f.cluster.size || f.q);

export function matches(t: RadarTrend, v: TrendView, f: Filters, data: RadarData) {
  if (f.focus.size && !f.focus.has(t.focus)) return false;
  if (f.subtopic && t.subtopic !== f.subtopic) return false;
  if (f.origin.size && !f.origin.has(t.origin)) return false;
  if (f.zone.size && !f.zone.has(v.zone)) return false;
  if (f.horizon.size && !f.horizon.has(v.horizon)) return false;
  if (f.cluster.size && !f.cluster.has(t.cluster)) return false;
  if (f.q) {
    const hay = [t.name, t.description, data.clusters.find((c) => c.code === t.cluster)?.name, t.subtopic, data.focus.find((x) => x.code === t.focus)?.name, `#${t.number}`]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

function toggle<T>(set: Set<T>, v: T) {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

interface Props {
  data: RadarData;
  persp: Perspective;
  setPersp: (p: Perspective) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
}

const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
    <span className="eyebrow !text-muted mr-1">{label}</span>
    {children}
  </div>
);

export function Toolbar({ data, persp, setPersp, filters: f, setFilters }: Props) {
  const set = (patch: Partial<Filters>) => setFilters({ ...f, ...patch });
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5" role="group" aria-label="Perspektive und Filter">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Group label="Perspektive">
          <span className="inline-flex rounded-[var(--radius-pill)] border border-line p-0.5">
            {(["EU", "GLOBAL"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={persp === p}
                onClick={() => setPersp(p)}
                className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm font-bold ${persp === p ? "bg-ink text-bg" : "text-ink"}`}
              >
                {PERSPECTIVE_LABEL[p]}
              </button>
            ))}
          </span>
        </Group>
        <Group label="Signalherkunft">
          {(Object.keys(ORIGIN_LABEL) as Origin[]).map((o) => (
            <Chip key={o} pressed={f.origin.has(o)} onClick={() => set({ origin: toggle(f.origin, o) })}>
              {ORIGIN_LABEL[o]}
            </Chip>
          ))}
        </Group>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Trend suchen"
            aria-label="Trend suchen"
            className="w-56 rounded-[var(--radius-pill)] border border-line bg-sunk px-4 py-1.5 text-sm text-ink placeholder:text-muted"
          />
          <Button ghost onClick={() => setFilters(emptyFilters())} disabled={!isFiltered(f)} className="disabled:opacity-40">
            Filter zurücksetzen
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Group label="Fokus">
          {data.focus.map((fo) => (
            <Chip key={fo.code} pressed={f.focus.has(fo.code)} onClick={() => set({ focus: toggle(f.focus, fo.code) })}>
              {fo.name}
            </Chip>
          ))}
          <select
            value={f.subtopic}
            onChange={(e) => set({ subtopic: e.target.value })}
            aria-label="Unterthema"
            className="rounded-[var(--radius-pill)] border border-line bg-sunk px-3 py-1 text-sm text-ink"
          >
            <option value="">Alle Unterthemen</option>
            {data.focus.map((fo) => (
              <optgroup key={fo.code} label={fo.name}>
                {fo.subtopics.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Group>
        <Group label="Phase">
          {ZONE_KEYS.map((z) => (
            <Chip key={z} pressed={f.zone.has(z)} onClick={() => set({ zone: toggle(f.zone, z) })}>
              {data.zones[z].name}
            </Chip>
          ))}
        </Group>
        <Group label="Horizont">
          {HORIZONS.map((h) => (
            <Chip key={h} pressed={f.horizon.has(h)} onClick={() => set({ horizon: toggle(f.horizon, h) })}>
              {h} J.
            </Chip>
          ))}
        </Group>
        <Group label="Cluster">
          {CLUSTER_KEYS.map((c) => (
            <Chip key={c} pressed={f.cluster.has(c)} onClick={() => set({ cluster: toggle(f.cluster, c) })} swatch={clusterVar(c)}>
              {c}
            </Chip>
          ))}
        </Group>
      </div>
      <p className="text-sm text-muted">
        {persp === "EU"
          ? "Europa / DACH: Trends mit überwiegend US-Signalen sind für DSGVO, EU AI Act, Mitbestimmung und Fankultur neu bewertet. Gestrichelte Punkte liegen global in einer anderen Phase."
          : "Global: Bewertung nach internationalem Marktstand, unabhängig vom europäischen Rechtsrahmen. Gestrichelte Punkte liegen in Europa in einer anderen Phase."}
      </p>
    </div>
  );
}
