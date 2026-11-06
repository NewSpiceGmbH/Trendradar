import "server-only";

import type { TrendInfo } from "@/components/admin/network-parts";
import { getAdminRepo } from "@/lib/admin/repo";

/** Trends (Nummer, Name, Cluster) für Chips und Eingaben */
export async function trendInfos(): Promise<TrendInfo[]> {
  const trends = await (await getAdminRepo()).trends();
  return trends.map((t) => ({ number: t.fields.number, name: t.fields.name, cluster: t.fields.cluster_code })).sort((a, b) => a.number - b.number);
}
