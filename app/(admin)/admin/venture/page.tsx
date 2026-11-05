import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VentureNotice } from "@/components/admin/venture-notice";
import { Badge, Card, Empty, PageHead, btn, timeAgo } from "@/components/admin/ui";
import { fmtScore } from "@/lib/venture/scoring";
import { getVentureRepo, VentureMissingError } from "@/lib/venture/store";
import { CHALLENGE_STATUS_LABEL } from "@/lib/venture/types";

export const metadata: Metadata = { title: "Challenges · Venture Clienting" };

export default function ChallengesPage() {
  return (
    <Suspense fallback={<p className="text-muted">Challenges werden geladen …</p>}>
      <Challenges />
    </Suspense>
  );
}

async function Challenges() {
  const head = (
    <PageHead eyebrow="Venture Clienting" title="Challenges" actions={<Link href="/admin/venture/neu" className={btn.primary}>Neue Challenge</Link>}>
      Konkrete Problemstellungen, für die wir Startups suchen. Der Agent leitet aus dem Problem die Suche ab, bewertet die Startups
      vor und schlägt sie vor – ihr entscheidet, wer in die qualifizierte Datenbank kommt.
    </PageHead>
  );
  const loaded = await getVentureRepo()
    .then((repo) => Promise.all([repo.challenges(), repo.candidates()]))
    .catch((e) => {
      if (e instanceof VentureMissingError) return e;
      throw e;
    });
  if (loaded instanceof VentureMissingError) return <>{head}<VentureNotice detail={loaded.message} /></>;
  const [challenges, candidates] = loaded;
  return (
    <>
      {head}
      {challenges.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {challenges.map((c) => {
            const mine = candidates.filter((x) => x.challengeId === c.id);
            const open = mine.filter((x) => x.status === "pending").length;
            const qualified = mine.filter((x) => x.status === "qualified").length;
            const best = mine[0];
            return (
              <Link key={c.id} href={`/admin/venture/${c.id}`} className="glass-strong flex flex-col gap-3 rounded-[var(--radius-card)] p-5 text-ink no-underline hover:brightness-110">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="!text-xl">{c.title}</h2>
                  <Badge tone={c.status === "closed" ? "muted" : "neutral"}>{CHALLENGE_STATUS_LABEL[c.status]}</Badge>
                </div>
                <p className="line-clamp-2 text-sm text-text">{c.problem}</p>
                <dl className="grid grid-cols-4 gap-2 border-t border-line pt-3 text-sm">
                  <div><dt className="text-xs text-muted">Kandidaten</dt><dd className="num text-xl">{mine.length}</dd></div>
                  <div><dt className="text-xs text-muted">Offen</dt><dd className="num text-xl">{open}</dd></div>
                  <div><dt className="text-xs text-muted">Aufgenommen</dt><dd className="num text-xl">{qualified}</dd></div>
                  <div><dt className="text-xs text-muted">Bester Score</dt><dd className="num text-xl">{best ? fmtScore(best.total) : "–"}</dd></div>
                </dl>
                <p className="text-xs text-muted">Letzte Suche: {c.lastRunAt ? timeAgo(c.lastRunAt) : "noch nicht gestartet"}</p>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card><Empty>Noch keine Challenge. Legt die erste an – je konkreter das Problem, desto besser die Kandidaten.</Empty></Card>
      )}
    </>
  );
}
