import type { MemberSource, PartnerType, Region, Startup } from "@/lib/venture/types";

/**
 * Netzwerk-Datenbank (Migration 0014). Ein Mitglied ist ein Eintrag der Tabelle startups (Typ Startup); dazu kommen
 * Angebote mit Angebotskategorien, Interessen, Referenzen und die Vorschläge des Netzwerk-Managers.
 */
export type Member = Startup;
export type { MemberSource, PartnerType, Region };

export const PARTNER_TYPES: PartnerType[] = ["solution_provider", "club", "operator", "caterer", "multiplier", "investor"];
export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  solution_provider: "Solution Provider",
  club: "Verein",
  operator: "Betreiber",
  caterer: "Caterer",
  multiplier: "Multiplikator",
  investor: "Investor",
};
export const PARTNER_TYPE_HINT: Record<PartnerType, string> = {
  solution_provider: "Startups und Anbieter mit eigener Lösung",
  club: "Clubs und Vereine",
  operator: "Arenen, Venues, Hotels, Veranstalter",
  caterer: "Gastronomie und Catering",
  multiplier: "Verbände, Agenturen, Medien",
  investor: "VCs, Angels, Corporate Venture",
};
/** Typen, die etwas anbieten (Reiter „Angebot“) bzw. etwas suchen (Reiter „Interessen“) */
export const OFFERING_TYPES: PartnerType[] = ["solution_provider", "caterer", "operator"];
export const SEEKING_TYPES: PartnerType[] = ["club", "operator", "investor", "multiplier"];

/** Felder je Partner-Typ (members.details), wie im Bewerbungsformular */
export const DETAIL_FIELDS: Record<PartnerType, { key: string; label: string }[]> = {
  club: [{ key: "league", label: "Sportart / Liga" }, { key: "venue", label: "Stadion / Kapazität" }],
  operator: [{ key: "venue_type", label: "Art der Venue" }, { key: "capacity", label: "Kapazität / Zimmer" }],
  multiplier: [{ key: "network", label: "Netzwerk" }, { key: "reach", label: "Reichweite" }],
  investor: [{ key: "focus", label: "Fokus" }, { key: "ticket", label: "Ticketgröße" }],
  caterer: [{ key: "gastro_type", label: "Art der Gastronomie" }, { key: "sites", label: "Standorte / Venues" }],
  solution_provider: [],
};

export type MemberStatus = Member["status"];
export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  qualified: "Aufgenommen",
  review: "In Prüfung",
  on_hold: "On hold",
  archived: "Archiviert",
};
export const SOURCE_LABEL: Record<MemberSource, string> = { agent: "Agent", editor: "Redaktion", application: "Bewerbung" };
export const REGION_LABEL: Record<Region, string> = { DACH: "DACH", EU: "Europa", US: "USA", GLOBAL: "Global" };

export interface OfferCategory {
  id: string;
  name: string;
  description: string | null;
  trendNumbers: number[];
  archived: boolean;
}

export interface Offer {
  id: string;
  memberId: string;
  title: string;
  description: string | null;
  categoryIds: string[];
  position: number;
}

export interface MemberReference {
  id: string;
  memberId: string;
  client: string;
  period: string | null;
  result: string | null;
  url: string | null;
  published: boolean;
  position: number;
}

export type SuggestionKind = "category" | "merge_categories" | "classify" | "admit" | "stale" | "connection" | "startup_flag";
export const SUGGESTION_KIND_LABEL: Record<SuggestionKind, string> = {
  category: "Neue Kategorie",
  merge_categories: "Kategorien zusammenlegen",
  classify: "Klassifizieren",
  admit: "Aufnehmen",
  stale: "Eintrag veraltet",
  connection: "Verbindung",
  startup_flag: "Merkmal Startup",
};
export type SuggestionStatus = "pending" | "accepted" | "adjusted" | "dismissed";

/** Vorschlag einer Kategorie: Name, Beschreibung, Trends und Mitglieder, die sie anbieten */
export interface CategoryPayload {
  name: string;
  description: string | null;
  trend_numbers: number[];
  member_ids: string[];
}

export interface Suggestion {
  id: string;
  runId: string | null;
  kind: SuggestionKind;
  memberId: string | null;
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
  status: SuggestionStatus;
  decidedAt: string | null;
  createdAt: string;
}

/** Ein Mitglied mit allem, was die Liste braucht */
export interface MemberRow {
  member: Member;
  categoryIds: string[];
  trends: number[];
  offerCount: number;
}

/** Merkmal „Startup“: grundsätzlich jünger als 5 Jahre (Vorschlag; die Redaktion bestätigt) */
export function suggestStartup(founded: number | null, year = new Date().getFullYear()): boolean | null {
  if (founded == null) return null;
  return year - founded < 5;
}
