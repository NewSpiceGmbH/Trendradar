import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { isFixtureMode } from "@/lib/auth/personas";
import type { Horizon } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { fixtureRepo } from "./fixture-repo";
import {
  MigrationMissingError, type AdminTrend, type AgentRun, type Lookups, type Persp, type Proposal, type Signal,
  type TeamMember, type TrendPatch, type Version,
} from "./types";

/** Zugriff des Redaktions-Backends. Supabase (mit RLS) oder – im lokalen Testmodus – ein Speicher im Prozess. */
export interface AdminRepo {
  lookups(): Promise<Lookups>;
  trends(): Promise<AdminTrend[]>;
  versions(trendId: number): Promise<Version[]>;
  proposals(): Promise<Proposal[]>;
  signals(): Promise<Signal[]>;
  runs(): Promise<AgentRun[]>;
  team(): Promise<TeamMember[]>;

  editTrend(trendId: number, patch: TrendPatch): Promise<void>;
  createTrend(patch: TrendPatch): Promise<number>;
  restoreVersion(versionId: number): Promise<void>;
  approve(proposalId: string, payload?: Record<string, unknown> | null, note?: string | null): Promise<number | null>;
  reject(proposalId: string, note: string): Promise<void>;
  assignSignal(signalId: string, trendId: number | null): Promise<void>;
  publishSignal(signalId: string, publish: boolean, userId: string): Promise<void>;
  dismissSignal(signalId: string): Promise<void>;
  setRole(email: string, role: "admin" | "editor" | "none"): Promise<void>;
}

export async function getAdminRepo(): Promise<AdminRepo> {
  // Redaktionsdaten sind immer tagesaktuell: zur Anfragezeit rendern, nie vorab
  await connection();
  if (isFixtureMode()) return fixtureRepo();
  return supabaseRepo(await createClient());
}

// ───────────────────────── Supabase ─────────────────────────

/** Fehlermeldungen der Datenbank in verständliches Deutsch */
const MESSAGES: Record<string, string> = {
  nur_redaktion: "Nur für die Redaktion.",
  nur_admin: "Nur Admins dürfen Rollen vergeben.",
  proposal_already_reviewed: "Dieser Vorschlag wurde bereits bearbeitet.",
  proposal_not_pending: "Dieser Vorschlag ist nicht mehr offen.",
  begruendung_fehlt: "Bitte eine Begründung angeben.",
  trend_fehlt: "Der Vorschlag nennt keinen Trend.",
  version_leer: "Dieser Eintrag ist die Neuanlage und lässt sich nicht wiederherstellen.",
  konto_unbekannt: "Zu dieser E-Mail-Adresse gibt es noch kein Konto. Bitte zuerst in Supabase anlegen.",
  eigene_rolle: "Die eigene Admin-Rolle lässt sich nicht entziehen.",
  signals_published_needs_trend: "Eine Meldung braucht einen Trend, bevor sie im Ticker erscheint.",
};

function fail(error: { message: string; code?: string } | null, what: string): never {
  const msg = error?.message ?? "unbekannter Fehler";
  if (/journey_stage|audience|published_at|could not find the function|does not exist/i.test(msg)) throw new MigrationMissingError(msg);
  const known = Object.keys(MESSAGES).find((k) => msg.includes(k));
  throw new Error(known ? MESSAGES[known] : `${what}: ${msg}`);
}

function ok<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) fail(res.error, what);
  return res.data as T;
}

const TREND_SELECT = `
  id, number, name, cluster_code, focus_code, subtopic_id, origin, description, use_cases, best_practice,
  signals_summary, opportunities, risks, evidence, uncertain, mandatory, status, journey_stage, audience, updated_at,
  trend_perspectives ( perspective, horizon, note ),
  trend_scores ( perspective, criterion, score, rationale ),
  trend_relevance ( industry_code, relevance )
`;

type TrendRow = Record<string, unknown> & {
  id: number;
  updated_at: string | null;
  trend_perspectives: { perspective: Persp; horizon: string | null; note: string | null }[];
  trend_scores: { perspective: Persp; criterion: number; score: number; rationale: string | null }[];
  trend_relevance: { industry_code: string; relevance: number }[];
};

const FIELD_KEYS = [
  "number", "name", "cluster_code", "focus_code", "subtopic_id", "origin", "description", "use_cases", "best_practice",
  "signals_summary", "opportunities", "risks", "evidence", "uncertain", "mandatory", "status", "journey_stage", "audience",
] as const;

function mapTrend(r: TrendRow): AdminTrend {
  const persp = (p: Persp) => {
    const row = r.trend_perspectives.find((x) => x.perspective === p);
    return row ? { horizon: row.horizon as Horizon | null, note: row.note } : null;
  };
  const scores = (p: Persp) =>
    r.trend_scores.filter((s) => s.perspective === p).sort((a, b) => a.criterion - b.criterion)
      .map((s) => ({ criterion: s.criterion, score: s.score, rationale: s.rationale }));
  return {
    id: r.id,
    updatedAt: r.updated_at,
    fields: Object.fromEntries(FIELD_KEYS.map((k) => [k, r[k]])) as unknown as AdminTrend["fields"],
    scores: { GLOBAL: scores("GLOBAL"), EU: scores("EU") },
    perspectives: { GLOBAL: persp("GLOBAL"), EU: persp("EU") },
    relevance: Object.fromEntries(r.trend_relevance.map((x) => [x.industry_code, x.relevance])),
  };
}

export function supabaseRepo(db: SupabaseClient): AdminRepo {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) fail(error, fn);
    return data;
  };
  return {
    async lookups() {
      const [clusters, focus, subtopics, industries, criteria, zones, sources, people] = await Promise.all([
        db.from("clusters").select("code, name, position").order("position"),
        db.from("focus_fields").select("code, name"),
        db.from("subtopics").select("id, focus_code, name, position").order("position"),
        db.from("industries").select("code, name, position").order("position"),
        db.from("criteria").select("idx, name, weight").order("idx"),
        db.from("zones").select("code, name"),
        db.from("sources").select("id, title, publisher, url"),
        db.from("profiles").select("id, display_name").in("platform_role", ["admin", "editor"]),
      ]);
      return {
        clusters: ok(clusters, "clusters").map((c) => ({ code: c.code, name: c.name })),
        focus: ok(focus, "focus_fields"),
        subtopics: ok(subtopics, "subtopics").map((s) => ({ id: s.id, focusCode: s.focus_code, name: s.name })),
        industries: ok(industries, "industries").map((i) => ({ code: i.code, name: i.name })),
        criteria: ok(criteria, "criteria").map((c) => ({ idx: c.idx, name: c.name, weight: Number(c.weight) })),
        zones: Object.fromEntries(ok(zones, "zones").map((z) => [z.code, { name: z.name }])),
        sources: Object.fromEntries(ok(sources, "sources").map((s) => [s.id, { title: s.title, publisher: s.publisher, url: s.url }])),
        people: Object.fromEntries((ok(people, "profiles") ?? []).map((p) => [p.id, p.display_name ?? "Redaktion"])),
      };
    },
    async trends() {
      return (ok(await db.from("trends").select(TREND_SELECT).order("number"), "trends") as unknown as TrendRow[]).map(mapTrend);
    },
    async versions(trendId) {
      const rows = ok(
        await db.from("trend_versions").select("id, trend_id, snapshot, changed_by, proposal_id, created_at")
          .eq("trend_id", trendId).order("created_at", { ascending: false }).limit(50),
        "trend_versions",
      );
      return rows.map((v) => ({ id: v.id, trendId: v.trend_id, snapshot: v.snapshot, changedBy: v.changed_by, proposalId: v.proposal_id, createdAt: v.created_at }));
    },
    async proposals() {
      const rows = ok(
        await db.from("proposals")
          .select("id, kind, target_trend_id, payload, rationale, source_ids, status, created_at, reviewed_at, reviewed_by, review_note, agent_runs ( agent )")
          .order("created_at", { ascending: false }).limit(200),
        "proposals",
      ) as unknown as (Record<string, unknown> & { agent_runs: { agent: string } | null })[];
      return rows.map((p) => ({
        id: p.id as string, kind: p.kind as Proposal["kind"], targetTrendId: p.target_trend_id as number | null,
        payload: (p.payload ?? {}) as Record<string, unknown>, rationale: p.rationale as string, sourceIds: (p.source_ids as string[]) ?? [],
        status: p.status as Proposal["status"], createdAt: p.created_at as string, reviewedAt: p.reviewed_at as string | null,
        reviewedBy: p.reviewed_by as string | null, reviewNote: p.review_note as string | null, agent: p.agent_runs?.agent ?? null,
      }));
    },
    async signals() {
      const rows = ok(
        await db.from("signals")
          .select("id, title, summary, url, publisher, published_on, status, trend_id, found_at, published_at")
          .order("found_at", { ascending: false }).limit(300),
        "signals",
      );
      const list: Signal[] = rows.map((s) => ({
        id: s.id, title: s.title, summary: s.summary, url: s.url, publisher: s.publisher, publishedOn: s.published_on,
        status: s.status, trendId: s.trend_id, foundAt: s.found_at, publishedAt: s.published_at,
      }));
      // Scouting-Angaben (Migration 0007) – fehlen die Spalten noch, bleibt es bei den Grunddaten
      const extra = await db.from("signals")
        .select("id, kind, evidence, relevance, press_release, scouts ( name ), signal_media ( id, kind, url, embed_url, title, credit, license, rights, approved )")
        .in("id", list.map((s) => s.id));
      if (!extra.error) {
        const byId = new Map((extra.data as unknown as Record<string, unknown>[]).map((r) => [r.id as string, r]));
        for (const s of list) {
          const r = byId.get(s.id) as (Record<string, unknown> & { scouts: { name: string } | null; signal_media: Record<string, unknown>[] }) | undefined;
          if (!r) continue;
          Object.assign(s, {
            kind: r.kind, evidence: r.evidence, relevance: r.relevance, pressRelease: r.press_release, scoutName: r.scouts?.name ?? null,
            media: (r.signal_media ?? []).map((m) => ({
              id: m.id, kind: m.kind, url: m.url, embedUrl: m.embed_url, title: m.title, credit: m.credit, license: m.license, rights: m.rights, approved: m.approved,
            })),
          });
        }
      }
      return list;
    },
    async runs() {
      const rows = ok(
        await db.from("agent_runs").select("id, agent, status, model, input_tokens, output_tokens, error, started_at, finished_at")
          .order("started_at", { ascending: false }).limit(50),
        "agent_runs",
      );
      const list: AgentRun[] = rows.map((r) => ({
        id: r.id, agent: r.agent, status: r.status, model: r.model, inputTokens: r.input_tokens, outputTokens: r.output_tokens,
        error: r.error, startedAt: r.started_at, finishedAt: r.finished_at,
      }));
      const extra = await db.from("agent_runs").select("id, searches, cost_usd, scouts ( name )").in("id", list.map((r) => r.id));
      if (!extra.error) {
        const byId = new Map((extra.data as unknown as { id: string; searches: number | null; cost_usd: string | null; scouts: { name: string } | null }[]).map((r) => [r.id, r]));
        for (const r of list) {
          const x = byId.get(r.id);
          if (x) Object.assign(r, { searches: x.searches, costUsd: x.cost_usd == null ? null : Number(x.cost_usd), scoutName: x.scouts?.name ?? null });
        }
      }
      return list;
    },
    async team() {
      const rows = (await rpc("team_members", {})) as { id: string; email: string; display_name: string | null; platform_role: "admin" | "editor" }[];
      return (rows ?? []).map((m) => ({ id: m.id, email: m.email, displayName: m.display_name, role: m.platform_role }));
    },

    async editTrend(trendId, patch) { await rpc("edit_trend", { p_trend: trendId, p_patch: patch }); },
    async createTrend(patch) { return (await rpc("create_trend", { p_patch: patch })) as number; },
    async restoreVersion(versionId) { await rpc("restore_trend_version", { p_version: versionId }); },
    async approve(id, payload, note) {
      return (await rpc("approve_proposal", { p_id: id, p_payload: payload ?? null, p_note: note ?? null })) as number | null;
    },
    async reject(id, note) { await rpc("reject_proposal", { p_id: id, p_note: note }); },
    async assignSignal(id, trendId) {
      const patch = trendId == null ? { trend_id: null, status: "new", published_at: null } : { trend_id: trendId, status: "assigned" };
      const { error } = await db.from("signals").update(patch).eq("id", id);
      if (error) fail(error, "signals");
    },
    async publishSignal(id, publish, userId) {
      const { error } = await db.from("signals")
        .update(publish ? { published_at: new Date().toISOString(), published_by: userId, status: "assigned" } : { published_at: null, published_by: null })
        .eq("id", id);
      if (error) fail(error, "signals");
    },
    async dismissSignal(id) {
      const { error } = await db.from("signals").update({ status: "dismissed", published_at: null, published_by: null }).eq("id", id);
      if (error) fail(error, "signals");
    },
    async setRole(email, role) { await rpc("set_platform_role", { p_email: email, p_role: role }); },
  };
}
