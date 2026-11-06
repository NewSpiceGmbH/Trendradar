import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AdminNav } from "@/components/admin/nav";
import { MigrationNotice } from "@/components/admin/ui";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";
import { getAdminRepo } from "@/lib/admin/repo";
import { MigrationMissingError } from "@/lib/admin/types";
import { getViewer } from "@/lib/auth/viewer";
import { getProjectsRepo } from "@/lib/projects/store";
import { getVentureRepo } from "@/lib/venture/store";

/** Redaktions-Backend: nur für platform_role admin/editor. Maßgeblich bleibt RLS in der Datenbank. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-backdrop flex min-h-dvh flex-col overflow-x-clip">
      <header className="glass sticky top-0 z-20 !border-x-0 !border-t-0 !shadow-none">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:gap-6 sm:px-8">
          <Link href="/admin" className="flex items-center gap-3 text-ink no-underline" aria-label="New Spice Redaktion – Cockpit">
            <Logo className="h-6 w-auto sm:h-7" />
            <span className="hidden text-sm text-muted sm:inline">Redaktion</span>
          </Link>
          <Link href="/radar" className="text-sm text-text no-underline hover:text-ink"><span className="hidden sm:inline">Zum </span>Dashboard →</Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:contents"><ThemeToggle /></span>
            <Suspense fallback={<span className="text-sm text-muted">…</span>}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <Suspense fallback={<p className="mx-auto max-w-[1600px] px-8 py-16 text-muted">Redaktion wird geladen …</p>}>
        <Shell>{children}</Shell>
      </Suspense>
    </div>
  );
}

async function Shell({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isEditor) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-6 py-24">
        <p className="eyebrow">Kein Zugang</p>
        <h1 className="!text-3xl">Nur für die Redaktion</h1>
        <p>Dieser Bereich ist der New-Spice-Redaktion vorbehalten. Ein Admin kann dir auf der Team-Seite eine Rolle geben.</p>
        <Link href="/radar">Zum Stadion</Link>
      </main>
    );
  }

  let pending = 0, fresh = 0, openCandidates = 0, newRequests = 0, migration: string | null = null;
  try {
    const repo = await getAdminRepo();
    const [proposals, signals] = await Promise.all([repo.proposals(), repo.signals()]);
    pending = proposals.filter((p) => p.status === "pending").length;
    fresh = signals.filter((s) => s.status !== "dismissed" && !s.publishedAt).length;
    // Venture Clienting (Migration 0009) – fehlt sie noch, bleibt die Zahl leer
    // Projekte (Migration 0010) – neue Anfragen; fehlt sie noch, bleibt die Zahl leer
    newRequests = await getProjectsRepo(viewer).then((r) => r.projects()).then((ps) => ps.filter((x) => x.status === "requested").length).catch(() => 0);
    openCandidates = await getVentureRepo().then((r) => r.candidates()).then((cs) => cs.filter((c) => c.status === "pending").length).catch(() => 0);
  } catch (e) {
    if (e instanceof MigrationMissingError) migration = e.message;
    else throw e;
  }

  const groups = [
    { label: null, items: [{ href: "/admin", label: "Cockpit" }] },
    { label: "Inhalte", items: [
      { href: "/admin/review", label: "Review-Queue", count: pending },
      { href: "/admin/ticker", label: "Liveticker", count: fresh },
      { href: "/admin/trends", label: "Trends" },
      { href: "/admin/datenbank", label: "Trenddatenbank" },
      { href: "/admin/quellenverzeichnis", label: "Quellenverzeichnis" },
    ] },
    { label: "Netzwerk", items: [
      { href: "/admin/venture", label: "Challenges", count: openCandidates },
      { href: "/admin/startups", label: "Netzwerk-Datenbank" },
    ] },
    { label: "Agenten", items: [
      { href: "/admin/scouting", label: "Scouting" },
      { href: "/admin/agents", label: "Agenten-Protokoll" },
    ] },
    { label: "Kunden", items: [
      { href: "/admin/projekte", label: "Projekte", count: newRequests },
      { href: "/admin/kunden", label: "Kunden" },
      ...(viewer.platformRole === "admin" ? [{ href: "/admin/team", label: "Team" }] : []),
    ] },
  ];

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-[1600px] flex-1 gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8 lg:py-8">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <AdminNav groups={groups} />
      </aside>
      <main className="flex min-w-0 flex-col gap-8">{migration ? <MigrationNotice detail={migration} /> : children}</main>
    </div>
  );
}
