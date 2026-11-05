import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { isFixtureMode } from "@/lib/auth/personas";
import { createClient } from "@/lib/supabase/server";
import { fixtureVenture } from "./fixture";
import { readBrief, type Brief } from "./brief";
import { domainOf } from "./scoring";
import type { Candidate, CandidateStatus, Challenge, DeepDiveSession, Startup, StartupPrivate } from "./types";

/** Daten fehlen, weil Migration 0009 noch nicht angewendet ist */
export class VentureMissingError extends Error {
  constructor(detail: string) {
    super(`Venture Clienting (Migration 0009) ist in der Datenbank noch nicht angelegt: ${detail}`);
    this.name = "VentureMissingError";
  }
}

export interface VentureRun {
  id: string;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt: string | null;
  costUsd: number | null;
  searches: number | null;
  error: string | null;
  strategy: string | null;
  notes: string | null;
  found: number | null;
}

export type ChallengeInput = Omit<Challenge, "id" | "lastRunAt" | "createdAt" | "brief" | "briefUpdatedAt">;
export type StartupInput = Omit<Startup, "id" | "createdAt" | "updatedAt" | "domain" | "approved">;

/** Zugriff auf Venture Clienting mit den Rechten der Redaktion (RLS gilt) oder im Testmodus auf einen Speicher im Prozess */
export interface VentureRepo {
  challenges(): Promise<Challenge[]>;
  challenge(id: string): Promise<Challenge | null>;
  saveChallenge(id: string | null, c: ChallengeInput, userId: string): Promise<string>;
  candidates(challengeId?: string): Promise<Candidate[]>;
  decide(candidateId: string, decision: Exclude<CandidateStatus, "pending">, note: string | null): Promise<string | null>;
  startups(): Promise<Startup[]>;
  startup(id: string): Promise<{ startup: Startup; priv: StartupPrivate } | null>;
  saveStartup(id: string, s: StartupInput, priv: StartupPrivate): Promise<void>;
  runs(challengeId: string): Promise<VentureRun[]>;
  // Problem Deep Dive (Migration 0011)
  sessions(challengeId: string): Promise<DeepDiveSession[]>;
  addSession(challengeId: string, s: Pick<DeepDiveSession, "title" | "heldOn" | "source" | "fileName" | "charCount">, userId: string): Promise<string>;
  deleteSession(id: string): Promise<void>;
  saveBrief(challengeId: string, brief: Brief): Promise<void>;
}

export async function getVentureRepo(): Promise<VentureRepo> {
  await connection();
  if (isFixtureMode()) return fixtureVenture();
  return supabaseVenture(await createClient());
}

function fail(error: { message: string }, what: string): never {
  if (/relation .*(challenges|startups|startup_candidates|startup_private).* does not exist|could not find the (table|function)|column .*challenge_id/i.test(error.message)) {
    throw new VentureMissingError(error.message);
  }
  throw new Error(`${what}: ${error.message}`);
}
function ok<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) fail(res.error, what);
  return res.data as T;
}

type Row = Record<string, unknown>;

export const mapChallenge = (r: Row): Challenge => ({
  id: r.id as string, title: r.title as string, problem: r.problem as string, goal: r.goal as string, context: r.context as string,
  audience: r.audience as Challenge["audience"], journeyStages: r.journey_stages as string[], trendNumbers: r.trend_numbers as number[],
  regions: r.regions as Challenge["regions"], minMaturity: r.min_maturity as Challenge["minMaturity"], mustHaves: r.must_haves as string[],
  exclusions: r.exclusions as string[], leads: (r.leads as string[]) ?? [], timeframe: r.timeframe as string | null, budget: r.budget as string | null,
  status: r.status as Challenge["status"], maxCandidates: r.max_candidates as number, maxSearches: r.max_searches as number,
  maxCostUsd: Number(r.max_cost_usd), model: r.model as string, effort: r.effort as Challenge["effort"],
  lastRunAt: r.last_run_at as string | null, createdAt: r.created_at as string,
  brief: readBrief(r.brief), briefUpdatedAt: (r.brief_updated_at as string | null) ?? null,
});

export const challengeRow = (c: ChallengeInput) => ({
  title: c.title, problem: c.problem, goal: c.goal, context: c.context, audience: c.audience, journey_stages: c.journeyStages,
  trend_numbers: c.trendNumbers, regions: c.regions, min_maturity: c.minMaturity, must_haves: c.mustHaves, exclusions: c.exclusions,
  leads: c.leads, timeframe: c.timeframe, budget: c.budget, status: c.status, max_candidates: c.maxCandidates, max_searches: c.maxSearches,
  max_cost_usd: c.maxCostUsd, model: c.model, effort: c.effort,
});

export const mapCandidate = (r: Row): Candidate => ({
  id: r.id as string, challengeId: r.challenge_id as string, runId: r.run_id as string | null, startupId: r.startup_id as string | null,
  name: r.name as string, website: r.website as string | null, domain: r.domain as string | null, country: r.country as string | null,
  founded: r.founded as number | null, stage: r.stage as Candidate["stage"], funding: r.funding as string | null, summary: r.summary as string,
  approach: r.approach as string | null, scores: (r.scores as Candidate["scores"]) ?? [], total: Number(r.total),
  recommendation: r.recommendation as Candidate["recommendation"], mustHaveGaps: r.must_have_gaps as string[],
  openQuestions: r.open_questions as string[], sources: (r.sources as Candidate["sources"]) ?? [], uncertain: r.uncertain as boolean,
  status: r.status as Candidate["status"], decidedAt: r.decided_at as string | null, decisionNote: r.decision_note as string | null,
  createdAt: r.created_at as string,
});

export const mapStartup = (r: Row): Startup => ({
  id: r.id as string, name: r.name as string, website: r.website as string | null, domain: r.domain as string | null,
  country: r.country as string | null, city: r.city as string | null, founded: r.founded as number | null, stage: r.stage as Startup["stage"],
  funding: r.funding as string | null, teamSize: r.team_size as string | null, tagline: r.tagline as string | null,
  solution: r.solution as string | null, useCases: r.use_cases as string | null, referenceCustomers: r.reference_customers as string | null,
  trendNumbers: (r.trend_numbers as number[]) ?? [], tags: (r.tags as string[]) ?? [], status: r.status as Startup["status"],
  approved: r.approved as boolean, published: r.published as boolean, logoUrl: r.logo_url as string | null,
  sources: (r.sources as Startup["sources"]) ?? [], createdAt: r.created_at as string, updatedAt: r.updated_at as string,
});

const mapPrivate = (r: Row | null): StartupPrivate => ({
  contactName: (r?.contact_name as string) ?? null, contactRole: (r?.contact_role as string) ?? null, contactEmail: (r?.contact_email as string) ?? null,
  pricing: (r?.pricing as string) ?? null, pitchDeckUrl: (r?.pitch_deck_url as string) ?? null, notes: (r?.notes as string) ?? null,
});

const MESSAGES: Record<string, string> = {
  "Begründung": "Bitte eine Begründung angeben.",
  "bereits entschieden": "Über diesen Kandidaten ist bereits entschieden.",
  "startups_publish_qualified": "Archivierte Profile lassen sich nicht veröffentlichen.",
  "startups_domain_key": "Ein Startup mit dieser Website gibt es schon in der Datenbank.",
};
const friendly = (msg: string) => MESSAGES[Object.keys(MESSAGES).find((k) => msg.includes(k)) ?? ""] ?? msg;

export function supabaseVenture(db: SupabaseClient): VentureRepo {
  return {
    async challenges() {
      return ok(await db.from("challenges").select("*").order("updated_at", { ascending: false }), "challenges").map(mapChallenge);
    },
    async challenge(id) {
      const r = ok(await db.from("challenges").select("*").eq("id", id).maybeSingle(), "challenges");
      return r ? mapChallenge(r) : null;
    },
    async saveChallenge(id, c, userId) {
      const row = challengeRow(c);
      const res = id
        ? await db.from("challenges").update(row).eq("id", id).select("id").single()
        : await db.from("challenges").insert({ ...row, created_by: userId }).select("id").single();
      return ok(res, "challenges").id as string;
    },
    async candidates(challengeId) {
      let q = db.from("startup_candidates").select("*").order("total", { ascending: false });
      if (challengeId) q = q.eq("challenge_id", challengeId);
      return ok(await q, "startup_candidates").map(mapCandidate);
    },
    async decide(candidateId, decision, note) {
      const { data, error } = await db.rpc("decide_candidate", { p_id: candidateId, p_decision: decision, p_note: note });
      if (error) {
        if (/could not find the function/i.test(error.message)) fail(error, "decide_candidate");
        throw new Error(friendly(error.message));
      }
      return (data as string | null) ?? null;
    },
    async startups() {
      return ok(await db.from("startups").select("*").order("name"), "startups").map(mapStartup);
    },
    async startup(id) {
      const [s, p] = await Promise.all([
        db.from("startups").select("*").eq("id", id).maybeSingle(),
        db.from("startup_private").select("*").eq("startup_id", id).maybeSingle(),
      ]);
      const row = ok(s, "startups");
      if (!row) return null;
      return { startup: mapStartup(row), priv: mapPrivate(ok(p, "startup_private")) };
    },
    async saveStartup(id, s, priv) {
      const { error } = await db.from("startups").update({
        name: s.name, website: s.website, domain: domainOf(s.website), country: s.country, city: s.city, founded: s.founded, stage: s.stage, funding: s.funding,
        team_size: s.teamSize, tagline: s.tagline, solution: s.solution, use_cases: s.useCases, reference_customers: s.referenceCustomers,
        trend_numbers: s.trendNumbers, tags: s.tags, status: s.status, published: s.published, logo_url: s.logoUrl, sources: s.sources,
      }).eq("id", id);
      if (error) throw new Error(friendly(error.message));
      const p = await db.from("startup_private").upsert({
        startup_id: id, contact_name: priv.contactName, contact_role: priv.contactRole, contact_email: priv.contactEmail,
        pricing: priv.pricing, pitch_deck_url: priv.pitchDeckUrl, notes: priv.notes,
      });
      if (p.error) throw new Error(friendly(p.error.message));
    },
    async sessions(challengeId) {
      const { data, error } = await db.from("deep_dive_sessions").select("*").eq("challenge_id", challengeId).order("created_at");
      if (error) {
        if (/does not exist|could not find the table/i.test(error.message)) return []; // vor Migration 0011
        fail(error, "deep_dive_sessions");
      }
      return (data ?? []).map((r) => ({
        id: r.id, title: r.title, heldOn: r.held_on, source: r.source, fileName: r.file_name, charCount: r.char_count,
        status: r.status, summary: r.summary, error: r.error, createdAt: r.created_at,
      }));
    },
    async addSession(challengeId, s, userId) {
      const r = await db.from("deep_dive_sessions").insert({
        challenge_id: challengeId, title: s.title, held_on: s.heldOn, source: s.source, file_name: s.fileName, char_count: s.charCount, created_by: userId,
      }).select("id").single();
      if (r.error && /does not exist|could not find the table/i.test(r.error.message)) throw new Error("Der Deep Dive ist noch nicht eingerichtet (Migration 0011 fehlt).");
      return ok(r, "deep_dive_sessions").id as string;
    },
    async deleteSession(id) {
      ok(await db.from("deep_dive_sessions").delete().eq("id", id), "deep_dive_sessions");
    },
    async saveBrief(challengeId, brief) {
      ok(await db.from("challenges").update({ brief, brief_updated_at: new Date().toISOString() }).eq("id", challengeId).select("id").single(), "challenges");
    },
    async runs(challengeId) {
      const rows = ok(
        await db.from("agent_runs").select("id, status, started_at, finished_at, cost_usd, searches, error, output")
          .eq("challenge_id", challengeId).eq("agent", "venture").order("started_at", { ascending: false }).limit(20),
        "agent_runs",
      );
      return rows.map((r) => {
        const out = (r.output ?? {}) as { strategy?: string; notes?: string; found?: number };
        return {
          id: r.id as string, status: r.status as VentureRun["status"], startedAt: r.started_at as string, finishedAt: r.finished_at as string | null,
          costUsd: r.cost_usd == null ? null : Number(r.cost_usd), searches: r.searches as number | null, error: r.error as string | null,
          strategy: out.strategy ?? null, notes: out.notes ?? null, found: out.found ?? null,
        };
      });
    },
  };
}
