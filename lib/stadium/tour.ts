import type { Perspective } from "@/lib/scoring";
import type { RadarData } from "@/lib/radar/types";
import { moved, type Positions } from "@/lib/radar/view";

/**
 * Geführte Tour „Ein Spieltag 2030“. Die Stationen kommen aus den Daten (Zählungen, Erkenntnisse der
 * Redaktion), damit sich die Geschichte mit den Inhalten ändert.
 */
export interface Station {
  key: string;
  eyebrow: string;
  /** große Zahl oder kurzes Stichwort */
  figure?: string;
  title: string;
  body: string;
  /** Kamera: Totale, Spielfeld oder auf die hervorgehobenen Trends */
  shot: "overview" | "pitch" | "group";
  /** hervorgehobene Trends; leer = alle gleich */
  highlight: number[];
  persp: Perspective;
}

/** Trendnummern aus einem Text wie „Digitale Tickets (#27, Score 4,25)“ */
export const trendRefs = (text: string) => [...new Set([...text.matchAll(/#(\d{1,2})\b/g)].map((m) => Number(m[1])))];

/** Ersten Satz eines Absatzes (für kurze Teaser) */
export const firstSentence = (text: string) => {
  const m = text.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : text).trim();
};

export function buildTour(data: RadarData, pos: Positions): Station[] {
  const all = data.trends.map((t) => t.number);
  const kickoff = all.filter((n) => pos.EU[n].zone === "KICKOFF");
  const shifted = all.filter((n) => moved(pos, n));
  const [first, second] = data.insights;

  const stations: Station[] = [
    {
      key: "einlass",
      eyebrow: "Einlass",
      figure: String(all.length),
      title: "Trends verändern, wie Menschen live erleben.",
      body: "Sport, Hospitality und Live Entertainment – sieben Cluster, ein Stadion. Jeder Punkt ist ein Trend, seine Größe zeigt den Business Impact.",
      shot: "overview",
      highlight: [],
      persp: "EU",
    },
    {
      key: "anpfiff",
      eyebrow: "Anpfiff",
      figure: String(kickoff.length),
      title: "Trends sind schon auf dem Spielfeld.",
      body: "Auf dem Rasen liegt, was jetzt umgesetzt werden sollte. Im Unterrang wärmt sich auf, was Piloten braucht. Im Oberrang sitzt, was wir beobachten.",
      shot: "pitch",
      highlight: kickoff,
      persp: "EU",
    },
  ];

  if (first) {
    stations.push({
      key: "erkenntnis-1",
      eyebrow: "Erkenntnis 1",
      title: first.title,
      body: firstSentence(first.body),
      shot: "group",
      highlight: trendRefs(first.body).filter((n) => pos.EU[n]),
      persp: "EU",
    });
  }

  if (shifted.length) {
    stations.push({
      key: "perspektive",
      eyebrow: second?.title ?? "Europa ist anders",
      figure: String(shifted.length),
      title: "Trends wechseln den Platz, sobald man global statt europäisch bewertet.",
      body: "Schauen Sie hin: Die markierten Punkte ziehen um. Treiber sind DSGVO, EU AI Act, Mitbestimmung und Fankultur.",
      shot: "overview",
      highlight: shifted,
      persp: "GLOBAL",
    });
  }

  stations.push({
    key: "abpfiff",
    eyebrow: "Abpfiff",
    title: "Jetzt selbst erkunden.",
    body: "Tribüne anklicken zum Hineinzoomen, Punkt anklicken für den Trend. Pulsierende Punkte lohnen einen zweiten Blick.",
    shot: "overview",
    highlight: [],
    persp: "EU",
  });

  return stations;
}
