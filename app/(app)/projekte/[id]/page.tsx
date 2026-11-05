import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { NoAccess } from "@/components/app/access";
import { Card } from "@/components/admin/ui";
import { Documents, Milestones, PhaseTrack, ShortlistCustomer, Updates } from "@/components/projects/parts";
import { getViewer } from "@/lib/auth/viewer";
import { getProjectsRepo } from "@/lib/projects/store";

export const metadata: Metadata = { title: "Projekt" };

export default function CustomerProjectPage(props: PageProps<"/projekte/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-8">
      <Suspense fallback={<p className="text-muted">Projekt wird geladen …</p>}>
        <ProjectView params={props.params} />
      </Suspense>
    </main>
  );
}

async function ProjectView({ params }: { params: PageProps<"/projekte/[id]">["params"] }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.hasAccess) return <NoAccess viewer={viewer} />;
  if (viewer.isEditor) redirect(`/admin/projekte/${id}`);
  const d = await (await getProjectsRepo(viewer)).project(id);
  if (!d) notFound();
  const p = d.project;
  return (
    <>
      <header className="flex flex-col gap-2">
        <Link href="/projekte" className="text-sm">← Alle Projekte</Link>
        <h1 className="!text-[clamp(28px,3.4vw,44px)]">{p.title}</h1>
      </header>
      <Card><PhaseTrack status={p.status} outcome={p.outcome} /></Card>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <ShortlistCustomer projectId={id} items={d.shortlist} />
          <Updates projectId={id} items={d.updates} editor={false} />
        </div>
        <aside className="flex flex-col gap-6">
          <Card>
            <dl className="flex flex-col gap-3 text-sm">
              <div><dt className="eyebrow !text-muted">Ihre Anfrage</dt><dd className="mt-1 whitespace-pre-line text-ink">{p.request}</dd></div>
              {p.goal && <div><dt className="eyebrow !text-muted">Erfolg gemessen an</dt><dd className="mt-1">{p.goal}</dd></div>}
              {(p.venue || p.timeframe) && <div><dt className="eyebrow !text-muted">Rahmen</dt><dd className="mt-1">{[p.venue, p.timeframe, p.budget].filter(Boolean).join(" · ")}</dd></div>}
              {p.outcomeNote && <div><dt className="eyebrow !text-muted">Ergebnis</dt><dd className="mt-1 text-ink">{p.outcomeNote}</dd></div>}
            </dl>
          </Card>
          <Milestones projectId={id} items={d.milestones} editable={false} />
          <Documents projectId={id} items={d.documents} editor={false} userId={viewer.id} />
        </aside>
      </div>
    </>
  );
}
