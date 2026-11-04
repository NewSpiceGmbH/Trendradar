import type { ReactNode } from "react";

export function SectionHead({ no, eyebrow, title, children }: { no: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)]">
      <span className="num text-5xl leading-none text-line sm:text-6xl" aria-hidden>
        {no}
      </span>
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {children && <div className="text-text">{children}</div>}
      </div>
    </div>
  );
}

export function Chip({ pressed, onClick, children, swatch }: { pressed: boolean; onClick: () => void; children: ReactNode; swatch?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 py-1 text-sm transition ${
        pressed ? "border-ink bg-ink text-bg" : "border-line text-ink hover:border-muted"
      }`}
    >
      {swatch && <i aria-hidden className="size-2.5 rounded-full" style={{ background: swatch }} />}
      {children}
    </button>
  );
}

export function Button({ children, ghost, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { ghost?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-[var(--radius-pill)] border px-4 py-2 text-sm font-bold transition ${
        ghost ? "border-line text-ink hover:border-muted" : "border-ink bg-ink text-bg hover:opacity-90"
      } ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}
