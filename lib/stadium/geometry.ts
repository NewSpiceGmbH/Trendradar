import { ARENA, CLUSTER_KEYS, type ClusterCode, type DotPosition, type Zone } from "@/lib/scoring";

/**
 * Übersetzt die Anordnung der 2D-Arena (layout() in lib/scoring.ts) in ein 3D-Stadion.
 * Winkel und Reihenfolge bleiben identisch, nur Radius und Höhe werden je Spielphase neu abgebildet:
 *   Anstoß   = Spielfeld (flach)
 *   Aufwärmen = Unterrang (ansteigend)
 *   Scouting = Oberrang (höher und weiter außen)
 * Einheit: Szenenmeter. x nach rechts, y nach oben, z zum Betrachter.
 */

/** horizontale Streckung, damit das Stadion oval wirkt (wie die 2D-Ellipse) */
export const SX = 1.32;

export interface Tier {
  /** Innen- und Außenradius */
  r: readonly [number, number];
  /** Höhe innen und außen */
  h: readonly [number, number];
}

export const TIERS: Record<Zone, Tier> = {
  KICKOFF: { r: [2.4, 5.4], h: [0.02, 0.02] },
  WARMUP: { r: [6.2, 8.9], h: [0.55, 2.3] },
  SCOUTING: { r: [9.5, 12.2], h: [3.0, 5.1] },
};

/** Spielfeldrand (Ellipse, in der die Anstoß-Trends liegen) */
export const PITCH_R = 5.9;
export const OUTER_R = 12.6;
export const ROOF_H = 5.6;

/** Abstand der Punkte über der Tribüne */
export const LIFT = 0.42;

export const SEGMENT = ARENA.segment;
/** Mittelwinkel eines Clusters in Grad (gleich wie in der 2D-Arena: A beginnt oben) */
export const clusterAngle = (c: ClusterCode) => -90 + CLUSTER_KEYS.indexOf(c) * SEGMENT + SEGMENT / 2;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Punkt auf der Stadion-Ellipse */
export function polar(r: number, deg: number, y = 0): [number, number, number] {
  return [r * SX * Math.cos(rad(deg)), y, r * Math.sin(rad(deg))];
}

/** Position eines Trends im Stadion, abgeleitet aus seiner 2D-Position */
export function dotPosition(p: DotPosition): { base: [number, number, number]; dot: [number, number, number]; size: number } {
  const [r0, r1] = ARENA.rings[p.zone];
  const f = Math.min(1, Math.max(0, (p.rad - r0) / (r1 - r0)));
  const t = TIERS[p.zone];
  const r = t.r[0] + (t.r[1] - t.r[0]) * f;
  const h = t.h[0] + (t.h[1] - t.h[0]) * f;
  const base = polar(r, p.ang, h);
  // Business Impact 1–5 → Kugelradius (layout() liefert r = 8 … 17,6)
  const size = 0.13 + (p.r - 8) * 0.012;
  return { base, dot: [base[0], h + LIFT, base[2]], size };
}

export interface CameraShot {
  position: [number, number, number];
  target: [number, number, number];
}

export const OVERVIEW: CameraShot = { position: [-2.4, 28, 33], target: [-2.4, 1.6, -1.6] };
export const PITCH_SHOT: CameraShot = { position: [0, 14, 15.5], target: [0, 0, 0.5] };

/** Blick vom Spielfeld auf die Tribüne eines Clusters */
export function clusterShot(c: ClusterCode): CameraShot {
  const m = clusterAngle(c);
  // vom gegenüberliegenden Spielfeldrand und erhöht: Spielfeld, Unter- und Oberrang des Blocks im Bild
  const target = polar(6.6, m, 1.4);
  const position = polar(-6.5, m, 12.5);
  return { position, target };
}

/** Kamera auf eine Gruppe von Punkten: vom gegenüberliegenden Spielfeldrand, leicht erhöht */
export function groupShot(points: [number, number, number][]): CameraShot {
  if (!points.length) return OVERVIEW;
  const c = points.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]] as [number, number, number], [0, 0, 0]).map((v) => v / points.length) as [number, number, number];
  const len = Math.hypot(c[0] / SX, c[2]) || 1;
  const dir: [number, number] = [c[0] / SX / len, c[2] / len];
  const spread = Math.max(...points.map((p) => Math.hypot(p[0] - c[0], p[2] - c[2])));
  const back = 10 + spread * 1.2;
  return {
    target: c,
    position: [c[0] - dir[0] * back * SX * 0.8, c[1] + 7 + spread * 0.6, c[2] - dir[1] * back],
  };
}

export const ZONE_PLACE: Record<Zone, string> = {
  KICKOFF: "Spielfeld",
  WARMUP: "Unterrang",
  SCOUTING: "Oberrang",
};

/** Bei Hochformat (Handy) weiter zurück, damit das Stadion in die Breite passt */
export function fitShot(shot: CameraShot, aspect: number): CameraShot {
  const k = aspect >= 1.2 ? 1 : Math.min(1.8, 0.9 / Math.max(aspect, 0.3));
  if (k === 1) return shot;
  const [px, py, pz] = shot.position, [tx, ty, tz] = shot.target;
  return { target: shot.target, position: [tx + (px - tx) * k, ty + (py - ty) * k, tz + (pz - tz) * k] };
}

// ───────────── Region (Journey-Ansicht) ─────────────

export const JOURNEY_OVERVIEW: CameraShot = { position: [4, 62, 78], target: [0, 0, 1] };
/** Stadion von außen, leicht erhöht */
export const STADIUM_OUTSIDE: CameraShot = { position: [0, 30, 44], target: [0, 2, 0] };

/** Kamera auf einen Ort der Journey: von Süden, erhöht */
export function placeShot(at: [number, number], height: number): CameraShot {
  return { target: [at[0], height * 0.6, at[1]], position: [at[0] + at[0] * 0.12, height + 26, at[1] + 34] };
}

/** Kamera auf einen einzelnen Punkt in der Region */
export function spotShot(p: [number, number, number]): CameraShot {
  return { target: p, position: [p[0], p[1] + 9, p[2] + 15] };
}
