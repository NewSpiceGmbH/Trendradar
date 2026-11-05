"use client";

/** Bausteine für Formulare im Backend */
export const Label = ({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="eyebrow !text-muted">{children}</label>
);

export function Toggles<T extends string>({ options, value, onChange, label }: { options: Record<T, string>; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {(Object.entries(options) as [T, string][]).map(([k, l]) => {
          const on = value.includes(k);
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
              className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm ${on ? "bg-ink font-bold text-bg" : "border border-line text-text hover:text-ink"}`}>
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}


/** Mehrzeilige Liste: ein Eintrag pro Zeile */
export const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
