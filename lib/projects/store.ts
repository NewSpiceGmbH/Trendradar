import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import type { Viewer } from "@/lib/auth/viewer";
import { isFixtureMode } from "@/lib/auth/personas";
import { createClient } from "@/lib/supabase/server";
import { fixtureProjects } from "./fixture";
import {
  BUCKET, inviteOpen, safeFileName,
  type CustomerStatus, type Invitation, type Member, type Org, type OrgInput, type Project, type ProjectDetail, type ProjectDocument,
  type ProjectPatch, type ProjectRequest, type ShortlistEntry, type ShortlistPatch,
} from "./types";

/** Daten fehlen, weil Migration 0010 noch nicht angewendet ist */
export class ProjectsMissingError extends Error {
  constructor(detail: string) {
    super(`Projekte (Migration 0010) sind in der Datenbank noch nicht angelegt: ${detail}`);
    this.name = "ProjectsMissingError";
  }
}

/**
 * Kunden und Projekte. Supabase mit den Rechten des eingeloggten Nutzers (RLS entscheidet, was Kunden sehen) oder im
 * Testmodus ein Speicher im Prozess, der dieselben Regeln nachbildet.
 */
export interface ProjectsRepo {
  // Kundenverwaltung (Redaktion)
  orgs(): Promise<Org[]>;
  org(id: string): Promise<{ org: Org; members: Member[]; invitations: Invitation[] } | null>;
  saveOrg(id: string | null, o: OrgInput): Promise<string>;
  invite(orgId: string, email: string, role: Member["role"], by: string): Promise<string>;
  revokeInvite(id: string): Promise<void>;
  removeMember(orgId: string, userId: string): Promise<void>;
  // Projekte
  projects(): Promise<Project[]>;
  project(id: string): Promise<ProjectDetail | null>;
  requestProject(orgId: string, r: ProjectRequest, userId: string): Promise<string>;
  saveProject(id: string, p: ProjectPatch): Promise<void>;
  addMilestone(projectId: string, title: string, dueDate: string | null): Promise<void>;
  setMilestoneDone(id: string, done: boolean): Promise<void>;
  deleteMilestone(id: string): Promise<void>;
  addUpdate(projectId: string, body: string, internal: boolean, authorId: string): Promise<void>;
  addToShortlist(projectId: string, startupId: string, rationale: string | null): Promise<void>;
  updateShortlist(projectId: string, startupId: string, p: ShortlistPatch): Promise<void>;
  removeFromShortlist(projectId: string, startupId: string): Promise<void>;
  respond(projectId: string, startupId: string, status: Exclude<CustomerStatus, "selected">, note: string | null): Promise<void>;
  complete(projectId: string, outcome: "success" | "no_success", note: string | null): Promise<number>;
  createDocument(projectId: string, file: { name: string; size: number; mime: string | null }, internal: boolean, userId: string): Promise<{ id: string; path: string }>;
  deleteDocument(id: string): Promise<void>;
  documentUrl(id: string): Promise<string | null>;
  /** Startups der Datenbank zur Auswahl für die Shortlist (Redaktion) */
  startupOptions(): Promise<{ id: string; name: string; tagline: string | null }[]>;
}

export async function getProjectsRepo(viewer: Viewer): Promise<ProjectsRepo> {
  await connection();
  if (isFixtureMode()) return fixtureProjects(viewer);
  return supabaseProjects(await createClient(), viewer);
}

function fail(error: { message: string }, what: string): never {
  if (/relation .*(projects|project_\w+).* does not exist|could not find the (table|function)/i.test(error.message)) throw new ProjectsMissingError(error.message);
  throw new Error(`${what}: ${friendly(error.message)}`);
}
function ok<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) fail(res.error, what);
  return res.data as T;
}
const MESSAGES: Record<string, string> = {
  "row-level security": "Dafür fehlen die Rechte – oder es sind keine Sitzplätze mehr frei.",
  "invitations_open_once": "Für diese Adresse gibt es schon eine offene Einladung.",
  "ausgewählt": "Bitte zuerst das umgesetzte Startup in der Shortlist als ausgewählt markieren.",
  "project_startups_pkey": "Dieses Startup steht schon auf der Shortlist.",
  "project_startups_private_needs_share": "Kosten und Pitchdeck lassen sich nur zusammen mit dem Eintrag freigeben.",
};
const friendly = (msg: string) => MESSAGES[Object.keys(MESSAGES).find((k) => msg.includes(k)) ?? ""] ?? msg;

type Row = Record<string, unknown>;

const mapProject = (r: Row): Project => ({
  id: r.id as string, orgId: r.org_id as string, orgName: ((r.organizations as { name?: string } | null)?.name) ?? null,
  title: r.title as string, request: r.request as string, goal: r.goal as string, venue: r.venue as string | null,
  timeframe: r.timeframe as string | null, budget: r.budget as string | null, status: r.status as Project["status"],
  outcome: r.outcome as Project["outcome"], outcomeNote: r.outcome_note as string | null, challengeId: r.challenge_id as string | null,
  leadId: r.lead_id as string | null, requestedBy: r.requested_by as string | null, completedAt: r.completed_at as string | null,
  createdAt: r.created_at as string, updatedAt: r.updated_at as string,
});

const mapOrg = (r: Row): Org => ({
  id: r.id as string, name: r.name as string, tier: r.tier as Org["tier"], seats: r.seats as number,
  accessFrom: r.access_from as string, accessUntil: r.access_until as string | null, isInternal: !!r.is_internal,
  memberCount: ((r.memberships as unknown[]) ?? []).length,
  openInvites: ((r.invitations as { accepted_at: string | null; expires_at: string }[]) ?? []).filter((i) => inviteOpen({ acceptedAt: i.accepted_at, expiresAt: i.expires_at })).length,
});

export function supabaseProjects(db: SupabaseClient, viewer: Viewer): ProjectsRepo {
  const names = async (ids: (string | null)[]) => {
    const uniq = [...new Set(ids.filter(Boolean) as string[])];
    if (!uniq.length) return new Map<string, string>();
    const { data } = await db.from("profiles").select("id, display_name").in("id", uniq);
    return new Map((data ?? []).map((p) => [p.id as string, (p.display_name as string) || ""]));
  };

  return {
    async orgs() {
      return ok(await db.from("organizations").select("id, name, tier, seats, access_from, access_until, is_internal, memberships ( user_id ), invitations ( accepted_at, expires_at )").order("name"), "organizations").map(mapOrg);
    },
    async org(id) {
      const row = ok(await db.from("organizations").select("id, name, tier, seats, access_from, access_until, is_internal, memberships ( user_id ), invitations ( accepted_at, expires_at )").eq("id", id).maybeSingle(), "organizations");
      if (!row) return null;
      const [members, invites] = await Promise.all([
        db.rpc("org_members", { p_org: id }),
        db.from("invitations").select("id, email, role, token, expires_at, accepted_at, created_at").eq("org_id", id).order("created_at", { ascending: false }),
      ]);
      return {
        org: mapOrg(row),
        // org_members() kommt mit Migration 0010; vorher bleibt die Liste leer
        members: (members.error && /could not find the function/i.test(members.error.message) ? [] : ok(members, "org_members")).map((m: Row) => ({ userId: m.user_id as string, email: m.email as string, name: m.display_name as string | null, role: m.role as Member["role"] })),
        invitations: ok(invites, "invitations").map((i) => ({ id: i.id, email: i.email, role: i.role, token: i.token, expiresAt: i.expires_at, acceptedAt: i.accepted_at, createdAt: i.created_at })),
      };
    },
    async saveOrg(id, o) {
      const row = { name: o.name, tier: o.tier, seats: o.seats, access_from: o.accessFrom, access_until: o.accessUntil };
      const res = id ? await db.from("organizations").update(row).eq("id", id).select("id").single() : await db.from("organizations").insert(row).select("id").single();
      return ok(res, "organizations").id as string;
    },
    async invite(orgId, email, role, by) {
      return (ok(await db.from("invitations").insert({ org_id: orgId, email, role, invited_by: by }).select("token").single(), "invitations") as { token: string }).token;
    },
    async revokeInvite(id) {
      ok(await db.from("invitations").delete().eq("id", id).select("id"), "invitations");
    },
    async removeMember(orgId, userId) {
      ok(await db.from("memberships").delete().eq("org_id", orgId).eq("user_id", userId).select("user_id"), "memberships");
    },

    async projects() {
      return ok(await db.from("projects").select("*, organizations ( name )").order("updated_at", { ascending: false }), "projects").map(mapProject);
    },
    async project(id) {
      const p = ok(await db.from("projects").select("*, organizations ( name )").eq("id", id).maybeSingle(), "projects");
      if (!p) return null;
      const [ms, ups, sl, docs] = await Promise.all([
        db.from("project_milestones").select("*").eq("project_id", id).order("position").order("due_date", { nullsFirst: false }),
        db.from("project_updates").select("*").eq("project_id", id).order("created_at", { ascending: false }),
        db.from("project_startups").select("*, startups ( id, name, website, tagline, solution, stage, country, approved )").eq("project_id", id).order("position"),
        db.from("project_documents").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      ]);
      const shortRows = ok(sl, "project_startups") as Row[];
      const ids = shortRows.map((r) => r.startup_id as string);
      // Vertrauliches: RLS gibt der Redaktion alles, Kunden nur bei Freigabe (share_private)
      const privRows = ids.length ? ok(await db.from("startup_private").select("*").in("startup_id", ids), "startup_private") : [];
      const priv = new Map((privRows as Row[]).map((r) => [r.startup_id as string, r]));
      const updates = ok(ups, "project_updates") as Row[];
      const documents = ok(docs, "project_documents") as Row[];
      const who = await names([...updates.map((u) => u.author_id as string), ...documents.map((d) => d.uploaded_by as string)]);
      const label = (uid: string | null) => (uid && who.get(uid)) || (uid === viewer.id ? viewer.name : "New Spice");
      return {
        project: mapProject(p),
        milestones: (ok(ms, "project_milestones") as Row[]).map((m) => ({ id: m.id as string, title: m.title as string, dueDate: m.due_date as string | null, doneAt: m.done_at as string | null, position: m.position as number })),
        updates: updates.map((u) => ({ id: u.id as string, body: u.body as string, internal: u.internal as boolean, authorId: u.author_id as string | null, authorName: label(u.author_id as string | null), createdAt: u.created_at as string })),
        shortlist: shortRows.filter((r) => r.startups).map((r): ShortlistEntry => {
          const s = r.startups as Row;
          const pr = priv.get(r.startup_id as string);
          return {
            startup: { id: s.id as string, name: s.name as string, website: s.website as string | null, tagline: s.tagline as string | null, solution: s.solution as string | null, stage: s.stage as ShortlistEntry["startup"]["stage"], country: s.country as string | null, approved: s.approved as boolean },
            priv: pr ? { contactName: pr.contact_name as string | null, contactRole: pr.contact_role as string | null, contactEmail: pr.contact_email as string | null, pricing: pr.pricing as string | null, pitchDeckUrl: pr.pitch_deck_url as string | null, notes: viewer.isEditor ? (pr.notes as string | null) : null } : null,
            position: r.position as number, rationale: r.rationale as string | null, shared: r.shared as boolean, sharePrivate: r.share_private as boolean,
            customerStatus: r.customer_status as CustomerStatus, customerNote: r.customer_note as string | null,
          };
        }),
        documents: documents.map((d): ProjectDocument => ({
          id: d.id as string, name: d.name as string, path: d.path as string, sizeBytes: d.size_bytes as number | null, mime: d.mime as string | null,
          internal: d.internal as boolean, uploadedBy: d.uploaded_by as string | null, uploaderName: label(d.uploaded_by as string | null), createdAt: d.created_at as string,
        })),
      };
    },
    async requestProject(orgId, r, userId) {
      const id = crypto.randomUUID();
      // ohne .select(): Kunden dürfen anlegen; die SELECT-Regel gilt danach trotzdem
      ok(await db.from("projects").insert({ id, org_id: orgId, title: r.title, request: r.request, goal: r.goal, venue: r.venue, timeframe: r.timeframe, budget: r.budget, requested_by: userId }), "projects");
      return id;
    },
    async saveProject(id, p) {
      const row: Row = {};
      if (p.title !== undefined) row.title = p.title;
      if (p.request !== undefined) row.request = p.request;
      if (p.goal !== undefined) row.goal = p.goal;
      if (p.venue !== undefined) row.venue = p.venue;
      if (p.timeframe !== undefined) row.timeframe = p.timeframe;
      if (p.budget !== undefined) row.budget = p.budget;
      if (p.status !== undefined) row.status = p.status;
      if (p.challengeId !== undefined) row.challenge_id = p.challengeId;
      if (p.leadId !== undefined) row.lead_id = p.leadId;
      ok(await db.from("projects").update(row).eq("id", id).select("id").single(), "projects");
    },
    async addMilestone(projectId, title, dueDate) {
      ok(await db.from("project_milestones").insert({ project_id: projectId, title, due_date: dueDate }), "project_milestones");
    },
    async setMilestoneDone(id, done) {
      ok(await db.from("project_milestones").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id).select("id").single(), "project_milestones");
    },
    async deleteMilestone(id) {
      ok(await db.from("project_milestones").delete().eq("id", id), "project_milestones");
    },
    async addUpdate(projectId, body, internal, authorId) {
      ok(await db.from("project_updates").insert({ project_id: projectId, body, internal, author_id: authorId }), "project_updates");
    },
    async addToShortlist(projectId, startupId, rationale) {
      const { count } = await db.from("project_startups").select("startup_id", { count: "exact", head: true }).eq("project_id", projectId);
      ok(await db.from("project_startups").insert({ project_id: projectId, startup_id: startupId, rationale, position: count ?? 0 }), "project_startups");
    },
    async updateShortlist(projectId, startupId, p) {
      const row: Row = {};
      if (p.rationale !== undefined) row.rationale = p.rationale;
      if (p.shared !== undefined) row.shared = p.shared;
      if (p.sharePrivate !== undefined) row.share_private = p.sharePrivate;
      if (p.customerStatus !== undefined) row.customer_status = p.customerStatus;
      if (p.position !== undefined) row.position = p.position;
      if (row.shared === false) row.share_private = false;
      ok(await db.from("project_startups").update(row).eq("project_id", projectId).eq("startup_id", startupId).select("startup_id").single(), "project_startups");
    },
    async removeFromShortlist(projectId, startupId) {
      ok(await db.from("project_startups").delete().eq("project_id", projectId).eq("startup_id", startupId), "project_startups");
    },
    async respond(projectId, startupId, status, note) {
      ok(await db.rpc("respond_shortlist", { p_project: projectId, p_startup: startupId, p_status: status, p_note: note }), "respond_shortlist");
    },
    async complete(projectId, outcome, note) {
      return ok(await db.rpc("complete_project", { p_id: projectId, p_outcome: outcome, p_note: note }), "complete_project") as number;
    },
    async createDocument(projectId, file, internal, userId) {
      const id = crypto.randomUUID();
      const path = `${projectId}/${id}-${safeFileName(file.name)}`;
      ok(await db.from("project_documents").insert({ id, project_id: projectId, name: file.name, path, size_bytes: file.size, mime: file.mime, internal, uploaded_by: userId }), "project_documents");
      return { id, path };
    },
    async deleteDocument(id) {
      const doc = ok(await db.from("project_documents").select("path").eq("id", id).maybeSingle(), "project_documents") as { path: string } | null;
      if (!doc) return;
      await db.storage.from(BUCKET).remove([doc.path as string]);
      ok(await db.from("project_documents").delete().eq("id", id), "project_documents");
    },
    async documentUrl(id) {
      const doc = ok(await db.from("project_documents").select("path, name").eq("id", id).maybeSingle(), "project_documents") as { path: string; name: string } | null;
      if (!doc) return null;
      // signierte Adresse mit den Rechten des Nutzers: die Speicherregel prüft dieselbe Freigabe wie der Eintrag
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(doc.path as string, 120, { download: doc.name as string });
      if (error) throw new Error(`Datei nicht abrufbar: ${error.message}`);
      return data.signedUrl;
    },
    async startupOptions() {
      return ok(await db.from("startups").select("id, name, tagline").eq("status", "qualified").order("name"), "startups") as { id: string; name: string; tagline: string | null }[];
    },
  };
}
