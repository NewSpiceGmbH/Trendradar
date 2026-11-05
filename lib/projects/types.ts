import type { Maturity, StartupPrivate } from "@/lib/venture/types";

/** Kunden und Projekte (Migrationen 0002 und 0010) */

export interface Org {
  id: string;
  name: string;
  tier: "basic" | "premium";
  seats: number;
  accessFrom: string;
  accessUntil: string | null;
  isInternal: boolean;
  memberCount: number;
  openInvites: number;
}
export type OrgInput = Pick<Org, "name" | "tier" | "seats" | "accessFrom" | "accessUntil">;

export interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: "owner" | "member";
}

export interface Invitation {
  id: string;
  email: string;
  role: "owner" | "member";
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export type ProjectStatus = "requested" | "scoping" | "shortlist" | "pilot" | "evaluation" | "completed" | "cancelled";
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  requested: "Angefragt",
  scoping: "Klärung",
  shortlist: "Shortlist",
  pilot: "Pilot",
  evaluation: "Auswertung",
  completed: "Abgeschlossen",
  cancelled: "Abgebrochen",
};
/** Phasen in Reihenfolge (für die Fortschrittsanzeige); „Abgebrochen“ steht außerhalb */
export const PROJECT_PHASES: ProjectStatus[] = ["requested", "scoping", "shortlist", "pilot", "evaluation", "completed"];

export interface Project {
  id: string;
  orgId: string;
  orgName: string | null;
  title: string;
  request: string;
  goal: string;
  venue: string | null;
  timeframe: string | null;
  budget: string | null;
  status: ProjectStatus;
  outcome: "success" | "no_success" | null;
  outcomeNote: string | null;
  challengeId: string | null;
  leadId: string | null;
  requestedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type ProjectRequest = Pick<Project, "title" | "request" | "goal" | "venue" | "timeframe" | "budget">;
export type ProjectPatch = Partial<Pick<Project, "title" | "request" | "goal" | "venue" | "timeframe" | "budget" | "status" | "challengeId" | "leadId">>;

export interface Milestone {
  id: string;
  title: string;
  dueDate: string | null;
  doneAt: string | null;
  position: number;
}

export interface ProjectUpdate {
  id: string;
  body: string;
  internal: boolean;
  authorId: string | null;
  /** Name der Person, wenn sichtbar; sonst „New Spice“ */
  authorName: string;
  createdAt: string;
}

export type CustomerStatus = "open" | "interested" | "not_interested" | "selected";
export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  open: "Noch offen",
  interested: "Interessant",
  not_interested: "Nicht passend",
  selected: "Ausgewählt",
};

export interface ShortlistEntry {
  startup: {
    id: string;
    name: string;
    website: string | null;
    tagline: string | null;
    solution: string | null;
    stage: Maturity | null;
    country: string | null;
    approved: boolean;
  };
  /** nur bei Freigabe (Kunde) bzw. immer (Redaktion) */
  priv: StartupPrivate | null;
  position: number;
  rationale: string | null;
  shared: boolean;
  sharePrivate: boolean;
  customerStatus: CustomerStatus;
  customerNote: string | null;
}
export type ShortlistPatch = Partial<Pick<ShortlistEntry, "rationale" | "shared" | "sharePrivate" | "customerStatus" | "position">>;

export interface ProjectDocument {
  id: string;
  name: string;
  path: string;
  sizeBytes: number | null;
  mime: string | null;
  internal: boolean;
  uploadedBy: string | null;
  uploaderName: string;
  createdAt: string;
}

export interface ProjectDetail {
  project: Project;
  milestones: Milestone[];
  updates: ProjectUpdate[];
  shortlist: ShortlistEntry[];
  documents: ProjectDocument[];
}

export const BUCKET = "project-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Dateiname für den Speicherpfad: nur sichere Zeichen, Endung bleibt */
export function safeFileName(name: string): string {
  const base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/-\./g, ".").replace(/^[-.]+|[-.]+$/g, "");
  return (base || "datei").slice(-120);
}

export const fmtBytes = (n: number | null) =>
  n == null ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/** Einladung noch offen und gültig? */
export const inviteOpen = (i: Pick<Invitation, "acceptedAt" | "expiresAt">, now: number = Date.now()) => !i.acceptedAt && Date.parse(i.expiresAt) > now;

/** Zugang einer Organisation heute aktiv und ob er in den nächsten 30 Tagen ausläuft */
export function accessState(o: Pick<Org, "accessFrom" | "accessUntil">, now: Date = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const active = today >= o.accessFrom && (!o.accessUntil || today <= o.accessUntil);
  const soon = active && !!o.accessUntil && Date.parse(o.accessUntil) - now.getTime() < 30 * 86_400_000;
  return { active, soon };
}
