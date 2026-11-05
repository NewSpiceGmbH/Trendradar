import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, PageHead } from "@/components/admin/ui";
import { StartupEditor } from "@/components/admin/venture";
import { getAdminRepo } from "@/lib/admin/repo";
import { fmtScore } from "@/lib/venture/scoring";
import { getVentureRepo } from "@/lib/venture/store";
import { CANDIDATE_STATUS_LABEL } from "@/lib/venture/types";

export const metadata: Metadata = { title: "Startup · Venture Clienting" };

export default function StartupPage(props: PageProps<"/admin/startups/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Profil wird geladen …</p>}>
      <Profile params={props.params} />
    </Suspense>
  );
}

async function Profile({ params }: { params: PageProps<"/admin/startups/[id]">["params"] }) {
  const { id } = await params;
  const repo = await getVentureRepo();
  const [found, candidates, challenges, trends] = await Promise.all([repo.startup(id), repo.candidates(), repo.challenges(), (await getAdminRepo()).trends()]);
  if (!found) notFound();
  const history = candidates.filter((c) => c.startupId === id);
  const title = new Map(challenges.map((c) => [c.id, c.title]));
  return (
    <>
      <PageHead eyebrow="Startup-Datenbank" title={found.startup.name}>
        <Link href="/admin/startups">← Zur Datenbank</Link>
      </PageHead>
      <StartupEditor startup={found.startup} priv={found.priv} trends={trends.map((t) => ({ number: t.fields.number, name: t.fields.name }))} />
      {history.length > 0 && (
        <Card>
          <h2 className="!text-xl">Bewertungen</h2>
          <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
            {history.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2">
                <Link href={`/admin/venture/${c.challengeId}`}>{title.get(c.challengeId) ?? "Challenge"}</Link>
                <span className="text-muted">{CANDIDATE_STATUS_LABEL[c.status]} · Score <span className="num text-ink">{fmtScore(c.total)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
