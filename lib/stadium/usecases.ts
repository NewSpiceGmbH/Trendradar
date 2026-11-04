import type { Audience } from "./audience";
import type { CameraShot } from "./geometry";
import { polar } from "./geometry";

/**
 * Use-Case-Szenen: begehbare Orte im Stadion, in denen Trends als konkrete Objekte erscheinen.
 * Jede Szene ist ein eigenes Diorama (components/stadium/dioramas.tsx); Hotspots verweisen auf Trends.
 * Ein Trend kann in mehreren Szenen vorkommen.
 */
export type UseCaseKey = "kiosk" | "lounge";

export interface Hotspot {
  key: string;
  label: string;
  trend: number;
  /** Position des Hotspots in der Szene (für Beschriftung und Kamera) */
  at: [number, number, number];
}

export interface UseCase {
  key: UseCaseKey;
  name: string;
  audience: Exclude<Audience, "both">;
  blurb: string;
  /** Marke im Radar (auf dem Umlauf zwischen Unter- und Oberrang) */
  marker: [number, number, number];
  shot: CameraShot;
  hotspots: Hotspot[];
}

export const USE_CASES: UseCase[] = [
  {
    key: "kiosk",
    name: "Verkaufsstand",
    audience: "public",
    blurb: "Bestellen, bezahlen, zapfen, abholen, Becher zurückgeben – ein Stand zeigt, wo Sekunden und Umsatz entstehen.",
    marker: polar(9.2, 64, 3.4),
    shot: { position: [2.6, 6.4, 15.5], target: [2.4, 1.2, 0.6] },
    hotspots: [
      { key: "kasse", label: "Kasse & Kartenterminal", trend: 26, at: [0.4, 1.6, 0.9] },
      { key: "abholung", label: "Abholfächer Mobile Order", trend: 24, at: [3.6, 2.4, 0.4] },
      { key: "zapfen", label: "Zapfwand zum Selbstzapfen", trend: 25, at: [-3.7, 2.3, 0.4] },
      { key: "gate", label: "Schranke ohne Kasse", trend: 19, at: [-2.2, 1.5, 3.4] },
      { key: "roboter", label: "Roboter in der Küche", trend: 10, at: [-0.9, 2.3, -1.2] },
      { key: "prognose", label: "Absatzprognose", trend: 11, at: [1.6, 2.9, -1.55] },
      { key: "pfand", label: "Smarter Pfandautomat", trend: 31, at: [3.2, 2.2, 3.4] },
    ],
  },
  {
    key: "lounge",
    name: "VIP-Lounge",
    audience: "vip",
    blurb: "Loge mit Blick aufs Feld: Service, Buchung und Preisstufen, die aus einem Platz ein Erlebnis machen.",
    marker: polar(9.2, 180, 3.4),
    shot: { position: [2.2, 7.5, 13], target: [2, 0.8, -0.2] },
    hotspots: [
      { key: "loge", label: "Premium-Stufen der Loge", trend: 13, at: [-2.6, 1.6, 0.2] },
      { key: "service", label: "Service-Roboter", trend: 9, at: [2.2, 2.2, 1.4] },
      { key: "concierge", label: "Concierge-Tablet: Hotel & Anreise", trend: 6, at: [0.4, 1.5, 2.1] },
      { key: "paket", label: "Reisepaket zum Spiel", trend: 16, at: [3.4, 2.6, -1.2] },
      { key: "preise", label: "Preisstufen in Echtzeit", trend: 12, at: [-0.6, 3.1, -2.3] },
    ],
  },
];

export const USE_CASE = Object.fromEntries(USE_CASES.map((u) => [u.key, u])) as Record<UseCaseKey, UseCase>;

/** Kamera auf einen Hotspot innerhalb der Szene */
export const hotspotShot = (h: Hotspot): CameraShot => ({
  // Ziel leicht nach rechts versetzt, damit das Objekt neben dem Panel sitzt
  target: [h.at[0] + 1.4, h.at[1], h.at[2]],
  position: [h.at[0] + 1.6, h.at[1] + 3, h.at[2] + 7.5],
});
