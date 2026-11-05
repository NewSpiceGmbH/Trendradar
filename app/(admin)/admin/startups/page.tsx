import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VentureNotice } from "@/components/admin/venture-notice";
import { Badge, Card, Empty, PageHead, input, timeAgo } from "@/components/admin/ui";
import { getVentureRepo, VentureMissingError } from "@/lib/venture/store";
import { MATURITY_LABEL } from "@/lib/venture/types";

export const metadata: Metadata = { title: "Startup-Datenbank · Venture Clienting" };

export default function StartupsPage(props: PageProps<"/admin/startups">) {
  return (
    <Suspense fallback={<p className="text-muted">Startups werden geladen …</p>}>
      <Startups searchParams={props.searchParams} />
    </Suspense>
  );
}

const FILTERS = [
  { key: "", label: "Qualifiziert" },
  { key: "radar", label: "Im Radar" },
  { key: "archiv", label: "Archiviert" },
] as const;

async function Startups({ searchParams }: { searchParams: PageProps<"/admin/startups">["searchParams"] }) {
  const q = await searchParams;
  const term = typeof q.q === "string" ? q.q.trim().toLowerCase() : "";
  const filter = FILTERS.find((f) => f.key === q.filter) ?? FILTERS[0];
  const head = (
    <PageHead eyebrow="Venture Clienting" title="Startup-Datenbank">
      Startups, die ihr nach der Vorevaluierung aufgenommen habt. Jedes Profil lässt sich ergänzen und im Radar veröffentlichen.
      Kontakt, Kosten und Pitchdeck bleiben vertraulich.
    </PageHead>
  );
  const loaded = await getVentureRepo()
    .then((repo) => Promise.all([repo.startups(), repo.candidates(), repo.challenges()]))
    .catch((e) => {
      if (e instanceof VentureMissingError) return e;
      throw e;
    });
  if (loaded instanceof VentureMissingError) return <>{head}<VentureNotice detail={loaded.message} /></>;
  const [all, candidates, challenges] = loaded;
  const list = all
    .filter((s) => (filter.key === "archiv" ? s.status === "archived" : s.status === "qualified" && (filter.key !== "radar" || s.published)))
    .filter((s) => !term || `${s.name} ${s.tagline ?? ""} ${s.solution ?? ""} ${s.tags.join(" ")}`.toLowerCase().includes(term));
  const challengeTitle = new Map(challenges.map((c) => [c.id, c.title]));
  return (
    <>
      {head}
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Filter" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.key} href={f.key ? `/admin/startups?filter=${f.key}` : "/admin/startups"} aria-current={filter.key === f.key ? "page" : undefined}
              className={`rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-bold no-underline ${filter.key === f.key ? "bg-ink text-bg" : "glass text-ink"}`}>
              {f.label}
            </Link>
          ))}
        </nav>
        <form className="ml-auto w-full max-w-xs" action="/admin/startups">
          {filter.key && <input type="hidden" name="filter" value={filter.key} />}
          <input name="q" defaultValue={term} aria-label="Startups durchsuchen" placeholder="Suchen …" className={input} />
        </form>
      </div>
      <Card className="!p-0">
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((s) => {
              const from = [...new Set(candidates.filter((c) => c.startupId === s.id).map((c) => challengeTitle.get(c.challengeId)).filter(Boolean))];
              return (
                <li key={s.id}>
                  <Link href={`/admin/startups/${s.id}`} className="grid gap-2 px-5 py-4 text-ink no-underline hover:bg-sunk sm:grid-cols-[minmax(0,1fr)_auto]">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <b className="text-lg">{s.name}</b>
                        {s.published && <Badge>Im Radar</Badge>}
                        {s.approved && <Badge>New Spice approved</Badge>}
                        {s.stage && <Badge tone="muted">{MATURITY_LABEL[s.stage]}</Badge>}
                      </span>
                      <span className="truncate text-sm text-text">{s.tagline ?? s.solution ?? "–"}</span>
                      <span className="text-xs text-muted">
                        {[s.domain, s.country, s.trendNumbers.length ? s.trendNumbers.map((n) => `#${n}`).join(" ") : null, from.length ? `aus: ${from.join(", ")}` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="text-xs text-muted">geändert {timeAgo(s.updatedAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-6">
            <Empty>{all.length ? "Keine Treffer." : "Noch keine Startups. Sie kommen über die Kandidaten einer Challenge in die Datenbank."}</Empty>
          </div>
        )}
      </Card>
    </>
  );
}
