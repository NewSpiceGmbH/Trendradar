import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { isFixtureMode } from "@/lib/auth/personas";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStatus, CustomerStatus } from "@/lib/projects/types";
import { mapStartup, startupRow } from "@/lib/venture/store";
import { MEMBER_DEFAULTS, type StartupPrivate } from "@/lib/venture/types";
import { fixtureNetwork } from "./fixture";
import type { CategoryPayload, Member, MemberReference, MemberStatus, Offer, OfferCategory, PartnerType, Suggestion, SuggestionStatus } from "./types";

/** Daten fehlen, weil Migration 0014 noch nicht angewendet ist */
export class NetworkMissingError extends Error {
  constructor(detail: string) {
    super(`Die Netzwerk-Datenbank (Migration 0014) ist in der Datenbank noch nicht angelegt: ${detail}`);
    this.name = "NetworkMissingError";
  }
}

export interface Assignment {
  projectId: string;
  title: string;
  orgName: string | null;
  status: ProjectStatus;
  role: "shortlist" | "partner";
  shared: boolean;
  customerStatus: CustomerStatus;
}

export interface NetworkRun {
  id: string;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  error: string | null;
  task: string | null;
  suggestions: number | null;
}

export type CategoryInput = Pick<OfferCategory, "name" | "description" | "trendNumbers" | "archived">;
export type OfferInput = Pick<Offer, "title" | "description" | "categoryIds">;
export type ReferenceInput = Pick<MemberReference, "client" | "period" | "result" | "url" | "published">;
export interface NewMember {
  name: string;
  website: string | null;
  partnerTypes: PartnerType[];
  founded: number | null;
  isStartup: boolean;
  status: MemberStatus;
}

/** Netzwerk-Datenbank mit den Rechten der Redaktion (RLS gilt) oder im Testmodus auf einen Speicher im Prozess */
export interface NetworkRepo {
  members(): Promise<Member[]>;
  member(id: string): Promise<{ member: Member; priv: StartupPrivate } | null>;
  createMember(m: NewMember, userId: string): Promise<string>;
  /** Sichtbarkeit „öffentlich“ (published) – nur für aufgenommene Einträge */
  setPublished(id: string, published: boolean): Promise<void>;
  categories(): Promise<OfferCategory[]>;
  saveCategory(id: string | null, c: CategoryInput, userId: string): Promise<string>;
  offers(memberId?: string): Promise<Offer[]>;
  saveOffer(id: string | null, memberId: string, o: OfferInput): Promise<string>;
  deleteOffer(id: string): Promise<void>;
  references(memberId: string): Promise<MemberReference[]>;
  saveReference(id: string | null, memberId: string, r: ReferenceInput): Promise<string>;
  deleteReference(id: string): Promise<void>;
  interests(memberId: string): Promise<string[]>;
  setInterests(memberId: string, categoryIds: string[]): Promise<void>;
  /** Beziehung „Kunde“: Organisation (id) je Mitglied (nur Redaktion) */
  customerOrgs(): Promise<Map<string, string>>;
  setCustomerOrg(memberId: string, orgId: string | null): Promise<void>;
  assignments(memberId: string): Promise<Assignment[]>;
  suggestions(status?: SuggestionStatus): Promise<Suggestion[]>;
  decideSuggestion(id: string, status: Exclude<SuggestionStatus, "pending">, payload?: CategoryPayload, userId?: string): Promise<void>;
  runs(): Promise<NetworkRun[]>;
}

export async function getNetworkRepo(): Promise<NetworkRepo> {
  await connection();
  if (isFixtureMode()) return fixtureNetwork();
  return supabaseNetwork(await createClient());
}

const MISSING = /relation .*(offer_categories|member_offers|member_offer_categories|member_references|member_interests|member_internal|network_suggestions).* does not exist|could not find the table .*(offer_categories|member_|network_suggestions)|column .*(partner_types|is_startup|role).* does not exist/i;

function fail(error: { message: string }, what: string): never {
  if (MISSING.test(error.message)) throw new NetworkMissingError(error.message);
  throw new Error(`${what}: ${friendly(error.message)}`);
}
function ok<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) fail(res.error, what);
  return res.data as T;
}

const MESSAGES: Record<string, string> = {
  "offer_categories_name": "Eine Kategorie mit diesem Namen gibt es schon.",
  "startups_partner_types": "Bitte mindestens einen Partner-Typ wählen.",
  "startups_publish_qualified": "Nur aufgenommene Einträge lassen sich veröffentlichen.",
  "startups_domain_key": "Einen Eintrag mit dieser Website gibt es schon.",
  "member_references_url_check": "Der Link muss mit http:// oder https:// beginnen.",
};
export const friendly = (msg: string) => MESSAGES[Object.keys(MESSAGES).find((k) => msg.includes(k)) ?? ""] ?? msg;

type Row = Record<string, unknown>;

export const mapCategory = (r: Row): OfferCategory => ({
  id: r.id as string, name: r.name as string, description: (r.description as string | null) ?? null,
  trendNumbers: (r.trend_numbers as number[]) ?? [], archived: Boolean(r.archived),
});
const mapOffer = (r: Row): Offer => ({
  id: r.id as string, memberId: r.member_id as string, title: r.title as string, description: (r.description as string | null) ?? null,
  position: (r.position as number) ?? 0,
  categoryIds: ((r.member_offer_categories as { category_id: string }[] | null) ?? []).map((x) => x.category_id),
});
const mapReference = (r: Row): MemberReference => ({
  id: r.id as string, memberId: r.member_id as string, client: r.client as string, period: (r.period as string | null) ?? null,
  result: (r.result as string | null) ?? null, url: (r.url as string | null) ?? null, published: Boolean(r.published), position: (r.position as number) ?? 0,
});
export const mapSuggestion = (r: Row): Suggestion => ({
  id: r.id as string, runId: (r.run_id as string | null) ?? null, kind: r.kind as Suggestion["kind"], memberId: (r.member_id as string | null) ?? null,
  title: r.title as string, rationale: r.rationale as string, payload: (r.payload as Record<string, unknown>) ?? {},
  status: r.status as SuggestionStatus, decidedAt: (r.decided_at as string | null) ?? null, createdAt: r.created_at as string,
});

export function supabaseNetwork(db: SupabaseClient): NetworkRepo {
  return {
    async members() {
      return ok(await db.from("startups").select("*").order("name"), "startups").map(mapStartup);
    },
    async member(id) {
      const [s, p] = await Promise.all([
        db.from("startups").select("*").eq("id", id).maybeSingle(),
        db.from("startup_private").select("*").eq("startup_id", id).maybeSingle(),
      ]);
      const row = ok(s, "startups");
      if (!row) return null;
      const pr = ok(p, "startup_private") as Row | null;
      return {
        member: mapStartup(row),
        priv: {
          contactName: (pr?.contact_name as string) ?? null, contactRole: (pr?.contact_role as string) ?? null, contactEmail: (pr?.contact_email as string) ?? null,
          pricing: (pr?.pricing as string) ?? null, pitchDeckUrl: (pr?.pitch_deck_url as string) ?? null, notes: (pr?.notes as string) ?? null,
        },
      };
    },
    async createMember(m, userId) {
      const row = startupRow({
        name: m.name, website: m.website, country: null, city: null, founded: m.founded, stage: null, funding: null, teamSize: null, tagline: null,
        solution: null, useCases: null, referenceCustomers: null, trendNumbers: [], tags: [], status: m.status, published: false, logoUrl: null, sources: [],
        ...MEMBER_DEFAULTS, partnerTypes: m.partnerTypes, isStartup: m.isStartup, source: "editor",
      });
      return (ok(await db.from("startups").insert({ ...row, created_by: userId }).select("id").single(), "startups") as Row).id as string;
    },
    async setPublished(id, published) {
      ok(await db.from("startups").update({ published }).eq("id", id).select("id").single(), "startups");
    },
    async categories() {
      return ok(await db.from("offer_categories").select("*").order("name"), "offer_categories").map(mapCategory);
    },
    async saveCategory(id, c, userId) {
      const row = { name: c.name, description: c.description, trend_numbers: c.trendNumbers, archived: c.archived };
      const res = id
        ? await db.from("offer_categories").update(row).eq("id", id).select("id").single()
        : await db.from("offer_categories").insert({ ...row, created_by: userId }).select("id").single();
      return (ok(res, "offer_categories") as Row).id as string;
    },
    async offers(memberId) {
      let q = db.from("member_offers").select("*, member_offer_categories ( category_id )").order("position");
      if (memberId) q = q.eq("member_id", memberId);
      return ok(await q, "member_offers").map(mapOffer);
    },
    async saveOffer(id, memberId, o) {
      const row = { title: o.title, description: o.description };
      let oid = id;
      if (oid) ok(await db.from("member_offers").update(row).eq("id", oid).select("id").single(), "member_offers");
      else {
        const { count } = await db.from("member_offers").select("id", { count: "exact", head: true }).eq("member_id", memberId);
        oid = (ok(await db.from("member_offers").insert({ ...row, member_id: memberId, position: count ?? 0 }).select("id").single(), "member_offers") as Row).id as string;
      }
      ok(await db.from("member_offer_categories").delete().eq("offer_id", oid), "member_offer_categories");
      if (o.categoryIds.length) {
        ok(await db.from("member_offer_categories").insert(o.categoryIds.map((c) => ({ offer_id: oid, category_id: c }))), "member_offer_categories");
      }
      return oid!;
    },
    async deleteOffer(id) {
      ok(await db.from("member_offers").delete().eq("id", id), "member_offers");
    },
    async references(memberId) {
      return ok(await db.from("member_references").select("*").eq("member_id", memberId).order("position"), "member_references").map(mapReference);
    },
    async saveReference(id, memberId, r) {
      const row = { client: r.client, period: r.period, result: r.result, url: r.url, published: r.published };
      if (id) return (ok(await db.from("member_references").update(row).eq("id", id).select("id").single(), "member_references") as Row).id as string;
      const { count } = await db.from("member_references").select("id", { count: "exact", head: true }).eq("member_id", memberId);
      return (ok(await db.from("member_references").insert({ ...row, member_id: memberId, position: count ?? 0 }).select("id").single(), "member_references") as Row).id as string;
    },
    async deleteReference(id) {
      ok(await db.from("member_references").delete().eq("id", id), "member_references");
    },
    async interests(memberId) {
      return (ok(await db.from("member_interests").select("category_id").eq("member_id", memberId), "member_interests") as Row[]).map((r) => r.category_id as string);
    },
    async setInterests(memberId, categoryIds) {
      ok(await db.from("member_interests").delete().eq("member_id", memberId), "member_interests");
      if (categoryIds.length) ok(await db.from("member_interests").insert(categoryIds.map((c) => ({ member_id: memberId, category_id: c }))), "member_interests");
    },
    async customerOrgs() {
      const rows = ok(await db.from("member_internal").select("member_id, org_id").not("org_id", "is", null), "member_internal") as Row[];
      return new Map(rows.map((r) => [r.member_id as string, r.org_id as string]));
    },
    async setCustomerOrg(memberId, orgId) {
      ok(await db.from("member_internal").upsert({ member_id: memberId, org_id: orgId }), "member_internal");
    },
    async assignments(memberId) {
      const rows = ok(
        await db.from("project_startups").select("project_id, role, shared, customer_status, projects ( title, status, organizations ( name ) )").eq("startup_id", memberId),
        "project_startups",
      ) as Row[];
      return rows.map((r) => {
        const p = (r.projects ?? {}) as { title?: string; status?: ProjectStatus; organizations?: { name?: string } | null };
        return {
          projectId: r.project_id as string, title: p.title ?? "Projekt", orgName: p.organizations?.name ?? null, status: p.status ?? "requested",
          role: (r.role as Assignment["role"]) ?? "shortlist", shared: Boolean(r.shared), customerStatus: r.customer_status as CustomerStatus,
        };
      });
    },
    async suggestions(status) {
      let q = db.from("network_suggestions").select("*").order("created_at", { ascending: false }).limit(200);
      if (status) q = q.eq("status", status);
      return ok(await q, "network_suggestions").map(mapSuggestion);
    },
    async decideSuggestion(id, status, payload, userId) {
      ok(await db.from("network_suggestions").update({
        status, decided_at: new Date().toISOString(), decided_by: userId ?? null, ...(payload ? { payload } : {}),
      }).eq("id", id).eq("status", "pending").select("id").single(), "network_suggestions");
    },
    async runs() {
      const rows = ok(
        await db.from("agent_runs").select("id, status, started_at, finished_at, model, input_tokens, output_tokens, cost_usd, error, output")
          .eq("agent", "network").order("started_at", { ascending: false }).limit(20),
        "agent_runs",
      ) as Row[];
      return rows.map((r) => {
        const out = (r.output ?? {}) as { task?: string; suggestions?: number };
        return {
          id: r.id as string, status: r.status as NetworkRun["status"], startedAt: r.started_at as string, finishedAt: (r.finished_at as string | null) ?? null,
          model: (r.model as string | null) ?? null, inputTokens: (r.input_tokens as number | null) ?? null, outputTokens: (r.output_tokens as number | null) ?? null,
          costUsd: r.cost_usd == null ? null : Number(r.cost_usd), error: (r.error as string | null) ?? null, task: out.task ?? null, suggestions: out.suggestions ?? null,
        };
      });
    },
  };
}
