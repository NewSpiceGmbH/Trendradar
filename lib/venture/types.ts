import type { Brief } from "./brief";

/** Venture Clienting: Challenges, Kandidaten des Agenten, qualifizierte Startup-Datenbank (Migration 0009) */

export type Maturity = "idea" | "prototype" | "pilot" | "market" | "scale";
export const MATURITY_LABEL: Record<Maturity, string> = {
  idea: "Idee",
  prototype: "Prototyp",
  pilot: "Pilot läuft",
  market: "Kunden im Einsatz",
  scale: "Skaliert",
};
export const MATURITY_ORDER: Maturity[] = ["idea", "prototype", "pilot", "market", "scale"];

export type ChallengeStatus = "draft" | "scouting" | "review" | "shortlist" | "closed";
export const CHALLENGE_STATUS_LABEL: Record<ChallengeStatus, string> = {
  draft: "Entwurf",
  scouting: "Scouting",
  review: "Bewertung",
  shortlist: "Shortlist",
  closed: "Abgeschlossen",
};

export type Recommendation = "shortlist" | "watch" | "no_fit";
export const RECOMMENDATION_LABEL: Record<Recommendation, string> = { shortlist: "Shortlist", watch: "Beobachten", no_fit: "Passt nicht" };

export type CandidateStatus = "pending" | "qualified" | "watch" | "rejected";
export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  pending: "Offen",
  qualified: "In der Datenbank",
  watch: "Beobachten",
  rejected: "Abgelehnt",
};

/** Kriterien der Vorevaluierung mit Gewicht (Summe 1) */
export const CRITERIA = [
  { key: "fit", label: "Problem-Fit", weight: 0.25, hint: "Löst die Lösung genau das beschriebene Problem und trifft sie das Ziel?" },
  { key: "maturity", label: "Reifegrad", weight: 0.2, hint: "Idee 1 · Prototyp 2 · Pilot 3 · Kunden im Einsatz 4 · skaliert 5" },
  { key: "references", label: "Referenzen im Zielmarkt", weight: 0.15, hint: "Belegte Einsätze in Stadien, Arenen, Hotels, Events – oder vergleichbaren Orten" },
  { key: "integration", label: "Integrationsaufwand", weight: 0.15, hint: "5 = schnell einsetzbar, Standard-Schnittstellen; 1 = großer Umbau" },
  { key: "gdpr", label: "DSGVO / EU-Tauglichkeit", weight: 0.1, hint: "Datenschutz, Hosting in der EU, EU AI Act, Präsenz in Europa" },
  { key: "team", label: "Team & Finanzierung", weight: 0.1, hint: "Erfahrung, Größe, Finanzierung, Durchhaltevermögen" },
  { key: "pricing", label: "Preismodell & Skalierbarkeit", weight: 0.05, hint: "Nachvollziehbares Preismodell, rechnet sich für Venues und Hotels" },
] as const;
export type CriterionKey = (typeof CRITERIA)[number]["key"];

export interface CriterionScore {
  criterion: CriterionKey;
  score: number;
  rationale: string;
  source_url: string | null;
}

export interface SourceRef {
  url: string;
  title: string | null;
}

export interface Challenge {
  id: string;
  title: string;
  problem: string;
  goal: string;
  context: string;
  audience: "vip" | "public" | "both";
  journeyStages: string[];
  trendNumbers: number[];
  regions: ("DACH" | "EU" | "US" | "GLOBAL")[];
  minMaturity: Exclude<Maturity, "scale">;
  mustHaves: string[];
  exclusions: string[];
  /** Hinweise aus dem Team: Startups oder Links, die der Agent prüfen soll */
  leads: string[];
  timeframe: string | null;
  budget: string | null;
  status: ChallengeStatus;
  maxCandidates: number;
  maxSearches: number;
  maxCostUsd: number;
  model: string;
  effort: "low" | "medium" | "high";
  lastRunAt: string | null;
  createdAt: string;
  /** Problem-Briefing aus dem Deep Dive (ab Migration 0011; sonst null) */
  brief?: Brief | null;
  briefUpdatedAt?: string | null;
}

export interface DeepDiveSession {
  id: string;
  title: string;
  heldOn: string | null;
  source: "paste" | "upload" | "notion";
  /** Link auf die Notion-Seite (bei source = notion) */
  sourceUrl?: string | null;
  fileName: string | null;
  charCount: number | null;
  status: "processing" | "done" | "failed";
  summary: string | null;
  error: string | null;
  createdAt: string;
}

export interface Candidate {
  id: string;
  challengeId: string;
  runId: string | null;
  startupId: string | null;
  name: string;
  website: string | null;
  domain: string | null;
  country: string | null;
  founded: number | null;
  stage: Maturity | null;
  funding: string | null;
  summary: string;
  approach: string | null;
  scores: CriterionScore[];
  total: number;
  recommendation: Recommendation;
  mustHaveGaps: string[];
  openQuestions: string[];
  sources: SourceRef[];
  uncertain: boolean;
  status: CandidateStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  example?: boolean;
}

export interface Startup {
  id: string;
  name: string;
  website: string | null;
  domain: string | null;
  country: string | null;
  city: string | null;
  founded: number | null;
  stage: Maturity | null;
  funding: string | null;
  teamSize: string | null;
  tagline: string | null;
  solution: string | null;
  useCases: string | null;
  referenceCustomers: string | null;
  trendNumbers: number[];
  tags: string[];
  /** qualified = „Aufgenommen“; review/on_hold ab Migration 0014 (Netzwerk-Datenbank) */
  status: "qualified" | "review" | "on_hold" | "archived";
  approved: boolean;
  published: boolean;
  logoUrl: string | null;
  sources: SourceRef[];
  // Netzwerk-Datenbank (Migration 0014): die Tabelle startups ist die Tabelle der Mitglieder
  partnerTypes: PartnerType[];
  /** Merkmal „Startup“ (jünger als 5 Jahre), von der Redaktion bestätigt */
  isStartup: boolean;
  region: Region | null;
  source: MemberSource;
  /** Angaben je Partner-Typ, z. B. { league: "3. Liga", capacity: "12.000" } */
  details: Record<string, string>;
  isPartner: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PartnerType = "club" | "caterer" | "operator" | "multiplier" | "investor" | "solution_provider";
export type Region = "DACH" | "EU" | "US" | "GLOBAL";
export type MemberSource = "agent" | "editor" | "application";

/** Standardwerte für Mitglieder, solange Migration 0014 fehlt oder ein Profil neu angelegt wird */
export const MEMBER_DEFAULTS = {
  partnerTypes: ["solution_provider"] as PartnerType[], isStartup: false, region: null, source: "editor" as MemberSource,
  details: {} as Record<string, string>, isPartner: false,
};

/** Vertraulich, nur Redaktion (in Paket 3 für die Shortlist eines Kunden freigebbar) */
export interface StartupPrivate {
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  pricing: string | null;
  pitchDeckUrl: string | null;
  notes: string | null;
}

export const EMPTY_PRIVATE: StartupPrivate = { contactName: null, contactRole: null, contactEmail: null, pricing: null, pitchDeckUrl: null, notes: null };
