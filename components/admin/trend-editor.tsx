"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveTrend } from "@/lib/admin/actions";
import { FIELD_LABEL, TEXT_FIELDS } from "@/lib/admin/labels";
import { changedFields, positionOf } from "@/lib/admin/patch";
import type { Lookups, TrendFields, TrendPatch, TrendSnapshot } from "@/lib/admin/types";
import { fmt } from "@/lib/radar/view";
import type { Perspective, Scores } from "@/lib/scoring";
import { FieldInput, HorizonSelect, ScoreEditor } from "./fields";
import { Card, btn, input } from "./ui";

const BASIC: (keyof TrendFields)[] = ["name", "status", "cluster_code", "focus_code", "subtopic_id", "origin", "journey_stage", "audience", "evidence"];

/**
 * Formular für einen Trend. Rechts die Live-Vorschau: In welcher Spielphase landet der Trend mit diesen Werten?
 * Gespeichert wird der komplette Stand über edit_trend() bzw. create_trend() – der alte Stand landet in der Historie.
 */
export function TrendEditor({ trendId, initial, lookups }: { trendId: number | null; initial: TrendSnapshot; lookups: Lookups }) {
  const router = useRouter();
  const [t, setT] = useState<TrendSnapshot>(() => structuredClone(initial));
  const [euOn, setEuOn] = useState(() => !!(initial.perspectives.EU || initial.scores.EU.length));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const weights = lookups.criteria.map((c) => c.weight) as unknown as Scores;

  const current = useMemo<TrendSnapshot>(
    () => (euOn ? t : { ...t, scores: { ...t.scores, EU: [] }, perspectives: { ...t.perspectives, EU: null } }),
    [t, euOn],
  );
  const dirty = JSON.stringify(current) !== JSON.stringify(initial);
  const setField = (k: keyof TrendFields, v: unknown) => setT((x) => ({ ...x, fields: { ...x.fields, [k]: v } }));

  const save = () =>
    start(async () => {
      if (!current.fields.name.trim()) return setMsg({ ok: false, text: "Bitte einen Namen angeben." });
      if (!current.fields.description.trim()) return setMsg({ ok: false, text: "Bitte eine Beschreibung angeben." });
      const { number: _n, ...fields } = current.fields;
      void _n;
      const patch: TrendPatch = { fields, scores: current.scores, perspectives: current.perspectives, relevance: current.relevance };
      const r = await saveTrend(trendId, patch);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Gespeichert." });
      if (trendId == null && r.id) router.push(`/admin/trends/${r.id}`);
      router.refresh();
    });

  const preview = (p: Perspective) => ({ before: trendId == null ? null : positionOf(initial, p, weights), after: positionOf(current, p, weights) });
  const changed = trendId == null ? [] : changedFields(initial, current);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <h2 className="!text-xl">Grunddaten</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {BASIC.map((k) => (
              <div key={k} className={k === "name" ? "sm:col-span-2" : ""}>
                <FieldInput k={k} value={t.fields[k]} onChange={(v) => setField(k, v)} lookups={lookups} focusCode={t.fields.focus_code} />
              </div>
            ))}
            <FieldInput k="uncertain" value={t.fields.uncertain} onChange={(v) => setField("uncertain", v)} lookups={lookups} />
            <FieldInput k="mandatory" value={t.fields.mandatory} onChange={(v) => setField("mandatory", v)} lookups={lookups} />
          </div>
        </Card>

        <Card>
          <h2 className="!text-xl">Texte</h2>
          <p className="mt-1 text-sm text-muted">Kurz, sachlich, Deutsch. Quellen im Format [s13]. Keine Volltexte fremder Artikel.</p>
          <div className="mt-4 flex flex-col gap-4">
            {TEXT_FIELDS.map((k) => (
              <FieldInput key={k} k={k} value={t.fields[k]} onChange={(v) => setField(k, k === "description" ? (v ?? "") : v)} lookups={lookups} />
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="!text-xl">Bewertung Global</h2>
          <div className="mt-4 flex flex-col gap-5">
            <div className="flex max-w-xs flex-col gap-1.5">
              <label htmlFor="h-global" className="eyebrow !text-muted">Horizont (Time-to-Adoption)</label>
              <HorizonSelect id="h-global" value={t.perspectives.GLOBAL?.horizon ?? "3–5"} onChange={(v) => setT((x) => ({ ...x, perspectives: { ...x.perspectives, GLOBAL: { horizon: (v ?? "3–5") as "3–5", note: null } } }))} />
            </div>
            <ScoreEditor criteria={lookups.criteria} scores={t.scores.GLOBAL} base={initial.scores.GLOBAL} onChange={(s) => setT((x) => ({ ...x, scores: { ...x.scores, GLOBAL: s } }))} />
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="!text-xl">Europa / DACH</h2>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={euOn} onChange={(e) => setEuOn(e.target.checked)} className="size-4" />
              Europa anders bewerten als Global
            </label>
          </div>
          {euOn ? (
            <div className="mt-4 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="eu-note" className="eyebrow !text-muted">Warum Europa anders ist</label>
                <textarea id="eu-note" rows={3} value={t.perspectives.EU?.note ?? ""} onChange={(e) => setT((x) => ({ ...x, perspectives: { ...x.perspectives, EU: { horizon: x.perspectives.EU?.horizon ?? null, note: e.target.value || null } } }))} className={input} placeholder="DSGVO, EU AI Act, Mitbestimmung, Fankultur …" />
              </div>
              <div className="flex max-w-xs flex-col gap-1.5">
                <label htmlFor="h-eu" className="eyebrow !text-muted">Horizont Europa</label>
                <HorizonSelect id="h-eu" allowInherit value={t.perspectives.EU?.horizon ?? null} onChange={(v) => setT((x) => ({ ...x, perspectives: { ...x.perspectives, EU: { horizon: v as "3–5" | null, note: x.perspectives.EU?.note ?? null } } }))} />
              </div>
              <ScoreEditor inheritable criteria={lookups.criteria} scores={t.scores.EU} base={t.scores.GLOBAL} onChange={(s) => setT((x) => ({ ...x, scores: { ...x.scores, EU: s } }))} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Ohne Abweichung gelten in Europa die globalen Werte.</p>
          )}
        </Card>

        <Card>
          <h2 className="!text-xl">Relevanz je Branche</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {lookups.industries.map((ind) => (
              <div key={ind.code} className="flex flex-col gap-1.5">
                <label htmlFor={`rel-${ind.code}`} className="eyebrow !text-muted">{ind.name}</label>
                <select id={`rel-${ind.code}`} value={t.relevance[ind.code] ?? 1} onChange={(e) => setT((x) => ({ ...x, relevance: { ...x.relevance, [ind.code]: Number(e.target.value) } }))} className={input}>
                  {[1, 2, 3].map((v) => <option key={v} value={v}>{["", "gering", "mittel", "hoch"][v]}</option>)}
                </select>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
        <Card className="flex flex-col gap-4">
          <h2 className="!text-xl">Live-Vorschau</h2>
          {(["EU", "GLOBAL"] as Perspective[]).map((p) => {
            const { before, after } = preview(p);
            const moved = before && before.zone !== after.zone;
            return (
              <div key={p} className={`flex flex-col gap-0.5 rounded-xl p-3 ${moved ? "bg-accent text-on-accent" : "border border-line"}`}>
                <span className={`eyebrow !text-[11px] ${moved ? "!text-on-accent" : "!text-muted"}`}>{p === "EU" ? "Europa / DACH" : "Global"}</span>
                <span className="font-bold">{moved ? `${lookups.zones[before!.zone]?.name} → ` : ""}{lookups.zones[after.zone]?.name}</span>
                <span className="num text-sm">Score {before && before.total !== after.total ? `${fmt(before.total)} → ` : ""}{fmt(after.total)} · {after.horizon} J.</span>
              </div>
            );
          })}
          {changed.length > 0 && <p className="text-xs text-muted">Geändert: {changed.map((k) => FIELD_LABEL[k]).join(", ")}</p>}
          {msg && <p role="status" className={`text-sm ${msg.ok ? "text-ink" : "text-[var(--cA)]"}`}>{msg.text}</p>}
          <button type="button" onClick={save} disabled={busy || (!dirty && trendId != null)} className={btn.primary}>
            {trendId == null ? "Als Entwurf anlegen" : "Speichern"}
          </button>
          {dirty && trendId != null && (
            <button type="button" onClick={() => { setT(structuredClone(initial)); setEuOn(!!(initial.perspectives.EU || initial.scores.EU.length)); setMsg(null); }} className={btn.ghost}>
              Änderungen verwerfen
            </button>
          )}
          <p className="text-xs text-muted">
            {t.fields.status === "published" ? "Veröffentlicht: Änderungen sind nach dem Speichern sofort im Stadion sichtbar." : "Nicht veröffentlicht: Kunden sehen diesen Trend nicht."}
          </p>
        </Card>
      </div>
    </div>
  );
}
