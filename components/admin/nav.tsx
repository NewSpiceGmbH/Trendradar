"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  count?: number;
}

/** Seitennavigation des Backends; markiert den aktiven Bereich */
export function AdminNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Redaktion" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm no-underline ${
              active ? "bg-ink font-bold text-bg" : "text-text hover:bg-sunk hover:text-ink"
            }`}
          >
            {i.label}
            {i.count ? (
              <span className={`num rounded-full px-2 text-xs ${active ? "bg-bg text-ink" : "bg-line text-ink"}`}>{i.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
