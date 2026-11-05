import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, Card, Empty, PageHead, btn, timeAgo } from "@/components/admin/ui";
import { DeepDivePanel } from "@/components/admin/deep-dive";
import { CandidateCard, RunChallengeButton } from "@/components/admin/venture";
import { STAGE_OPTIONS } from "@/lib/admin/labels";
import { getVentureRepo } from "@/lib/venture/store";
import { CHALLENGE_STATUS_LABEL, MATURITY_LABEL, type Candidate } from "@/lib/venture/types";

// „Startups suchen“ ist eine Server Action dieser Seite; der Lauf läuft per after() weiter und braucht das Zeitlimit
export const maxDuration = 800;

export const metadata: Metadata = { title: "Challenge · Venture Clienting" };

export default function ChallengePage(props: PageProps<"/admin/venture/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Challenge wird geladen …</p>}>
      <ChallengeView params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

const GROUPS: { key: string; label: string; test: (c: Candidate) => boolean }[] = [
  { key: "offen", label: "Zu entscheiden", test: (c) => c.status === "pending" },
  { key: "beobachten", label: "Beobachten", test: (c) => c.status === "watch" },
  { key: "aufgenommen", label: "In der Datenbank", test: (c) => c.status === "qualified" },
  { key: "abgelehnt", label: "Abgelehnt", test: (c) => c.status === "rejected" },
];

async function ChallengeView({ params, searchParams }: { params: PageProps<"/admin/venture/[id]">["params"]; searchParams: PageProps<"/admin/venture/[id]">["searchParams"] }) {
  const { id } = await params;
  const q = await searchParams;
  const repo = await getVentureRepo();
  const [c, candidates, runs, sessions] = await Promise.all([repo.challenge(id), repo.candidates(id), repo.runs(id), repo.sessions(id)]);
  if (!c) notFound();
  const group = GROUPS.find((g) => g.key === q.zeige) ?? GROUPS[0];
  const list = candidates.filter(group.test);
  const last = runs[0];
  const running = last?.status === "running";

  return (
    <>
      <PageHead
        eyebrow={`Venture Clienting · ${CHALLENGE_STATUS_LABEL[c.status]}`}
        title={c.title}
        actions={<Link href={`/admin/venture/${id}/bearbeiten`} className={btn.ghost}>Bearbeiten</Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="eyebrow !text-muted">Problem</dt><dd className="mt-1 text-ink">{c.problem || "–"}</dd></div>
            <div><dt className="eyebrow !text-muted">Ziel und Erfolgskriterien</dt><dd className="mt-1">{c.goal || "–"}</dd></div>
            <div><dt className="eyebrow !text-muted">Kontext</dt><dd className="mt-1">{c.context || "–"}</dd></div>
            <div>
              <dt className="eyebrow !text-muted">Muss-Kriterien</dt>
              <dd className="mt-1">{c.mustHaves.length ? <ul className="list-disc pl-5">{c.mustHaves.map((m) => <li key={m}>{m}</li>)}</ul> : "–"}</dd>
            </div>
            <div>
              <dt className="eyebrow !text-muted">Rahmen</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone="muted">ab {MATURITY_LABEL[c.minMaturity]}</Badge>
                {c.regions.map((r) => <Badge key={r} tone="muted">{r}</Badge>)}
                {c.journeyStages.map((s) => <Badge key={s} tone="muted">{STAGE_OPTIONS[s as keyof typeof STAGE_OPTIONS] ?? s}</Badge>)}
                {c.trendNumbers.map((n) => <Badge key={n} tone="muted">#{n}</Badge>)}
                {c.timeframe && <Badge tone="muted">{c.timeframe}</Badge>}
                {c.budget && <Badge tone="muted">{c.budget}</Badge>}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="!text-xl">Agent</h2>
          <p className="mt-1 text-sm text-muted">
            Sucht bis zu {c.maxCandidates} Startups mit höchstens {c.maxSearches} Suchen, Kostengrenze {c.maxCostUsd.toFixed(2).replace(".", ",")} $.
          </p>
          <div className="mt-4">
            {running ? (
              <p className="text-sm text-ink">Suche läuft seit {timeAgo(last.startedAt).replace(/^vor /, "")} – Seite in ein paar Minuten neu laden.</p>
            ) : (
              <RunChallengeButton challengeId={id} />
            )}
          </div>
          {last && (
            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm">
              <p className="text-xs text-muted">
                Letzter Lauf {timeAgo(last.startedAt)} · {last.status === "succeeded" ? `${last.found ?? 0} gefunden` : last.status === "failed" ? "fehlgeschlagen" : "läuft"}
                {last.costUsd != null ? ` · ${last.costUsd.toFixed(2).replace(".", ",")} $` : ""}{last.searches ? ` · ${last.searches} Suchen` : ""}
              </p>
              {last.error && <p className="text-xs text-[var(--cA)]">{last.error}</p>}
              {last.strategy && <p><b className="text-ink">Suchstrategie:</b> {last.strategy}</p>}
              {last.notes && <p className="text-muted">{last.notes}</p>}
            </div>
          )}
        </Card>
      </div>

      <DeepDivePanel challengeId={id} sessions={sessions} brief={c.brief ?? null} briefUpdatedAt={c.briefUpdatedAt ?? null} />

      <section aria-labelledby="kandidaten" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="kandidaten" className="!text-2xl">Kandidaten</h2>
          <nav aria-label="Kandidaten filtern" className="flex flex-wrap gap-2">
            {GROUPS.map((g) => (
              <Link key={g.key} href={g.key === "offen" ? `/admin/venture/${id}` : `/admin/venture/${id}?zeige=${g.key}`} aria-current={group.key === g.key ? "page" : undefined}
                className={`rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-bold no-underline ${group.key === g.key ? "bg-ink text-bg" : "glass text-ink"}`}>
                {g.label} <span className="num opacity-70">{candidates.filter(g.test).length}</span>
              </Link>
            ))}
          </nav>
        </div>
        <Card className="!py-0">
          {list.length ? (
            <ul className="divide-y divide-line">
              {list.map((x) => <CandidateCard key={x.id} c={x} startupHref={x.startupId ? `/admin/startups/${x.startupId}` : null} />)}
            </ul>
          ) : (
            <div className="py-6">
              <Empty>{group.key === "offen" ? (candidates.length ? "Alles entschieden." : "Noch keine Kandidaten. Startet die Suche – der Agent liefert in ein paar Minuten.") : "Keine Einträge."}</Empty>
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
