"use client";

import { AUDIENCE_OPTIONS, FIELD_LABEL, HORIZON_OPTIONS, ORIGIN_OPTIONS, STAGE_OPTIONS, STATUS_LABEL, TEXT_FIELDS } from "@/lib/admin/labels";
import type { Lookups, ScoreItem, TrendFields } from "@/lib/admin/types";
import { input } from "./ui";

/** Eingabe für ein Feld eines Trends – passend zum Datentyp */
export function FieldInput({
  k, value, onChange, lookups, focusCode,
}: {
  k: keyof TrendFields;
  value: unknown;
  onChange: (v: unknown) => void;
  lookups: Pick<Lookups, "clusters" | "focus" | "subtopics">;
  focusCode?: string;
}) {
  const id = `f-${k}`;
  const label = <label htmlFor={id} className="eyebrow !text-muted">{FIELD_LABEL[k]}</label>;
  const select = (opts: Record<string, string>) => (
    <select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={input}>
      {Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  let control: React.ReactNode;
  if ((TEXT_FIELDS as readonly string[]).includes(k)) {
    control = (
      <textarea id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)} rows={k === "description" ? 3 : 4} className={`${input} resize-y leading-relaxed`} />
    );
  } else if (k === "uncertain" || k === "mandatory") {
    return (
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--ink)]" />
        {FIELD_LABEL[k]}
      </label>
    );
  } else if (k === "cluster_code") control = select(Object.fromEntries(lookups.clusters.map((c) => [c.code, `${c.code} · ${c.name}`])));
  else if (k === "focus_code") control = select(Object.fromEntries(lookups.focus.map((f) => [f.code, f.name])));
  else if (k === "subtopic_id") {
    control = (
      <select id={id} value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={input}>
        <option value="">–</option>
        {lookups.subtopics.filter((s) => !focusCode || s.focusCode === focusCode).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    );
  } else if (k === "origin") control = select(ORIGIN_OPTIONS);
  else if (k === "evidence") control = select({ A: "A · durch Primärquellen belegt", B: "B · teilweise belegt", C: "C · Wissensbasis, zu validieren" });
  else if (k === "status") control = select(STATUS_LABEL);
  else if (k === "journey_stage") control = select(STAGE_OPTIONS);
  else if (k === "audience") control = select(AUDIENCE_OPTIONS);
  else control = <input id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={input} />;
  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {control}
    </div>
  );
}

/** Scores 1–5 je Kriterium mit Begründung; optional nur Abweichungen (EU) */
export function ScoreEditor({
  criteria, scores, onChange, base, withRationale = true, inheritable = false,
}: {
  criteria: Lookups["criteria"];
  scores: ScoreItem[];
  onChange: (s: ScoreItem[]) => void;
  /** Vergleichswerte (z. B. GLOBAL bei EU, vorheriger Stand bei Vorschlägen) */
  base?: ScoreItem[];
  withRationale?: boolean;
  /** Kriterien ohne eigenen Wert übernehmen den Vergleichswert (EU erbt von Global) */
  inheritable?: boolean;
}) {
  const get = (c: number) => scores.find((s) => s.criterion === c);
  const set = (c: number, patch: Partial<ScoreItem>) => {
    const cur = get(c) ?? { criterion: c, score: base?.find((b) => b.criterion === c)?.score ?? 3, rationale: null };
    const next = scores.filter((s) => s.criterion !== c).concat({ ...cur, ...patch }).sort((a, b) => a.criterion - b.criterion);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      {criteria.map((c) => {
        const cur = get(c.idx)?.score ?? base?.find((b) => b.criterion === c.idx)?.score ?? 3;
        const was = base?.find((b) => b.criterion === c.idx)?.score;
        return (
          <div key={c.idx} className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start">
            <div className="flex flex-col">
              <span className="text-sm text-ink">{c.name}</span>
              <span className="text-xs text-muted">
                {Math.round(c.weight * 100)} %
                {inheritable ? (get(c.idx) ? " · eigene Bewertung" : " · wie Global") : was != null && was !== cur ? ` · vorher ${was}` : ""}
              </span>
              {inheritable && get(c.idx) && (
                <button type="button" onClick={() => onChange(scores.filter((s) => s.criterion !== c.idx))} className="self-start text-xs text-muted underline hover:text-ink">
                  zurück auf Global
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1" role="radiogroup" aria-label={c.name}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={cur === v}
                    onClick={() => set(c.idx, { score: v })}
                    className={`num size-9 rounded-full text-sm ${cur === v ? (inheritable && !get(c.idx) ? "border-2 border-ink text-ink" : "bg-ink text-bg") : was === v ? "border border-muted text-ink" : "border border-line text-muted hover:text-ink"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {withRationale && (!inheritable || get(c.idx)) && (
                <input
                  value={get(c.idx)?.rationale ?? ""}
                  onChange={(e) => set(c.idx, { rationale: e.target.value || null })}
                  placeholder="Begründung"
                  aria-label={`Begründung ${c.name}`}
                  className={input}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HorizonSelect({ value, onChange, allowInherit, id }: { value: string | null; onChange: (v: string | null) => void; allowInherit?: boolean; id: string }) {
  return (
    <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={input}>
      {allowInherit && <option value="">wie Global</option>}
      {HORIZON_OPTIONS.map((h) => <option key={h} value={h}>{h} Jahre</option>)}
    </select>
  );
}
