import type { ClusterCode, Horizon, Scores, Zone } from "@/lib/scoring";

export type Origin = "EU" | "US" | "GLOBAL";
export type Evidence = "A" | "B" | "C";
export type FocusCode = "HOS" | "INF" | "FAN";
export type IndustryCode = "SPORT" | "HOSPITALITY" | "LIVE";

export interface Source {
  id: string;
  title: string;
  publisher: string | null;
  publishedLabel: string | null;
  url: string;
}

export interface Partner {
  key: string;
  name: string;
  role: string | null;
  knowledgeBase: boolean;
  sourceIds: string[];
}

export interface RadarTrend {
  number: number;
  name: string;
  cluster: ClusterCode;
  focus: FocusCode;
  subtopic: string | null;
  origin: Origin;
  description: string;
  useCases: string | null;
  bestPractice: string | null;
  signals: string | null;
  opportunities: string | null;
  risks: string | null;
  evidence: Evidence;
  uncertain: boolean;
  mandatory: boolean;
  /** Relevanz 1–3 je Branche in der Reihenfolge von RadarData.industries */
  relevance: number[];
  global: { horizon: Horizon; scores: Scores };
  /** nur bei Abweichung; fehlende Einzelwerte übernehmen GLOBAL */
  eu: { horizon: Horizon | null; scores: Partial<Record<number, number>> | null; note: string | null; sourceIds: string[] } | null;
  sourceIds: string[];
  partnerKeys: string[];
  /** nur für Premium und Redaktion, sonst null (RLS) */
  premium: { recommendation: string | null; whyPrioritized: string | null } | null;
}

export interface RadarCase {
  id: string;
  client: string;
  year: string | null;
  title: string;
  solution: string | null;
  result: string | null;
  trendNumbers: number[];
}

export interface RadarData {
  trends: RadarTrend[];
  clusters: { code: ClusterCode; name: string }[];
  focus: { code: FocusCode; name: string; description: string | null; subtopics: string[] }[];
  industries: { code: IndustryCode; name: string }[];
  criteria: { idx: number; name: string; weight: number }[];
  zones: Record<Zone, { name: string; tagline: string }>;
  insights: { title: string; body: string }[];
  sources: Record<string, Source>;
  partners: Record<string, Partner>;
  cases: RadarCase[];
  /** true, wenn der Nutzer Premium-Inhalte sehen darf */
  premium: boolean;
}
