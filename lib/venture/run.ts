import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropicClient, closeStaleRuns } from "@/lib/agents/run";
import { monthStart } from "@/lib/agents/schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { runVentureAgent } from "./agent";
import { DEEPDIVE_MODEL, runDeepDiveAgent } from "./deepdive";
import type { TranscriptInput } from "./transcript";
import { domainOf, guardRecommendation, totalOf } from "./scoring";
import { mapChallenge } from "./store";

/**
 * Ein Venture-Clienting-Lauf: Budget prüfen (gemeinsam mit den Scouts), Agent ausführen, Kandidaten speichern
 * (ohne Dubletten in derselben Challenge), Lauf protokollieren. Läuft serverseitig mit dem Secret-Key, schreibt aber
 * nur in startup_candidates, agent_runs und challenges (Status, letzter Lauf) – nie in startups (Agenten-Regel 1).
 */
export type VentureOutcome =
  | { status: "succeeded"; runId: string; inserted: number; costUsd: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; runId?: string; error: string };

export async function runChallenge(challengeId: string, opts: { userId?: string | null; client?: Pick<Anthropic, "beta">; db?: SupabaseClient } = {}): Promise<VentureOutcome> {
  const db = opts.db ?? createAdminClient();
  await closeStaleRuns(db);
  const [ch, settings, spend, trends, cands, startups] = await Promise.all([
    db.from("challenges").select("*").eq("id", challengeId).single(),
    db.from("scouting_settings").select("monthly_budget_usd, paused").single(),
    db.from("agent_runs").select("cost_usd").gte("started_at", monthStart(new Date())),
    db.from("trends").select("number, name, cluster_code").eq("status", "published").order("number"),
    db.from("startup_candidates").select("name, domain").eq("challenge_id", challengeId),
    db.from("startups").select("name, domain").limit(300),
  ]);
  for (const [name, r] of Object.entries({ ch, settings, spend, trends, cands, startups })) if (r.error) return { status: "failed", error: `${name}: ${r.error.message}` };
  const challenge = mapChallenge(ch.data as Record<string, unknown>);
  const spent = (spend.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const budget = Number(settings.data!.monthly_budget_usd);
  if (settings.data!.paused) return { status: "skipped", reason: "Agenten sind pausiert (Not-Aus unter Scouting)." };
  if (spent + challenge.maxCostUsd > budget) return { status: "skipped", reason: `Monatsbudget erreicht (${spent.toFixed(2)} von ${budget.toFixed(2)} $).` };
  if (!opts.client && !process.env.ANTHROPIC_API_KEY) return { status: "skipped", reason: "ANTHROPIC_API_KEY ist nicht hinterlegt." };

  const known = [...(cands.data ?? []), ...(startups.data ?? [])].map((k) => ({ name: k.name as string, domain: (k.domain as string | null) ?? null }));
  const now = new Date();
  const { data: run, error: runErr } = await db.from("agent_runs").insert({
    agent: "venture", status: "running", challenge_id: challengeId, model: challenge.model, triggered_by: opts.userId ?? null,
    input: { challenge: challenge.title, known: known.length },
  }).select("id").single();
  if (runErr) return { status: "failed", error: runErr.message };
  const runId = run.id as string;
  await db.from("challenges").update({ status: "scouting" }).eq("id", challengeId);

  try {
    const client = opts.client ?? anthropicClient();
    const result = await runVentureAgent(client, {
      challenge,
      trends: (trends.data ?? []).map((t) => ({ number: t.number as number, name: t.name as string, cluster: t.cluster_code as string })),
      known, today: now,
    });

    const seen = new Set((cands.data ?? []).map((c) => c.domain).filter(Boolean) as string[]);
    const existingStartups = new Map((startups.data ?? []).filter((s) => s.domain).map((s) => [s.domain as string, s.name as string]));
    const rows = [];
    for (const c of result.candidates.slice(0, challenge.maxCandidates)) {
      const domain = domainOf(c.website);
      if (domain && seen.has(domain)) continue;
      if (domain) seen.add(domain);
      // Gesamtscore rechnen wir selbst; die Empfehlung wird gegen Score und Muss-Kriterien abgesichert
      const scores = c.scores.map((s) => ({ ...s, criterion: s.criterion }));
      const total = totalOf(scores as never);
      rows.push({
        challenge_id: challengeId, run_id: runId, name: c.name, website: c.website, domain, country: c.country, founded: c.founded,
        stage: c.stage, funding: c.funding, summary: c.summary, approach: c.approach, scores, total,
        recommendation: guardRecommendation(c.recommendation, total, c.must_have_gaps),
        must_have_gaps: c.must_have_gaps, open_questions: c.open_questions, sources: c.sources,
        uncertain: c.uncertain || c.scores.some((s) => !s.source_url),
        // bereits in der Datenbank: Profil verknüpfen, die Redaktion entscheidet trotzdem
        decision_note: domain && existingStartups.has(domain) ? "Bereits in der Startup-Datenbank." : null,
      });
    }
    if (rows.length) {
      const { error } = await db.from("startup_candidates").insert(rows);
      if (error) throw new Error(`startup_candidates: ${error.message}`);
    }
    await db.from("agent_runs").update({
      status: "succeeded", finished_at: new Date().toISOString(), model: result.model,
      input_tokens: result.usage.input_tokens + (result.usage.cache_read_input_tokens ?? 0) + (result.usage.cache_creation_input_tokens ?? 0),
      output_tokens: result.usage.output_tokens, searches: result.searches, cost_usd: result.costUsd,
      output: { strategy: result.strategy, notes: result.notes, found: result.candidates.length, inserted: rows.length, rejected: result.rejected, turns: result.turns, promptVersion: result.promptVersion },
    }).eq("id", runId);
    await db.from("challenges").update({ status: "review", last_run_at: now.toISOString() }).eq("id", challengeId);
    return { status: "succeeded", runId, inserted: rows.length, costUsd: result.costUsd };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.from("agent_runs").update({ status: "failed", finished_at: new Date().toISOString(), error }).eq("id", runId);
    await db.from("challenges").update({ status: challenge.status === "draft" || challenge.status === "scouting" ? "draft" : challenge.status, last_run_at: now.toISOString() }).eq("id", challengeId);
    return { status: "failed", runId, error };
  }
}

/**
 * Ein Deep-Dive-Gespräch auswerten. Das Transkript kommt nur als Argument herein und wird nirgends gespeichert.
 * Schreibt das konsolidierte Briefing (Entwurf für die Redaktion) an die Challenge, die Kurzfassung ans Gespräch
 * und den Lauf ins Protokoll.
 */
export async function runDeepDive(sessionId: string, transcript: TranscriptInput, opts: { userId?: string | null; client?: Pick<Anthropic, "beta">; db?: SupabaseClient } = {}) {
  const db = opts.db ?? createAdminClient();
  const sess = await db.from("deep_dive_sessions").select("id, challenge_id, title, held_on").eq("id", sessionId).single();
  if (sess.error) return { status: "failed" as const, error: sess.error.message };
  const ch = await db.from("challenges").select("*").eq("id", sess.data.challenge_id).single();
  if (ch.error) return { status: "failed" as const, error: ch.error.message };
  const challenge = mapChallenge(ch.data as Record<string, unknown>);
  const failSession = async (error: string, runId?: string) => {
    await db.from("deep_dive_sessions").update({ status: "failed", error }).eq("id", sessionId);
    if (runId) await db.from("agent_runs").update({ status: "failed", finished_at: new Date().toISOString(), error }).eq("id", runId);
    return { status: "failed" as const, error };
  };
  if (!opts.client && !process.env.ANTHROPIC_API_KEY) return failSession("ANTHROPIC_API_KEY ist nicht hinterlegt.");

  const { data: run, error: runErr } = await db.from("agent_runs").insert({
    agent: "deepdive", status: "running", challenge_id: challenge.id, model: DEEPDIVE_MODEL, triggered_by: opts.userId ?? null,
    input: { session: sess.data.title, kind: transcript.kind, chars: transcript.kind === "text" ? transcript.text.length : null },
  }).select("id").single();
  if (runErr) return failSession(runErr.message);
  const runId = run.id as string;
  await db.from("deep_dive_sessions").update({ run_id: runId }).eq("id", sessionId);

  try {
    const result = await runDeepDiveAgent(opts.client ?? anthropicClient(), {
      challenge, brief: challenge.brief ?? null, transcript, session: { title: sess.data.title as string, heldOn: (sess.data.held_on as string | null) ?? null },
    });
    await db.from("challenges").update({ brief: result.brief, brief_updated_at: new Date().toISOString() }).eq("id", challenge.id);
    await db.from("deep_dive_sessions").update({ status: "done", summary: result.sessionSummary, error: null }).eq("id", sessionId);
    await db.from("agent_runs").update({
      status: "succeeded", finished_at: new Date().toISOString(), model: result.model,
      input_tokens: result.usage.input_tokens + (result.usage.cache_read_input_tokens ?? 0) + (result.usage.cache_creation_input_tokens ?? 0),
      output_tokens: result.usage.output_tokens, cost_usd: result.costUsd,
      output: { session: sess.data.title, turns: result.turns, promptVersion: result.promptVersion },
    }).eq("id", runId);
    return { status: "succeeded" as const, runId, costUsd: result.costUsd };
  } catch (e) {
    return failSession(e instanceof Error ? e.message : String(e), runId);
  }
}
