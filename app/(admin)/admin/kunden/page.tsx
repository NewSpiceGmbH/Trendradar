import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, Empty, PageHead, btn } from "@/components/admin/ui";
import { getViewer } from "@/lib/auth/viewer";
import { getProjectsRepo } from "@/lib/projects/store";
import { accessState } from "@/lib/projects/types";

export const metadata: Metadata = { title: "Kunden · Redaktion" };

export default function CustomersPage() {
  return (
    <Suspense fallback={<p className="text-muted">Kunden werden geladen …</p>}>
      <Customers />
    </Suspense>
  );
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("de-DE") : "unbefristet");

async function Customers() {
  const viewer = (await getViewer())!;
  const repo = await getProjectsRepo(viewer);
  const [orgs, projects] = await Promise.all([repo.orgs(), repo.projects().catch(() => [])]);
  const list = orgs.filter((o) => !o.isInternal);
  return (
    <>
      <PageHead eyebrow="Redaktion" title="Kunden" actions={<Link href="/admin/kunden/neu" className={btn.primary}>Neuer Kunde</Link>}>
        Kunden-Organisationen mit Laufzeit, Paket und Sitzplätzen. Ihr ladet die Ansprechperson ein, sie lädt ihr Team selbst ein.
      </PageHead>
      <Card className="!p-0">
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((o) => {
              const { active, soon } = accessState(o);
              const open = projects.filter((p) => p.orgId === o.id && p.status !== "completed" && p.status !== "cancelled").length;
              return (
                <li key={o.id}>
                  <Link href={`/admin/kunden/${o.id}`} className="grid gap-2 px-5 py-4 text-ink no-underline hover:bg-sunk sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <span className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <b className="text-lg">{o.name}</b>
                        <Badge tone={o.tier === "premium" ? "neutral" : "muted"}>{o.tier === "premium" ? "Premium" : "Basic"}</Badge>
                        {!active && <Badge tone="warn">Zugang nicht aktiv</Badge>}
                        {soon && <Badge tone="warn">läuft bald aus</Badge>}
                      </span>
                      <span className="text-xs text-muted">{fmtDate(o.accessFrom)} – {fmtDate(o.accessUntil)} · {o.memberCount} von {o.seats} Plätzen{o.openInvites ? ` · ${o.openInvites} Einladung(en) offen` : ""}</span>
                    </span>
                    <span className="text-sm text-muted">{open ? `${open} laufende Projekte` : "kein laufendes Projekt"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-6"><Empty>Noch keine Kunden. Legt die erste Organisation an.</Empty></div>
        )}
      </Card>
    </>
  );
}
