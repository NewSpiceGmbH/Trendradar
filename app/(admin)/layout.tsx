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

/** Redaktions-Backend: nur für platform_role admin/editor. Maßgeblich bleibt RLS in der Datenbank. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-backdrop flex min-h-dvh flex-col">
      <header className="glass sticky top-0 z-20 !border-x-0 !border-t-0 !shadow-none">
        <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-4 py-3 sm:px-8">
          <Link href="/admin" className="flex items-center gap-3 text-ink no-underline" aria-label="New Spice Redaktion – Cockpit">
            <Logo className="h-7 w-auto" />
            <span className="text-sm text-muted">Redaktion</span>
          </Link>
          <Link href="/radar" className="text-sm text-text no-underline hover:text-ink">Zum Dashboard →</Link>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <Suspense fallback={<span className="text-sm text-muted">…</span>}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <Suspense fallback={<p className="mx-auto max-w-[1440px] px-8 py-16 text-muted">Redaktion wird geladen …</p>}>
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

  let pending = 0, fresh = 0, migration: string | null = null;
  try {
    const repo = await getAdminRepo();
    const [proposals, signals] = await Promise.all([repo.proposals(), repo.signals()]);
    pending = proposals.filter((p) => p.status === "pending").length;
    fresh = signals.filter((s) => s.status !== "dismissed" && !s.publishedAt).length;
  } catch (e) {
    if (e instanceof MigrationMissingError) migration = e.message;
    else throw e;
  }

  const items = [
    { href: "/admin", label: "Cockpit" },
    { href: "/admin/review", label: "Review-Queue", count: pending },
    { href: "/admin/ticker", label: "Liveticker", count: fresh },
    { href: "/admin/trends", label: "Trends" },
    { href: "/admin/datenbank", label: "Trenddatenbank" },
    { href: "/admin/quellenverzeichnis", label: "Quellenverzeichnis" },
    { href: "/admin/scouting", label: "Scouting" },
    { href: "/admin/agents", label: "Agenten" },
    ...(viewer.platformRole === "admin" ? [{ href: "/admin/team", label: "Team" }] : []),
  ];

  return (
    <div className="mx-auto grid w-full max-w-[1440px] flex-1 gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <AdminNav items={items} />
      </aside>
      <main className="flex min-w-0 flex-col gap-8">{migration ? <MigrationNotice detail={migration} /> : children}</main>
    </div>
  );
}
