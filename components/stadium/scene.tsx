"use client";

import { Billboard, CameraControls, Html, Line } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CLUSTER_KEYS, type ClusterCode, type Perspective } from "@/lib/scoring";
import type { RadarData } from "@/lib/radar/types";
import type { Positions } from "@/lib/radar/view";
import {
  OUTER_R, PITCH_R, ROOF_H, SEGMENT, SX, TIERS, clusterAngle, dotPosition, fitShot, polar, type CameraShot,
} from "@/lib/stadium/geometry";

export interface Palette {
  bg: string; surface: string; sunk: string; line: string; ink: string; muted: string;
  pitch: string; pitchLine: string; accent: string;
  clusters: Record<string, string>;
}

export interface SceneProps {
  data: RadarData;
  pos: Positions;
  persp: Perspective;
  palette: Palette;
  shot: CameraShot;
  cluster: ClusterCode | null;
  selected: number | null;
  hovered: number | null;
  /** hervorgehobene Trends (Tour); null = keine Hervorhebung */
  highlight: Set<number> | null;
  /** Trends mit Neugier-Signal */
  pulse: Set<number>;
  /** Nummern, deren Beschriftung dauerhaft sichtbar ist */
  labelled: Set<number>;
  autoRotate: boolean;
  onHover: (n: number | null) => void;
  onSelectTrend: (n: number) => void;
  onSelectCluster: (c: ClusterCode) => void;
  onBackground: () => void;
}

const deg = (d: number) => (d * Math.PI) / 180;

// ───────────── Geometrie der Tribünen ─────────────

/** ansteigender Tribünenblock zwischen zwei Winkeln */
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

/** senkrechte Wand auf einem Radius */
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

/** Linie entlang der Ellipse (für Sitzreihen, Ränder) */
function arc(r: number, y: number, a0: number, a1: number, steps = 24): [number, number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => polar(r, a0 + ((a1 - a0) * i) / steps, y));
}

const GAP = 1.6; // Gang zwischen zwei Blöcken in Grad

function Stands({ palette, cluster, onSelectCluster }: Pick<SceneProps, "palette" | "cluster" | "onSelectCluster">) {
  const [hover, setHover] = useState<ClusterCode | null>(null);
  const blocks = useMemo(
    () =>
      CLUSTER_KEYS.map((c, i) => {
        const a0 = -90 + i * SEGMENT + GAP / 2, a1 = a0 + SEGMENT - GAP;
        const w = TIERS.WARMUP, s = TIERS.SCOUTING;
        return {
          c, a0, a1,
          lower: standGeometry(w.r[0], w.r[1], w.h[0], w.h[1], a0, a1),
          upper: standGeometry(s.r[0], s.r[1], s.h[0], s.h[1], a0, a1),
          front: wallGeometry(w.r[0], 0, w.h[0], a0, a1),
          mid: wallGeometry(s.r[0], w.h[1], s.h[0], a0, a1),
          back: wallGeometry(OUTER_R, 0, ROOF_H, a0, a1),
          rows: [
            ...[0.25, 0.5, 0.75].map((f) => arc(w.r[0] + (w.r[1] - w.r[0]) * f, w.h[0] + (w.h[1] - w.h[0]) * f + 0.01, a0, a1)),
            ...[0.25, 0.5, 0.75].map((f) => arc(s.r[0] + (s.r[1] - s.r[0]) * f, s.h[0] + (s.h[1] - s.h[0]) * f + 0.01, a0, a1)),
          ],
          rim: arc(OUTER_R, ROOF_H, a0, a1),
          band: arc(s.r[1] + 0.05, s.h[1] + 0.03, a0 + 0.6, a1 - 0.6),
        };
      }),
    [],
  );
  useEffect(() => () => blocks.forEach((b) => [b.lower, b.upper, b.front, b.mid, b.back].forEach((g) => g.dispose())), [blocks]);
  useEffect(() => {
    document.body.style.cursor = hover ? "pointer" : "";
    return () => { document.body.style.cursor = ""; };
  }, [hover]);

  return (
    <group>
      {blocks.map((b) => {
        const tint = palette.clusters[b.c];
        const active = cluster === b.c || hover === b.c;
        const dim = cluster !== null && cluster !== b.c;
        const standColor = new THREE.Color(palette.surface).lerp(new THREE.Color(tint), active ? 0.28 : 0.1);
        const handlers = {
          onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(b.c); },
          onPointerOut: () => setHover((h) => (h === b.c ? null : h)),
          onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelectCluster(b.c); },
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
            <mesh geometry={b.back}>
              <meshStandardMaterial color={palette.sunk} side={THREE.DoubleSide} transparent opacity={0.55} />
            </mesh>
            {b.rows.map((r, k) => (
              <Line key={k} points={r} color={palette.line} lineWidth={1} transparent opacity={dim ? 0.35 : 0.9} />
            ))}
            <Line points={b.rim} color={palette.line} lineWidth={1.2} />
            <Line points={b.band} color={tint} lineWidth={active ? 5 : 3} transparent opacity={dim ? 0.35 : 1} />
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
      <mesh geometry={disc} receiveShadow>
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

interface DotProps {
  n: number;
  name: string;
  color: string;
  target: { base: [number, number, number]; dot: [number, number, number]; size: number };
  state: "normal" | "dim" | "glow";
  pulse: boolean;
  selected: boolean;
  label: "none" | "short" | "teaser";
  teaser?: string;
  palette: Palette;
  onHover: (n: number | null) => void;
  onSelect: (n: number) => void;
}

function Dot({ n, name, color, target, state, pulse, selected, label, teaser, palette, onHover, onSelect }: DotProps) {
  const group = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const goal = useMemo(() => new THREE.Vector3(...target.base), [target]);
  const lift = target.dot[1] - target.base[1];

  useFrame((s, dt) => {
    const g = group.current;
    if (!g) return;
    g.position.lerp(goal, 1 - Math.exp(-dt * 2.6));
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
    <group ref={group} position={target.base}>
      <mesh position={[0, lift / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, lift, 6]} />
        <meshBasicMaterial color={color} transparent opacity={state === "dim" ? 0.15 : 0.6} />
      </mesh>
      <mesh
        ref={ball}
        position={[0, lift, 0]}
        onPointerOver={(e) => { e.stopPropagation(); onHover(n); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = ""; }}
        onClick={(e) => { e.stopPropagation(); onSelect(n); }}
      >
        <sphereGeometry args={[target.size, 28, 28]} />
        <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0.55} roughness={0.35} transparent />
      </mesh>
      {selected && (
        <Billboard position={[0, lift, 0]}>
          <mesh>
            <ringGeometry args={[target.size * 1.7, target.size * 1.95, 48]} />
            <meshBasicMaterial color={palette.ink} transparent opacity={0.9} />
          </mesh>
        </Billboard>
      )}
      {/* immer gemountet und per CSS ein-/ausgeblendet: vermeidet Mount/Unmount von Html-Wurzeln während des Renderns */}
      <Html position={[0, lift + target.size + 0.18, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div className={`stadium-label ${label === "teaser" ? "is-teaser" : ""} ${label === "none" ? "is-hidden" : ""}`} aria-hidden={label === "none"}>
          <span className="num">{n}</span> {name}
          {label === "teaser" && teaser && <small>{teaser}</small>}
        </div>
      </Html>
    </group>
  );
}

// ───────────── Kamera ─────────────

function Rig({ shot, autoRotate }: { shot: CameraShot; autoRotate: boolean }) {
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
    if (idle.current > 0 && !c.active) void c.rotate(dt * 0.035, 0, false);
  });
  return (
    <CameraControls
      ref={ref}
      makeDefault
      smoothTime={0.85}
      minDistance={5}
      maxDistance={90}
      minPolarAngle={0.12}
      maxPolarAngle={1.32}
      dollySpeed={0.4}
      truckSpeed={0}
    />
  );
}

// ───────────── Szene ─────────────

function ClusterLabels({ data, palette, cluster, onSelectCluster }: Pick<SceneProps, "data" | "palette" | "cluster" | "onSelectCluster">) {
  return (
    <>
      {data.clusters.map((c) => (
        <Html key={c.code} position={polar(OUTER_R + 0.9, clusterAngle(c.code), ROOF_H)} center zIndexRange={[30, 10]}>
          <button
            type="button"
            className={`stadium-cluster ${cluster === c.code ? "is-active" : ""} ${cluster && cluster !== c.code ? "is-dim" : ""}`}
            style={{ "--tint": palette.clusters[c.code] } as React.CSSProperties}
            onClick={() => onSelectCluster(c.code)}
            aria-label={`Tribüne ${c.code}: ${c.name}`}
          >
            <span className="num">{c.code}</span>
            <span className="stadium-cluster-name">{c.name}</span>
          </button>
        </Html>
      ))}
    </>
  );
}

function World(p: SceneProps) {
  const { data, pos, persp, palette, cluster, selected, hovered, highlight, pulse, labelled } = p;
  const targets = useMemo(() => {
    const out: Record<number, ReturnType<typeof dotPosition>> = {};
    for (const t of data.trends) out[t.number] = dotPosition(pos[persp][t.number]);
    return out;
  }, [data, pos, persp]);

  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.bg, 45, 110]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 18, 10]} intensity={1.1} />
      <hemisphereLight args={[palette.ink, palette.bg, 0.25]} />
      <Pitch palette={palette} />
      <Stands palette={palette} cluster={cluster} onSelectCluster={p.onSelectCluster} />
      <ClusterLabels data={data} palette={palette} cluster={cluster} onSelectCluster={p.onSelectCluster} />
      {data.trends.map((t) => {
        const inCluster = !cluster || t.cluster === cluster;
        const state = highlight ? (highlight.has(t.number) ? "glow" : "dim") : inCluster ? "normal" : "dim";
        const label = hovered === t.number ? "teaser" : labelled.has(t.number) || selected === t.number ? "short" : "none";
        return (
          <Dot
            key={t.number}
            n={t.number}
            name={t.name}
            color={palette.clusters[t.cluster]}
            target={targets[t.number]}
            state={state}
            pulse={pulse.has(t.number)}
            selected={selected === t.number}
            label={label}
            teaser={`${data.zones[pos[persp][t.number].zone].name} · ${pos[persp][t.number].total.toFixed(2).replace(".", ",")}`}
            palette={palette}
            onHover={p.onHover}
            onSelect={p.onSelectTrend}
          />
        );
      })}
      <Rig shot={p.shot} autoRotate={p.autoRotate} />
    </>
  );
}

export default function StadiumScene(props: SceneProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [-2.4, 28, 33], fov: 38, near: 0.1, far: 120 }}
      gl={{ antialias: true }}
      onPointerMissed={props.onBackground}
      fallback={<p className="p-8 text-muted">3D wird von diesem Browser nicht unterstützt. Bitte die 2D-Ansicht nutzen.</p>}
      aria-label="3D-Stadion mit allen Trends"
    >
      <World {...props} />
    </Canvas>
  );
}

