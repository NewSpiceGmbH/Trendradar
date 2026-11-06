"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  count?: number;
}
export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/** Seitennavigation des Backends in Gruppen; am Handy hinter „Menü“ (gleiche Gruppen) */
export function AdminNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const all = groups.flatMap((g) => g.items);
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const current = all.find((i) => isActive(i.href));
  const total = all.reduce((n, i) => n + (i.count ?? 0), 0);

  const list = (
    <div className="flex flex-col gap-4">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className="flex flex-col gap-0.5">
          {g.label && <p className="eyebrow !text-[11px] !text-muted px-3 pb-1">{g.label}</p>}
          {g.items.map((i) => {
            const active = isActive(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm no-underline ${
                  active ? "bg-ink font-bold text-bg" : "text-text hover:bg-sunk hover:text-ink"
                }`}
              >
                {i.label}
                {i.count ? <span className={`num rounded-full px-2 text-xs ${active ? "bg-bg text-ink" : "bg-line text-ink"}`}>{i.count}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <nav aria-label="Redaktion">
      {/* Handy: aufklappbar */}
      <div className="lg:hidden">
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
          className="glass flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] px-4 py-3 text-sm font-bold text-ink">
          <span>Menü{current ? <span className="font-normal text-muted"> · {current.label}</span> : null}</span>
          <span className="flex items-center gap-2">
            {total > 0 && <span className="num rounded-full bg-line px-2 text-xs">{total}</span>}
            <span aria-hidden>{open ? "▴" : "▾"}</span>
          </span>
        </button>
        {open && <div className="glass-strong mt-2 rounded-[var(--radius-card)] p-3">{list}</div>}
      </div>
      <div className="hidden lg:block">{list}</div>
    </nav>
  );
}
