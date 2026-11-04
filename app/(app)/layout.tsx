import Link from "next/link";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] items-center gap-6 px-4 py-3 sm:px-8">
          <Link href="/radar" className="flex items-baseline gap-2 text-ink no-underline">
            <span className="font-display text-lg font-extrabold tracking-tight">New Spice</span>
            <span className="text-sm text-muted">Trendradar</span>
          </Link>
          <nav aria-label="Bereiche" className="hidden gap-5 text-sm md:flex">
            {[
              ["/radar", "Stadion"],
              ["/radar/klassisch", "2D-Ansicht"],
              ["/radar/klassisch#datenbank", "Trenddatenbank"],
              ["/radar/klassisch#quellen", "Quellen"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="text-text no-underline hover:text-ink">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
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
