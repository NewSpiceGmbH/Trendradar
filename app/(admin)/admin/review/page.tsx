import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, Empty, ExampleTag, PageHead, formatDate, timeAgo } from "@/components/admin/ui";
import { KIND_LABEL, applyPatch, positionOf, proposalPatch } from "@/lib/admin/patch";
import { emptySnapshot } from "@/lib/admin/labels";
import { getAdminRepo } from "@/lib/admin/repo";
import type { Proposal, ProposalStatus, TrendPatch } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Review-Queue · Redaktion" };

const TABS: { key: ProposalStatus; label: string }[] = [
  { key: "pending", label: "Offen" },
  { key: "approved", label: "Freigegeben" },
  { key: "rejected", label: "Abgelehnt" },
];

export default function ReviewPage(props: PageProps<"/admin/review">) {
  return (
    <Suspense fallback={<p className="text-muted">Vorschläge werden geladen …</p>}>
      <Review searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Review({ searchParams }: { searchParams: PageProps<"/admin/review">["searchParams"] }) {
  const q = await searchParams;
  const status = (TABS.find((t) => t.key === q.status)?.key ?? "pending") as ProposalStatus;
  const repo = await getAdminRepo();
  const [proposals, trends, lookups] = await Promise.all([repo.proposals(), repo.trends(), repo.lookups()]);
  const byId = new Map(trends.map((t) => [t.id, t]));
  const weights = lookups.criteria.map((c) => c.weight) as unknown as Parameters<typeof positionOf>[2];
  const list = proposals.filter((p) => p.status === status);
  const count = (s: ProposalStatus) => proposals.filter((p) => p.status === s).length;

  /** Auswirkung im Stadion: Phase vorher → nachher (Europa) */
  const impact = (p: Proposal) => {
    const before = p.targetTrendId ? byId.get(p.targetTrendId) : null;
    try {
      if (p.kind === "new_trend") {
        const after = applyPatch(emptySnapshot(), p.payload as TrendPatch);
        return { before: null, after: lookups.zones[positionOf(after, "EU", weights).zone]?.name };
      }
      const patch = proposalPatch(p.kind, p.payload);
      if (!before || !patch) return null;
      const a = positionOf(before, "EU", weights), b = positionOf(applyPatch(before, patch), "EU", weights);
      return a.zone === b.zone && a.total === b.total ? null : { before: lookups.zones[a.zone]?.name, after: lookups.zones[b.zone]?.name, moved: a.zone !== b.zone };
    } catch {
      return null;
    }
  };

  return (
    <>
      <PageHead eyebrow="Redaktion" title="Review-Queue">
        Vorschläge der Agenten. Erst eure Freigabe veröffentlicht eine Änderung – vorher wird der alte Stand gesichert.
      </PageHead>

      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "pending" ? "/admin/review" : `/admin/review?status=${t.key}`}
            aria-current={status === t.key ? "page" : undefined}
            className={`rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-bold no-underline ${status === t.key ? "bg-ink text-bg" : "glass text-ink"}`}
          >
            {t.label} <span className="num opacity-70">{count(t.key)}</span>
          </Link>
        ))}
      </nav>

      <Card className="!p-0">
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((p) => {
              const t = p.targetTrendId ? byId.get(p.targetTrendId) : null;
              const im = p.status === "pending" ? impact(p) : null;
              const title = t ? `#${t.fields.number} ${t.fields.name}` : String((p.payload.fields as { name?: string } | undefined)?.name ?? "Neuer Trend");
              return (
                <li key={p.id}>
                  <Link href={`/admin/review/${p.id}`} className="grid gap-2 px-5 py-4 text-ink no-underline hover:bg-sunk/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge>{KIND_LABEL[p.kind]}</Badge>
                        <b className="truncate">{title}</b>
                        {p.example && <ExampleTag />}
                        {im && (
                          <Badge tone={im.moved || !im.before ? "accent" : "neutral"}>
                            {im.before ? `${im.before} → ${im.after}` : `landet im ${im.after}`}
                          </Badge>
                        )}
                      </span>
                      <span className="line-clamp-2 text-sm text-text">{p.rationale}</span>
                      {p.status !== "pending" && p.reviewNote && <span className="text-sm text-muted">Notiz: {p.reviewNote}</span>}
                    </span>
                    <span className="flex flex-col items-start text-xs text-muted sm:items-end">
                      <span>{p.agent ? `Agent ${p.agent}` : "Agent"}</span>
                      <span title={formatDate(p.createdAt)}>{timeAgo(p.status === "pending" ? p.createdAt : p.reviewedAt)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-6">
            <Empty>{status === "pending" ? "Alles geprüft. Neue Vorschläge der Agenten erscheinen hier." : "Noch keine Einträge."}</Empty>
          </div>
        )}
      </Card>
    </>
  );
}
