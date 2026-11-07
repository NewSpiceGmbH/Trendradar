"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavKey = "radar" | "radar2d" | "news" | "netzwerk" | "projekte" | "empfehlen" | "profil";

const ITEMS: { key: NavKey; href: string; label: string; short: string; active: (p: string) => boolean }[] = [
  { key: "radar", href: "/radar", label: "Dashboard (3D)", short: "3D", active: (p: string) => p === "/radar" },
  { key: "radar2d", href: "/radar/klassisch", label: "2D-Ansicht", short: "2D", active: (p: string) => p.startsWith("/radar/klassisch") },
  { key: "news", href: "/news", label: "News-Ticker", short: "News", active: (p: string) => p.startsWith("/news") },
  { key: "netzwerk", href: "/netzwerk", label: "Netzwerk", short: "Netzwerk", active: (p: string) => p.startsWith("/netzwerk") },
  { key: "projekte", href: "/projekte", label: "Projekte", short: "Projekte", active: (p: string) => p.startsWith("/projekte") },
  { key: "empfehlen", href: "/empfehlen", label: "Kontakt empfehlen", short: "Empfehlen", active: (p: string) => p.startsWith("/empfehlen") },
  { key: "profil", href: "/profil", label: "Mein Profil", short: "Profil", active: (p: string) => p.startsWith("/profil") },
];

/** Standard (Kunden und Redaktion), solange die Zugangsart noch nicht geladen ist */
export const DEFAULT_NAV: NavKey[] = ["radar", "radar2d", "news", "netzwerk", "projekte"];

/** Hauptnavigation für Kunden und Redaktion; Trenddatenbank und Quellen liegen im Backend */
export function MainNav(props: { static?: boolean; keys?: NavKey[] }) {
  const keys = props.keys ?? DEFAULT_NAV;
  // ohne Pfad (Platzhalter beim Vorab-Rendern) ist nichts markiert
  return props.static ? <Items path="" keys={keys} /> : <ActiveNav keys={keys} />;
}

function ActiveNav({ keys }: { keys: NavKey[] }) {
  return <Items path={usePathname()} keys={keys} />;
}

function Items({ path, keys }: { path: string; keys: NavKey[] }) {
  return (
    <nav aria-label="Bereiche" className="flex min-w-0 items-center gap-0.5 text-sm sm:gap-1">
      {ITEMS.filter((i) => keys.includes(i.key)).map((i) => {
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
