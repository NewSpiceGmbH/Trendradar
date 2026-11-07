import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LiveFeed, ProjectList, RequestsDock, SignalLight, type ProjectRow } from "@/components/admin/cockpit";
import { btn, timeAgo } from "@/components/admin/ui";
import { getAdminRepo } from "@/lib/admin/repo";
import { getScoutingRepo } from "@/lib/agents/store";
import type { Scout } from "@/lib/agents/types";
import { getViewer } from "@/lib/auth/viewer";
import { bySignal, projectSignal } from "@/lib/projects/signal";
import { getProjectsRepo } from "@/lib/projects/store";
import type { ProjectOverview } from "@/lib/projects/types";
import { getApplicationsRepo } from "@/lib/applications/store";
import { holdSignal } from "@/lib/applications/hold";
import { HOLD_REASON_LABEL, type Application } from "@/lib/applications/types";
import { getVentureRepo } from "@/lib/venture/store";
import type { Candidate, Startup } from "@/lib/venture/types";

export const metadata: Metadata = { title: "Cockpit · Redaktion" };

export default function CockpitPage() {
  return (
    <Suspense fallback={<p className="text-muted">Cockpit wird geladen …</p>}>
      <Cockpit />
    </Suspense>
  );
}

const DAY = 86_400_000;
/** Zeitpunkt der Anfrage (nach connection(), daher je Aufruf neu) */
const requestTime = () => Date.now();

async function Cockpit() {
  await connection();
  const viewer = (await getViewer())!;
  const now = requestTime();
  const admin = await getAdminRepo();
  const projectsRepo = await getProjectsRepo(viewer);
  const [proposals, signals, trends, runs, scouts, overview, workdays, venture] = await Promise.all([
    admin.proposals(), admin.signals(), admin.trends(), admin.runs(),
    getScoutingRepo().then((r) => r.scouts()).catch(() => [] as Scout[]),
    projectsRepo.overview().catch(() => [] as ProjectOverview[]),
    projectsRepo.responseWorkdays().catch(() => 3),
    getVentureRepo().then((r) => Promise.all([r.candidates(), r.startups()])).catch(() => [[], []] as [Candidate[], Startup[]]),
  ]);
  // Bewerbungen (Migration 0015) – fehlt sie noch, bleibt es leer
  const applications = await getApplicationsRepo().then((r) => r.applications()).catch(() => [] as Application[]);
  const holds = applications.filter((a) => a.status === "on_hold" && a.holdUntil)
    .map((a) => ({ a, signal: holdSignal(a.holdUntil!, new Date(now), workdays) }))
    .sort((x, y) => x.a.holdUntil!.localeCompare(y.a.holdUntil!));
  const [candidates, startups] = venture;

  const pending = proposals.filter((p) => p.status === "pending").length;
  const runs7 = runs.filter((r) => Date.parse(r.startedAt) > now - 7 * DAY).length;
  const requests = overview.filter((o) => o.project.status === "requested").map((o) => o.project).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rows: ProjectRow[] = overview
    .filter((o) => o.project.status !== "requested")
    .map((o) => ({
      project: o.project,
      signal: projectSignal({ status: o.project.status, editorSeenAt: o.project.editorSeenAt ?? null, milestones: o.milestones, lastCustomerAt: o.lastCustomerAt, lastTeamAt: o.lastTeamAt }, new Date(now), workdays),
      isNew: o.project.status === "scoping" && !o.project.editorSeenAt,
    }))
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || bySignal(a, b));
  const feed = signals.filter((s) => s.status !== "dismissed").sort((a, b) => b.foundAt.localeCompare(a.foundAt)).slice(0, 40);
  const trendOptions = trends.filter((t) => t.fields.status === "published")
    .map((t) => ({ id: t.id, number: t.fields.number, name: t.fields.name, cluster: t.fields.cluster_code }))
    .sort((a, b) => a.number - b.number);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow !text-muted">{new Date(now).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" })}</p>
            <h1 className="!text-[clamp(32px,4vw,48px)]">Cockpit</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/review" className={`${btn.ghost} !px-3 !py-1.5 text-xs`}><span className="num">{pending}</span> Vorschläge zur Freigabe →</Link>
            {runs7 === 0 && <Link href="/admin/agents" className={`${btn.ghost} !px-3 !py-1.5 text-xs`}><span className="text-warn" aria-hidden>⚠</span> <span className="num">0</span> Agentenläufe in 7 Tagen</Link>}
            <RequestsDock requests={requests} now={now} />
          </div>
        </header>

        <Funnel candidates={candidates} startups={startups} overview={overview} applications={applications} now={now} />
        <ProjectList rows={rows} />
        {holds.length > 0 && (
          <section aria-labelledby="holds" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="holds" className="!text-xl">Wiedervorlagen</h2>
              <Link href="/admin/netzwerk/eingang?zeige=hold" className="text-sm">Alle im Eingang →</Link>
            </div>
            <ul className="glass-strong flex flex-col divide-y divide-line rounded-[var(--radius-card)]">
              {holds.map(({ a, signal }) => (
                <li key={a.id}>
                  <Link href={`/admin/netzwerk/eingang?zeige=hold&id=app:${a.id}`} className="flex items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-sunk">
                    <SignalLight s={signal} />
                    <span className="min-w-0 flex-1"><b>{a.orgName}</b> <span className="text-sm text-muted">· {a.holdReason ? HOLD_REASON_LABEL[a.holdReason] : "On hold"}</span></span>
                    <span className="shrink-0 text-sm text-text">{signal.reason}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="min-w-0 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:pr-1">
        <LiveFeed signals={feed} trends={trendOptions} scouts={{ active: scouts.filter((s) => s.active).length, total: scouts.length }} now={now} />
      </aside>
    </div>
  );
}

// ───────────────────────── Netzwerk-Funnel ─────────────────────────

type Source = "agent" | "redaktion" | "kunde";
const SOURCE_LABEL: Record<Source, string> = { agent: "Agent", redaktion: "Redaktion", kunde: "Kunde/Bewerbung" };

function Funnel({ candidates, startups, overview, applications, now }: { candidates: Candidate[]; startups: Startup[]; overview: ProjectOverview[]; applications: Application[]; now: number }) {
  const recent = candidates.filter((c) => Date.parse(c.createdAt) > now - 90 * DAY);
  // Bewerbungen und Empfehlungen zählen als Quelle „Kunde/Bewerbung“ (unbestätigte noch nicht)
  const apps = applications.filter((a) => a.status !== "unconfirmed" && Date.parse(a.createdAt) > now - 90 * DAY);
  // Herkunft: Kandidaten kommen vom Agenten (mit Lauf) oder wurden von der Redaktion eingetragen; Bewerbungen folgen
  const candSource = (c: Candidate): Source => (c.runId ? "agent" : "redaktion");
  const startupSource = new Map<string, Source>();
  for (const s of startups) {
    const c = candidates.find((x) => x.startupId === s.id);
    startupSource.set(s.id, c ? candSource(c) : s.source === "application" ? "kunde" : s.source === "agent" ? "agent" : "redaktion");
  }
  const split = <T,>(xs: T[], src: (x: T) => Source) => ({
    agent: xs.filter((x) => src(x) === "agent").length,
    redaktion: xs.filter((x) => src(x) === "redaktion").length,
    kunde: xs.filter((x) => src(x) === "kunde").length,
  });
  const plus = (p: Record<Source, number>, kunde: number) => ({ ...p, kunde: p.kunde + kunde });
  const shortlisted = [...new Set(overview.flatMap((o) => o.shortlist.startupIds))];
  const piloting = [...new Set(overview.filter((o) => ["pilot", "evaluation", "completed"].includes(o.project.status)).flatMap((o) => o.shortlist.selectedIds))];
  const bySource = (id: string) => startupSource.get(id) ?? "redaktion";
  const stages = [
    { label: "Eingang", parts: plus(split(recent, candSource), apps.length) },
    { label: "Vorevaluiert", parts: plus(split(recent.filter((c) => c.status !== "pending"), candSource), apps.filter((a) => a.status !== "new").length) },
    { label: "In der Datenbank", parts: split(startups.filter((s) => s.status === "qualified"), (s) => bySource(s.id)) },
    { label: "Shortlist", parts: split(shortlisted, bySource) },
    { label: "Pilot", parts: split(piloting, bySource) },
    { label: "New Spice approved", parts: split(startups.filter((s) => s.approved), (s) => bySource(s.id)) },
  ].map((s) => ({ ...s, total: s.parts.agent + s.parts.redaktion + s.parts.kunde }));
  const max = Math.max(1, ...stages.map((s) => s.total));
  const totals = plus(split(recent, candSource), apps.length);
  const newest = [
    ...candidates.filter((c) => c.status === "pending").map((c) => ({ id: c.id, name: c.name, href: `/admin/venture/${c.challengeId}`, source: candSource(c), at: c.createdAt })),
    ...applications.filter((a) => a.status === "new").map((a) => ({ id: a.id, name: a.orgName, href: `/admin/netzwerk/eingang?id=app:${a.id}`, source: "kunde" as Source, at: a.createdAt })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  const waiting = candidates.filter((c) => c.status === "pending").length;
  const waitingApps = applications.filter((a) => a.status === "new").length;

  return (
    <section aria-labelledby="funnel" className="grid gap-6 rounded-[var(--radius-card)] bg-accent p-5 text-on-accent lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="funnel" className="eyebrow !text-on-accent">Netzwerk-Funnel · 90 Tage</h2>
          <Link href="/admin/netzwerk" className="text-xs font-bold !text-on-accent">Netzwerk-Datenbank →</Link>
        </div>
        <ol className="grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-6">
          {stages.map((s) => (
            <li key={s.label} className="flex flex-col gap-1.5"
              title={`${s.label}: ${s.total} (Agent ${s.parts.agent} · Redaktion ${s.parts.redaktion} · Kunde ${s.parts.kunde})`}>
              <span className="num text-3xl leading-none">{s.total}</span>
              <span className="flex h-12 flex-col-reverse overflow-hidden rounded-sm" aria-hidden>
                {(["agent", "redaktion", "kunde"] as const).map((k) => (
                  <span key={k} style={{ height: `${(s.parts[k] / max) * 100}%` }}
                    className={k === "agent" ? "bg-on-accent" : k === "redaktion" ? "bg-on-accent/55" : "funnel-hatch"} />
                ))}
              </span>
              <span lang="de" className="hyphens-auto break-words text-[11px] font-bold leading-tight">{s.label}</span>
            </li>
          ))}
        </ol>
        <p className="flex flex-wrap gap-4 text-xs">
          {(["agent", "redaktion", "kunde"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`inline-block size-3 rounded-sm ${k === "agent" ? "bg-on-accent" : k === "redaktion" ? "bg-on-accent/55" : "funnel-hatch border border-on-accent"}`} aria-hidden />
              {SOURCE_LABEL[k]} <span className="num">{totals[k]}</span>
            </span>
          ))}
        </p>
      </div>
      <div className="flex flex-col gap-2 border-on-accent/30 lg:border-l lg:pl-5">
        <p className="eyebrow !text-on-accent">Neu im Eingang</p>
        <ul className="flex flex-col divide-y divide-on-accent/20 text-sm">
          {newest.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 py-1.5">
              <span className="flex min-w-0 flex-col">
                <Link href={c.href} className="truncate font-bold !text-on-accent no-underline hover:underline">{c.name}</Link>
                <span className="text-xs">{SOURCE_LABEL[c.source]}</span>
              </span>
              <span className="shrink-0 text-xs">{timeAgo(c.at)}</span>
            </li>
          ))}
          {!newest.length && <li className="py-1.5 text-xs">Nichts Neues. Startet eine Challenge, um Startups zu finden.</li>}
        </ul>
        <span className="mt-auto flex flex-col gap-1">
          {waitingApps > 0 && <Link href="/admin/netzwerk/eingang" className="text-xs font-bold !text-on-accent">{waitingApps} Bewerbungen im Eingang →</Link>}
          {waiting > 0 && <Link href="/admin/venture" className="text-xs font-bold !text-on-accent">{waiting} Kandidaten warten auf Entscheidung →</Link>}
        </span>
      </div>
    </section>
  );
}
