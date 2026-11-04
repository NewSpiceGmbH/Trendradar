"use client";

import { Edges, Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OUTER_R, SX } from "@/lib/stadium/geometry";
import { STAGE, STAGES, type StageKey } from "@/lib/stadium/journey";
import type { Palette } from "./scene";

/**
 * Stilisierte Region um das Stadion: Häuserblöcke (instanziert), Ringstraße, Bahnlinie und die Orte der
 * Customer Journey als hellere „Ton-Modelle“. Farben ausschließlich aus den CI-Tokens.
 */

// deterministischer Zufall, damit die Stadt bei jedem Laden gleich aussieht
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const CELL = 6.2;
const EXTENT_X = 96, EXTENT_Z = 66;

function blocked(x: number, z: number) {
  // Stadion mit Ringstraße und Vorplatz
  if ((x / (OUTER_R * SX + 9)) ** 2 + (z / (OUTER_R + 9)) ** 2 < 1) return true;
  if (Math.abs(x) < 9 && z > 10 && z < 30) return true;
  // Orte freihalten
  for (const s of STAGES) {
    if (s.key === "stadion" || s.key === "einlass") continue;
    if (Math.hypot(x - s.at[0], z - s.at[1]) < 12) return true;
  }
  // Bahnlinie
  if (Math.abs(z - (-22 + (x + 34) * 0.08)) < 3.2 && x < -20) return true;
  return false;
}

function Blocks({ palette }: { palette: Palette }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const r = rng(7);
    const out: { x: number; z: number; w: number; d: number; h: number }[] = [];
    for (let x = -EXTENT_X; x <= EXTENT_X; x += CELL) {
      for (let z = -EXTENT_Z; z <= EXTENT_Z; z += CELL) {
        // Hauptstraßen alle drei Zellen frei lassen
        if (Math.round(x / CELL) % 4 === 0 || Math.round(z / CELL) % 3 === 0) continue;
        const jx = x + (r() - 0.5) * 1.2, jz = z + (r() - 0.5) * 1.2;
        if (blocked(jx, jz)) continue;
        const dist = Math.hypot(jx / 1.4, jz);
        const h = 0.6 + r() * (dist < 45 ? 3.2 : 1.6);
        out.push({ x: jx, z: jz, w: CELL * (0.55 + r() * 0.3), d: CELL * (0.55 + r() * 0.3), h });
      }
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    items.forEach((b, i) => {
      o.position.set(b.x, b.h / 2, b.z);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [items]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} raycast={() => null}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={new THREE.Color(palette.surface).lerp(new THREE.Color(palette.line), 0.5)} roughness={0.95} />
    </instancedMesh>
  );
}

function Ground({ palette }: { palette: Palette }) {
  const ring = useMemo(() => {
    const g = new THREE.RingGeometry(OUTER_R + 1.5, OUTER_R + 6, 96);
    g.scale(SX, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useEffect(() => () => ring.dispose(), [ring]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} raycast={() => null}>
        <planeGeometry args={[260, 200]} />
        <meshStandardMaterial color={palette.bg} roughness={1} />
      </mesh>
      {/* Ringstraße */}
      <mesh geometry={ring} position={[0, 0.01, 0]} raycast={() => null}>
        <meshStandardMaterial color={palette.sunk} roughness={1} />
      </mesh>
    </group>
  );
}

/**
 * Mattiertes Glas für die Orte: durchscheinend, mit Klarlack-Reflex. Lebt von der Umgebung (Lightformer in scene.tsx).
 */
export function Glass({ tint, strength = 1 }: { tint: string; strength?: number }) {
  return (
    <meshPhysicalMaterial
      color={tint}
      transmission={0.72 * strength}
      roughness={0.36}
      thickness={2.2}
      ior={1.35}
      clearcoat={1}
      clearcoatRoughness={0.06}
      attenuationColor={tint}
      attenuationDistance={14}
      envMapIntensity={2.6}
    />
  );
}

/** feine Lichtkante an Glaskörpern */
export function GlassEdge({ color }: { color: string }) {
  return <Edges threshold={20} color={color} transparent opacity={0.55} />;
}

/** Helle Bauteile der Orte */
function Clay({ position, size, color, onClick }: { position: [number, number, number]; size: [number, number, number]; color: string; onClick?: () => void }) {
  return (
    <mesh
      position={[position[0], position[1] + size[1] / 2, position[2]]}
      onClick={onClick ? (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); } : undefined}
      onPointerOver={onClick ? (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={onClick ? () => { document.body.style.cursor = ""; } : undefined}
    >
      <boxGeometry args={size} />
      <Glass tint={color} />
      <GlassEdge color={color} />
    </mesh>
  );
}

function Glow({ at, radius, active, palette }: { at: [number, number]; radius: number; active: boolean; palette: Palette }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.55, "rgba(255,255,255,0.25)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[at[0], 0.03, at[1]]} raycast={() => null}>
      <circleGeometry args={[radius, 48]} />
      <meshBasicMaterial map={tex} color={active ? palette.accent : palette.ink} transparent opacity={active ? 0.55 : 0.14} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

export function Places({ palette, active, onSelect }: { palette: Palette; active: StageKey | null; onSelect: (k: StageKey) => void }) {
  const ink = palette.ink, sand = new THREE.Color(palette.ink).lerp(new THREE.Color(palette.muted), 0.35).getStyle();
  const z = STAGE.zuhause.at, a = STAGE.anreise.at, r = STAGE.region.at, e = STAGE.einlass.at, k = STAGE.kulissen.at;

  const houses = useMemo(() => {
    const rr = rng(3);
    return Array.from({ length: 9 }, (_, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      return { x: z[0] - 6 + col * 6 + (rr() - 0.5), z: z[1] - 5 + row * 5 + (rr() - 0.5), h: 1.4 + rr() * 0.8 };
    });
  }, [z]);
  const panels = useMemo(() => Array.from({ length: 24 }, (_, i) => ({ x: k[0] - 7 + (i % 6) * 2.4, z: k[1] - 2 + Math.floor(i / 6) * 2 })), [k]);

  return (
    <group>
      {STAGES.filter((s) => s.key !== "stadion").map((s) => (
        <Glow key={s.key} at={s.at} radius={s.key === "einlass" ? 9 : 12} active={active === s.key} palette={palette} />
      ))}

      {/* Zuhause: Wohnviertel mit Satteldächern */}
      {houses.map((h, i) => (
        <group key={i} position={[h.x, 0, h.z]} onClick={(ev) => { ev.stopPropagation(); onSelect("zuhause"); }}>
          <mesh position={[0, h.h / 2, 0]}>
            <boxGeometry args={[3, h.h, 2.6]} />
            <Glass tint={i % 2 ? ink : sand} />
            <GlassEdge color={ink} />
          </mesh>
          <mesh position={[0, h.h + 0.55, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1.55, 1, 1.35]}>
            <coneGeometry args={[1.5, 1.1, 4]} />
            <Glass tint={sand} />
          </mesh>
        </group>
      ))}

      {/* Anreise & Parken: Bahnhofshalle, Gleise, Parkhaus mit Ladesäulen */}
      <group onClick={(ev) => { ev.stopPropagation(); onSelect("anreise"); }}>
        <Clay position={[a[0] - 2, 0, a[1]]} size={[12, 2.2, 4]} color={ink} />
        <mesh position={[a[0] - 2, 2.2, a[1]]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[2, 2, 12, 24, 1, false, 0, Math.PI]} />
          <Glass tint={sand} />
        </mesh>
        {/* Parkhaus: vier Ebenen */}
        {[0, 1, 2, 3].map((l) => (
          <Clay key={l} position={[a[0] + 8, l * 1.05, a[1] + 6]} size={[7, 0.25, 6]} color={l % 2 ? sand : ink} />
        ))}
        {[[-3.2, -2.7], [3.2, -2.7], [-3.2, 2.7], [3.2, 2.7]].map(([dx, dz], i) => (
          <Clay key={i} position={[a[0] + 8 + dx, 0, a[1] + 6 + dz]} size={[0.4, 3.4, 0.4]} color={sand} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[a[0] + 5.2 + i * 1.4, 0.55, a[1] + 10.4]}>
            <boxGeometry args={[0.35, 1.1, 0.35]} />
            <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.35} roughness={0.6} />
          </mesh>
        ))}
      </group>
      <Line points={[[-110, 0.06, -22 + (-110 + 34) * 0.08 - 0.6], [a[0] + 5, 0.06, a[1] - 0.6]]} color={palette.muted} lineWidth={1.5} />
      <Line points={[[-110, 0.06, -22 + (-110 + 34) * 0.08 + 0.6], [a[0] + 5, 0.06, a[1] + 0.6]]} color={palette.muted} lineWidth={1.5} />
      {/* Weg vom Bahnhof zum Stadion */}
      <Line points={[[a[0] + 5, 0.07, a[1] + 2], [-20, 0.07, -12], [-13, 0.07, -6]]} color={palette.ink} lineWidth={1.2} dashed dashSize={0.8} gapSize={0.6} transparent opacity={0.55} />

      {/* Region & Hotel: Turm mit Sockel, daneben Fanzone */}
      <group onClick={(ev) => { ev.stopPropagation(); onSelect("region"); }}>
        <Clay position={[r[0], 0, r[1]]} size={[8, 1.6, 6]} color={sand} />
        <Clay position={[r[0] - 1, 1.6, r[1]]} size={[4, 7.6, 4]} color={ink} />
        <Clay position={[r[0] + 4.5, 0, r[1] + 5]} size={[5, 2.6, 3.4]} color={sand} />
        <mesh position={[r[0] - 6, 0.1, r[1] + 5]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[2.6, 32]} />
          <Glass tint={sand} />
        </mesh>
      </group>

      {/* Vorplatz & Einlass: Platz mit Toren */}
      <group onClick={(ev) => { ev.stopPropagation(); onSelect("einlass"); }}>
        <mesh position={[e[0], 0.04, e[1]]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[16, 9]} />
          <meshStandardMaterial color={palette.sunk} roughness={1} />
        </mesh>
        {[-5, -1.7, 1.7, 5].map((dx) => (
          <group key={dx}>
            <Clay position={[e[0] + dx - 1, 0, e[1] - 2]} size={[0.35, 2.4, 0.35]} color={ink} />
            <Clay position={[e[0] + dx + 1, 0, e[1] - 2]} size={[0.35, 2.4, 0.35]} color={ink} />
            <Clay position={[e[0] + dx, 2.4, e[1] - 2]} size={[2.4, 0.3, 0.4]} color={sand} />
          </group>
        ))}
      </group>

      {/* Hinter den Kulissen: Solarfeld, Batteriespeicher, Windrad */}
      <group onClick={(ev) => { ev.stopPropagation(); onSelect("kulissen"); }}>
        {panels.map((p, i) => (
          <mesh key={i} position={[p.x, 0.55, p.z]} rotation={[-0.5, 0, 0]}>
            <boxGeometry args={[2, 0.08, 1.4]} />
            <meshStandardMaterial color={palette.line} roughness={0.35} metalness={0.3} />
          </mesh>
        ))}
        {[0, 1, 2].map((i) => (
          <Clay key={i} position={[k[0] + 8, 0, k[1] - 3 + i * 2.6]} size={[3.2, 1.6, 2]} color={sand} />
        ))}
        <Clay position={[k[0] - 9, 0, k[1] - 6]} size={[0.35, 9, 0.35]} color={ink} />
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[k[0] - 9, 9, k[1] - 5.8]} rotation={[0, 0, (i * Math.PI * 2) / 3]}>
            <boxGeometry args={[0.25, 4.2, 0.08]} />
            <Glass tint={ink} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function City({ palette }: { palette: Palette }) {
  return (
    <group>
      <Ground palette={palette} />
      <Blocks palette={palette} />
    </group>
  );
}
