import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { isFixtureMode } from "@/lib/auth/personas";
import { createClient } from "@/lib/supabase/server";
import { fixtureApplications } from "./fixture";
import type { AcceptOptions, Application, ApplicationStatus, ChangeField, ChangeRequest, ChangeStatus, HoldReason } from "./types";

/** Daten fehlen, weil Migration 0015 noch nicht angewendet ist */
export class ApplicationsMissingError extends Error {
  constructor(detail: string) {
    super(`Bewerbungen und Eingang (Migration 0015) sind in der Datenbank noch nicht angelegt: ${detail}`);
    this.name = "ApplicationsMissingError";
  }
}

export interface AcceptResult { memberId: string; orgId: string; token: string | null; kind: string }
export type RecommendInput = Pick<Application, "partnerType" | "orgName" | "contactName" | "email" | "website" | "message">;

/** Eingang mit den Rechten des eingeloggten Nutzers (RLS gilt) oder im Testmodus auf einen Speicher im Prozess */
export interface ApplicationsRepo {
  // Redaktion
  applications(): Promise<Application[]>;
  application(id: string): Promise<Application | null>;
  hold(id: string, reason: HoldReason, until: string, userId: string): Promise<void>;
  reject(id: string, note: string, userId: string): Promise<void>;
  accept(id: string, o: AcceptOptions): Promise<AcceptResult>;
  pitchDeckUrl(path: string): Promise<string | null>;
  changeRequests(status?: ChangeStatus): Promise<ChangeRequest[]>;
  /** Entscheiden; bei Übernahme einfache Felder direkt im Eintrag ändern */
  decideChange(id: string, status: Exclude<ChangeStatus, "open">, value: string | null, note: string | null, userId: string): Promise<void>;
  // Partner
  recommend(r: RecommendInput, userId: string): Promise<string>;
  myRecommendations(userId: string): Promise<Application[]>;
  // Solution Provider
  requestChange(memberId: string, field: ChangeField, oldValue: string | null, newValue: string, comment: string | null, userId: string): Promise<void>;
}

export async function getApplicationsRepo(): Promise<ApplicationsRepo> {
  await connection();
  if (isFixtureMode()) return fixtureApplications();
  return supabaseApplications(await createClient());
}

const MISSING = /relation .*(applications|change_requests).* does not exist|could not find the (table|function) .*(applications|change_requests|accept_application)/i;
const MESSAGES: Record<string, string> = {
  "bereits entschieden": "Über diese Bewerbung ist bereits entschieden.",
  "applications_hold": "On hold braucht einen Grund und ein Datum für die Wiedervorlage.",
  "invitations_open_once": "Für diese Adresse gibt es schon eine offene Einladung.",
  "row-level security": "Dafür fehlen die Rechte.",
};
export const friendly = (msg: string) => MESSAGES[Object.keys(MESSAGES).find((k) => msg.includes(k)) ?? ""] ?? msg;

function ok<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) {
    if (MISSING.test(res.error.message)) throw new ApplicationsMissingError(res.error.message);
    throw new Error(`${what}: ${friendly(res.error.message)}`);
  }
  return res.data as T;
}

type Row = Record<string, unknown>;
export const mapApplication = (r: Row): Application => ({
  id: r.id as string, partnerType: r.partner_type as Application["partnerType"], orgName: r.org_name as string,
  contactName: (r.contact_name as string | null) ?? null, contactRole: (r.contact_role as string | null) ?? null, email: r.email as string,
  website: (r.website as string | null) ?? null, founded: (r.founded as number | null) ?? null, details: (r.details as Record<string, string>) ?? {},
  offer: (r.offer as string | null) ?? null, offerCategoryIds: (r.offer_category_ids as string[]) ?? [], maturity: (r.maturity as Application["maturity"]) ?? null,
  referencesText: (r.references_text as string | null) ?? null, pitchDeckPath: (r.pitch_deck_path as string | null) ?? null,
  message: (r.message as string | null) ?? null, source: r.source as Application["source"], recommendedBy: (r.recommended_by as string | null) ?? null,
  status: r.status as ApplicationStatus, holdReason: (r.hold_reason as HoldReason | null) ?? null, holdUntil: (r.hold_until as string | null) ?? null,
  decisionNote: (r.decision_note as string | null) ?? null, decidedAt: (r.decided_at as string | null) ?? null,
  memberId: (r.member_id as string | null) ?? null, orgId: (r.org_id as string | null) ?? null, precheck: (r.precheck as Application["precheck"]) ?? null,
  emailConfirmedAt: (r.email_confirmed_at as string | null) ?? null, createdAt: r.created_at as string,
});
const mapChange = (r: Row): ChangeRequest => ({
  id: r.id as string, memberId: r.member_id as string, memberName: ((r.startups as { name?: string } | null)?.name) ?? null,
  field: r.field as ChangeField, oldValue: (r.old_value as string | null) ?? null, newValue: r.new_value as string, comment: (r.comment as string | null) ?? null,
  status: r.status as ChangeStatus, decisionNote: (r.decision_note as string | null) ?? null, decidedAt: (r.decided_at as string | null) ?? null,
  createdAt: r.created_at as string,
});

const COLS = "id, partner_type, org_name, contact_name, contact_role, email, website, founded, details, offer, offer_category_ids, maturity, references_text, pitch_deck_path, message, source, recommended_by, status, hold_reason, hold_until, decision_note, decided_at, member_id, org_id, precheck, email_confirmed_at, created_at";
const COLUMN: Partial<Record<ChangeField, string>> = { name: "name", website: "website", tagline: "tagline", solution: "solution" };

export function supabaseApplications(db: SupabaseClient): ApplicationsRepo {
  return {
    async applications() {
      return ok(await db.from("applications").select(COLS).order("created_at", { ascending: false }).limit(500), "applications").map(mapApplication);
    },
    async application(id) {
      const r = ok(await db.from("applications").select(COLS).eq("id", id).maybeSingle(), "applications");
      return r ? mapApplication(r as Row) : null;
    },
    async hold(id, reason, until, userId) {
      ok(await db.from("applications").update({ status: "on_hold", hold_reason: reason, hold_until: until, decided_by: userId, decided_at: new Date().toISOString() })
        .eq("id", id).in("status", ["new", "on_hold"]).select("id").single(), "applications");
    },
    async reject(id, note, userId) {
      ok(await db.from("applications").update({ status: "rejected", decision_note: note, decided_by: userId, decided_at: new Date().toISOString(), hold_reason: null, hold_until: null })
        .eq("id", id).in("status", ["new", "on_hold"]).select("id").single(), "applications");
    },
    async accept(id, o) {
      const { data, error } = await db.rpc("accept_application", {
        p_id: id, p_org_name: o.orgName, p_tier: o.tier, p_seats: o.seats, p_months: o.months, p_invite: o.invite,
      });
      if (error) {
        if (MISSING.test(error.message)) throw new ApplicationsMissingError(error.message);
        throw new Error(friendly(error.message));
      }
      const r = data as { member_id: string; org_id: string; token: string | null; kind: string };
      return { memberId: r.member_id, orgId: r.org_id, token: r.token ?? null, kind: r.kind };
    },
    async pitchDeckUrl(path) {
      const { data } = await db.storage.from("applications").createSignedUrl(path, 600);
      return data?.signedUrl ?? null;
    },
    async changeRequests(status) {
      let q = db.from("change_requests").select("*, startups ( name )").order("created_at", { ascending: false }).limit(200);
      if (status) q = q.eq("status", status);
      return ok(await q, "change_requests").map((r) => mapChange(r as Row));
    },
    async decideChange(id, status, value, note, userId) {
      const cr = ok(await db.from("change_requests").select("member_id, field, new_value, status").eq("id", id).single(), "change_requests") as Row;
      if (cr.status !== "open") throw new Error("Über diese Anfrage ist bereits entschieden.");
      const col = COLUMN[cr.field as ChangeField];
      if (status !== "rejected" && col) {
        const v = (value ?? (cr.new_value as string)).trim();
        const patch: Row = { [col]: v || null };
        if (col === "website") patch.domain = v ? new URL(/^https?:\/\//.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, "") : null;
        ok(await db.from("startups").update(patch).eq("id", cr.member_id as string).select("id").single(), "startups");
      }
      ok(await db.from("change_requests").update({
        status, decided_by: userId, decided_at: new Date().toISOString(), decision_note: note,
        ...(status === "adjusted" && value ? { new_value: value } : {}),
      }).eq("id", id).select("id").single(), "change_requests");
    },
    async recommend(r, userId) {
      return (ok(await db.from("applications").insert({
        partner_type: r.partnerType, org_name: r.orgName, contact_name: r.contactName, email: r.email, website: r.website, message: r.message,
        privacy_accepted_at: new Date().toISOString(), source: "partner", recommended_by: userId, status: "new", confirm_token: null,
      }).select("id").single(), "applications") as Row).id as string;
    },
    async myRecommendations(userId) {
      return ok(await db.from("applications").select(COLS).eq("recommended_by", userId).order("created_at", { ascending: false }), "applications").map(mapApplication);
    },
    async requestChange(memberId, field, oldValue, newValue, comment, userId) {
      ok(await db.from("change_requests").insert({ member_id: memberId, field, old_value: oldValue, new_value: newValue, comment, requested_by: userId }).select("id").single(), "change_requests");
    },
  };
}
