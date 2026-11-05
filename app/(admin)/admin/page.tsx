import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, Empty, ExampleTag, PageHead, timeAgo } from "@/components/admin/ui";
import { KIND_LABEL, positionOf } from "@/lib/admin/patch";
import { getAdminRepo } from "@/lib/admin/repo";
import { ZONE_KEYS } from "@/lib/scoring";

export const metadata: Metadata = { title: "Cockpit · Redaktion" };

const withinDays = (iso: string, days: number) => Date.parse(iso) > Date.now() - days * 86_400_000;

export default function CockpitPage() {
  return (
    <Suspense fallback={<p className="text-muted">Cockpit wird geladen …</p>}>
      <Cockpit />
    </Suspense>
  );
}

async function Cockpit() {
  const repo = await getAdminRepo();
  const [proposals, signals, trends, runs, lookups] = await Promise.all([repo.proposals(), repo.signals(), repo.trends(), repo.runs(), repo.lookups()]);
  const pending = proposals.filter((p) => p.status === "pending");
  const openSignals = signals.filter((s) => s.status !== "dismissed" && !s.publishedAt);
  const published = trends.filter((t) => t.fields.status === "published");
  const drafts = trends.filter((t) => t.fields.status === "draft");
  const recentRuns = runs.filter((r) => withinDays(r.startedAt, 7));
  const tokens = recentRuns.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0);
  const byNumber = new Map(trends.map((t) => [t.id, t]));
  const weights = lookups.criteria.map((c) => c.weight) as unknown as Parameters<typeof positionOf>[2];
  const zones = Object.fromEntries(ZONE_KEYS.map((z) => [z, 0])) as Record<string, number>;
  for (const t of published) zones[positionOf(t, "EU", weights).zone]++;

  const tiles = [
    { label: "Offene Vorschläge", value: pending.length, href: "/admin/review", accent: true },
    { label: "Meldungen ohne Freigabe", value: openSignals.length, href: "/admin/ticker" },
    { label: "Trends veröffentlicht", value: published.length, sub: drafts.length ? `${drafts.length} Entwürfe` : undefined, href: "/admin/trends" },
    { label: "Agentenläufe (7 Tage)", value: recentRuns.length, sub: tokens ? `${Math.round(tokens / 1000)} Tsd. Tokens` : undefined, href: "/admin/agents" },
  ];

  return (
    <>
      <PageHead eyebrow="Redaktion" title="Cockpit">
        Was die Agenten geliefert haben und was auf Freigabe wartet. Veröffentlicht wird nur, was ihr freigebt.
      </PageHead>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={`flex flex-col gap-1 rounded-[var(--radius-card)] p-5 no-underline ${t.accent ? "bg-accent text-on-accent" : "glass-strong text-ink"}`}
          >
            <span className={`eyebrow !text-[11px] ${t.accent ? "!text-on-accent" : "!text-muted"}`}>{t.label}</span>
            <span className="num text-5xl leading-none">{t.value}</span>
            {t.sub && <span className={`text-sm ${t.accent ? "" : "text-muted"}`}>{t.sub}</span>}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="!text-xl">Als Nächstes prüfen</h2>
            <Link href="/admin/review" className="text-sm">Alle Vorschläge →</Link>
          </div>
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {pending.slice(0, 6).map((p) => {
              const t = p.targetTrendId ? byNumber.get(p.targetTrendId) : null;
              return (
                <li key={p.id}>
                  <Link href={`/admin/review/${p.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-ink no-underline hover:opacity-80">
                    <span className="flex min-w-0 flex-col">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge>{KIND_LABEL[p.kind]}</Badge>
                        <b className="truncate">{t ? `#${t.fields.number} ${t.fields.name}` : p.kind === "new_trend" ? String((p.payload.fields as { name?: string })?.name ?? "Neuer Trend") : "–"}</b>
                        {p.example && <ExampleTag />}
                      </span>
                      <span className="truncate text-sm text-muted">{p.rationale}</span>
                    </span>
                    <span className="text-xs text-muted">{timeAgo(p.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {!pending.length && <Empty>Keine offenen Vorschläge. Sobald die Agenten laufen, landen ihre Vorschläge hier.</Empty>}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="!text-xl">Radar heute</h2>
            <p className="mt-1 text-sm text-muted">Veröffentlichte Trends je Spielphase, Perspektive Europa</p>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              {ZONE_KEYS.map((z) => (
                <div key={z} className="flex flex-col">
                  <dt className="text-xs text-muted">{lookups.zones[z]?.name ?? z}</dt>
                  <dd className="num text-3xl text-ink">{zones[z]}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="!text-xl">Zuletzt im Liveticker</h2>
              <Link href="/admin/ticker" className="text-sm">Ticker →</Link>
            </div>
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              {signals.filter((s) => s.publishedAt).slice(0, 4).map((s) => (
                <li key={s.id} className="flex flex-col">
                  <span className="text-ink">{s.title}</span>
                  <span className="text-xs text-muted">
                    {s.trendId && byNumber.get(s.trendId) ? `#${byNumber.get(s.trendId)!.fields.number} · ` : ""}{timeAgo(s.publishedAt)}
                  </span>
                </li>
              ))}
            </ul>
            {!signals.some((s) => s.publishedAt) && <Empty>Noch keine Meldung veröffentlicht.</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}
