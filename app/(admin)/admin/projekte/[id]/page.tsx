import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, PageHead } from "@/components/admin/ui";
import { Documents, Milestones, PhaseTrack, ProjectControl, ShortlistEditor, Updates } from "@/components/projects/parts";
import { getAdminRepo } from "@/lib/admin/repo";
import { getViewer } from "@/lib/auth/viewer";
import { getProjectsRepo } from "@/lib/projects/store";

export const metadata: Metadata = { title: "Projekt · Redaktion" };

export default function ProjectPage(props: PageProps<"/admin/projekte/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Projekt wird geladen …</p>}>
      <ProjectView params={props.params} />
    </Suspense>
  );
}

async function ProjectView({ params }: { params: PageProps<"/admin/projekte/[id]">["params"] }) {
  const { id } = await params;
  const viewer = (await getViewer())!;
  const repo = await getProjectsRepo(viewer);
  const [d, options, team] = await Promise.all([repo.project(id), repo.startupOptions(), (await getAdminRepo()).team().catch(() => [])]);
  if (!d) notFound();
  const p = d.project;
  const people = team.map((m) => ({ id: m.id, name: m.displayName || m.email }));
  return (
    <>
      <PageHead eyebrow={`Projekt · ${p.orgName ?? "Kunde"}`} title={p.title}>
        <Link href={`/admin/kunden/${p.orgId}`}>Zum Kunden →</Link>
      </PageHead>
      <Card><PhaseTrack status={p.status} outcome={p.outcome} /></Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2"><dt className="eyebrow !text-muted">Anfrage</dt><dd className="mt-1 whitespace-pre-line text-ink">{p.request || "–"}</dd></div>
              <div><dt className="eyebrow !text-muted">Erfolg gemessen an</dt><dd className="mt-1">{p.goal || "–"}</dd></div>
              <div><dt className="eyebrow !text-muted">Rahmen</dt><dd className="mt-1">{[p.venue, p.timeframe, p.budget].filter(Boolean).join(" · ") || "–"}</dd></div>
            </dl>
          </Card>
          <ShortlistEditor projectId={id} items={d.shortlist} options={options} />
          <Updates projectId={id} items={d.updates} editor />
        </div>
        <aside className="flex flex-col gap-6">
          <ProjectControl project={p} people={people} />
          <Milestones projectId={id} items={d.milestones} editable />
          <Documents projectId={id} items={d.documents} editor userId={viewer.id} />
        </aside>
      </div>
    </>
  );
}
