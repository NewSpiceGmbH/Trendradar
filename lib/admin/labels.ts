import type { TrendFields, TrendSnapshot } from "./types";

/** Bezeichnungen der Felder in Formularen und Vergleichen */
export const FIELD_LABEL: Record<keyof TrendFields, string> = {
  number: "Nummer",
  name: "Name",
  cluster_code: "Cluster",
  focus_code: "Fokusfeld",
  subtopic_id: "Unterthema",
  origin: "Signalherkunft",
  description: "Beschreibung",
  use_cases: "Anwendungsfälle",
  best_practice: "Best Practices",
  signals_summary: "Markt- und Innovationssignale",
  opportunities: "Chancen",
  risks: "Risiken",
  evidence: "Evidenz",
  uncertain: "Unsicher (zu validieren)",
  mandatory: "Pflicht (regulatorisch)",
  status: "Status",
  journey_stage: "Ort der Journey",
  audience: "Zielgruppe",
};

export const TEXT_FIELDS = ["description", "use_cases", "best_practice", "signals_summary", "opportunities", "risks"] as const;

export const STATUS_LABEL = { draft: "Entwurf", published: "Veröffentlicht", archived: "Archiviert" } as const;
export const ORIGIN_OPTIONS = { EU: "Europa", US: "USA", GLOBAL: "Global" } as const;
export const STAGE_OPTIONS = {
  zuhause: "Zuhause", anreise: "Anreise & Parken", region: "Region & Hotel", einlass: "Vorplatz & Einlass", stadion: "Im Stadion", kulissen: "Hinter den Kulissen",
} as const;
export const AUDIENCE_OPTIONS = { both: "Hospitality & Public", vip: "Hospitality", public: "Public" } as const;
export const HORIZON_OPTIONS = ["0–2", "3–5", "6–10"] as const;

/** Lesbarer Wert eines Feldes für Vergleiche */
export function fieldValue(k: keyof TrendFields, v: unknown, lookups?: { clusters: { code: string; name: string }[]; subtopics: { id: number; name: string }[] }) {
  if (v == null || v === "") return "–";
  switch (k) {
    case "status": return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? String(v);
    case "origin": return ORIGIN_OPTIONS[v as keyof typeof ORIGIN_OPTIONS] ?? String(v);
    case "journey_stage": return STAGE_OPTIONS[v as keyof typeof STAGE_OPTIONS] ?? String(v);
    case "audience": return AUDIENCE_OPTIONS[v as keyof typeof AUDIENCE_OPTIONS] ?? String(v);
    case "uncertain":
    case "mandatory": return v ? "ja" : "nein";
    case "cluster_code": return lookups?.clusters.find((c) => c.code === v)?.name ? `${v} · ${lookups.clusters.find((c) => c.code === v)!.name}` : String(v);
    case "subtopic_id": return lookups?.subtopics.find((s) => s.id === v)?.name ?? String(v);
    default: return String(v);
  }
}

/** Ausgangspunkt für einen neuen Trend (Vorschau neuer Trends, Formular „Neuer Trend“) */
export function emptySnapshot(number = 0): TrendSnapshot {
  return {
    fields: {
      number, name: "", cluster_code: "A", focus_code: "FAN", subtopic_id: null, origin: "GLOBAL", description: "", use_cases: null,
      best_practice: null, signals_summary: null, opportunities: null, risks: null, evidence: "C", uncertain: false, mandatory: false,
      status: "draft", journey_stage: "stadion", audience: "both",
    },
    scores: { GLOBAL: [1, 2, 3, 4, 5, 6].map((criterion) => ({ criterion, score: 3, rationale: null })), EU: [] },
    perspectives: { GLOBAL: { horizon: "3–5", note: null }, EU: null },
    relevance: { SPORT: 2, HOSPITALITY: 2, LIVE: 2 },
  };
}
