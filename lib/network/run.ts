import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropicClient, closeStaleRuns } from "@/lib/agents/run";
import { monthStart } from "@/lib/agents/schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { NETWORK_MODEL, runCategoryAgent } from "./agent";
import { PARTNER_TYPE_LABEL, type PartnerType } from "./types";

/** Geschätzte Höchstkosten eines Laufs (für die Budgetprüfung vor dem Start) */
const MAX_COST_USD = 2;

/**
 * Netzwerk-Manager: Kategorienliste vorschlagen. Läuft serverseitig mit dem Secret-Key, schreibt aber nur in
 * network_suggestions und agent_runs – nie in offer_categories oder member_offers (Agenten-Regel 1).
 */
export async function runCategorySuggestions(opts: { userId?: string | null; client?: Pick<Anthropic, "beta">; db?: SupabaseClient } = {}) {
  const db = opts.db ?? createAdminClient();
  await closeStaleRuns(db);
  const [settings, spend, trends, members, cands, cats, open] = await Promise.all([
    db.from("scouting_settings").select("monthly_budget_usd, paused").single(),
    db.from("agent_runs").select("cost_usd").gte("started_at", monthStart(new Date())),
    db.from("trends").select("number, name").eq("status", "published").order("number"),
    db.from("startups").select("id, name, partner_types, tagline, solution, use_cases, tags, status").neq("status", "archived").limit(400),
    db.from("startup_candidates").select("name, summary, approach").in("status", ["pending", "watch"]).limit(200),
    db.from("offer_categories").select("name").eq("archived", false),
    db.from("network_suggestions").select("payload").eq("kind", "category").eq("status", "pending"),
  ]);
  for (const [name, r] of Object.entries({ settings, spend, trends, members, cands, cats, open })) {
    if (r.error) return { status: "failed" as const, error: `${name}: ${r.error.message}` };
  }
  const spent = (spend.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const budget = Number(settings.data!.monthly_budget_usd);
  if (settings.data!.paused) return { status: "skipped" as const, reason: "Agenten sind pausiert (Not-Aus unter Scouting)." };
  if (spent + MAX_COST_USD > budget) return { status: "skipped" as const, reason: `Monatsbudget erreicht (${spent.toFixed(2)} von ${budget.toFixed(2)} $).` };
  if (!opts.client && !process.env.ANTHROPIC_API_KEY) return { status: "skipped" as const, reason: "ANTHROPIC_API_KEY ist nicht hinterlegt." };

  const existing = [
    ...(cats.data ?? []).map((c) => c.name as string),
    ...(open.data ?? []).map((s) => String((s.payload as { name?: string })?.name ?? "")).filter(Boolean),
  ];
  const briefing = {
    trends: (trends.data ?? []).map((t) => ({ number: t.number as number, name: t.name as string })),
    members: (members.data ?? []).map((m) => ({
      id: m.id as string, name: m.name as string,
      types: ((m.partner_types as PartnerType[]) ?? []).map((t) => PARTNER_TYPE_LABEL[t] ?? t),
      text: [m.tagline, m.solution, m.use_cases].filter(Boolean).join(" "), tags: (m.tags as string[]) ?? [],
    })),
    candidates: (cands.data ?? []).map((c) => ({ name: c.name as string, text: [c.summary, c.approach].filter(Boolean).join(" ") })),
    existing,
  };

  const { data: run, error: runErr } = await db.from("agent_runs").insert({
    agent: "network", status: "running", model: NETWORK_MODEL, triggered_by: opts.userId ?? null,
    input: { task: "categories", members: briefing.members.length, candidates: briefing.candidates.length, existing: existing.length },
  }).select("id").single();
  if (runErr) return { status: "failed" as const, error: runErr.message };
  const runId = run.id as string;

  try {
    const result = await runCategoryAgent(opts.client ?? anthropicClient(), briefing);
    if (result.categories.length) {
      const { error } = await db.from("network_suggestions").insert(result.categories.map(({ rationale, ...payload }) => ({
        run_id: runId, kind: "category", title: `Kategorie „${payload.name}“`, rationale, payload,
      })));
      if (error) throw new Error(`network_suggestions: ${error.message}`);
    }
    await db.from("agent_runs").update({
      status: "succeeded", finished_at: new Date().toISOString(), model: result.model,
      input_tokens: result.usage.input_tokens + (result.usage.cache_read_input_tokens ?? 0) + (result.usage.cache_creation_input_tokens ?? 0),
      output_tokens: result.usage.output_tokens, cost_usd: result.costUsd,
      output: { task: "categories", suggestions: result.categories.length, rejected: result.rejected, notes: result.notes, turns: result.turns, promptVersion: result.promptVersion },
    }).eq("id", runId);
    return { status: "succeeded" as const, runId, suggestions: result.categories.length, costUsd: result.costUsd };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.from("agent_runs").update({ status: "failed", finished_at: new Date().toISOString(), error }).eq("id", runId);
    return { status: "failed" as const, runId, error };
  }
}
