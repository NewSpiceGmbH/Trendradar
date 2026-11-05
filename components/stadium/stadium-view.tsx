"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CLUSTER_KEYS, ZONE_KEYS, type ClusterCode, type Perspective } from "@/lib/scoring";
import type { RadarData } from "@/lib/radar/types";
import { PERSPECTIVE_LABEL, fmt, moved, positions } from "@/lib/radar/view";
import {
  JOURNEY_OVERVIEW, OVERVIEW, PITCH_SHOT, STADIUM_OUTSIDE, ZONE_PLACE, clusterShot, dotPosition, groupShot, placeShot, spotShot,
  type CameraShot,
} from "@/lib/stadium/geometry";
import { STAGE, STAGES, journeySpot, registerStages, stageOf, type StageKey } from "@/lib/stadium/journey";
import { buildTour, firstSentence } from "@/lib/stadium/tour";
import { AUDIENCE_LABEL, FILTER_LABEL, audienceOf, matchesAudience, registerAudience, type AudienceFilter } from "@/lib/stadium/audience";
import { USE_CASE, hotspotShot, type UseCaseKey } from "@/lib/stadium/usecases";
import { isFresh, newsByTrend } from "@/lib/stadium/ticker";
import type { Palette, View } from "./scene";
import { TickerPanel, TickerStrip } from "./ticker";
import { TrendDetail } from "./trend-detail";

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
    bg: v("--bg"), surface: v("--surface"), sunk: v("--sunk"), line: v("--line"), ink: v("--ink"), text: v("--text"), muted: v("--muted"),
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

const pill = "glass rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-bold text-ink hover:brightness-110";

export default function StadiumView({ data, notice, editor = false }: { data: RadarData; notice?: ReactNode; editor?: boolean }) {
  // Ort und Zielgruppe aus der Datenbank vor allen anderen Berechnungen übernehmen
  useMemo(() => {
    registerStages(data.trends);
    registerAudience(data.trends);
  }, [data]);
  const pos = useMemo(() => positions(data), [data]);
  const tour = useMemo(() => buildTour(data, pos), [data, pos]);
  const palette = usePalette();
  const byNumber = useMemo(() => new Map(data.trends.map((t) => [t.number, t])), [data]);
  const news = useMemo(() => newsByTrend(data.ticker), [data]);
  const clusterName = useMemo(() => Object.fromEntries(data.clusters.map((c) => [c.code, c.name])), [data]);

  // Einstieg: Zustand aus der Adresse, sonst beim ersten Besuch die Tour (Komponente läuft nur im Browser)
  const [initial] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("c")?.toUpperCase() as ClusterCode | undefined;
    const o = q.get("o") as StageKey | null;
    const t = Number(q.get("t"));
    const trend = t && byNumber.has(t) ? t : null;
    const view: View = q.get("v") === "radar" || (c && CLUSTER_KEYS.includes(c)) ? "radar" : "journey";
    let found = new Set<number>();
    try {
      found = new Set((JSON.parse(store.get(FOUND) ?? "[]") as number[]).filter((n) => byNumber.has(n)));
    } catch { /* ignorieren */ }
    const sc = q.get("s") as UseCaseKey | null;
    const z = q.get("z");
    const deep = !!(c || o || trend || q.get("v") || sc || q.get("live"));
    return {
      persp: (q.get("p") === "global" ? "GLOBAL" : "EU") as Perspective,
      view,
      cluster: view === "radar" ? (trend ? byNumber.get(trend)!.cluster : c && CLUSTER_KEYS.includes(c) ? c : null) : null,
      place: view === "journey" ? (trend ? stageOf(trend) : o && STAGE[o] ? o : null) : null,
      selected: trend,
      useCase: sc && USE_CASE[sc] ? sc : null,
      detail: !!trend && q.get("d") === "1",
      audience: (z === "vip" || z === "public" ? z : "all") as AudienceFilter,
      station: !deep && !store.get(TOUR_SEEN) ? 0 : null,
      ticker: q.get("live") === "1",
      found,
    };
  });
  const [persp, setPersp] = useState<Perspective>(initial.persp);
  const [view, setView] = useState<View>(initial.view);
  const [cluster, setCluster] = useState<ClusterCode | null>(initial.cluster);
  const [place, setPlace] = useState<StageKey | null>(initial.place);
  const [selected, setSelected] = useState<number | null>(initial.selected);
  const [useCase, setUseCase] = useState<UseCaseKey | null>(initial.useCase);
  // Detailansicht gehört zu genau einem Trend; wechselt die Auswahl, schließt sie sich von selbst
  const [detailFor, setDetailFor] = useState<number | null>(initial.detail ? initial.selected : null);
  const detail = detailFor !== null && detailFor === selected;
  const setDetail = (open: boolean) => setDetailFor(open ? selected : null);
  const [audience, setAudience] = useState<AudienceFilter>(initial.audience);
  const [hovered, setHovered] = useState<number | null>(null);
  const [station, setStation] = useState<number | null>(initial.station);
  const [switched, setSwitched] = useState<string | null>(null);
  const [found, setFound] = useState<Set<number>>(initial.found);
  const [tickerOpen, setTickerOpen] = useState<boolean>(initial.ticker);

  const touring = station !== null;
  const st = touring ? tour[station] : null;

  // Zustand in die Adresse schreiben, damit sich jede Ansicht teilen lässt
  useEffect(() => {
    if (touring) return;
    const q = new URLSearchParams();
    if (view === "radar") q.set("v", "radar");
    if (cluster) q.set("c", cluster);
    if (place) q.set("o", place);
    if (useCase) q.set("s", useCase);
    if (selected) q.set("t", String(selected));
    if (selected && detail) q.set("d", "1");
    if (persp === "GLOBAL") q.set("p", "global");
    if (audience !== "all") q.set("z", audience);
    if (tickerOpen) q.set("live", "1");
    const s = q.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [view, cluster, place, selected, persp, touring, useCase, audience, detail, tickerOpen]);

  // In der Perspektiv-Station erst Europa zeigen, dann umschalten – damit man die Bewegung sieht
  useEffect(() => {
    if (!st || st.persp === "EU") return;
    const id = window.setTimeout(() => setSwitched(st.key), 1600);
    return () => window.clearTimeout(id);
  }, [st]);

  const activePersp: Perspective = st ? (st.persp === "GLOBAL" && switched === st.key ? "GLOBAL" : "EU") : persp;
  const tourScene = st && st.shot.kind === "scene" ? st.shot.useCase : null;
  const activeUseCase = st ? tourScene : useCase;
  const activeView: View = activeUseCase ? "scene" : st ? (st.view === "scene" ? "radar" : st.view) : view;

  const discover = useCallback((n: number) => {
    setFound((f) => {
      if (f.has(n)) return f;
      const next = new Set(f).add(n);
      store.set(FOUND, JSON.stringify([...next]));
      return next;
    });
  }, []);

  /**
   * Klick auf eine Kachel während der Tour: Tour an der aktuellen Station verlassen und den Zustand der Station
   * (Ansicht, Ort, Szene, Perspektive) übernehmen, damit die angeklickte Kachel im richtigen Kontext aufgeht.
   */
  const leaveTour = useCallback((): { view: View; useCase: UseCaseKey | null } | null => {
    if (!st) return null;
    const s = st.shot;
    const ctx = {
      view: (s.kind === "journey" || s.kind === "place" ? "journey" : "radar") as View,
      useCase: s.kind === "scene" ? s.useCase : null,
    };
    setStation(null);
    store.set(TOUR_SEEN, "1");
    setPersp(activePersp);
    setView(ctx.view);
    setUseCase(ctx.useCase);
    setPlace(s.kind === "place" ? s.place : null);
    setCluster(null);
    setSelected(null);
    return ctx;
  }, [st, activePersp]);

  const selectTrend = useCallback(
    (n: number) => {
      const ctx = leaveTour() ?? { view, useCase };
      setTickerOpen(false);
      setSelected(n);
      discover(n);
      if (ctx.useCase) return;
      if (ctx.view === "radar") setCluster(byNumber.get(n)!.cluster);
      else setPlace(stageOf(n));
    },
    [leaveTour, view, byNumber, discover, useCase],
  );
  const selectCluster = useCallback((c: ClusterCode) => {
    leaveTour();
    setTickerOpen(false);
    setView("radar");
    setPlace(null);
    setUseCase(null);
    setCluster(c);
    setSelected(null);
  }, [leaveTour]);
  const selectPlace = useCallback((k: StageKey) => {
    leaveTour();
    setTickerOpen(false);
    if (k === "stadion" && place === "stadion") {
      // zweiter Klick auf das Stadion: hinein in den Radar
      setView("radar");
      setPlace(null);
      setSelected(null);
      return;
    }
    setView("journey");
    setCluster(null);
    setPlace(k);
    setSelected(null);
  }, [leaveTour, place]);
  const enterStadium = useCallback(() => {
    leaveTour();
    setView("radar");
    setPlace(null);
    setCluster(null);
    setSelected(null);
  }, [leaveTour]);
  const openUseCase = useCallback((k: UseCaseKey, trend?: number) => {
    leaveTour();
    setTickerOpen(false);
    setUseCase(k);
    setSelected(trend ?? null);
    if (trend) discover(trend);
  }, [leaveTour, discover]);
  const closeUseCase = () => {
    setUseCase(null);
    setSelected(null);
  };
  const switchView = (v: View) => {
    setUseCase(null);
    setView(v);
    setCluster(null);
    setPlace(null);
    setSelected(null);
  };

  const endTour = useCallback(() => {
    setStation(null);
    setView("journey");
    store.set(TOUR_SEEN, "1");
  }, []);
  const openTicker = () => {
    setTickerOpen((o) => !o);
    setCluster(null);
    setPlace(null);
    setSelected(null);
    setUseCase(null);
  };
  const startTour = () => {
    setTickerOpen(false);
    setCluster(null);
    setPlace(null);
    setSelected(null);
    setUseCase(null);
    setStation(0);
  };
  const step = useCallback(
    (d: number) => {
      if (station === null) return;
      const n = station + d;
      if (n >= tour.length) endTour();
      else setStation(Math.max(0, n));
    },
    [station, tour.length, endTour],
  );

  const up = useCallback(() => {
    if (tickerOpen) setTickerOpen(false);
    else if (detail) setDetailFor(null);
    else if (selected) setSelected(null);
    else if (useCase) setUseCase(null);
    else if (cluster) setCluster(null);
    else if (place) setPlace(null);
    else if (view === "radar") setView("journey");
  }, [selected, cluster, place, view, useCase, detail, tickerOpen]);

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

  // Position eines Trends in der aktuellen Ansicht (für Kamerafahrten)
  const spotOf = useCallback(
    (n: number, v: View, p: Perspective): [number, number, number] => {
      const k = stageOf(n);
      if (v === "journey" && k !== "stadion") {
        const group = data.trends.map((t) => t.number).filter((m) => stageOf(m) === k)
          .sort((a, b) => pos[p][b].total - pos[p][a].total || a - b);
        return journeySpot(STAGE[k], group.indexOf(n), group.length).dot;
      }
      return dotPosition(pos[p][n]).dot;
    },
    [data, pos],
  );

  const shot: CameraShot = useMemo(() => {
    const forPlace = (k: StageKey): CameraShot => (k === "stadion" ? STADIUM_OUTSIDE : placeShot(STAGE[k].at, STAGE[k].height));
    if (st) {
      const s = st.shot;
      if (s.kind === "pitch") return PITCH_SHOT;
      if (s.kind === "radar") return OVERVIEW;
      if (s.kind === "place") return forPlace(s.place);
      if (s.kind === "scene") return USE_CASE[s.useCase].shot;
      return JOURNEY_OVERVIEW;
    }
    if (useCase) {
      const h = selected ? USE_CASE[useCase].hotspots.find((x) => x.trend === selected) : null;
      return h ? hotspotShot(h) : USE_CASE[useCase].shot;
    }
    if (selected && detail) {
      // Detail-Panel deckt die rechte Hälfte ab: ganze Tribüne bzw. ganzen Ort zeigen statt Nahaufnahme
      if (view === "radar") return clusterShot(byNumber.get(selected)!.cluster);
      return forPlace(stageOf(selected));
    }
    if (selected) {
      const d = spotOf(selected, view, persp);
      return view === "journey" && stageOf(selected) !== "stadion" ? spotShot(d) : groupShot([d]);
    }
    if (view === "radar") return cluster ? clusterShot(cluster) : OVERVIEW;
    return place ? forPlace(place) : JOURNEY_OVERVIEW;
  }, [st, selected, view, cluster, place, persp, spotOf, useCase, detail, byNumber]);

  const highlight = useMemo(() => (st && st.highlight.length ? new Set(st.highlight) : null), [st]);
  const pulse = useMemo(() => {
    if (touring) return new Set<number>();
    const top = [...data.trends].sort((a, b) => pos[persp][b.number].total - pos[persp][a.number].total)[0]?.number;
    const curious = data.trends.filter((t) => moved(pos, t.number)).map((t) => t.number);
    if (top) curious.push(top);
    // Trends mit neuer Meldung im Liveticker
    for (const [n, items] of news) if (isFresh(items[0])) curious.push(n);
    return new Set(curious.filter((n) => !found.has(n) && n !== selected));
  }, [touring, data, pos, persp, found, selected, news]);
  const labelled = useMemo(() => {
    if (st && st.highlight.length && st.highlight.length <= 12) return new Set(st.highlight);
    if (!touring && view === "radar" && cluster) return new Set(data.trends.filter((t) => t.cluster === cluster).map((t) => t.number));
    if (!touring && view === "journey" && place) return new Set(data.trends.filter((t) => stageOf(t.number) === place).map((t) => t.number));
    return new Set<number>();
  }, [st, touring, view, cluster, place, data]);

  const counts = useMemo(() => {
    const c = { KICKOFF: 0, WARMUP: 0, SCOUTING: 0 };
    for (const t of data.trends) c[pos[activePersp][t.number].zone]++;
    return c;
  }, [data, pos, activePersp]);

  const sel = selected ? byNumber.get(selected) ?? null : null;
  const selView = sel ? pos[persp][sel.number] : null;
  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: view === "radar" ? "Radar" : "Journey", onClick: () => { setCluster(null); setPlace(null); setSelected(null); } },
  ];
  if (view === "radar" && cluster) crumbs.push({ label: `Tribüne ${cluster} · ${clusterName[cluster]}`, onClick: () => setSelected(null) });
  if (view === "journey" && place) crumbs.push({ label: STAGE[place].name, onClick: () => setSelected(null) });
  if (useCase) {
    crumbs.splice(1, crumbs.length - 1);
    crumbs.push({ label: USE_CASE[useCase].name, onClick: () => setSelected(null) });
  }
  if (sel) crumbs.push({ label: `#${sel.number} ${sel.name}` });

  return (
    <div className="relative -mt-[57px] h-[100dvh] min-h-[600px] w-full overflow-hidden bg-bg">
      <div className="absolute inset-0">
        <Scene
          data={data}
          pos={pos}
          persp={activePersp}
          palette={palette}
          view={activeView}
          shot={shot}
          cluster={touring ? null : cluster}
          place={touring ? (st?.shot.kind === "place" ? st.shot.place : null) : place}
          useCase={activeUseCase}
          audience={touring ? "all" : audience}
          selected={touring ? null : selected}
          hovered={hovered}
          highlight={highlight}
          pulse={pulse}
          labelled={labelled}
          autoRotate={!touring && !cluster && !place && !selected && !useCase && !tickerOpen}
          showMarkers={!touring || st?.shot.kind === "journey" || st?.shot.kind === "radar"}
          onHover={setHovered}
          onSelectTrend={selectTrend}
          onSelectCluster={selectCluster}
          onSelectPlace={selectPlace}
          onEnterStadium={enterStadium}
          onOpenUseCase={openUseCase}
          onBackground={() => !touring && setSelected(null)}
        />
      </div>

      {/* kurzer Übergang beim Betreten und Verlassen einer Szene */}
      <div key={activeView === "scene" ? `scene-${activeUseCase}` : "world"} className="stadium-fade pointer-events-none absolute inset-0 bg-bg" aria-hidden />

      {/* Kopf: Titel und Pfad */}
      <div className="pointer-events-none absolute inset-x-0 top-[57px] flex flex-wrap items-start justify-between gap-4 p-4 sm:p-8">
        <div className="pointer-events-auto flex max-w-xl flex-col gap-2">
          {!touring && notice}
          <p className="eyebrow">Trendradar 2027–2035</p>
          <h1 className="!text-[clamp(28px,3.4vw,44px)]">Future of Experiences</h1>
          {!touring && (
            <nav aria-label="Pfad" className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden>›</span>}
                  {c.onClick && i < crumbs.length - 1 ? (
                    <button type="button" onClick={c.onClick} className="hover:text-ink">{c.label}</button>
                  ) : (
                    <span className="text-ink">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>
        {!touring && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <span className="glass inline-flex rounded-[var(--radius-pill)] p-0.5" role="group" aria-label="Ansicht">
              {([["journey", "Journey"], ["radar", "Radar"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => switchView(v)}
                  className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm font-bold ${view === v ? "bg-ink text-bg" : "text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </span>
            <span className="glass inline-flex rounded-[var(--radius-pill)] p-0.5" role="group" aria-label="Zielgruppe">
              {(["all", "vip", "public"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={audience === a}
                  onClick={() => setAudience(a)}
                  className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm font-bold ${audience === a ? "bg-ink text-bg" : "text-ink"}`}
                >
                  {FILTER_LABEL[a]}
                </button>
              ))}
            </span>
            <span className="glass inline-flex rounded-[var(--radius-pill)] p-0.5" role="group" aria-label="Perspektive">
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
            <button type="button" onClick={startTour} className={pill}>Tour starten</button>
            <Link href="/radar/klassisch" className={`${pill} no-underline`}>2D-Ansicht</Link>
          </div>
        )}
      </div>

      {/* Fuß: Spielphasen und Fortschritt */}
      {!touring && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-4 sm:p-8">
          <dl className="glass pointer-events-auto flex overflow-hidden rounded-[var(--radius-card)]">
            {ZONE_KEYS.map((z) => (
              <div key={z} className={`flex flex-col px-4 py-3 ${z === "KICKOFF" ? "bg-accent text-on-accent" : ""}`}>
                <dt className={`eyebrow !text-[10px] ${z === "KICKOFF" ? "!text-on-accent" : "!text-muted"}`}>{data.zones[z].name} · {ZONE_PLACE[z]}</dt>
                <dd className={`num text-3xl leading-none ${z === "KICKOFF" ? "" : "text-ink"}`}>{counts[z]}</dd>
              </div>
            ))}
          </dl>
          <div className="pointer-events-none flex min-w-0 flex-col items-end gap-2">
            <TickerStrip items={data.ticker} open={tickerOpen} onOpen={openTicker} editor={editor} />
            <p className="glass pointer-events-auto rounded-[var(--radius-pill)] px-4 py-1.5 text-sm text-muted">
              <span className="num text-ink">{found.size}</span> von {data.trends.length} entdeckt
              {!cluster && !place && !useCase && (
                <span className="hidden sm:inline"> · {view === "journey" ? "Ort anklicken oder ins Stadion gehen" : "Tribüne anklicken zum Hineinzoomen"}</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Seitenpanel: Ort, Tribüne oder Trend */}
      {!touring && !(detail && sel) && (cluster || place || sel || useCase || tickerOpen) && (
        <aside
          className="absolute inset-x-3 bottom-3 max-h-[55%] glass-strong overflow-y-auto rounded-[var(--radius-card)] p-5 sm:inset-x-auto sm:bottom-auto sm:right-8 sm:top-[200px] sm:max-h-[calc(100%-16rem)] sm:w-[360px]"
          aria-live="polite"
        >
          {tickerOpen ? (
            <TickerPanel data={data} onSelectTrend={selectTrend} onClose={() => setTickerOpen(false)} />
          ) : sel && selView ? (
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
              <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                <div><dt className="text-xs text-muted">Phase</dt><dd className="font-bold text-ink">{data.zones[selView.zone].name}</dd></div>
                <div><dt className="text-xs text-muted">Horizont</dt><dd className="font-bold text-ink">{selView.horizon} J.</dd></div>
                <div><dt className="text-xs text-muted">Ort</dt><dd className="font-bold text-ink">{STAGE[stageOf(sel.number)].name}</dd></div>
                <div><dt className="text-xs text-muted">Zielgruppe</dt><dd className="font-bold text-ink">{AUDIENCE_LABEL[audienceOf(sel.number)]}</dd></div>
              </dl>
              {moved(pos, sel.number) && (
                <p className="text-sm text-muted">
                  Global {data.zones[pos.GLOBAL[sel.number].zone].name}, in Europa {data.zones[pos.EU[sel.number].zone].name}.
                </p>
              )}
              {news.get(sel.number)?.length ? (
                <p className="border-t border-line pt-3 text-sm">
                  <span className="eyebrow !text-[10px] !text-muted">Liveticker · {news.get(sel.number)!.length}</span>
                  <span className="mt-1 block font-bold text-ink">{news.get(sel.number)![0].title}</span>
                </p>
              ) : null}
              <button type="button" onClick={() => setDetail(true)} className="self-start rounded-[var(--radius-pill)] bg-ink px-5 py-2 text-sm font-bold text-bg hover:opacity-90">
                Mehr erfahren
              </button>
            </article>
          ) : useCase ? (
            <UseCasePanel data={data} useCaseKey={useCase} onSelect={selectTrend} onClose={closeUseCase} hovered={hovered} onHover={setHovered} />
          ) : view === "radar" && cluster ? (
            <TrendList
              data={data} pos={pos} persp={persp} hovered={hovered} onHover={setHovered} onSelect={selectTrend} audience={audience}
              eyebrow={`Tribüne ${cluster}`} dot={`var(--c${cluster})`} title={clusterName[cluster]}
              trends={data.trends.filter((t) => t.cluster === cluster).map((t) => t.number)}
            />
          ) : place ? (
            <TrendList
              data={data} pos={pos} persp={persp} hovered={hovered} onHover={setHovered} onSelect={selectTrend} audience={audience}
              eyebrow={`Station ${STAGES.findIndex((s) => s.key === place) + 1} von ${STAGES.length}`} title={STAGE[place].name} blurb={STAGE[place].blurb}
              trends={data.trends.filter((t) => stageOf(t.number) === place).map((t) => t.number)}
              action={place === "stadion" ? { label: "Hinein in den Radar", onClick: enterStadium } : undefined}
            />
          ) : null}
        </aside>
      )}

      {/* Ebene 3: Detailansicht */}
      {!touring && detail && sel && (
        <TrendDetail
          data={data}
          trend={sel}
          pos={pos}
          persp={persp}
          onClose={() => setDetail(false)}
          onOpen={(n) => { selectTrend(n); setDetailFor(n); }}
          onOpenScene={(k, n) => { setDetail(false); openUseCase(k, n); }}
        />
      )}

      {/* Tour */}
      {st && station !== null && (
        <section
          aria-label="Tour"
          className="absolute inset-x-3 bottom-3 glass-strong flex flex-col gap-4 rounded-[var(--radius-card)] p-6 sm:inset-x-auto sm:bottom-8 sm:left-8 sm:w-[460px]"
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
                <button type="button" onClick={() => step(-1)} className="glass rounded-[var(--radius-pill)] px-4 py-2 text-sm font-bold text-ink hover:brightness-110">
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
                {t.number} {t.name}, {data.zones[pos[persp][t.number].zone].name}, {STAGE[stageOf(t.number)].name}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function TrendList({
  data, pos, persp, hovered, onHover, onSelect, eyebrow, dot, title, blurb, trends, action, audience,
}: {
  data: RadarData; pos: ReturnType<typeof positions>; persp: Perspective; audience: AudienceFilter;
  hovered: number | null; onHover: (n: number | null) => void; onSelect: (n: number) => void;
  eyebrow: string; dot?: string; title: string; blurb?: string; trends: number[];
  action?: { label: string; onClick: () => void };
}) {
  const byNumber = new Map(data.trends.map((t) => [t.number, t]));
  const sorted = [...trends].sort((a, b) => pos[persp][b].total - pos[persp][a].total || a - b);
  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow !text-muted flex items-center gap-2">
        {dot && <span className="inline-block size-2.5 rounded-full" style={{ background: dot }} />}
        {eyebrow}
      </p>
      <h2 className="!text-[26px]">{title}</h2>
      {blurb && <p className="text-ink">{blurb}</p>}
      <dl className="grid grid-cols-3 gap-3 border-y border-line py-3 text-sm">
        {ZONE_KEYS.map((z) => (
          <div key={z}>
            <dt className="text-xs text-muted">{data.zones[z].name}</dt>
            <dd className="num text-xl text-ink">{sorted.filter((n) => pos[persp][n].zone === z).length}</dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-col">
        {sorted.map((n) => {
          const t = byNumber.get(n)!;
          const v = pos[persp][n];
          return (
            <li key={n}>
              <button
                type="button"
                onClick={() => onSelect(n)}
                onMouseEnter={() => onHover(n)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(n)}
                onBlur={() => onHover(null)}
                className={`grid w-full grid-cols-[12px_28px_minmax(0,1fr)_auto] items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${hovered === n ? "bg-sunk" : ""} ${matchesAudience(n, audience) ? "" : "opacity-40"}`}
              >
                <span className="inline-block size-2 self-center rounded-full" style={{ background: `var(--c${t.cluster})` }} />
                <span className="num text-muted">{n}</span>
                <span className="truncate text-ink">
                  {t.name}
                  {audienceOf(n) === "vip" && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">VIP</span>}
                </span>
                <span className="text-xs text-muted">{data.zones[v.zone].name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {action && (
        <button type="button" onClick={action.onClick} className="self-start rounded-[var(--radius-pill)] bg-ink px-5 py-2 text-sm font-bold text-bg hover:opacity-90">
          {action.label}
        </button>
      )}
    </div>
  );
}

function UseCasePanel({
  data, useCaseKey, onSelect, onClose, hovered, onHover,
}: {
  data: RadarData; useCaseKey: UseCaseKey; onSelect: (n: number) => void; onClose: () => void;
  hovered: number | null; onHover: (n: number | null) => void;
}) {
  const u = USE_CASE[useCaseKey];
  const byNumber = new Map(data.trends.map((t) => [t.number, t]));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow !text-muted">Szene · {u.audience === "vip" ? "Hospitality" : "Public"}</p>
        <button type="button" onClick={onClose} aria-label="Szene schließen" className="-mr-1 -mt-1 rounded-full px-2 text-lg text-muted hover:text-ink">×</button>
      </div>
      <h2 className="!text-[26px]">{u.name}</h2>
      <p className="text-ink">{u.blurb}</p>
      <ul className="flex flex-col border-t border-line pt-3">
        {u.hotspots.map((h) => {
          const t = byNumber.get(h.trend);
          if (!t) return null;
          return (
            <li key={h.key}>
              <button
                type="button"
                onClick={() => onSelect(h.trend)}
                onMouseEnter={() => onHover(h.trend)}
                onMouseLeave={() => onHover(null)}
                className={`grid w-full grid-cols-[12px_minmax(0,1fr)] items-start gap-x-2 rounded-lg px-2 py-2 text-left text-sm ${hovered === h.trend ? "bg-sunk" : ""}`}
              >
                <span className="mt-1.5 inline-block size-2 rounded-full" style={{ background: `var(--c${t.cluster})` }} />
                <span className="flex flex-col">
                  <span className="font-bold text-ink">{h.label}</span>
                  <span className="text-xs text-muted">#{t.number} {t.name}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Objekt in der Szene oder in der Liste anklicken. Esc führt zurück ins Stadion.</p>
    </div>
  );
}
