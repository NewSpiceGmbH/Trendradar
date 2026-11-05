import type { ReactNode } from "react";

/** Gemeinsame Bausteine des Redaktions-Backends (Server und Client) */

export function PageHead({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-3xl flex-col gap-2">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="!text-[clamp(28px,3vw,40px)]">{title}</h1>
        {children && <p className="text-text">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass-strong rounded-[var(--radius-card)] p-5 sm:p-6 ${className}`}>{children}</section>;
}

const TONES = {
  neutral: "border-line text-text",
  accent: "border-accent/60 bg-accent text-on-accent",
  warn: "border-[color-mix(in_srgb,var(--cA)_60%,transparent)] text-ink",
  muted: "border-line text-muted",
} as const;

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2.5 py-0.5 text-xs font-bold ${TONES[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">{children}</p>;
}

export function ExampleTag() {
  return <Badge tone="muted">Beispiel · Testmodus</Badge>;
}

/** Hinweis, solange Migration 0006 noch nicht angewendet ist */
export function MigrationNotice({ detail }: { detail: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Datenbank noch nicht bereit</p>
        <h2 className="!text-2xl">Migration 0006 fehlt</h2>
        <p>
          Das Redaktions-Backend braucht die Datenbank-Erweiterung aus Pull Request „Migration 0006: Grundlage für das Redaktions-Backend“.
          Sobald er nach <code>main</code> übernommen ist, wendet Supabase sie an und diese Seite funktioniert.
        </p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
    </Card>
  );
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "–");

const rel = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "–";
  const min = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  if (Math.abs(min) < 60) return rel.format(min, "minute");
  const h = Math.round(min / 60);
  if (Math.abs(h) < 48) return rel.format(h, "hour");
  return rel.format(Math.round(h / 24), "day");
}

export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-ink px-4 py-2 text-sm font-bold text-bg no-underline hover:opacity-90 disabled:opacity-40",
  ghost: "glass inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-bold text-ink no-underline hover:brightness-110 disabled:opacity-40",
  danger: "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-line px-4 py-2 text-sm font-bold text-ink hover:border-[var(--cA)] disabled:opacity-40",
};

export const input =
  "w-full rounded-xl border border-line bg-sunk px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-muted focus:outline-none";
