import type { Perspective } from "@/lib/scoring";
import type { RadarData } from "@/lib/radar/types";
import { moved, type Positions } from "@/lib/radar/view";
import { STAGE, stageOf, type StageKey } from "./journey";

/**
 * Geführte Tour „Ein Spieltag 2030“: entlang der Customer Journey von zuhause ins Stadion, dann in den Radar.
 * Zahlen und hervorgehobene Trends kommen aus den Daten, damit sich die Geschichte mit den Inhalten ändert.
 */
export type Shot =
  | { kind: "journey" }
  | { kind: "place"; place: StageKey }
  | { kind: "radar" }
  | { kind: "pitch" };

export interface Station {
  key: string;
  eyebrow: string;
  /** große Zahl oder kurzes Stichwort */
  figure?: string;
  title: string;
  body: string;
  view: "journey" | "radar";
  shot: Shot;
  /** hervorgehobene Trends; leer = alle gleich */
  highlight: number[];
  persp: Perspective;
}

/** Trendnummern aus einem Text wie „Digitale Tickets (#27, Score 4,25)“ */
export const trendRefs = (text: string) => [...new Set([...text.matchAll(/#(\d{1,2})\b/g)].map((m) => Number(m[1])))];

/** Erster Satz eines Absatzes (für kurze Teaser) */
export const firstSentence = (text: string) => {
  const m = text.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : text).trim();
};

const PLACE_TITLES: Partial<Record<StageKey, string>> = {
  zuhause: "Der Spieltag beginnt auf dem Sofa.",
  anreise: "Der Weg ins Stadion wird Teil des Erlebnisses.",
  region: "Aus einem Spiel wird eine Reise.",
  einlass: "Am Tor entscheidet sich, ob es reibungslos läuft.",
  kulissen: "Was niemand sieht, trägt alles.",
};

export function buildTour(data: RadarData, pos: Positions): Station[] {
  const all = data.trends.map((t) => t.number);
  const at = (k: StageKey) => all.filter((n) => stageOf(n) === k);
  const kickoff = all.filter((n) => pos.EU[n].zone === "KICKOFF");
  const shifted = all.filter((n) => moved(pos, n));
  const europe = data.insights.find((i) => /europa/i.test(i.title));

  const place = (k: StageKey): Station | null => {
    const list = at(k);
    if (!list.length) return null;
    return {
      key: k,
      eyebrow: STAGE[k].name,
      figure: String(list.length),
      title: PLACE_TITLES[k] ?? STAGE[k].name,
      body: STAGE[k].blurb,
      view: "journey",
      shot: { kind: "place", place: k },
      highlight: list,
      persp: "EU",
    };
  };

  const stations: (Station | null)[] = [
    {
      key: "spieltag",
      eyebrow: "Ein Spieltag 2030",
      figure: String(all.length),
      title: "Trends verändern, wie Menschen live erleben.",
      body: "Wir folgen einem Gast durch den Tag – von zuhause bis zum Abpfiff. Jeder Punkt ist ein Trend, seine Größe zeigt den Business Impact.",
      view: "journey",
      shot: { kind: "journey" },
      highlight: [],
      persp: "EU",
    },
    place("zuhause"),
    place("anreise"),
    place("region"),
    place("einlass"),
    {
      key: "anpfiff",
      eyebrow: "Anpfiff",
      figure: String(kickoff.length),
      title: "Trends sind schon auf dem Spielfeld.",
      body: "Im Stadion ordnet sich alles nach Reife: Auf dem Rasen liegt, was jetzt umgesetzt werden sollte. Im Unterrang wärmt sich auf, was Piloten braucht. Im Oberrang sitzt, was wir beobachten.",
      view: "radar",
      shot: { kind: "pitch" },
      highlight: kickoff,
      persp: "EU",
    },
    shifted.length
      ? {
          key: "europa",
          eyebrow: europe?.title ?? "Europa ist anders",
          figure: String(shifted.length),
          title: "Trends wechseln den Platz, sobald man global statt europäisch bewertet.",
          body: "Schauen Sie hin: Die markierten Punkte ziehen um. Treiber sind DSGVO, EU AI Act, Mitbestimmung und Fankultur.",
          view: "radar",
          shot: { kind: "radar" },
          highlight: shifted,
          persp: "GLOBAL",
        }
      : null,
    place("kulissen"),
    {
      key: "abpfiff",
      eyebrow: "Abpfiff",
      title: "Jetzt selbst erkunden.",
      body: "Ort oder Stadion anklicken zum Hineinzoomen, Punkt anklicken für den Trend. Oben wechseln Sie zwischen Journey und Radar.",
      view: "journey",
      shot: { kind: "journey" },
      highlight: [],
      persp: "EU",
    },
  ];
  return stations.filter((s): s is Station => s !== null);
}
