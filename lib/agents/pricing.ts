/**
 * Kosten eines Agentenlaufs in US-Dollar aus den Usage-Angaben der Claude-API.
 * Preise: Listenpreise der Claude-API (Stand Oktober 2026), pro Million Token; Websuche 10 $ je 1.000 Suchen.
 * Bei Preisänderungen hier anpassen – das Protokoll speichert die Kosten je Lauf, das Monatsbudget rechnet damit.
 */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
export const WEB_SEARCH_USD = 0.01;

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export function costOf(model: string, u: UsageLike): { usd: number; searches: number } {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  const usd =
    (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1_000_000 +
    searches * WEB_SEARCH_USD;
  return { usd: Math.round(usd * 10_000) / 10_000, searches };
}

/** Summe mehrerer Antworten eines Laufs (Agentenschleife) */
export function addUsage(a: UsageLike, b: UsageLike): UsageLike {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    server_tool_use: { web_search_requests: (a.server_tool_use?.web_search_requests ?? 0) + (b.server_tool_use?.web_search_requests ?? 0) },
  };
}

export const ZERO_USAGE: UsageLike = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0 } };
