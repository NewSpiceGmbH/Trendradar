import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProjectsNotice } from "@/components/admin/projects-notice";
import { Badge, Card, Empty, PageHead, timeAgo } from "@/components/admin/ui";
import { getViewer } from "@/lib/auth/viewer";
import { getProjectsRepo, ProjectsMissingError } from "@/lib/projects/store";
import { PROJECT_PHASES, PROJECT_STATUS_LABEL, type Project } from "@/lib/projects/types";

export const metadata: Metadata = { title: "Projekte · Redaktion" };

export default function ProjectsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Projekte werden geladen …</p>}>
      <Projects />
    </Suspense>
  );
}

async function Projects() {
  const head = (
    <PageHead eyebrow="Redaktion" title="Projekte">
      Anfragen und laufende Projekte aller Kunden. Aus einer Anfrage wird eine Challenge für den Venture-Agenten, daraus die
      Shortlist für den Kunden. Erfolgreiche Projekte vergeben „New Spice approved“.
    </PageHead>
  );
  const projects = await getProjectsRepo((await getViewer())!).then((r) => r.projects()).catch((e) => {
    if (e instanceof ProjectsMissingError) return e;
    throw e;
  });
  if (projects instanceof ProjectsMissingError) return <>{head}<ProjectsNotice detail={projects.message} /></>;
  const groups: { label: string; test: (p: Project) => boolean }[] = [
    { label: "Neue Anfragen", test: (p) => p.status === "requested" },
    { label: "Laufend", test: (p) => !["requested", "completed", "cancelled"].includes(p.status) },
    { label: "Abgeschlossen", test: (p) => p.status === "completed" || p.status === "cancelled" },
  ];
  return (
    <>
      {head}
      {projects.length ? groups.map((g) => {
        const list = projects.filter(g.test);
        if (!list.length) return null;
        return (
          <section key={g.label} className="flex flex-col gap-3">
            <h2 className="!text-xl">{g.label} <span className="num text-muted">{list.length}</span></h2>
            <Card className="!p-0">
              <ul className="divide-y divide-line">
                {list.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/projekte/${p.id}`} className="grid gap-2 px-5 py-4 text-ink no-underline hover:bg-sunk sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2"><b>{p.title}</b><Badge tone="muted">{p.orgName ?? "Kunde"}</Badge></span>
                        <span className="truncate text-sm text-muted">{p.request}</span>
                      </span>
                      <span className="flex flex-col gap-1.5">
                        <span className="flex gap-0.5" aria-hidden>
                          {PROJECT_PHASES.map((s, i) => <span key={s} className={`h-1 flex-1 rounded-full ${i <= PROJECT_PHASES.indexOf(p.status) ? "bg-ink" : "bg-line"}`} />)}
                        </span>
                        <span className="text-xs text-muted">{PROJECT_STATUS_LABEL[p.status]} · {timeAgo(p.updatedAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        );
      }) : <Card><Empty>Noch keine Projekte. Kunden fragen sie im Portal unter „Projekte“ an.</Empty></Card>}
    </>
  );
}
