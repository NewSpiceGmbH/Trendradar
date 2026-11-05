import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReviewActions } from "@/components/admin/review-actions";
import { Badge, Card, ExampleTag, PageHead, formatDate } from "@/components/admin/ui";
import { FIELD_LABEL, emptySnapshot, fieldValue } from "@/lib/admin/labels";
import { KIND_LABEL, applyPatch, changedFields, positionOf, proposalPatch } from "@/lib/admin/patch";
import { getAdminRepo } from "@/lib/admin/repo";
import type { Lookups, Proposal, Signal, TrendPatch, TrendSnapshot } from "@/lib/admin/types";
import { fmt } from "@/lib/radar/view";
import type { Perspective, Scores } from "@/lib/scoring";

export const metadata: Metadata = { title: "Vorschlag · Redaktion" };

export default function ProposalPage(props: PageProps<"/admin/review/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Vorschlag wird geladen …</p>}>
      <Detail params={props.params} />
    </Suspense>
  );
}

function Impact({ before, after, lookups }: { before: TrendSnapshot | null; after: TrendSnapshot; lookups: Lookups }) {
  const weights = lookups.criteria.map((c) => c.weight) as unknown as Scores;
  const rows = (["EU", "GLOBAL"] as Perspective[]).map((p) => ({
    p,
    a: before ? positionOf(before, p, weights) : null,
    b: positionOf(after, p, weights),
  }));
  return (
    <Card>
      <h2 className="!text-xl">Auswirkung im Stadion</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {rows.map(({ p, a, b }) => {
          const moved = a && a.zone !== b.zone;
          return (
            <div key={p} className={`flex flex-col gap-1 rounded-xl p-4 ${moved ? "bg-accent text-on-accent" : "border border-line"}`}>
              <span className={`eyebrow !text-[11px] ${moved ? "!text-on-accent" : "!text-muted"}`}>{p === "EU" ? "Europa / DACH" : "Global"}</span>
              <span className="text-lg font-bold">
                {a ? `${lookups.zones[a.zone]?.name} → ${lookups.zones[b.zone]?.name}` : `neu im ${lookups.zones[b.zone]?.name}`}
              </span>
              <span className="num text-sm">
                Score {a ? `${fmt(a.total)} → ` : ""}{fmt(b.total)} · Horizont {a && a.horizon !== b.horizon ? `${a.horizon} → ` : ""}{b.horizon} J.
              </span>
              {moved && <span className="text-sm">Der Punkt wandert auf einen anderen Ring.</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FieldDiff({ before, after, lookups }: { before: TrendSnapshot | null; after: TrendSnapshot; lookups: Lookups }) {
  const keys = before ? changedFields(before, after) : (Object.keys(after.fields) as (keyof TrendSnapshot["fields"])[]).filter((k) => after.fields[k] != null && after.fields[k] !== "" && k !== "number" && k !== "status");
  if (!keys.length) return null;
  return (
    <Card>
      <h2 className="!text-xl">{before ? "Vorher / Nachher" : "Inhalt des neuen Trends"}</h2>
      <dl className="mt-4 flex flex-col gap-5">
        {keys.map((k) => (
          <div key={k} className="flex flex-col gap-2">
            <dt className="eyebrow !text-muted">{FIELD_LABEL[k]}</dt>
            <dd className={`grid gap-3 text-sm ${before ? "md:grid-cols-2" : ""}`}>
              {before && (
                <p className="rounded-xl border border-line p-3 text-muted line-through decoration-[color-mix(in_srgb,var(--muted)_50%,transparent)]">
                  {fieldValue(k, before.fields[k], lookups)}
                </p>
              )}
              <p className="rounded-xl border border-line bg-sunk p-3 text-ink">{fieldValue(k, after.fields[k], lookups)}</p>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function ScoreDiff({ before, after, lookups }: { before: TrendSnapshot | null; after: TrendSnapshot; lookups: Lookups }) {
  const persps = (["GLOBAL", "EU"] as const).filter((p) => JSON.stringify(before?.scores[p] ?? []) !== JSON.stringify(after.scores[p]) || JSON.stringify(before?.perspectives[p] ?? null) !== JSON.stringify(after.perspectives[p]));
  if (!persps.length) return null;
  return (
    <Card>
      <h2 className="!text-xl">Bewertung</h2>
      {persps.map((p) => {
        const b = before?.scores[p] ?? [];
        const a = after.scores[p];
        const g = after.scores.GLOBAL;
        return (
          <div key={p} className="mt-4 flex flex-col gap-2">
            <p className="eyebrow !text-muted">{p === "EU" ? "Europa / DACH (nur Abweichungen von Global)" : "Global"}</p>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="py-1 font-normal">Kriterium</th><th className="w-24 py-1 font-normal">Score</th><th className="py-1 font-normal">Begründung</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lookups.criteria.map((c) => {
                  const was = b.find((s) => s.criterion === c.idx)?.score ?? (p === "EU" ? g.find((s) => s.criterion === c.idx)?.score : undefined);
                  const now = a.find((s) => s.criterion === c.idx);
                  const changed = now && was !== now.score;
                  return (
                    <tr key={c.idx}>
                      <td className="py-2 pr-3 text-ink">{c.name}</td>
                      <td className="num py-2 pr-3">{now ? (changed && was != null ? <><span className="text-muted line-through">{was}</span> → <b className="text-ink">{now.score}</b></> : <span className="text-ink">{now.score}</span>) : <span className="text-muted">wie Global</span>}</td>
                      <td className="py-2 text-text">{now?.rationale ?? "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(after.perspectives[p]?.horizon || after.perspectives[p]?.note) && (
              <p className="text-sm">
                {after.perspectives[p]?.horizon && <>Horizont <b className="text-ink">{after.perspectives[p]!.horizon} Jahre</b>. </>}
                {after.perspectives[p]?.note}
              </p>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function SignalCard({ signal }: { signal: Signal | undefined }) {
  if (!signal) return null;
  return (
    <Card>
      <h2 className="!text-xl">Meldung</h2>
      <div className="mt-3 flex flex-col gap-1 text-sm">
        <a href={signal.url} target="_blank" rel="noopener noreferrer" className="font-bold">{signal.title}</a>
        <span className="text-muted">{signal.publisher ?? "–"} · {signal.url}</span>
        {signal.summary && <p className="mt-2 text-ink">{signal.summary}</p>}
      </div>
    </Card>
  );
}

async function Detail({ params }: { params: PageProps<"/admin/review/[id]">["params"] }) {
  const { id } = await params;
  const repo = await getAdminRepo();
  const [proposals, trends, signals, lookups] = await Promise.all([repo.proposals(), repo.trends(), repo.signals(), repo.lookups()]);
  const p: Proposal | undefined = proposals.find((x) => x.id === id);
  if (!p) notFound();
  const target = p.targetTrendId ? trends.find((t) => t.id === p.targetTrendId) ?? null : null;

  let after: TrendSnapshot | null = null;
  let previewError: string | null = null;
  try {
    if (p.kind === "new_trend") after = applyPatch(emptySnapshot(Math.max(...trends.map((t) => t.fields.number)) + 1), p.payload as TrendPatch);
    else if (target) after = applyPatch(target, proposalPatch(p.kind, p.payload) ?? {});
  } catch (e) {
    previewError = e instanceof Error ? e.message : String(e);
  }
  const pending = proposals.filter((x) => x.status === "pending" && x.id !== p.id);
  const signal = p.kind === "attach_signal" ? signals.find((s) => s.id === p.payload.signal_id) : undefined;
  const sources = [...p.sourceIds.map((s) => ({ key: s, title: lookups.sources[s]?.title ?? s, url: lookups.sources[s]?.url })),
    ...(p.kind === "new_source" ? [{ key: "neu", title: String(p.payload.title ?? ""), url: String(p.payload.url ?? "") }] : [])];
  const title = target ? `#${target.fields.number} ${target.fields.name}` : String((p.payload.fields as { name?: string } | undefined)?.name ?? "Neuer Trend");

  return (
    <>
      <nav className="text-sm"><Link href="/admin/review">← Review-Queue</Link></nav>
      <PageHead eyebrow={KIND_LABEL[p.kind]} title={title}>{p.rationale}</PageHead>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {p.example && <ExampleTag />}
        <Badge tone={p.status === "pending" ? "neutral" : "muted"}>{{ pending: "Offen", approved: "Freigegeben", rejected: "Abgelehnt" }[p.status]}</Badge>
        <span>{p.agent ? `Agent ${p.agent}` : "Agent"} · {formatDate(p.createdAt)}</span>
        {p.reviewedAt && <span>· geprüft {formatDate(p.reviewedAt)}{p.reviewedBy && lookups.people[p.reviewedBy] ? ` von ${lookups.people[p.reviewedBy]}` : ""}</span>}
        {target && <Link href={`/admin/trends/${target.fields.number}`}>Trend öffnen</Link>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {previewError && <Card><p className="text-ink">Vorschau nicht möglich: {previewError}</p></Card>}
          {after && p.status === "pending" && (p.kind !== "attach_signal" || !!p.payload.fields) && <Impact before={target} after={after} lookups={lookups} />}
          {after && p.status === "pending" && <FieldDiff before={target} after={after} lookups={lookups} />}
          {after && p.status === "pending" && <ScoreDiff before={target} after={after} lookups={lookups} />}
          {p.status !== "pending" && (
            <Card>
              <p>Dieser Vorschlag ist erledigt{p.reviewNote ? `: „${p.reviewNote}“` : "."} Änderungen am Trend stehen in dessen Versionshistorie.</p>
            </Card>
          )}
          <SignalCard signal={signal} />
          {(sources.length > 0 || p.payload.qa != null) && (
            <Card>
              <h2 className="!text-xl">Quellen und Prüfung</h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {sources.map((s) => (
                  <li key={s.key}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}</li>
                ))}
              </ul>
              {p.payload.qa != null && <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-sunk p-3 text-xs">{JSON.stringify(p.payload.qa, null, 2)}</pre>}
            </Card>
          )}
        </div>
        <div className="xl:sticky xl:top-24 xl:self-start">
          {p.status === "pending" && (
            <ReviewActions
              id={p.id}
              kind={p.kind}
              payload={p.payload}
              before={target}
              lookups={{ clusters: lookups.clusters, focus: lookups.focus, subtopics: lookups.subtopics, criteria: lookups.criteria }}
              nextId={pending[0]?.id ?? null}
            />
          )}
        </div>
      </div>
    </>
  );
}
