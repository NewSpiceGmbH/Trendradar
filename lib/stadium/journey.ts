/**
 * Customer Journey eines Spieltags: die Orte in der Region rund um das Stadion und welche Trends dort wirken.
 * Startwert der Zuordnung – später ein Feld, das die Redaktion pflegt (trends.journey_stage).
 * Trends ohne Eintrag landen „Im Stadion“.
 */

export type StageKey = "zuhause" | "anreise" | "region" | "einlass" | "stadion" | "kulissen";

export interface Stage {
  key: StageKey;
  name: string;
  /** kurzes Symbol für die Markierung in der Szene */
  icon: string;
  /** ein Satz für Panel und Tour */
  blurb: string;
  /** Mittelpunkt in der Szene (x, z) */
  at: [number, number];
  /** Höhe, über der die Trendpunkte schweben */
  height: number;
}

export const STAGES: Stage[] = [
  { key: "zuhause", name: "Zuhause", icon: "⌂", blurb: "Ticket, App, Vorfreude und Bindung – hier entsteht die Beziehung zum Club, lange vor dem Anpfiff.", at: [-40, 18], height: 2.6 },
  { key: "anreise", name: "Anreise & Parken", icon: "⇄", blurb: "Bahn, Shuttle, Parkhaus und Ladesäule – der Weg ins Stadion wird Teil des Erlebnisses.", at: [-34, -22], height: 4.2 },
  { key: "region", name: "Region & Hotel", icon: "▲", blurb: "Aus dem Spiel wird eine Reise: Hotel, Quartier und Fanzone in der Stadt.", at: [32, -24], height: 9.5 },
  { key: "einlass", name: "Vorplatz & Einlass", icon: "◇", blurb: "Am Tor entscheidet sich, ob der Tag reibungslos und sicher beginnt.", at: [0, 21], height: 2.2 },
  { key: "stadion", name: "Im Stadion", icon: "●", blurb: "Platz, Gastro, Premium und Erlebnis auf den Rängen.", at: [0, 0], height: 7 },
  { key: "kulissen", name: "Hinter den Kulissen", icon: "ϟ", blurb: "Was niemand sieht: Energie, Betrieb, Bau und Resilienz.", at: [36, 16], height: 3.4 },
];

export const STAGE = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<StageKey, Stage>;

const DEFAULT_STAGE: Record<number, StageKey> = {
  1: "zuhause", 2: "zuhause", 4: "zuhause", 5: "zuhause", 7: "zuhause", 12: "zuhause", 14: "zuhause",
  15: "zuhause", 17: "zuhause", 30: "zuhause", 44: "zuhause",
  32: "anreise", 37: "anreise",
  6: "region", 16: "region", 21: "region", 22: "region", 28: "region", 29: "region", 33: "region",
  18: "einlass", 27: "einlass", 38: "einlass", 39: "einlass",
  3: "stadion", 9: "stadion", 10: "stadion", 11: "stadion", 13: "stadion", 19: "stadion", 23: "stadion",
  24: "stadion", 25: "stadion", 26: "stadion", 42: "stadion", 43: "stadion",
  8: "kulissen", 20: "kulissen", 31: "kulissen", 34: "kulissen", 35: "kulissen", 36: "kulissen", 40: "kulissen", 41: "kulissen",
};

// Werte aus der Datenbank (trends.journey_stage) haben Vorrang vor dem Startwert oben
const fromData = new Map<number, StageKey>();
export function registerStages(trends: { number: number; journey: StageKey | null }[]) {
  fromData.clear();
  for (const t of trends) if (t.journey) fromData.set(t.number, t.journey);
}

export const stageOf = (n: number): StageKey => fromData.get(n) ?? DEFAULT_STAGE[n] ?? "stadion";

/**
 * Position eines Trends über seinem Ort: auf einem Kreis um den Ortsmittelpunkt, nach Score sortiert.
 * `index`/`count` = Platz innerhalb des Orts.
 */
export function journeySpot(stage: Stage, index: number, count: number): { dot: [number, number, number]; ground: number } {
  const r = 2.2 + count * 0.42;
  const a = -Math.PI / 2 + (index / Math.max(1, count)) * Math.PI * 2;
  const wobble = (index % 2) * 0.9;
  return {
    dot: [stage.at[0] + Math.cos(a) * r, stage.height + 1.4 + wobble, stage.at[1] + Math.sin(a) * r * 0.8],
    ground: 0.05,
  };
}
