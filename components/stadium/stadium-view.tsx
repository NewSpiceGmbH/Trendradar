"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CLUSTER_KEYS, ZONE_KEYS, type ClusterCode, type Perspective } from "@/lib/scoring";
import type { RadarData } from "@/lib/radar/types";
import { PERSPECTIVE_LABEL, fmt, moved, positions } from "@/lib/radar/view";
import { OVERVIEW, PITCH_SHOT, ZONE_PLACE, clusterShot, dotPosition, groupShot, type CameraShot } from "@/lib/stadium/geometry";
import { buildTour, firstSentence } from "@/lib/stadium/tour";
import type { Palette } from "./scene";

const Scene = dynamic(() => import("./scene"), {
  ssr: false,
  loading: () => <p className="absolute inset-0 grid place-items-center text-muted">Stadion wird aufgebaut …</p>,
});

const TOUR_SEEN = "trendradar.tour-gesehen";
const FOUND = "trendradar.entdeckt";

const store = {
  get(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, v: string) {
    try { window.localStorage.setItem(key, v); } catch { /* privates Fenster o. Ä. */ }
  },
};

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim() || "#888";
  return {
    bg: v("--bg"), surface: v("--surface"), sunk: v("--sunk"), line: v("--line"), ink: v("--ink"), muted: v("--muted"),
    pitch: v("--pitch"), pitchLine: v("--pitch-line"), accent: v("--accent"),
    clusters: Object.fromEntries(CLUSTER_KEYS.map((c) => [c, v(`--c${c}`)])),
  };
}

/** Farben aus den CI-Tokens, aktualisiert beim Wechsel Hell/Dunkel */
function usePalette() {
  const [palette, setPalette] = useState<Palette>(readPalette);
  useEffect(() => {
    const mo = new MutationObserver(() => setPalette(readPalette()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => mo.disconnect();
  }, []);
  return palette;
}

export default function StadiumView({ data }: { data: RadarData }) {
  const pos = useMemo(() => positions(data), [data]);
  const tour = useMemo(() => buildTour(data, pos), [data, pos]);
  const palette = usePalette();

  const byNumber = useMemo(() => new Map(data.trends.map((t) => [t.number, t])), [data]);
  const clusterName = useMemo(() => Object.fromEntries(data.clusters.map((c) => [c.code, c.name])), [data]);

  // Einstieg: Zustand aus der Adresse, sonst beim ersten Besuch die Tour (Komponente läuft nur im Browser)
  const [initial] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("c")?.toUpperCase() as ClusterCode | undefined;
    const t = Number(q.get("t"));
    const trend = t && byNumber.has(t) ? t : null;
    let found = new Set<number>();
    try {
      found = new Set((JSON.parse(store.get(FOUND) ?? "[]") as number[]).filter((n) => byNumber.has(n)));
    } catch { /* ignorieren */ }
    return {
      persp: (q.get("p") === "global" ? "GLOBAL" : "EU") as Perspective,
      cluster: trend ? byNumber.get(trend)!.cluster : c && CLUSTER_KEYS.includes(c) ? c : null,
      selected: trend,
      station: !c && !trend && !store.get(TOUR_SEEN) ? 0 : null,
      found,
    };
  });
  const [persp, setPersp] = useState<Perspective>(initial.persp);
  const [cluster, setCluster] = useState<ClusterCode | null>(initial.cluster);
  const [selected, setSelected] = useState<number | null>(initial.selected);
  const [hovered, setHovered] = useState<number | null>(null);
  const [station, setStation] = useState<number | null>(initial.station);
  const [switched, setSwitched] = useState<string | null>(null);
  const [found, setFound] = useState<Set<number>>(initial.found);

  // Zustand in die Adresse schreiben, damit sich jede Ansicht teilen lässt
  useEffect(() => {
    if (station !== null) return;
    const q = new URLSearchParams();
    if (cluster) q.set("c", cluster);
    if (selected) q.set("t", String(selected));
    if (persp === "GLOBAL") q.set("p", "global");
    const s = q.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [cluster, selected, persp, station]);

  const touring = station !== null;
  const st = touring ? tour[station] : null;

  // In der Perspektiv-Station erst Europa zeigen, dann umschalten – damit man die Bewegung sieht
  useEffect(() => {
    if (!st || st.persp === "EU") return;
    const id = window.setTimeout(() => setSwitched(st.key), 1400);
    return () => window.clearTimeout(id);
  }, [st]);

  const activePersp: Perspective = st ? (st.persp === "GLOBAL" && switched === st.key ? "GLOBAL" : "EU") : persp;

  const discover = useCallback((n: number) => {
    setFound((f) => {
      if (f.has(n)) return f;
      const next = new Set(f).add(n);
      store.set(FOUND, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const selectTrend = useCallback(
    (n: number) => {
      if (touring) return;
      setSelected(n);
      setCluster(byNumber.get(n)!.cluster);
      discover(n);
    },
    [touring, byNumber, discover],
  );
  const selectCluster = useCallback(
    (c: ClusterCode) => {
      if (touring) return;
      setCluster(c);
      setSelected(null);
    },
    [touring],
  );

  const endTour = useCallback(() => {
    setStation(null);
    store.set(TOUR_SEEN, "1");
  }, []);
  const startTour = () => {
    setCluster(null);
    setSelected(null);
    setStation(0);
  };
  const step = useCallback(
    (d: number) => setStation((s) => {
      if (s === null) return s;
      const n = s + d;
      if (n < 0) return 0;
      if (n >= tour.length) { store.set(TOUR_SEEN, "1"); return null; }
      return n;
    }),
    [tour.length],
  );

  const up = useCallback(() => {
    if (selected) setSelected(null);
    else if (cluster) setCluster(null);
  }, [selected, cluster]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (touring) {
        if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") { e.preventDefault(); step(1); }
        else if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "Escape") endTour();
      } else if (e.key === "Escape") up();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [touring, step, endTour, up]);

  // Kamera
  const shot: CameraShot = useMemo(() => {
    if (st) {
      if (st.shot === "pitch") return PITCH_SHOT;
      if (st.shot === "group" && st.highlight.length) return groupShot(st.highlight.map((n) => dotPosition(pos[st.persp][n]).dot));
      return OVERVIEW;
    }
    if (selected) {
      const d = dotPosition(pos[persp][selected]).dot;
      return groupShot([d]);
    }
    if (cluster) return clusterShot(cluster);
    return OVERVIEW;
  }, [st, selected, cluster, pos, persp]);

  // Hervorhebung, Neugier-Signale, Beschriftungen
  const highlight = useMemo(() => (st && st.highlight.length ? new Set(st.highlight) : null), [st]);
  const pulse = useMemo(() => {
    if (touring) return new Set<number>();
    const top = [...data.trends].sort((a, b) => pos[persp][b.number].total - pos[persp][a.number].total)[0]?.number;
    const curious = data.trends.filter((t) => moved(pos, t.number)).map((t) => t.number);
    if (top) curious.push(top);
    return new Set(curious.filter((n) => !found.has(n) && n !== selected));
  }, [touring, data, pos, persp, found, selected]);
  const labelled = useMemo(() => {
    if (st && st.highlight.length && st.highlight.length <= 6) return new Set(st.highlight);
    if (!touring && cluster) return new Set(data.trends.filter((t) => t.cluster === cluster).map((t) => t.number));
    return new Set<number>();
  }, [st, touring, cluster, data]);

  const counts = useMemo(() => {
    const c = { KICKOFF: 0, WARMUP: 0, SCOUTING: 0 };
    for (const t of data.trends) c[pos[activePersp][t.number].zone]++;
    return c;
  }, [data, pos, activePersp]);

  const sel = selected ? byNumber.get(selected) ?? null : null;
  const selView = sel ? pos[persp][sel.number] : null;

  return (
    <div className="relative h-[calc(100dvh-57px)] min-h-[560px] w-full overflow-hidden bg-bg">
      <div className="absolute inset-0">
        {(
          <Scene
            data={data}
            pos={pos}
            persp={activePersp}
            palette={palette}
            shot={shot}
            cluster={touring ? null : cluster}
            selected={touring ? null : selected}
            hovered={hovered}
            highlight={highlight}
            pulse={pulse}
            labelled={labelled}
            autoRotate={!touring && !cluster && !selected}
            onHover={setHovered}
            onSelectTrend={selectTrend}
            onSelectCluster={selectCluster}
            onBackground={() => !touring && setSelected(null)}
          />
        )}
      </div>

      {/* Kopf: Titel und Pfad */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-4 p-4 sm:p-8">
        <div className="pointer-events-auto flex max-w-xl flex-col gap-2">
          <p className="eyebrow">Trendradar 2027–2035</p>
          <h1 className="!text-[clamp(28px,3.4vw,44px)]">Future of Experiences</h1>
          {!touring && (
            <nav aria-label="Pfad" className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <button type="button" onClick={() => { setCluster(null); setSelected(null); }} className={!cluster ? "text-ink" : "hover:text-ink"}>
                Stadion
              </button>
              {cluster && (
                <>
                  <span aria-hidden>›</span>
                  <button type="button" onClick={() => setSelected(null)} className={!selected ? "text-ink" : "hover:text-ink"}>
                    Tribüne {cluster} · {clusterName[cluster]}
                  </button>
                </>
              )}
              {sel && (
                <>
                  <span aria-hidden>›</span>
                  <span className="text-ink">#{sel.number} {sel.name}</span>
                </>
              )}
            </nav>
          )}
        </div>
        {!touring && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-[var(--radius-pill)] border border-line bg-bg/70 p-0.5 backdrop-blur" role="group" aria-label="Perspektive">
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
            <button type="button" onClick={startTour} className="rounded-[var(--radius-pill)] border border-line bg-bg/70 px-4 py-1.5 text-sm font-bold text-ink backdrop-blur hover:border-muted">
              Tour starten
            </button>
            <Link href="/radar/klassisch" className="rounded-[var(--radius-pill)] border border-line bg-bg/70 px-4 py-1.5 text-sm font-bold text-ink no-underline backdrop-blur hover:border-muted">
              2D-Ansicht
            </Link>
          </div>
        )}
      </div>

      {/* Fuß: Spielphasen und Fortschritt */}
      {!touring && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-4 sm:p-8">
          <dl className="pointer-events-auto flex overflow-hidden rounded-[var(--radius-card)] border border-line bg-bg/70 backdrop-blur">
            {ZONE_KEYS.map((z) => (
              <div key={z} className={`flex flex-col px-4 py-3 ${z === "KICKOFF" ? "bg-accent text-on-accent" : ""}`}>
                <dt className={`eyebrow !text-[10px] ${z === "KICKOFF" ? "!text-on-accent" : "!text-muted"}`}>{data.zones[z].name} · {ZONE_PLACE[z]}</dt>
                <dd className={`num text-3xl leading-none ${z === "KICKOFF" ? "" : "text-ink"}`}>{counts[z]}</dd>
              </div>
            ))}
          </dl>
          <p className="pointer-events-auto rounded-[var(--radius-pill)] border border-line bg-bg/70 px-4 py-1.5 text-sm text-muted backdrop-blur">
            <span className="num text-ink">{found.size}</span> von {data.trends.length} entdeckt
            {!cluster && <span className="hidden sm:inline"> · Tribüne anklicken zum Hineinzoomen</span>}
          </p>
        </div>
      )}

      {/* Seitenpanel: Tribüne oder Trend */}
      {!touring && (cluster || sel) && (
        <aside
          className="absolute inset-x-3 bottom-3 max-h-[55%] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface/95 p-5 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-auto sm:right-8 sm:top-36 sm:max-h-[calc(100%-12rem)] sm:w-[360px]"
          aria-live="polite"
        >
          {sel && selView ? (
            <article className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <p className="eyebrow !text-muted flex items-center gap-2">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: `var(--c${sel.cluster})` }} />
                  {sel.cluster} · {clusterName[sel.cluster]}
                </p>
                <button type="button" onClick={() => setSelected(null)} aria-label="Trend schließen" className="-mr-1 -mt-1 rounded-full px-2 text-lg text-muted hover:text-ink">×</button>
              </div>
              <div className="flex items-end justify-between gap-4">
                <h2 className="!text-[26px]">
                  <span className="num text-muted">{sel.number}</span> {sel.name}
                </h2>
                <p className="flex flex-col items-end">
                  <span className="num text-3xl leading-none text-ink">{fmt(selView.total)}</span>
                  <span className="text-xs text-muted">Score</span>
                </p>
              </div>
              <p className="text-ink">{firstSentence(sel.description)}</p>
              <dl className="grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
                <div><dt className="text-xs text-muted">Phase</dt><dd className="font-bold text-ink">{data.zones[selView.zone].name}</dd></div>
                <div><dt className="text-xs text-muted">Horizont</dt><dd className="font-bold text-ink">{selView.horizon} J.</dd></div>
                <div><dt className="text-xs text-muted">Evidenz</dt><dd className="font-bold text-ink">{sel.evidence}{sel.uncertain ? " · zu validieren" : ""}</dd></div>
              </dl>
              {moved(pos, sel.number) && (
                <p className="text-sm text-muted">
                  Global {data.zones[pos.GLOBAL[sel.number].zone].name}, in Europa {data.zones[pos.EU[sel.number].zone].name}.
                </p>
              )}
              <Link href={`/trends/${sel.number}`} className="self-start rounded-[var(--radius-pill)] bg-ink px-5 py-2 text-sm font-bold text-bg no-underline hover:opacity-90">
                Mehr erfahren
              </Link>
            </article>
          ) : cluster ? (
            <ClusterPanel data={data} cluster={cluster} name={clusterName[cluster]} pos={pos} persp={persp} hovered={hovered} onHover={setHovered} onSelect={selectTrend} />
          ) : null}
        </aside>
      )}

      {/* Tour */}
      {st && station !== null && (
        <section
          aria-label="Tour"
          className="absolute inset-x-3 bottom-3 flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface/90 p-6 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-8 sm:left-8 sm:w-[460px]"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="eyebrow">{st.eyebrow}</p>
            <p className="num text-sm text-muted" aria-label={`Station ${station + 1} von ${tour.length}`}>
              {station + 1} / {tour.length}
            </p>
          </div>
          <div className="flex items-start gap-5">
            {st.figure && <span className="num text-[56px] leading-[0.85] text-accent-ink">{st.figure}</span>}
            <div className="flex flex-col gap-2">
              <h2 className="!text-[clamp(20px,2vw,26px)]">{st.title}</h2>
              <p>{st.body}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={endTour} className="text-sm text-muted hover:text-ink">
              Tour überspringen
            </button>
            <div className="flex gap-2">
              {station > 0 && (
                <button type="button" onClick={() => step(-1)} className="rounded-[var(--radius-pill)] border border-line px-4 py-2 text-sm font-bold text-ink hover:border-muted">
                  Zurück
                </button>
              )}
              <button type="button" onClick={() => step(1)} className="rounded-[var(--radius-pill)] bg-ink px-5 py-2 text-sm font-bold text-bg hover:opacity-90" autoFocus>
                {station === tour.length - 1 ? "Losgehen" : "Weiter"}
              </button>
            </div>
          </div>
          <div className="flex gap-1" aria-hidden>
            {tour.map((s, i) => (
              <span key={s.key} className={`h-1 flex-1 rounded-full ${i <= station ? "bg-ink" : "bg-line"}`} />
            ))}
          </div>
        </section>
      )}

      {/* Für Tastatur und Screenreader: alle Trends als Liste */}
      <nav aria-label="Alle Trends" className="sr-only">
        <ul>
          {data.trends.map((t) => (
            <li key={t.number}>
              <button type="button" onClick={() => selectTrend(t.number)}>
                {t.number} {t.name}, {data.zones[pos[persp][t.number].zone].name}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function ClusterPanel({
  data, cluster, name, pos, persp, hovered, onHover, onSelect,
}: {
  data: RadarData; cluster: ClusterCode; name: string; pos: ReturnType<typeof positions>; persp: Perspective;
  hovered: number | null; onHover: (n: number | null) => void; onSelect: (n: number) => void;
}) {
  const trends = data.trends
    .filter((t) => t.cluster === cluster)
    .sort((a, b) => pos[persp][b.number].total - pos[persp][a.number].total || a.number - b.number);
  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow !text-muted flex items-center gap-2">
        <span className="inline-block size-2.5 rounded-full" style={{ background: `var(--c${cluster})` }} />
        Tribüne {cluster}
      </p>
      <h2 className="!text-[26px]">{name}</h2>
      <dl className="grid grid-cols-3 gap-3 border-y border-line py-3 text-sm">
        {ZONE_KEYS.map((z) => (
          <div key={z}>
            <dt className="text-xs text-muted">{data.zones[z].name}</dt>
            <dd className="num text-xl text-ink">{trends.filter((t) => pos[persp][t.number].zone === z).length}</dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-col">
        {trends.map((t) => {
          const v = pos[persp][t.number];
          return (
            <li key={t.number}>
              <button
                type="button"
                onClick={() => onSelect(t.number)}
                onMouseEnter={() => onHover(t.number)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(t.number)}
                onBlur={() => onHover(null)}
                className={`grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${hovered === t.number ? "bg-sunk" : ""}`}
              >
                <span className="num text-muted">{t.number}</span>
                <span className="truncate text-ink">{t.name}</span>
                <span className="text-xs text-muted">{data.zones[v.zone].name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
