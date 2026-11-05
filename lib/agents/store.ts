import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { isFixtureMode } from "@/lib/auth/personas";
import { createClient } from "@/lib/supabase/server";
import { MigrationMissingError } from "@/lib/admin/types";
import { fixtureScouting } from "./fixture";
import { isStale, monthStart, STALE_ERROR } from "./schedule";
import type { Channel, Scout, ScoutingSettings, Tip } from "./types";

/** Zugriff auf den Scouting-Stab für das Backend (mit den Rechten der Redaktion; RLS gilt) */
export interface ScoutingRepo {
  settings(): Promise<ScoutingSettings>;
  saveSettings(s: ScoutingSettings): Promise<void>;
  scouts(): Promise<Scout[]>;
  saveScout(id: string | null, s: Omit<Scout, "id" | "lastRunAt" | "key">): Promise<string>;
  channels(): Promise<Channel[]>;
  saveChannel(id: string | null, c: Omit<Channel, "id" | "key">): Promise<string>;
  tips(): Promise<Tip[]>;
  addTip(url: string, note: string | null, scoutId: string | null, userId: string): Promise<void>;
  monthSpendUsd(): Promise<number>;
  runStats(): Promise<Record<string, { runs: number; costUsd: number; signals: number; published: number; lastError: string | null; runningSince: string | null }>>;
}

export async function getScoutingRepo(): Promise<ScoutingRepo> {
  await connection();
  if (isFixtureMode()) return fixtureScouting();
  return supabaseScouting(await createClient());
}

function fail(error: { message: string }, what: string): never {
  if (/relation .*(scouts|source_channels|scout_tips|scouting_settings).* does not exist|could not find the table/i.test(error.message)) {
    throw new MigrationMissingError(`Scouting (Migration 0007): ${error.message}`);
  }
  throw new Error(`${what}: ${error.message}`);
}

const SCOUT_COLS =
  "id, key, name, role, shirt_number, briefing, keywords, exclusions, verticals, clusters, journey_stages, audience, regions, languages, watch_trends, cadence, run_hour, run_weekday, max_searches, max_cost_usd, max_signals, deliver_media, min_evidence, model, effort, active, last_run_at, scout_channels ( channel_id )";

export function mapScout(r: Record<string, unknown> & { scout_channels?: { channel_id: string }[] }): Scout {
  return {
    id: r.id as string, key: r.key as string | null, name: r.name as string, role: r.role as string | null,
    shirtNumber: r.shirt_number as number | null, briefing: r.briefing as string, keywords: r.keywords as string[],
    exclusions: r.exclusions as string[], verticals: r.verticals as Scout["verticals"], clusters: r.clusters as string[],
    journeyStages: r.journey_stages as string[], audience: r.audience as Scout["audience"], regions: r.regions as Scout["regions"],
    languages: r.languages as string[], watchTrends: r.watch_trends as number[], cadence: r.cadence as Scout["cadence"],
    runHour: r.run_hour as number, runWeekday: r.run_weekday as number | null, maxSearches: r.max_searches as number,
    maxCostUsd: Number(r.max_cost_usd), maxSignals: r.max_signals as number, deliverMedia: r.deliver_media as boolean,
    minEvidence: r.min_evidence as Scout["minEvidence"], model: r.model as string, effort: r.effort as Scout["effort"],
    active: r.active as boolean, lastRunAt: r.last_run_at as string | null,
    ...(r.lane ? { lane: r.lane as Scout["lane"] } : {}),
    channelIds: (r.scout_channels ?? []).map((c) => c.channel_id),
  };
}

export function mapChannel(r: Record<string, unknown>): Channel {
  return {
    id: r.id as string, key: r.key as string | null, name: r.name as string, kind: r.kind as Channel["kind"], url: r.url as string | null,
    domains: r.domains as string[], verticals: r.verticals as Channel["verticals"], region: r.region as Channel["region"],
    language: r.language as string | null, access: r.access as Channel["access"], secretRef: r.secret_ref as string | null,
    notes: r.notes as string | null, active: r.active as boolean, verified: r.verified as boolean,
  };
}

const scoutRow = (s: Omit<Scout, "id" | "lastRunAt" | "key">) => ({
  name: s.name, role: s.role, shirt_number: s.shirtNumber, briefing: s.briefing, keywords: s.keywords, exclusions: s.exclusions,
  verticals: s.verticals, clusters: s.clusters, journey_stages: s.journeyStages, audience: s.audience, regions: s.regions,
  languages: s.languages, watch_trends: s.watchTrends, cadence: s.cadence, run_hour: s.runHour, run_weekday: s.runWeekday,
  max_searches: s.maxSearches, max_cost_usd: s.maxCostUsd, max_signals: s.maxSignals, deliver_media: s.deliverMedia,
  min_evidence: s.minEvidence, model: s.model, effort: s.effort, active: s.active,
  // Bereich erst ab Migration 0008; vorher nicht mitschicken, sonst scheitert das Speichern
  ...(s.lane ? { lane: s.lane } : {}),
});

const channelRow = (c: Omit<Channel, "id" | "key">) => ({
  name: c.name, kind: c.kind, url: c.url, domains: c.domains, verticals: c.verticals, region: c.region, language: c.language,
  access: c.access, secret_ref: c.secretRef, notes: c.notes, active: c.active, verified: c.verified,
});

export function supabaseScouting(db: SupabaseClient): ScoutingRepo {
  return {
    async settings() {
      const { data, error } = await db.from("scouting_settings").select("monthly_budget_usd, paused").maybeSingle();
      if (error) fail(error, "scouting_settings");
      return { monthlyBudgetUsd: Number(data?.monthly_budget_usd ?? 200), paused: !!data?.paused };
    },
    async saveSettings(s) {
      const { error } = await db.from("scouting_settings").update({ monthly_budget_usd: s.monthlyBudgetUsd, paused: s.paused, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) fail(error, "scouting_settings");
    },
    async scouts() {
      const { data, error } = await db.from("scouts").select(SCOUT_COLS).order("shirt_number");
      if (error) fail(error, "scouts");
      return (data ?? []).map((r) => mapScout(r as never));
    },
    async saveScout(id, s) {
      const row = scoutRow(s);
      const res = id ? await db.from("scouts").update(row).eq("id", id).select("id").single() : await db.from("scouts").insert(row).select("id").single();
      if (res.error) fail(res.error, "scouts");
      const sid = res.data.id as string;
      // Quellen ersetzen
      const del = await db.from("scout_channels").delete().eq("scout_id", sid);
      if (del.error) fail(del.error, "scout_channels");
      if (s.channelIds.length) {
        const ins = await db.from("scout_channels").insert(s.channelIds.map((channel_id) => ({ scout_id: sid, channel_id })));
        if (ins.error) fail(ins.error, "scout_channels");
      }
      return sid;
    },
    async channels() {
      const { data, error } = await db.from("source_channels").select("*").order("name");
      if (error) fail(error, "source_channels");
      return (data ?? []).map(mapChannel);
    },
    async saveChannel(id, c) {
      const row = channelRow(c);
      const res = id ? await db.from("source_channels").update(row).eq("id", id).select("id").single() : await db.from("source_channels").insert(row).select("id").single();
      if (res.error) fail(res.error, "source_channels");
      return res.data.id as string;
    },
    async tips() {
      const { data, error } = await db.from("scout_tips").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) fail(error, "scout_tips");
      return (data ?? []).map((t) => ({
        id: t.id, url: t.url, note: t.note, scoutId: t.scout_id, status: t.status, signalId: t.signal_id, error: t.error,
        createdAt: t.created_at, processedAt: t.processed_at,
      }));
    },
    async addTip(url, note, scoutId, userId) {
      const { error } = await db.from("scout_tips").insert({ url, note, scout_id: scoutId, submitted_by: userId });
      if (error) fail(error, "scout_tips");
    },
    async monthSpendUsd() {
      const { data, error } = await db.from("agent_runs").select("cost_usd").gte("started_at", monthStart(new Date()));
      if (error) fail(error, "agent_runs");
      return (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    },
    async runStats() {
      const [runs, signals] = await Promise.all([
        db.from("agent_runs").select("scout_id, cost_usd, status, error, started_at").not("scout_id", "is", null).order("started_at", { ascending: false }).limit(500),
        db.from("signals").select("scout_id, published_at").not("scout_id", "is", null).limit(2000),
      ]);
      if (runs.error) fail(runs.error, "agent_runs");
      if (signals.error) fail(signals.error, "signals");
      const out: Awaited<ReturnType<ScoutingRepo["runStats"]>> = {};
      const get = (id: string) => (out[id] ??= { runs: 0, costUsd: 0, signals: 0, published: 0, lastError: null, runningSince: null });
      for (const r of runs.data ?? []) {
        const s = get(r.scout_id as string);
        if (s.runs === 0 && r.status === "failed") s.lastError = r.error as string;
        if (s.runs === 0 && r.status === "running" && !isStale(r.started_at as string)) s.runningSince = r.started_at as string;
        if (s.runs === 0 && r.status === "running" && isStale(r.started_at as string)) s.lastError = STALE_ERROR;
        s.runs++;
        s.costUsd += Number(r.cost_usd ?? 0);
      }
      for (const r of signals.data ?? []) {
        const s = get(r.scout_id as string);
        s.signals++;
        if (r.published_at) s.published++;
      }
      return out;
    },
  };
}
