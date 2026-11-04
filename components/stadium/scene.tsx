"use client";

import { Billboard, CameraControls, Line } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CLUSTER_KEYS, type ClusterCode, type Perspective } from "@/lib/scoring";
import type { RadarData } from "@/lib/radar/types";
import { fmt, type Positions } from "@/lib/radar/view";
import {
  OUTER_R, PITCH_R, ROOF_H, SEGMENT, SX, TIERS, clusterAngle, dotPosition, fitShot, polar, type CameraShot,
} from "@/lib/stadium/geometry";
import { STAGES, journeySpot, stageOf, type StageKey } from "@/lib/stadium/journey";
import { City, Places } from "./city";
import { Projector, createRegistry, labelRef, type LabelRegistry } from "./labels";

export interface Palette {
  bg: string; surface: string; sunk: string; line: string; ink: string; text: string; muted: string;
  pitch: string; pitchLine: string; accent: string;
  clusters: Record<string, string>;
}

export type View = "journey" | "radar";

export interface SceneProps {
  data: RadarData;
  pos: Positions;
  persp: Perspective;
  palette: Palette;
  view: View;
  shot: CameraShot;
  cluster: ClusterCode | null;
  place: StageKey | null;
  selected: number | null;
  hovered: number | null;
  /** hervorgehobene Trends (Tour); null = keine Hervorhebung */
  highlight: Set<number> | null;
  /** Trends mit Neugier-Signal */
  pulse: Set<number>;
  /** Nummern, deren Beschriftung dauerhaft sichtbar ist */
  labelled: Set<number>;
  autoRotate: boolean;
  /** Ortsmarken und Tribünen-Beschriftungen zeigen */
  showMarkers: boolean;
  onHover: (n: number | null) => void;
  onSelectTrend: (n: number) => void;
  onSelectCluster: (c: ClusterCode) => void;
  onSelectPlace: (k: StageKey) => void;
  /** Klick auf das Stadion von außen (Journey → Radar) */
  onEnterStadium: () => void;
  onBackground: () => void;
}

const deg = (d: number) => (d * Math.PI) / 180;

// ───────────── Geometrie der Tribünen ─────────────

function standGeometry(rIn: number, rOut: number, hIn: number, hOut: number, a0: number, a1: number, steps = 18) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = deg(a0 + ((a1 - a0) * i) / steps);
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(rIn * SX * c, hIn, rIn * s, rOut * SX * c, hOut, rOut * s);
    if (i < steps) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wallGeometry(r: number, y0: number, y1: number, a0: number, a1: number, steps = 18) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = deg(a0 + ((a1 - a0) * i) / steps);
    const x = r * SX * Math.cos(a), z = r * Math.sin(a);
    pos.push(x, y0, z, x, y1, z);
    if (i < steps) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function arc(r: number, y: number, a0: number, a1: number, steps = 24): [number, number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => polar(r, a0 + ((a1 - a0) * i) / steps, y));
}

const GAP = 1.6; // Gang zwischen zwei Blöcken in Grad

function Stands({ palette, cluster, view, onSelectCluster, onEnterStadium }: Pick<SceneProps, "palette" | "cluster" | "view" | "onSelectCluster" | "onEnterStadium">) {
  const [hover, setHover] = useState<ClusterCode | null>(null);
  const blocks = useMemo(
    () =>
      CLUSTER_KEYS.map((c, i) => {
        const a0 = -90 + i * SEGMENT + GAP / 2, a1 = a0 + SEGMENT - GAP;
        const w = TIERS.WARMUP, s = TIERS.SCOUTING;
        return {
          c,
          lower: standGeometry(w.r[0], w.r[1], w.h[0], w.h[1], a0, a1),
          upper: standGeometry(s.r[0], s.r[1], s.h[0], s.h[1], a0, a1),
          front: wallGeometry(w.r[0], 0, w.h[0], a0, a1),
          mid: wallGeometry(s.r[0], w.h[1], s.h[0], a0, a1),
          rows: [
            ...[0.25, 0.5, 0.75].map((f) => arc(w.r[0] + (w.r[1] - w.r[0]) * f, w.h[0] + (w.h[1] - w.h[0]) * f + 0.01, a0, a1)),
            ...[0.25, 0.5, 0.75].map((f) => arc(s.r[0] + (s.r[1] - s.r[0]) * f, s.h[0] + (s.h[1] - s.h[0]) * f + 0.01, a0, a1)),
          ],
          band: arc(s.r[1] + 0.05, s.h[1] + 0.03, a0 + 0.6, a1 - 0.6),
        };
      }),
    [],
  );
  const facade = useMemo(() => ({ wall: wallGeometry(OUTER_R, 0, ROOF_H, -90, 270, 128), rim: arc(OUTER_R, ROOF_H, -90, 270, 128) }), []);
  useEffect(
    () => () => {
      blocks.forEach((b) => [b.lower, b.upper, b.front, b.mid].forEach((g) => g.dispose()));
      facade.wall.dispose();
    },
    [blocks, facade],
  );
  useEffect(() => {
    document.body.style.cursor = hover ? "pointer" : "";
    return () => { document.body.style.cursor = ""; };
  }, [hover]);

  const sand = new THREE.Color(palette.ink).lerp(new THREE.Color(palette.muted), 0.3);
  return (
    <group>
      {blocks.map((b) => {
        const tint = palette.clusters[b.c];
        const active = view === "radar" && (cluster === b.c || hover === b.c);
        const dim = view === "radar" && cluster !== null && cluster !== b.c;
        const base = new THREE.Color(palette.surface).lerp(new THREE.Color(palette.muted), 0.18);
        const standColor = base.lerp(new THREE.Color(tint), active ? 0.3 : 0.12);
        const handlers = {
          onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(b.c); },
          onPointerOut: () => setHover((h) => (h === b.c ? null : h)),
          onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (view === "journey") onEnterStadium(); else onSelectCluster(b.c); },
        };
        return (
          <group key={b.c}>
            <mesh geometry={b.lower} {...handlers}>
              <meshStandardMaterial color={standColor} roughness={0.9} side={THREE.DoubleSide} transparent opacity={dim ? 0.45 : 1} />
            </mesh>
            <mesh geometry={b.upper} {...handlers}>
              <meshStandardMaterial color={standColor} roughness={0.9} side={THREE.DoubleSide} transparent opacity={dim ? 0.45 : 1} />
            </mesh>
            <mesh geometry={b.front}>
              <meshStandardMaterial color={palette.sunk} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={b.mid}>
              <meshStandardMaterial color={palette.sunk} side={THREE.DoubleSide} />
            </mesh>
            {b.rows.map((r, k) => (
              <Line key={k} points={r} color={palette.line} lineWidth={1} transparent opacity={dim ? 0.35 : 0.9} />
            ))}
            <Line points={b.band} color={tint} lineWidth={active ? 5 : 3} transparent opacity={dim ? 0.35 : 1} />
          </group>
        );
      })}
      {/* Fassade in Sand, außen hell wie ein Modell aus Ton */}
      {/* im Radar fast durchsichtig, damit die vorderen Ränge sichtbar bleiben */}
      <mesh geometry={facade.wall} onClick={(e) => { e.stopPropagation(); if (view === "journey") onEnterStadium(); }}>
        <meshStandardMaterial color={sand} roughness={0.85} side={THREE.DoubleSide} transparent opacity={view === "radar" ? 0.14 : 1} depthWrite={view !== "radar"} />
      </mesh>
      <Line points={facade.rim} color={palette.ink} lineWidth={1.4} />
      {/* Flutlichtmasten */}
      {[35, 145, 215, 325].map((a) => {
        const [x, , z] = polar(OUTER_R + 1.4, a, 0);
        return (
          <group key={a} position={[x, 0, z]}>
            <mesh position={[0, 5, 0]}>
              <cylinderGeometry args={[0.12, 0.16, 10, 8]} />
              <meshStandardMaterial color={sand} roughness={0.8} />
            </mesh>
            <mesh position={[0, 10.2, 0]} rotation={[0, -deg(a) - Math.PI / 2, 0.3]}>
              <boxGeometry args={[1.8, 0.9, 0.25]} />
              <meshStandardMaterial color={palette.ink} emissive={palette.ink} emissiveIntensity={0.9} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Pitch({ palette }: { palette: Palette }) {
  const disc = useMemo(() => {
    const g = new THREE.CircleGeometry(PITCH_R, 96);
    g.scale(SX, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useEffect(() => () => disc.dispose(), [disc]);
  const a = 5.4, b = 3.5, y = 0.015;
  const rect = (x0: number, z0: number, x1: number, z1: number): [number, number, number][] => [
    [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0],
  ];
  const circle = Array.from({ length: 49 }, (_, i) => {
    const t = (i / 48) * Math.PI * 2;
    return [Math.cos(t) * 0.95, y, Math.sin(t) * 0.95] as [number, number, number];
  });
  const lc = palette.pitchLine;
  return (
    <group>
      <mesh geometry={disc}>
        <meshStandardMaterial color={palette.pitch} roughness={1} />
      </mesh>
      <Line points={rect(-a, -b, a, b)} color={lc} lineWidth={1.2} />
      <Line points={[[0, y, -b], [0, y, b]]} color={lc} lineWidth={1.2} />
      <Line points={circle} color={lc} lineWidth={1.2} />
      <Line points={rect(-a, -1.6, -a + 1.3, 1.6)} color={lc} lineWidth={1.2} />
      <Line points={rect(a - 1.3, -1.6, a, 1.6)} color={lc} lineWidth={1.2} />
      <Line points={arc(PITCH_R, 0.02, 0, 360, 96)} color={palette.line} lineWidth={1.2} />
    </group>
  );
}

// ───────────── Trends ─────────────

interface Target { dot: [number, number, number]; ground: number; size: number }

interface DotProps {
  n: number;
  color: string;
  target: Target;
  state: "normal" | "dim" | "glow";
  pulse: boolean;
  selected: boolean;
  palette: Palette;
  registry: LabelRegistry;
  onHover: (n: number | null) => void;
  onSelect: (n: number) => void;
}

function Dot({ n, color, target, state, pulse, selected, palette, registry, onHover, onSelect }: DotProps) {
  const group = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const pin = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const goal = useMemo(() => new THREE.Vector3(...target.dot), [target]);
  const ground = useRef(target.ground);
  // Flugbahn: beim Ortswechsel ein Bogen nach oben statt einer geraden Linie
  const flight = useRef({ from: new THREE.Vector3(), t: 1, goal: null as THREE.Vector3 | null });

  useEffect(() => {
    const id = `t${n}`;
    registry.anchors.set(id, (out) => {
      if (!ball.current) return false;
      ball.current.getWorldPosition(out);
      out.y += target.size * ball.current.scale.x + 0.3;
      return true;
    });
    return () => { registry.anchors.delete(id); };
  }, [n, registry, target.size]);

  useFrame((s, dt) => {
    const g = group.current;
    if (!g) return;
    const f = flight.current;
    if (f.goal !== goal) {
      // neues Ziel: Flug von der aktuellen Position starten (beim ersten Bild ohne Flug)
      f.from.copy(g.position);
      f.t = f.goal ? 0 : 1;
      f.goal = goal;
    }
    const dist = f.from.distanceTo(goal);
    if (f.t < 1) {
      f.t = Math.min(1, f.t + dt / (dist > 12 ? 1.8 : 1.1));
      const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - (-2 * f.t + 2) ** 2 / 2; // easeInOutQuad
      g.position.lerpVectors(f.from, goal, e);
      g.position.y += Math.sin(Math.PI * e) * Math.min(14, dist * 0.35);
    } else {
      g.position.lerp(goal, 1 - Math.exp(-dt * 4));
    }
    ground.current += (target.ground - ground.current) * Math.min(1, dt * 3);
    if (pin.current) {
      const h = Math.max(0.01, g.position.y - ground.current);
      pin.current.scale.set(1, h, 1);
      pin.current.position.y = -h / 2;
    }
    const wantGlow = state === "glow" || selected ? 1.6 : state === "dim" ? 0.04 : 0.55;
    if (mat.current) {
      mat.current.emissiveIntensity += (wantGlow - mat.current.emissiveIntensity) * Math.min(1, dt * 5);
      const op = state === "dim" ? 0.2 : 1;
      mat.current.opacity += (op - mat.current.opacity) * Math.min(1, dt * 5);
    }
    if (ball.current) {
      const k = pulse ? 1 + 0.22 * Math.max(0, Math.sin(s.clock.elapsedTime * 2.6 + n)) : 1;
      const sel = selected ? 1.35 : 1;
      ball.current.scale.setScalar(ball.current.scale.x + (k * sel - ball.current.scale.x) * Math.min(1, dt * 8));
    }
  });

  return (
    <group ref={group} position={target.dot}>
      <mesh ref={pin} raycast={() => null}>
        <cylinderGeometry args={[0.014, 0.014, 1, 6]} />
        <meshBasicMaterial color={color} transparent opacity={state === "dim" ? 0.15 : 0.55} />
      </mesh>
      <mesh
        ref={ball}
        onPointerOver={(e) => { e.stopPropagation(); onHover(n); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = ""; }}
        onClick={(e) => { e.stopPropagation(); onSelect(n); }}
      >
        <sphereGeometry args={[target.size, 28, 28]} />
        <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0.55} roughness={0.35} transparent />
      </mesh>
      {selected && (
        <Billboard>
          <mesh>
            <ringGeometry args={[target.size * 1.7, target.size * 1.95, 48]} />
            <meshBasicMaterial color={palette.ink} transparent opacity={0.9} />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}

// ───────────── Kamera ─────────────

function Rig({ shot, autoRotate, view }: { shot: CameraShot; autoRotate: boolean; view: View }) {
  const ref = useRef<CameraControls>(null);
  const idle = useRef(0);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const fitted = useMemo(() => fitShot(shot, aspect), [shot, aspect]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    idle.current = -2.5; // nach einer Kamerafahrt kurz warten, bevor die Drehung einsetzt
    void c.setLookAt(...fitted.position, ...fitted.target, true);
  }, [fitted]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const stop = () => { idle.current = -6; };
    c.addEventListener("controlstart", stop);
    return () => c.removeEventListener("controlstart", stop);
  }, []);
  useFrame((_, dt) => {
    const c = ref.current;
    if (!c || !autoRotate) return;
    idle.current += dt;
    if (idle.current > 0 && !c.active) void c.rotate(dt * (view === "journey" ? 0.02 : 0.035), 0, false);
  });
  return (
    <CameraControls
      ref={ref}
      makeDefault
      smoothTime={0.95}
      minDistance={5}
      maxDistance={view === "journey" ? 160 : 90}
      minPolarAngle={0.12}
      maxPolarAngle={1.3}
      dollySpeed={0.4}
      truckSpeed={0}
    />
  );
}

// ───────────── Szene ─────────────

function useTargets(data: RadarData, pos: Positions, persp: Perspective, view: View) {
  return useMemo(() => {
    const out: Record<number, Target> = {};
    const byStage = new Map<StageKey, number[]>();
    for (const t of data.trends) {
      const k = stageOf(t.number);
      if (!byStage.has(k)) byStage.set(k, []);
      byStage.get(k)!.push(t.number);
    }
    for (const t of data.trends) {
      const radar = dotPosition(pos[persp][t.number]);
      const k = stageOf(t.number);
      if (view === "journey" && k !== "stadion") {
        const group = byStage.get(k)!.sort((a, b) => pos[persp][b].total - pos[persp][a].total || a - b);
        const stage = STAGES.find((s) => s.key === k)!;
        const spot = journeySpot(stage, group.indexOf(t.number), group.length);
        out[t.number] = { dot: spot.dot, ground: spot.ground, size: radar.size * 1.25 };
      } else {
        out[t.number] = { dot: radar.dot, ground: radar.base[1], size: radar.size };
      }
    }
    return out;
  }, [data, pos, persp, view]);
}

function World(p: SceneProps & { registry: LabelRegistry; targets: Record<number, Target> }) {
  const { data, palette, cluster, selected, highlight, pulse, view, targets, registry } = p;
  const fog: [number, number] = view === "journey" ? [95, 210] : [45, 110];
  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.bg, ...fog]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[-20, 40, 25]} intensity={1.15} color={palette.ink} />
      <hemisphereLight args={[palette.ink, palette.bg, 0.3]} />
      <City palette={palette} />
      <Places palette={palette} active={p.place} onSelect={p.onSelectPlace} />
      <Pitch palette={palette} />
      <Stands palette={palette} cluster={cluster} view={view} onSelectCluster={p.onSelectCluster} onEnterStadium={p.onEnterStadium} />
      {data.trends.map((t) => {
        const inScope = view === "radar" ? !cluster || t.cluster === cluster : !p.place || stageOf(t.number) === p.place;
        const state = highlight ? (highlight.has(t.number) ? "glow" : "dim") : inScope ? "normal" : "dim";
        return (
          <Dot
            key={t.number}
            n={t.number}
            color={palette.clusters[t.cluster]}
            target={targets[t.number]}
            state={state}
            pulse={pulse.has(t.number)}
            selected={selected === t.number}
            palette={palette}
            registry={registry}
            onHover={p.onHover}
            onSelect={p.onSelectTrend}
          />
        );
      })}
      <Projector registry={registry} />
      <Rig shot={p.shot} autoRotate={p.autoRotate} view={view} />
    </>
  );
}

/** Beschriftungen und Marken als HTML über der Szene */
function Overlay(p: SceneProps & { registry: LabelRegistry }) {
  const { data, pos, persp, palette, view, cluster, place, selected, hovered, labelled, registry, showMarkers } = p;
  const counts = useMemo(() => {
    const c = new Map<StageKey, number>();
    for (const t of data.trends) c.set(stageOf(t.number), (c.get(stageOf(t.number)) ?? 0) + 1);
    return c;
  }, [data]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={false}>
      {showMarkers && view === "radar" &&
        data.clusters.map((c) => (
          <button
            key={c.code}
            ref={labelRef(registry, `c${c.code}`)}
            type="button"
            className={`stadium-cluster stadium-anchor ${cluster === c.code ? "is-active" : ""} ${cluster && cluster !== c.code ? "is-dim" : ""}`}
            style={{ "--tint": palette.clusters[c.code] } as React.CSSProperties}
            onClick={() => p.onSelectCluster(c.code)}
            aria-label={`Tribüne ${c.code}: ${c.name}`}
          >
            <span className="num">{c.code}</span>
            <span className="stadium-cluster-name">{c.name}</span>
          </button>
        ))}
      {showMarkers && view === "journey" &&
        STAGES.filter((s) => s.key !== place).map((s) => (
          <button
            key={s.key}
            ref={labelRef(registry, `p${s.key}`)}
            type="button"
            className={`stadium-place stadium-anchor ${place === s.key ? "is-active" : ""} ${place && place !== s.key ? "is-dim" : ""}`}
            onClick={() => p.onSelectPlace(s.key)}
            aria-label={`${s.name}: ${counts.get(s.key) ?? 0} Trends`}
          >
            <span className="stadium-place-icon" aria-hidden>{s.icon}</span>
            <span className="flex flex-col items-start leading-tight">
              <b>{s.name}</b>
              <small>{counts.get(s.key) ?? 0} Trends</small>
            </span>
          </button>
        ))}
      {data.trends.map((t) => {
        const mode = hovered === t.number ? "teaser" : labelled.has(t.number) || selected === t.number ? "short" : "none";
        const v = pos[persp][t.number];
        return (
          <div
            key={t.number}
            ref={labelRef(registry, `t${t.number}`)}
            className={`stadium-label stadium-anchor ${mode === "teaser" ? "is-teaser" : ""} ${mode === "none" ? "is-hidden" : ""}`}
            aria-hidden
          >
            <span>
              <span className="num">{t.number}</span> {t.name}
            </span>
            {mode === "teaser" && <small>{data.zones[v.zone].name} · {fmt(v.total)}</small>}
          </div>
        );
      })}
    </div>
  );
}

export default function StadiumScene(props: SceneProps) {
  const [registry] = useState(createRegistry);
  const targets = useTargets(props.data, props.pos, props.persp, props.view);

  // statische Anker: Tribünen und Orte
  useEffect(() => {
    for (const c of CLUSTER_KEYS) {
      const [x, y, z] = polar(OUTER_R + 0.9, clusterAngle(c), ROOF_H + 0.6);
      registry.anchors.set(`c${c}`, (out) => (out.set(x, y, z), true));
    }
    for (const s of STAGES) {
      const y = s.key === "stadion" ? ROOF_H + 6 : s.height + 5.5;
      registry.anchors.set(`p${s.key}`, (out) => (out.set(s.at[0], y, s.key === "stadion" ? -2 : s.at[1]), true));
    }
  }, [registry]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [4, 62, 78], fov: 38, near: 0.1, far: 400 }}
        gl={{ antialias: true }}
        onPointerMissed={props.onBackground}
        fallback={<p className="p-8 text-muted">3D wird von diesem Browser nicht unterstützt. Bitte die 2D-Ansicht nutzen.</p>}
        aria-label="3D-Stadion mit Region und allen Trends"
      >
        <World {...props} registry={registry} targets={targets} />
      </Canvas>
      <Overlay {...props} registry={registry} />
    </div>
  );
}
