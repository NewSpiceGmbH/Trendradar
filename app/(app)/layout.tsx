import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/app/logo";
import { MainNav, type NavKey } from "@/components/app/main-nav";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";
import { getViewer } from "@/lib/auth/viewer";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="glass sticky top-0 z-20 !border-x-0 !border-t-0 !shadow-none">
        <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3 sm:gap-6 sm:px-8">
          <Link href="/radar" className="flex shrink-0 items-center gap-3 text-ink no-underline" aria-label="New Spice Trendradar – zum Dashboard">
            <Logo className="h-6 w-auto sm:h-7" />
            <span className="hidden text-sm text-muted lg:inline">Trendradar</span>
          </Link>
          <Suspense fallback={<MainNav static />}>
            <ViewerNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:contents"><ThemeToggle /></span>
            <Suspense fallback={<span className="text-sm text-muted">…</span>}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}

/** Navigation je Zugangsart: Kunden mit Projekten, Partner mit „Kontakt empfehlen“, Solution Provider nur „Mein Profil“ */
async function ViewerNav() {
  const v = await getViewer();
  if (!v) return <MainNav />;
  const keys: NavKey[] = [];
  if (v.hasAccess) keys.push("radar", "radar2d", "news", "netzwerk");
  if (v.isEditor || v.canRequestProjects) keys.push("projekte");
  if (v.canRecommend) keys.push("empfehlen");
  if (v.providerMemberId) keys.push("profil");
  return <MainNav keys={keys} />;
}
