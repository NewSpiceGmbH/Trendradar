import type { PartnerType } from "@/lib/network/types";
import type { Maturity } from "@/lib/venture/types";

/** Bewerbungen, Empfehlungen und Änderungsanfragen (Migration 0015) */

export type ApplicationStatus = "unconfirmed" | "new" | "on_hold" | "accepted" | "rejected";
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  unconfirmed: "E-Mail unbestätigt",
  new: "Neu",
  on_hold: "On hold",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
};

export type HoldReason = "documents" | "internal" | "later";
export const HOLD_REASON_LABEL: Record<HoldReason, string> = {
  documents: "Unterlagen fehlen",
  internal: "Rücksprache intern",
  later: "Später prüfen",
};

export interface Precheck {
  /** Website erreichbar? */
  website: "ok" | "unreachable" | "none";
  /** E-Mail-Domain passt zur Website (null = keine Website oder Freemail) */
  emailDomainMatch: boolean | null;
  freemail: boolean;
  duplicates: { kind: "member" | "org" | "application"; id: string; name: string }[];
  checkedAt: string;
}

export interface Application {
  id: string;
  partnerType: PartnerType;
  orgName: string;
  contactName: string | null;
  contactRole: string | null;
  email: string;
  website: string | null;
  founded: number | null;
  details: Record<string, string>;
  offer: string | null;
  offerCategoryIds: string[];
  maturity: Maturity | null;
  referencesText: string | null;
  pitchDeckPath: string | null;
  message: string | null;
  source: "form" | "partner";
  recommendedBy: string | null;
  status: ApplicationStatus;
  holdReason: HoldReason | null;
  holdUntil: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  memberId: string | null;
  orgId: string | null;
  precheck: Precheck | null;
  emailConfirmedAt: string | null;
  createdAt: string;
}

export type ChangeField = "name" | "website" | "tagline" | "solution" | "offer" | "reference" | "contact" | "other";
export const CHANGE_FIELD_LABEL: Record<ChangeField, string> = {
  name: "Name",
  website: "Website",
  tagline: "Kurzbeschreibung (ein Satz)",
  solution: "Lösung / Beschreibung",
  offer: "Angebot",
  reference: "Referenz",
  contact: "Ansprechperson",
  other: "Sonstiges",
};
/** Felder, die beim Übernehmen direkt im Eintrag geändert werden; der Rest wird von Hand gepflegt */
export const AUTO_APPLY_FIELDS: ChangeField[] = ["name", "website", "tagline", "solution"];

export type ChangeStatus = "open" | "accepted" | "adjusted" | "rejected";
export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = { open: "Offen", accepted: "Übernommen", adjusted: "Angepasst übernommen", rejected: "Abgelehnt" };

export interface ChangeRequest {
  id: string;
  memberId: string;
  memberName: string | null;
  field: ChangeField;
  oldValue: string | null;
  newValue: string;
  comment: string | null;
  status: ChangeStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/** Was beim Annehmen angelegt wird (vorbelegt je Partner-Typ, in der Box änderbar) */
export interface AcceptOptions {
  orgName: string;
  tier: "basic" | "premium";
  seats: number;
  months: number | null;
  invite: boolean;
}
export type OrgKindOf = "customer" | "partner" | "investor" | "provider";
export const kindOf = (t: PartnerType): OrgKindOf =>
  t === "multiplier" ? "partner" : t === "investor" ? "investor" : t === "solution_provider" ? "provider" : "customer";
export const KIND_LABEL: Record<OrgKindOf, string> = {
  customer: "Kunde (Radar, Projekte)",
  partner: "Partner-Zugang (Radar lesen, Kontakte empfehlen, keine Projekte)",
  investor: "Investor-Zugang (Radar und öffentliche Einträge, nichts Vertrauliches)",
  provider: "Zugang zum eigenen Profil (nur lesend, „Änderung anfragen“)",
};

export function acceptDefaults(a: Pick<Application, "partnerType" | "orgName">): AcceptOptions {
  const customer = kindOf(a.partnerType) === "customer";
  return { orgName: a.orgName, tier: "basic", seats: customer ? 5 : 3, months: customer ? 12 : 1, invite: true };
}
