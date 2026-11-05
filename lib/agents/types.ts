/** Konfiguration des Scouting-Stabs (Tabellen aus Migration 0007) */

export type Vertical = "SPORT" | "HOSPITALITY" | "LIVE";
export type Region = "DACH" | "EU" | "US" | "GLOBAL";
export type ChannelKind = "web_search" | "website" | "rss" | "youtube" | "linkedin" | "newsletter" | "upload" | "api" | "mcp";

/** Bereich im Lagebild (Migration 0008) */
export type Lane = "sport_hospitality" | "startup_tech" | "cross_industry";
export const LANES: Lane[] = ["sport_hospitality", "startup_tech", "cross_industry"];
export const LANE_LABEL: Record<Lane, string> = {
  sport_hospitality: "Sport & Hospitality",
  startup_tech: "Startups & Technologie",
  cross_industry: "Cross-Industry",
};
export const LANE_BLURB: Record<Lane, string> = {
  sport_hospitality: "Clubs, Ligen, Arenen, Hotels und Events – unser Kernmarkt.",
  startup_tech: "Neue Startups, Finanzierungsrunden und Technologien, die für Venues und Hotels taugen.",
  cross_industry: "Flughäfen, Bahnhöfe, Handel, Freizeitparks, Messen: überall mit vielen Menschen und Transaktionen.",
};

export interface Scout {
  id: string;
  key: string | null;
  name: string;
  role: string | null;
  shirtNumber: number | null;
  briefing: string;
  keywords: string[];
  exclusions: string[];
  verticals: Vertical[];
  clusters: string[];
  journeyStages: string[];
  audience: "vip" | "public" | "both";
  regions: Region[];
  languages: string[];
  watchTrends: number[];
  cadence: "daily" | "weekly" | "manual";
  runHour: number;
  runWeekday: number | null;
  maxSearches: number;
  maxCostUsd: number;
  maxSignals: number;
  deliverMedia: boolean;
  minEvidence: "A" | "B" | "C";
  model: string;
  effort: "low" | "medium" | "high";
  active: boolean;
  lastRunAt: string | null;
  channelIds: string[];
  /** fehlt, solange Migration 0008 nicht angewendet ist */
  lane?: Lane;
}

export interface Channel {
  id: string;
  key: string | null;
  name: string;
  kind: ChannelKind;
  url: string | null;
  domains: string[];
  verticals: Vertical[];
  region: Region | null;
  language: string | null;
  access: "open" | "subscription" | "licensed";
  secretRef: string | null;
  notes: string | null;
  active: boolean;
  verified: boolean;
}

export interface Tip {
  id: string;
  url: string;
  note: string | null;
  scoutId: string | null;
  status: "open" | "done" | "failed";
  signalId: string | null;
  error: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface ScoutingSettings {
  monthlyBudgetUsd: number;
  paused: boolean;
}

export const VERTICAL_LABEL: Record<Vertical, string> = { SPORT: "Sport", HOSPITALITY: "Hospitality", LIVE: "Live Entertainment" };
export const REGION_LABEL: Record<Region, string> = { DACH: "DACH", EU: "Europa", US: "USA", GLOBAL: "Global" };
export const CHANNEL_LABEL: Record<ChannelKind, string> = {
  web_search: "Websuche", website: "Website", rss: "RSS-Feed", youtube: "YouTube-Kanal", linkedin: "LinkedIn",
  newsletter: "Newsletter", upload: "Dokumente", api: "Schnittstelle", mcp: "MCP-Server",
};
/** Typen, die der Scout in Paket A schon liest; die übrigen lassen sich anlegen und werden später angebunden */
export const CHANNEL_READY: ChannelKind[] = ["web_search", "website", "rss", "youtube", "linkedin"];
export const MODEL_OPTIONS = { "claude-opus-5-5": "Claude Opus 5.5 (Standard)", "claude-sonnet-5-5": "Claude Sonnet 5.5 (günstiger)" } as const;
