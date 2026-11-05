import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/app/logo";
import { MainNav } from "@/components/app/main-nav";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="glass sticky top-0 z-20 !border-x-0 !border-t-0 !shadow-none">
        <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3 sm:gap-6 sm:px-8">
          <Link href="/radar" className="flex shrink-0 items-center gap-3 text-ink no-underline" aria-label="New Spice Trendradar – zum Dashboard">
            <Logo className="h-7 w-auto" />
            <span className="hidden text-sm text-muted lg:inline">Trendradar</span>
          </Link>
          <Suspense fallback={<MainNav static />}>
            <MainNav />
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
