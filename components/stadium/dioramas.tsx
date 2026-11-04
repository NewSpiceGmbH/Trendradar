"use client";

import { Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { OUTER_R, TIERS, polar } from "@/lib/stadium/geometry";
import { STAGE } from "@/lib/stadium/journey";
import { USE_CASE, type UseCaseKey } from "@/lib/stadium/usecases";
import { Glass, GlassEdge } from "./city";
import type { Palette } from "./scene";

/**
 * Begehbare Use-Case-Szenen (Verkaufsstand, VIP-Lounge) und ihre Marken im Stadion.
 * Maßstab der Dioramen ≈ Meter. Jeder Hotspot ist anklickbar und verweist auf einen Trend.
 */

type V3 = [number, number, number];

const click = (fn: () => void) => (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); fn(); };

function useCursor(on: boolean) {
  useEffect(() => {
    document.body.style.cursor = on ? "pointer" : "";
    return () => { document.body.style.cursor = ""; };
  }, [on]);
}

function Box({ at, size, tint, edge }: { at: V3; size: V3; tint: string; edge?: string }) {
  return (
    <mesh position={at}>
      <boxGeometry args={size} />
      <Glass tint={tint} />
      {edge && <GlassEdge color={edge} />}
    </mesh>
  );
}

function Matte({ at, size, color, emissive = 0 }: { at: V3; size: V3; color: string; emissive?: number }) {
  return (
    <mesh position={at}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} roughness={0.6} />
    </mesh>
  );
}

/** Leuchtfläche unter einem Hotspot; heller bei Hover und Auswahl */
function HotGlow({ at, color, level }: { at: V3; color: string; level: 0 | 1 | 2 }) {
  return (
    <mesh position={[at[0], 0.02, at[2]]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.55, 0.95, 48]} />
      <meshBasicMaterial color={color} transparent opacity={[0.25, 0.6, 0.95][level]} depthWrite={false} />
    </mesh>
  );
}

interface HotProps {
  id: string;
  at: V3;
  color: string;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}

function Hot({ at, color, selected, onSelect, children }: HotProps) {
  const [hover, setHover] = useState(false);
  useCursor(hover);
  return (
    <group
      onClick={click(onSelect)}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
      onPointerOut={() => setHover(false)}
    >
      {children}
      <HotGlow at={at} color={color} level={selected ? 2 : hover ? 1 : 0} />
    </group>
  );
}

export interface DioramaProps {
  palette: Palette;
  /** Clusterfarbe je Trendnummer */
  colorOf: (n: number) => string;
  selected: number | null;
  onSelectTrend: (n: number) => void;
}

// ───────────── Pfandautomat (auch rund ums Stadion) ─────────────

export function Pfandautomat({ palette, at, scale = 1, onClick }: { palette: Palette; at: V3; scale?: number; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  useCursor(hover && !!onClick);
  const sand = new THREE.Color(palette.ink).lerp(new THREE.Color(palette.muted), 0.3).getStyle();
  return (
    <group
      position={at}
      scale={scale}
      onClick={onClick ? click(onClick) : undefined}
      onPointerOver={onClick ? (e) => { e.stopPropagation(); setHover(true); } : undefined}
      onPointerOut={onClick ? () => setHover(false) : undefined}
    >
      <Box at={[0, 1, 0]} size={[1, 2, 0.8]} tint={sand} edge={palette.ink} />
      {/* Einwurf */}
      <mesh position={[0, 1.15, 0.41]}>
        <torusGeometry args={[0.2, 0.05, 12, 32]} />
        <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={hover ? 1.2 : 0.6} />
      </mesh>
      <mesh position={[0, 1.15, 0.405]}>
        <circleGeometry args={[0.18, 32]} />
        <meshStandardMaterial color={palette.bg} />
      </mesh>
      {/* Display */}
      <mesh position={[0, 1.65, 0.41]}>
        <planeGeometry args={[0.6, 0.32]} />
        <meshStandardMaterial color={palette.ink} emissive={palette.ink} emissiveIntensity={0.8} />
      </mesh>
      <Matte at={[0, 0.55, 0.41]} size={[0.5, 0.06, 0.04]} color={palette.line} />
    </group>
  );
}

/** Automaten am Ring und auf dem Vorplatz (Journey) */
export function PfandRing({ palette, onOpen }: { palette: Palette; onOpen: () => void }) {
  const spots = useMemo(() => {
    const ring = [20, 70, 112, 160, 250, 300].map((a) => polar(OUTER_R + 3.8, a, 0));
    const e = STAGE.einlass.at;
    return [...ring, [e[0] - 7, 0, e[1] + 2] as V3, [e[0] + 7, 0, e[1] + 2] as V3];
  }, []);
  return (
    <group>
      {spots.map((p, i) => (
        <Pfandautomat key={i} palette={palette} at={p} scale={0.9} onClick={onOpen} />
      ))}
    </group>
  );
}

// ───────────── Marken im Radar: Logen und Verkaufsstand ─────────────

export function StadiumMarkers({ palette, onOpen }: { palette: Palette; onOpen: (k: UseCaseKey) => void }) {
  const [hover, setHover] = useState<UseCaseKey | null>(null);
  useCursor(hover !== null);
  const w = TIERS.WARMUP.h[1], s = TIERS.SCOUTING.h[0];
  const boxes = useMemo(() => Array.from({ length: 9 }, (_, i) => 162 + i * 4.5), []);
  const kiosk = USE_CASE.kiosk.marker;
  return (
    <group>
      {/* gläserne Logen auf der Haupttribüne */}
      <group
        onClick={click(() => onOpen("lounge"))}
        onPointerOver={(e) => { e.stopPropagation(); setHover("lounge"); }}
        onPointerOut={() => setHover(null)}
      >
        {boxes.map((a) => {
          const [x, , z] = polar(9.2, a, 0);
          return (
            <mesh key={a} position={[x, (w + s) / 2, z]} rotation-y={-((a + 90) * Math.PI) / 180}>
              <boxGeometry args={[0.95, s - w - 0.06, 0.45]} />
              <meshStandardMaterial
                color={palette.ink}
                emissive={palette.ink}
                emissiveIntensity={hover === "lounge" ? 0.9 : 0.35}
                transparent
                opacity={0.85}
              />
            </mesh>
          );
        })}
      </group>
      {/* Verkaufsstand im Umlauf */}
      <group
        position={[kiosk[0], w + 0.02, kiosk[2]]}
        rotation-y={-((64 + 90) * Math.PI) / 180}
        onClick={click(() => onOpen("kiosk"))}
        onPointerOver={(e) => { e.stopPropagation(); setHover("kiosk"); }}
        onPointerOut={() => setHover(null)}
      >
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[1.3, 0.64, 0.42]} />
          <meshStandardMaterial color={palette.ink} emissive={palette.ink} emissiveIntensity={hover === "kiosk" ? 1 : 0.45} />
        </mesh>
      </group>
    </group>
  );
}

// ───────────── Diorama: Verkaufsstand ─────────────

export function Kiosk({ palette, colorOf, selected, onSelectTrend }: DioramaProps) {
  const sand = new THREE.Color(palette.ink).lerp(new THREE.Color(palette.muted), 0.3).getStyle();
  const ink = palette.ink;
  const uc = USE_CASE.kiosk;
  const h = Object.fromEntries(uc.hotspots.map((x) => [x.key, x]));
  const hot = (key: string, children: React.ReactNode) => (
    <Hot id={key} at={h[key].at} color={colorOf(h[key].trend)} selected={selected === h[key].trend} onSelect={() => onSelectTrend(h[key].trend)}>
      {children}
    </Hot>
  );
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[8, 64]} />
        <meshStandardMaterial color={palette.sunk} roughness={1} />
      </mesh>
      <Line points={Array.from({ length: 65 }, (_, i) => [Math.cos((i / 64) * Math.PI * 2) * 8, 0.01, Math.sin((i / 64) * Math.PI * 2) * 8] as V3)} color={palette.line} lineWidth={1} />
      {/* Rückwand, Dach, Theke */}
      <Box at={[0, 1.6, -2]} size={[9, 3.2, 0.3]} tint={sand} edge={ink} />
      <Box at={[0, 3.35, -0.85]} size={[9.4, 0.22, 2.6]} tint={ink} edge={ink} />
      <Box at={[0, 0.52, 0.7]} size={[6, 1.04, 0.9]} tint={sand} edge={ink} />
      <Matte at={[0, 3.2, 0.42]} size={[3.4, 0.36, 0.06]} color={palette.accent} emissive={0.5} />

      {hot("kasse", <>
        <Matte at={[0.4, 1.12, 0.9]} size={[0.38, 0.12, 0.28]} color={palette.line} />
        <mesh position={[0.4, 1.32, 0.82]} rotation-x={-0.5}>
          <planeGeometry args={[0.34, 0.24]} />
          <meshStandardMaterial color={ink} emissive={ink} emissiveIntensity={0.9} />
        </mesh>
      </>)}

      {hot("abholung", <>
        {Array.from({ length: 9 }, (_, i) => {
          const c = i % 3, r = Math.floor(i / 3);
          const ready = i === 4;
          return <Matte key={i} at={[3.1 + c * 0.52, 0.55 + r * 0.55, 0.4]} size={[0.48, 0.5, 0.5]} color={ready ? palette.accent : sand} emissive={ready ? 0.7 : 0.05} />;
        })}
        <mesh position={[3.62, 2.35, 0.66]}>
          <planeGeometry args={[1.5, 0.32]} />
          <meshStandardMaterial color={ink} emissive={ink} emissiveIntensity={0.8} />
        </mesh>
      </>)}

      {hot("zapfen", <>
        <Box at={[-3.7, 1.25, 0.15]} size={[1.7, 2.5, 0.5]} tint={sand} edge={ink} />
        {[-0.5, -0.17, 0.17, 0.5].map((dx) => (
          <mesh key={dx} position={[-3.7 + dx, 1.35, 0.5]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.05, 0.05, 0.32, 12]} />
            <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.4} metalness={0.4} roughness={0.3} />
          </mesh>
        ))}
        <mesh position={[-3.7, 2.15, 0.41]}>
          <planeGeometry args={[1.2, 0.36]} />
          <meshStandardMaterial color={ink} emissive={ink} emissiveIntensity={0.8} />
        </mesh>
      </>)}

      {hot("gate", <>
        {[-2.9, -1.5].map((x) => <Matte key={x} at={[x, 0.55, 3.4]} size={[0.16, 1.1, 0.5]} color={sand} />)}
        <Box at={[-2.2, 0.75, 3.4]} size={[1.2, 0.7, 0.04]} tint={ink} />
        <Matte at={[-2.2, 1.25, 3.4]} size={[1.5, 0.08, 0.14]} color={palette.accent} emissive={0.6} />
      </>)}

      {hot("roboter", <>
        <mesh position={[-0.9, 0.45, -1.2]}>
          <cylinderGeometry args={[0.28, 0.34, 0.9, 20]} />
          <meshStandardMaterial color={sand} roughness={0.5} metalness={0.2} />
        </mesh>
        <mesh position={[-0.75, 1.35, -1.15]} rotation-z={-0.4}>
          <boxGeometry args={[0.18, 1.1, 0.18]} />
          <meshStandardMaterial color={ink} roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[-0.25, 1.95, -1.1]} rotation-z={1.1}>
          <boxGeometry args={[0.15, 0.9, 0.15]} />
          <meshStandardMaterial color={ink} roughness={0.4} metalness={0.3} />
        </mesh>
        <Matte at={[0.15, 1.75, -1.1]} size={[0.14, 0.22, 0.24]} color={palette.accent} emissive={0.5} />
      </>)}

      {hot("prognose", <>
        <mesh position={[1.6, 2.6, -1.84]}>
          <planeGeometry args={[2, 1.1]} />
          <meshStandardMaterial color={palette.bg} emissive={palette.bg} emissiveIntensity={0.2} />
        </mesh>
        {[0.35, 0.6, 0.45, 0.85, 0.7].map((v, i) => (
          <Matte key={i} at={[0.95 + i * 0.33, 2.15 + v / 2, -1.8]} size={[0.2, v, 0.02]} color={i === 3 ? palette.accent : ink} emissive={0.6} />
        ))}
      </>)}

      {hot("pfand", <Pfandautomat palette={palette} at={[3.2, 0, 3.4]} />)}
    </group>
  );
}

// ───────────── Diorama: VIP-Lounge ─────────────

export function Lounge({ palette, colorOf, selected, onSelectTrend }: DioramaProps) {
  const sand = new THREE.Color(palette.ink).lerp(new THREE.Color(palette.muted), 0.3).getStyle();
  const ink = palette.ink;
  const uc = USE_CASE.lounge;
  const h = Object.fromEntries(uc.hotspots.map((x) => [x.key, x]));
  const hot = (key: string, children: React.ReactNode) => (
    <Hot id={key} at={h[key].at} color={colorOf(h[key].trend)} selected={selected === h[key].trend} onSelect={() => onSelectTrend(h[key].trend)}>
      {children}
    </Hot>
  );
  const lc = palette.pitchLine;
  return (
    <group>
      {/* Spielfeld tief unten hinter der Glasfront */}
      <mesh position={[0, -3.5, -12]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[30, 16]} />
        <meshStandardMaterial color={palette.pitch} roughness={1} />
      </mesh>
      <Line points={[[-11, -3.48, -18], [11, -3.48, -18], [11, -3.48, -6], [-11, -3.48, -6], [-11, -3.48, -18]]} color={lc} lineWidth={1.2} />
      <Line points={[[0, -3.48, -18], [0, -3.48, -6]]} color={lc} lineWidth={1.2} />
      {/* Boden, Seitenwände, Glasfront */}
      <Matte at={[0, -0.05, 0]} size={[10, 0.1, 7]} color={palette.sunk} />
      <Box at={[-5, 1.7, 0]} size={[0.2, 3.4, 7]} tint={sand} edge={ink} />
      <Box at={[5, 1.7, 0]} size={[0.2, 3.4, 7]} tint={sand} edge={ink} />
      <mesh position={[0, 1.7, -3.45]}>
        <boxGeometry args={[10, 3.4, 0.06]} />
        <meshPhysicalMaterial color={ink} transmission={0.95} roughness={0.05} thickness={0.2} ior={1.5} clearcoat={1} envMapIntensity={2} transparent opacity={0.5} />
        <GlassEdge color={ink} />
      </mesh>
      {/* Sitzreihe an der Glasfront */}
      {[-3, -1.5, 0, 1.5, 3].map((x) => <Matte key={x} at={[x, 0.45, -2.6]} size={[0.9, 0.9, 0.8]} color={sand} />)}

      {hot("loge", <>
        <Matte at={[-2.6, 0.35, 0.2]} size={[2.6, 0.7, 1]} color={palette.line} />
        <Matte at={[-3.6, 0.35, 1.3]} size={[0.9, 0.7, 1.6]} color={palette.line} />
        <Matte at={[-2.6, 0.85, -0.25]} size={[2.6, 0.6, 0.2]} color={sand} />
        <Matte at={[-2.2, 0.3, 1.5]} size={[1.1, 0.6, 0.8]} color={sand} />
      </>)}

      {hot("service", <>
        <mesh position={[2.2, 0.65, 1.4]}>
          <cylinderGeometry args={[0.32, 0.4, 1.3, 24]} />
          <meshStandardMaterial color={sand} roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[2.2, 1.55, 1.4]}>
          <sphereGeometry args={[0.3, 24, 24]} />
          <meshStandardMaterial color={ink} roughness={0.3} />
        </mesh>
        <mesh position={[2.2, 1.58, 1.68]}>
          <planeGeometry args={[0.32, 0.12]} />
          <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.8} />
        </mesh>
        <Matte at={[2.2, 1.2, 1.75]} size={[0.6, 0.04, 0.4]} color={ink} />
      </>)}

      {hot("concierge", <>
        <Matte at={[0.4, 0.5, 2.1]} size={[0.08, 1, 0.08]} color={sand} />
        <mesh position={[0.4, 1.1, 2.1]} rotation-x={-0.6}>
          <boxGeometry args={[0.5, 0.36, 0.03]} />
          <meshStandardMaterial color={ink} emissive={ink} emissiveIntensity={0.9} />
        </mesh>
      </>)}

      {hot("paket", <>
        <Matte at={[3.4, 1.4, -1.2]} size={[1.1, 1.8, 0.06]} color={palette.bg} />
        <Matte at={[3.4, 1.75, -1.15]} size={[0.8, 0.5, 0.02]} color={ink} emissive={0.7} />
        <Matte at={[3.4, 1.15, -1.15]} size={[0.8, 0.14, 0.02]} color={palette.accent} emissive={0.6} />
      </>)}

      {hot("preise", <>
        {[0.5, 0.8, 1.15].map((v, i) => (
          <Matte key={i} at={[-1.1 + i * 0.5, 2.35 + v / 2, -3.3]} size={[0.32, v, 0.03]} color={i === 2 ? palette.accent : ink} emissive={0.7} />
        ))}
      </>)}

      {/* Bar */}
      <Box at={[3.6, 0.55, 1]} size={[1.6, 1.1, 0.6]} tint={sand} edge={ink} />
    </group>
  );
}

export const DIORAMA: Record<UseCaseKey, (p: DioramaProps) => React.ReactElement> = { kiosk: Kiosk, lounge: Lounge };
