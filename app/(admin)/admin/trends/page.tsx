import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, Empty, PageHead, btn, input, timeAgo } from "@/components/admin/ui";
import { AUDIENCE_OPTIONS, STAGE_OPTIONS, STATUS_LABEL } from "@/lib/admin/labels";
import { positionOf } from "@/lib/admin/patch";
import { getAdminRepo } from "@/lib/admin/repo";
import type { TrendStatus } from "@/lib/admin/types";
import { fmt } from "@/lib/radar/view";
import type { Scores } from "@/lib/scoring";

export const metadata: Metadata = { title: "Trends · Redaktion" };

export default function TrendsPage(props: PageProps<"/admin/trends">) {
  return (
    <Suspense fallback={<p className="text-muted">Trends werden geladen …</p>}>
      <Trends searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Trends({ searchParams }: { searchParams: PageProps<"/admin/trends">["searchParams"] }) {
  const q = await searchParams;
  const term = typeof q.q === "string" ? q.q.trim().toLowerCase() : "";
  const status = (typeof q.status === "string" && q.status in STATUS_LABEL ? q.status : "") as TrendStatus | "";
  const repo = await getAdminRepo();
  const [trends, lookups] = await Promise.all([repo.trends(), repo.lookups()]);
  const weights = lookups.criteria.map((c) => c.weight) as unknown as Scores;
  const list = trends.filter(
    (t) => (!status || t.fields.status === status) && (!term || `#${t.fields.number} ${t.fields.name} ${t.fields.description}`.toLowerCase().includes(term)),
  );

  return (
    <>
      <PageHead
        eyebrow="Redaktion"
        title="Trends"
        actions={<Link href="/admin/trends/neu" className={btn.primary}>Neuer Trend</Link>}
      >
        Alle Trends inklusive Entwürfen. Jede Änderung wird versioniert und lässt sich wiederherstellen.
      </PageHead>

      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={term} placeholder="Suchen nach Name, Nummer, Beschreibung" aria-label="Trends durchsuchen" className={`${input} max-w-md`} />
        <select name="status" defaultValue={status} aria-label="Status" className={`${input} w-auto`}>
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className={btn.ghost}>Filtern</button>
      </form>

      <Card className="overflow-x-auto !p-0">
        {list.length ? (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-normal">#</th>
                <th className="py-3 font-normal">Trend</th>
                <th className="py-3 font-normal">Ort</th>
                <th className="py-3 font-normal">Zielgruppe</th>
                <th className="py-3 font-normal">Phase (Europa)</th>
                <th className="py-3 font-normal">Score</th>
                <th className="py-3 font-normal">Status</th>
                <th className="py-3 pr-5 font-normal">Geändert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((t) => {
                const v = positionOf(t, "EU", weights);
                return (
                  <tr key={t.id} className="hover:bg-sunk/60">
                    <td className="num px-5 py-3 text-muted">{t.fields.number}</td>
                    <td className="py-3 pr-3">
                      <Link href={`/admin/trends/${t.fields.number}`} className="flex items-center gap-2 font-bold text-ink no-underline hover:underline">
                        <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: `var(--c${t.fields.cluster_code})` }} />
                        {t.fields.name || "(ohne Namen)"}
                      </Link>
                    </td>
                    <td className="py-3 pr-3 text-text">{STAGE_OPTIONS[t.fields.journey_stage]}</td>
                    <td className="py-3 pr-3 text-text">{AUDIENCE_OPTIONS[t.fields.audience]}</td>
                    <td className="py-3 pr-3 text-text">{lookups.zones[v.zone]?.name}</td>
                    <td className="num py-3 pr-3 text-ink">{fmt(v.total)}</td>
                    <td className="py-3 pr-3"><Badge tone={t.fields.status === "published" ? "neutral" : "muted"}>{STATUS_LABEL[t.fields.status]}</Badge></td>
                    <td className="py-3 pr-5 text-xs text-muted">{timeAgo(t.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-6"><Empty>Keine Trends gefunden.</Empty></div>
        )}
      </Card>
    </>
  );
}
