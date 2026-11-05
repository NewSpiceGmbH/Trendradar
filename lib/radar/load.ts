import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapRadar, type RawRadar } from "./raw";
import type { RadarData } from "./types";

const TREND_SELECT = `
  id, number, name, cluster_code, focus_code, origin, description, use_cases, best_practice,
  signals_summary, opportunities, risks, evidence, uncertain, mandatory,
  subtopics ( name ),
  trend_perspectives ( perspective, horizon, note ),
  trend_scores ( perspective, criterion, score ),
  trend_relevance ( industry_code, relevance ),
  trend_sources ( source_id, perspective ),
  trend_partners ( partner_key, position ),
  trend_premium ( recommendation, why_prioritized )
`;

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Radar-Daten (${what}): ${res.error.message}`);
  return res.data as T;
}

/**
 * Lädt den Radar mit den Rechten des eingeloggten Nutzers. Was RLS nicht freigibt (Entwürfe,
 * Premium-Inhalte für Basic-Kunden, alles für abgelaufene Orgs), kommt hier gar nicht erst an.
 */
export async function loadRadar(supabase: SupabaseClient, opts: { premium: boolean }): Promise<RadarData> {
  const [trends, clusters, focus, subtopics, industries, criteria, zones, insights, sources, partners, cases] =
    await Promise.all([
      supabase.from("trends").select(TREND_SELECT).eq("status", "published").order("number"),
      supabase.from("clusters").select("code, name, position"),
      supabase.from("focus_fields").select("code, name, description"),
      supabase.from("subtopics").select("focus_code, name, position"),
      supabase.from("industries").select("code, name, position"),
      supabase.from("criteria").select("idx, name, weight"),
      supabase.from("zones").select("code, name, tagline"),
      supabase.from("insights").select("title, body, position").eq("status", "published"),
      supabase.from("sources").select("id, title, publisher, published_label, url"),
      supabase.from("partners").select("key, name, role, knowledge_base, partner_sources ( source_id )"),
      opts.premium
        ? supabase.from("cases").select("id, client, year, title, solution, result, case_trends ( trend_id )").eq("status", "published")
        : Promise.resolve({ data: [], error: null }),
    ]);

  // Ort und Zielgruppe gibt es erst ab Migration 0006. Fehlen die Spalten noch, bleibt es bei den Startwerten im Code.
  const extra = await supabase.from("trends").select("id, journey_stage, audience").eq("status", "published");
  const extraById = new Map((extra.error ? [] : (extra.data ?? [])).map((r) => [r.id as number, r]));
  const trendRows = (must(trends, "trends") as unknown as RawRadar["trends"]).map((t) => ({
    ...t,
    journey_stage: (extraById.get(t.id)?.journey_stage as string | undefined) ?? null,
    audience: (extraById.get(t.id)?.audience as string | undefined) ?? null,
  }));

  // Liveticker: RLS gibt Kunden nur freigegebene Meldungen zu veröffentlichten Trends; die Redaktion sieht alle,
  // deshalb hier ausdrücklich nur freigegebene. Fehlt die Spalte (vor 0006), bleibt der Ticker leer.
  const ticker = await supabase
    .from("signals")
    .select("id, trend_id, title, summary, url, publisher, published_on, published_at")
    .not("published_at", "is", null)
    .not("trend_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(60);

  // Startups: RLS gibt Kunden nur veröffentlichte Profile; die Redaktion sieht alle, deshalb ausdrücklich filtern.
  // Vor Migration 0009 gibt es die Tabelle nicht – dann bleibt die Liste leer.
  const startups = await supabase
    .from("startups")
    .select("id, name, website, tagline, solution, stage, country, approved, trend_numbers")
    .eq("published", true)
    .eq("status", "qualified");

  const raw: RawRadar = {
    trends: trendRows,
    clusters: must(clusters, "clusters"),
    focus_fields: must(focus, "focus_fields"),
    subtopics: must(subtopics, "subtopics"),
    industries: must(industries, "industries"),
    criteria: must(criteria, "criteria"),
    zones: must(zones, "zones"),
    insights: must(insights, "insights"),
    sources: must(sources, "sources"),
    partners: must(partners, "partners") as unknown as RawRadar["partners"],
    cases: must(cases, "cases") as unknown as RawRadar["cases"],
    ticker: ticker.error ? [] : (ticker.data as RawRadar["ticker"]),
    startups: startups.error ? [] : (startups.data as RawRadar["startups"]),
    premium: opts.premium,
  };
  return mapRadar(raw);
}
