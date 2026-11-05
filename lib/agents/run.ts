import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { toMediaRow } from "./media";
import { parseFeed, recentItems } from "./rss";
import { isDue, monthStart, searchSince } from "./schedule";
import { runScoutAgent, type Candidate } from "./scout";
import { mapChannel, mapScout } from "./store";
import type { Channel, Scout, Tip } from "./types";

/**
 * Ein Scout-Lauf mit Datenbank: Budget prüfen, Kandidaten sammeln (RSS, YouTube, Tipps), Agent ausführen,
 * Meldungen und Medien speichern (ohne Dubletten), Lauf protokollieren. Läuft serverseitig mit dem Secret-Key –
 * schreibt aber nur in signals, signal_media, scout_tips, agent_runs und scouts.last_run_at (Agenten-Regel 1).
 */

export type RunOutcome =
  | { status: "succeeded"; runId: string; inserted: number; costUsd: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; runId?: string; error: string };

const FETCH_TIMEOUT_MS = 10_000;

async function getText(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { "user-agent": "NewSpice-Trendradar/1.0 (+https://trendradar.newspice.de)", ...headers }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Neue Einträge aus RSS-Feeds und YouTube-Kanälen des Scouts; Fehler einzelner Kanäle brechen den Lauf nicht ab */
export async function collectCandidates(channels: Channel[], since: Date): Promise<{ candidates: Candidate[]; problems: string[] }> {
  const candidates: Candidate[] = [];
  const problems: string[] = [];
  await Promise.all(
    channels.filter((c) => c.active && c.url).map(async (c) => {
      try {
        if (c.kind === "rss") {
          for (const i of recentItems(parseFeed(await getText(c.url!)), since)) candidates.push({ title: i.title, url: i.url, source: c.name, published: i.published });
        } else if (c.kind === "youtube") {
          const key = process.env[c.secretRef ?? "YOUTUBE_API_KEY"];
          const channelId = c.url!.match(/channel\/(UC[\w-]{20,})/)?.[1];
          if (!key || !channelId) {
            problems.push(`${c.name}: YouTube braucht einen API-Schlüssel und eine Kanal-URL der Form youtube.com/channel/UC…`);
            return;
          }
          const q = new URLSearchParams({ part: "snippet", channelId, order: "date", type: "video", maxResults: "10", publishedAfter: since.toISOString(), key });
          const data = JSON.parse(await getText(`https://www.googleapis.com/youtube/v3/search?${q}`)) as { items?: { id: { videoId: string }; snippet: { title: string; publishedAt: string } }[] };
          for (const v of data.items ?? []) candidates.push({ title: v.snippet.title, url: `https://www.youtube.com/watch?v=${v.id.videoId}`, source: c.name, published: v.snippet.publishedAt.slice(0, 10) });
        }
      } catch (e) {
        problems.push(`${c.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );
  return { candidates: candidates.slice(0, 60), problems };
}

async function load(db: SupabaseClient, scoutId: string) {
  const [scout, settings, spend, trends, known, tips] = await Promise.all([
    db.from("scouts").select("*, scout_channels ( channel_id, source_channels ( * ) )").eq("id", scoutId).single(),
    db.from("scouting_settings").select("monthly_budget_usd, paused").single(),
    db.from("agent_runs").select("cost_usd").gte("started_at", monthStart(new Date())),
    db.from("trends").select("id, number, name, cluster_code").eq("status", "published").order("number"),
    db.from("signals").select("url").order("found_at", { ascending: false }).limit(300),
    db.from("scout_tips").select("*").eq("status", "open").or(`scout_id.eq.${scoutId},scout_id.is.null`).order("created_at").limit(10),
  ]);
  for (const [name, r] of Object.entries({ scout, settings, spend, trends, known, tips })) if (r.error) throw new Error(`${name}: ${r.error.message}`);
  const row = scout.data as Record<string, unknown> & { scout_channels: { channel_id: string; source_channels: Record<string, unknown> }[] };
  return {
    scout: mapScout(row as never),
    channels: row.scout_channels.map((sc) => mapChannel(sc.source_channels)),
    budget: Number(settings.data!.monthly_budget_usd),
    paused: !!settings.data!.paused,
    spent: (spend.data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
    trends: (trends.data ?? []).map((t) => ({ id: t.id as number, number: t.number as number, name: t.name as string, cluster: t.cluster_code as string })),
    knownUrls: (known.data ?? []).map((k) => k.url as string),
    tips: (tips.data ?? []).map((t) => ({ id: t.id, url: t.url, note: t.note, scoutId: t.scout_id, status: t.status, signalId: t.signal_id, error: t.error, createdAt: t.created_at, processedAt: t.processed_at }) as Tip),
  };
}

export async function runScout(scoutId: string, opts: { userId?: string | null; client?: Pick<Anthropic, "beta">; db?: SupabaseClient } = {}): Promise<RunOutcome> {
  const db = opts.db ?? createAdminClient();
  const ctx = await load(db, scoutId);
  const s: Scout = ctx.scout;
  if (ctx.paused) return { status: "skipped", reason: "Scouting ist pausiert (Not-Aus)." };
  if (ctx.spent + s.maxCostUsd > ctx.budget) return { status: "skipped", reason: `Monatsbudget erreicht (${ctx.spent.toFixed(2)} von ${ctx.budget.toFixed(2)} $).` };
  if (!opts.client && !process.env.ANTHROPIC_API_KEY) return { status: "skipped", reason: "ANTHROPIC_API_KEY ist nicht hinterlegt." };

  const now = new Date();
  const since = searchSince(s.lastRunAt, now);
  const { candidates, problems } = await collectCandidates(ctx.channels, since);

  const { data: run, error: runErr } = await db.from("agent_runs").insert({
    agent: "scout", status: "running", scout_id: s.id, model: s.model, triggered_by: opts.userId ?? null,
    input: { scout: s.key ?? s.name, since: since.toISOString(), candidates: candidates.length, tips: ctx.tips.length, channelProblems: problems },
  }).select("id").single();
  if (runErr) return { status: "failed", error: runErr.message };
  const runId = run.id as string;

  try {
    const client = opts.client ?? new Anthropic();
    const result = await runScoutAgent(client, {
      scout: s, channels: ctx.channels, trends: ctx.trends, candidates, tips: ctx.tips, knownUrls: ctx.knownUrls, since, today: now,
    });

    const trendId = new Map(ctx.trends.map((t) => [t.number, t.id]));
    const known = new Set(ctx.knownUrls);
    let inserted = 0;
    for (const f of result.findings) {
      if (known.has(f.url)) continue;
      known.add(f.url);
      const suggested = f.suggested_trends.filter((n) => trendId.has(n)).slice(0, 3);
      const { data: sig, error } = await db.from("signals").upsert({
        title: f.title, summary: f.summary, url: f.url, publisher: f.publisher, published_on: f.published_on, status: "new",
        trend_id: suggested.length ? trendId.get(suggested[0]) : null, run_id: runId, scout_id: s.id,
        kind: f.kind, evidence: f.evidence, relevance: f.relevance, press_release: f.press_release, suggested_trends: suggested,
      }, { onConflict: "url", ignoreDuplicates: true }).select("id").maybeSingle();
      if (error) throw new Error(`signals: ${error.message}`);
      if (!sig) continue; // schon vorhanden
      inserted++;
      if (s.deliverMedia) {
        const media = f.media.map(toMediaRow).filter((m) => m !== null).map((m) => ({ ...m, signal_id: sig.id }));
        if (media.length) {
          const { error: mErr } = await db.from("signal_media").insert(media);
          if (mErr) throw new Error(`signal_media: ${mErr.message}`);
        }
      }
      const tip = f.from_tip ? ctx.tips.find((t) => t.url === f.from_tip) : null;
      if (tip) await db.from("scout_tips").update({ status: "done", signal_id: sig.id, processed_at: new Date().toISOString() }).eq("id", tip.id);
    }
    // Tipps ohne Treffer: erledigt, mit Hinweis
    const usedTips = new Set(result.findings.map((f) => f.from_tip).filter(Boolean));
    for (const t of ctx.tips.filter((t) => !usedTips.has(t.url))) {
      await db.from("scout_tips").update({ status: "done", scout_id: s.id, error: "Keine verwertbare Meldung gefunden.", processed_at: new Date().toISOString() }).eq("id", t.id);
    }

    await db.from("agent_runs").update({
      status: "succeeded", finished_at: new Date().toISOString(), model: result.model,
      input_tokens: result.usage.input_tokens + (result.usage.cache_read_input_tokens ?? 0) + (result.usage.cache_creation_input_tokens ?? 0),
      output_tokens: result.usage.output_tokens, searches: result.searches, cost_usd: result.costUsd,
      output: { notes: result.notes, found: result.findings.length, inserted, rejected: result.rejected, turns: result.turns, promptVersion: result.promptVersion },
    }).eq("id", runId);
    await db.from("scouts").update({ last_run_at: now.toISOString() }).eq("id", s.id);
    return { status: "succeeded", runId, inserted, costUsd: result.costUsd };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.from("agent_runs").update({ status: "failed", finished_at: new Date().toISOString(), error }).eq("id", runId);
    await db.from("scouts").update({ last_run_at: now.toISOString() }).eq("id", s.id);
    return { status: "failed", runId, error };
  }
}

/** Alle Scouts, die laut Zeitplan jetzt dran sind */
export async function dueScouts(now = new Date(), db: SupabaseClient = createAdminClient()): Promise<string[]> {
  const { data, error } = await db.from("scouts").select("id, active, cadence, run_hour, run_weekday, last_run_at").eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((r) => isDue({ active: r.active, cadence: r.cadence, runHour: r.run_hour, runWeekday: r.run_weekday, lastRunAt: r.last_run_at }, now))
    .map((r) => r.id as string);
}
