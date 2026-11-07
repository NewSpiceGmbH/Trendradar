import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NoAccess } from "@/components/app/access";
import { Badge, Card, timeAgo } from "@/components/admin/ui";
import { PhaseTrack, RequestForm } from "@/components/projects/parts";
import { getViewer } from "@/lib/auth/viewer";
import { getProjectsRepo, ProjectsMissingError } from "@/lib/projects/store";
import { PROJECT_STATUS_LABEL } from "@/lib/projects/types";

export const metadata: Metadata = { title: "Projekte" };

export default function CustomerProjectsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
      <Suspense fallback={<p className="text-muted">Projekte werden geladen …</p>}>
        <Projects />
      </Suspense>
    </main>
  );
}

async function Projects() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.hasAccess) return <NoAccess viewer={viewer} />;
  if (viewer.isEditor) redirect("/admin/projekte");
  if (!viewer.canRequestProjects) {
    return (
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{viewer.activeOrg?.name}</p>
        <h1 className="!text-[clamp(32px,4vw,48px)]">Projekte</h1>
        <p className="max-w-2xl text-lg">Projekte mit New Spice sind Kunden vorbehalten (Vereine, Betreiber, Caterer). Ihre Ansprechperson bei New Spice hilft weiter.</p>
      </header>
    );
  }
  const projects = await getProjectsRepo(viewer).then((r) => r.projects()).catch((e) => {
    if (e instanceof ProjectsMissingError) return [];
    throw e;
  });
  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{viewer.activeOrg?.name}</p>
        <h1 className="!text-[clamp(32px,4vw,48px)]">Projekte</h1>
        <p className="max-w-2xl text-lg">Vom Problem zum Piloten: Sie beschreiben, was besser werden soll. New Spice sucht passende Startups, prüft sie vor und begleitet Sie bis zum Ergebnis.</p>
      </header>
      {projects.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projekte/${p.id}`} className="glass-strong flex h-full flex-col gap-4 rounded-[var(--radius-card)] p-5 text-ink no-underline hover:brightness-110">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="!text-xl">{p.title}</h2>
                  <Badge tone="muted">{PROJECT_STATUS_LABEL[p.status]}</Badge>
                </div>
                <p className="line-clamp-2 text-sm text-text">{p.request}</p>
                <div className="mt-auto flex flex-col gap-2">
                  <PhaseTrack status={p.status} outcome={p.outcome} />
                  <span className="text-xs text-muted">zuletzt {timeAgo(p.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!projects.length && <Card><p className="text-muted">Noch keine Projekte. Starten Sie mit einer Anfrage.</p></Card>}
      <RequestForm />
    </>
  );
}
