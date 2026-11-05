import type { Horizon } from "@/lib/scoring";

/**
 * Datenmodell des Redaktions-Backends. Ein AdminTrend hat dasselbe Format wie ein Snapshot in trend_versions
 * und wie ein Patch für edit_trend() (siehe supabase/migrations/0006_redaktion.sql) – plus id und updatedAt.
 */

export type Persp = "GLOBAL" | "EU";
export type TrendStatus = "draft" | "published" | "archived";
export type JourneyStage = "zuhause" | "anreise" | "region" | "einlass" | "stadion" | "kulissen";
export type AudienceValue = "vip" | "public" | "both";

export interface TrendFields {
  number: number;
  name: string;
  cluster_code: string;
  focus_code: string;
  subtopic_id: number | null;
  origin: "EU" | "US" | "GLOBAL";
  description: string;
  use_cases: string | null;
  best_practice: string | null;
  signals_summary: string | null;
  opportunities: string | null;
  risks: string | null;
  evidence: "A" | "B" | "C";
  uncertain: boolean;
  mandatory: boolean;
  status: TrendStatus;
  journey_stage: JourneyStage;
  audience: AudienceValue;
}

export interface ScoreItem {
  criterion: number;
  score: number;
  rationale?: string | null;
}

export interface PerspectiveRow {
  horizon: Horizon | null;
  note: string | null;
}

export interface TrendSnapshot {
  fields: TrendFields;
  scores: Record<Persp, ScoreItem[]>;
  perspectives: Record<Persp, PerspectiveRow | null>;
  relevance: Record<string, number>;
}

export interface AdminTrend extends TrendSnapshot {
  id: number;
  updatedAt: string | null;
}

/** Änderung im Format von edit_trend(): fehlende Schlüssel bleiben unverändert */
export interface TrendPatch {
  fields?: Partial<TrendFields>;
  scores?: Partial<Record<Persp, ScoreItem[]>>;
  perspectives?: Partial<Record<Persp, PerspectiveRow | null>>;
  relevance?: Record<string, number>;
}

export type ProposalKind = "new_trend" | "update_trend" | "score_change" | "new_source" | "attach_signal";
export type ProposalStatus = "pending" | "approved" | "rejected";

export interface Proposal {
  id: string;
  kind: ProposalKind;
  targetTrendId: number | null;
  payload: Record<string, unknown>;
  rationale: string;
  sourceIds: string[];
  status: ProposalStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  agent: string | null;
  /** nur im lokalen Testmodus: Beispieldaten, nie echte Inhalte */
  example?: boolean;
}

export type SignalStatus = "new" | "assigned" | "dismissed";

export interface Signal {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  publisher: string | null;
  publishedOn: string | null;
  status: SignalStatus;
  trendId: number | null;
  foundAt: string;
  publishedAt: string | null;
  /** ab Migration 0007 (Scouting) */
  kind?: string | null;
  evidence?: "A" | "B" | "C" | null;
  relevance?: number | null;
  pressRelease?: boolean;
  scoutName?: string | null;
  /** Bereich im Lagebild (ab Migration 0008) */
  lane?: "sport_hospitality" | "startup_tech" | "cross_industry" | null;
  media?: SignalMedia[];
  example?: boolean;
}

export interface SignalMedia {
  id: string;
  kind: "video" | "image";
  url: string;
  embedUrl: string | null;
  title: string | null;
  credit: string | null;
  license: string | null;
  rights: "embed" | "press" | "cc" | "own" | "unclear";
  approved: boolean;
}

export interface Version {
  id: number;
  trendId: number;
  /** leer ({}) beim Eintrag „neu angelegt“ */
  snapshot: TrendSnapshot | Record<string, never>;
  changedBy: string | null;
  proposalId: string | null;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  agent: "scout" | "analyst" | "scorer" | "editor";
  status: "running" | "succeeded" | "failed";
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** ab Migration 0007 */
  scoutName?: string | null;
  searches?: number | null;
  costUsd?: number | null;
}

export interface TeamMember {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin" | "editor";
}

export interface Lookups {
  clusters: { code: string; name: string }[];
  focus: { code: string; name: string }[];
  subtopics: { id: number; focusCode: string; name: string }[];
  industries: { code: string; name: string }[];
  criteria: { idx: number; name: string; weight: number }[];
  zones: Record<string, { name: string }>;
  sources: Record<string, { title: string; publisher: string | null; url: string }>;
  /** Anzeigenamen der Redaktion (für „geändert von“) */
  people: Record<string, string>;
}

export class MigrationMissingError extends Error {
  constructor(detail: string) {
    super(`Die Datenbank kennt das Redaktions-Backend noch nicht (Migration 0006 fehlt): ${detail}`);
    this.name = "MigrationMissingError";
  }
}
