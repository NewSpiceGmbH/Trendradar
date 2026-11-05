import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrgEditor, TeamPanel } from "@/components/admin/customers";
import { Badge, Card, PageHead, timeAgo } from "@/components/admin/ui";
import { getViewer } from "@/lib/auth/viewer";
import { getProjectsRepo } from "@/lib/projects/store";
import { PROJECT_STATUS_LABEL } from "@/lib/projects/types";

export const metadata: Metadata = { title: "Kunde · Redaktion" };

export default function CustomerPage(props: PageProps<"/admin/kunden/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Kunde wird geladen …</p>}>
      <Customer params={props.params} />
    </Suspense>
  );
}

async function Customer({ params }: { params: PageProps<"/admin/kunden/[id]">["params"] }) {
  const { id } = await params;
  const repo = await getProjectsRepo((await getViewer())!);
  const [d, projects] = await Promise.all([repo.org(id), repo.projects().catch(() => [])]);
  if (!d) notFound();
  const mine = projects.filter((p) => p.orgId === id);
  return (
    <>
      <PageHead eyebrow="Kunde" title={d.org.name}><Link href="/admin/kunden">← Alle Kunden</Link></PageHead>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <OrgEditor orgId={id} initial={{ name: d.org.name, tier: d.org.tier, seats: d.org.seats, accessFrom: d.org.accessFrom, accessUntil: d.org.accessUntil }} />
          <Card>
            <h2 className="!text-xl">Projekte</h2>
            <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
              {mine.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/projekte/${p.id}`}>{p.title}</Link>
                  <span className="flex items-center gap-2 text-xs text-muted"><Badge tone="muted">{PROJECT_STATUS_LABEL[p.status]}</Badge>{timeAgo(p.updatedAt)}</span>
                </li>
              ))}
              {!mine.length && <li className="py-2 text-muted">Noch keine Projekte. Der Kunde fragt sie im Portal unter „Projekte“ an.</li>}
            </ul>
          </Card>
        </div>
        <TeamPanel orgId={id} seats={d.org.seats} members={d.members} invitations={d.invitations} />
      </div>
    </>
  );
}
