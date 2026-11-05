import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RestoreButton } from "@/components/admin/restore-button";
import { TrendEditor } from "@/components/admin/trend-editor";
import { Badge, Card, Empty, PageHead, formatDate } from "@/components/admin/ui";
import { FIELD_LABEL, STATUS_LABEL, emptySnapshot } from "@/lib/admin/labels";
import { changedFields, snapshotOf } from "@/lib/admin/patch";
import { getAdminRepo } from "@/lib/admin/repo";
import type { TrendSnapshot, Version } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Trend bearbeiten · Redaktion" };

export default function TrendEditPage(props: PageProps<"/admin/trends/[number]">) {
  return (
    <Suspense fallback={<p className="text-muted">Trend wird geladen …</p>}>
      <Edit params={props.params} />
    </Suspense>
  );
}

/** Kurzbeschreibung einer Version: was hat sich gegenüber dem folgenden Stand geändert? */
function describe(v: Version, after: TrendSnapshot) {
  if (!("fields" in v.snapshot)) return "Neu angelegt";
  const before = v.snapshot as TrendSnapshot;
  const parts = changedFields(before, after).map((k) => FIELD_LABEL[k]);
  if (JSON.stringify(before.scores) !== JSON.stringify(after.scores) || JSON.stringify(before.perspectives) !== JSON.stringify(after.perspectives)) parts.push("Bewertung");
  if (JSON.stringify(before.relevance) !== JSON.stringify(after.relevance)) parts.push("Relevanz");
  return parts.length ? parts.join(", ") : "ohne inhaltliche Änderung";
}

async function Edit({ params }: { params: PageProps<"/admin/trends/[number]">["params"] }) {
  const { number } = await params;
  const repo = await getAdminRepo();
  const [trends, lookups] = await Promise.all([repo.trends(), repo.lookups()]);
  const isNew = number === "neu";
  const trend = isNew ? null : trends.find((t) => t.fields.number === Number(number));
  if (!isNew && !trend) notFound();
  const versions = trend ? await repo.versions(trend.id) : [];
  const initial = trend ? snapshotOf(trend) : emptySnapshot(Math.max(0, ...trends.map((t) => t.fields.number)) + 1);

  return (
    <>
      <nav className="text-sm"><Link href="/admin/trends">← Alle Trends</Link></nav>
      <PageHead
        eyebrow={isNew ? "Neuer Trend" : `Trend #${trend!.fields.number}`}
        title={isNew ? "Neuer Trend" : trend!.fields.name}
        actions={trend && trend.fields.status === "published" ? <Link href={`/radar?v=radar&t=${trend.fields.number}&d=1`} className="glass rounded-[var(--radius-pill)] px-4 py-2 text-sm font-bold text-ink no-underline">Im Stadion ansehen</Link> : undefined}
      >
        {isNew ? "Neue Trends starten als Entwurf. Veröffentlichen über den Status." : undefined}
      </PageHead>
      {trend && (
        <div className="flex flex-wrap gap-2 text-sm text-muted">
          <Badge>{STATUS_LABEL[trend.fields.status]}</Badge>
          <span>Zuletzt geändert {formatDate(trend.updatedAt)}</span>
        </div>
      )}

      <TrendEditor key={trend ? `${trend.id}-${trend.updatedAt}` : "neu"} trendId={trend?.id ?? null} initial={initial} lookups={lookups} />

      {trend && (
        <Card>
          <h2 className="!text-xl">Versionshistorie</h2>
          <p className="mt-1 text-sm text-muted">Vor jeder Änderung wird der bisherige Stand gesichert. Wiederherstellen sichert ebenfalls zuerst den aktuellen Stand.</p>
          {versions.length ? (
            <ol className="mt-4 flex flex-col divide-y divide-line">
              {versions.map((v, i) => {
                const after = i === 0 ? snapshotOf(trend) : ("fields" in versions[i - 1].snapshot ? (versions[i - 1].snapshot as TrendSnapshot) : snapshotOf(trend));
                return (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <span className="flex flex-col">
                      <span className="text-ink">{describe(v, after)}</span>
                      <span className="text-xs text-muted">
                        {formatDate(v.createdAt)}
                        {v.changedBy && lookups.people[v.changedBy] ? ` · ${lookups.people[v.changedBy]}` : ""}
                        {v.proposalId ? <> · <Link href={`/admin/review/${v.proposalId}`}>aus Agenten-Vorschlag</Link></> : ""}
                      </span>
                    </span>
                    {"fields" in v.snapshot && <RestoreButton versionId={v.id} />}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="mt-4"><Empty>Noch keine Änderungen gespeichert.</Empty></div>
          )}
        </Card>
      )}
    </>
  );
}
