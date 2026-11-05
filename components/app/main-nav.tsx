"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/radar", label: "Dashboard (3D)", short: "3D", active: (p: string) => p === "/radar" },
  { href: "/radar/klassisch", label: "2D-Ansicht", short: "2D", active: (p: string) => p.startsWith("/radar/klassisch") },
  { href: "/news", label: "News-Ticker", short: "News", active: (p: string) => p.startsWith("/news") },
  { href: "/projekte", label: "Projekte", short: "Projekte", active: (p: string) => p.startsWith("/projekte") },
];

/** Hauptnavigation für Kunden und Redaktion; Trenddatenbank und Quellen liegen im Backend */
export function MainNav(props: { static?: boolean }) {
  // ohne Pfad (Platzhalter beim Vorab-Rendern) ist nichts markiert
  return props.static ? <Items path="" /> : <ActiveNav />;
}

function ActiveNav() {
  return <Items path={usePathname()} />;
}

function Items({ path }: { path: string }) {
  return (
    <nav aria-label="Bereiche" className="flex min-w-0 items-center gap-0.5 text-sm sm:gap-1">
      {ITEMS.map((i) => {
        const on = i.active(path);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-[var(--radius-pill)] px-2.5 py-1.5 font-bold sm:px-3 no-underline ${on ? "bg-ink text-bg" : "text-text hover:text-ink"}`}
          >
            <span className="hidden sm:inline">{i.label}</span>
            <span className="sm:hidden">{i.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
