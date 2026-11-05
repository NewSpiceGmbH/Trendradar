"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveProposal, rejectProposal } from "@/lib/admin/actions";
import { FIELD_LABEL } from "@/lib/admin/labels";
import type { Lookups, ProposalKind, ScoreItem, TrendFields, TrendSnapshot } from "@/lib/admin/types";
import { FieldInput, HorizonSelect, ScoreEditor } from "./fields";
import { Card, btn, input } from "./ui";

type Mode = "idle" | "edit" | "reject";

/**
 * Aktionen in der Review-Queue: Freigeben, Bearbeiten und freigeben, Ablehnen (mit Begründung).
 * Beim Bearbeiten wird der Vorschlag selbst verändert; freigegeben wird die bearbeitete Fassung.
 */
export function ReviewActions({
  id, kind, payload, before, lookups, nextId,
}: {
  id: string;
  kind: ProposalKind;
  payload: Record<string, unknown>;
  before: TrendSnapshot | null;
  lookups: Pick<Lookups, "clusters" | "focus" | "subtopics" | "criteria">;
  nextId: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState<Record<string, unknown>>(() => structuredClone(payload));
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  const done = (text: string) => {
    setMsg({ ok: true, text });
    router.push(nextId ? `/admin/review/${nextId}` : "/admin/review");
    router.refresh();
  };
  const approve = (edited: boolean) =>
    start(async () => {
      const r = await approveProposal(id, edited ? draft : null, note || null);
      if (r.ok) done(r.message ?? "Freigegeben.");
      else setMsg({ ok: false, text: r.error });
    });
  const reject = () =>
    start(async () => {
      const r = await rejectProposal(id, note);
      if (r.ok) done("Abgelehnt.");
      else setMsg({ ok: false, text: r.error });
    });

  const fields = (draft.fields ?? {}) as Partial<TrendFields>;
  const setField = (k: keyof TrendFields, v: unknown) => setDraft((d) => ({ ...d, fields: { ...(d.fields as object), [k]: v } }));
  const editableKeys = (kind === "new_trend"
    ? (["name", "cluster_code", "focus_code", "description", "use_cases", "best_practice", "opportunities", "risks", "evidence", "journey_stage", "audience"] as const)
    : (Object.keys(fields) as (keyof TrendFields)[])) as readonly (keyof TrendFields)[];

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="!text-xl">Entscheidung</h2>

      {mode === "edit" && (
        <div className="flex flex-col gap-4">
          {kind === "score_change" ? (
            <>
              <ScoreEditor
                criteria={lookups.criteria}
                scores={(draft.scores as ScoreItem[]) ?? []}
                base={before?.scores[(draft.perspective as "GLOBAL" | "EU") ?? "GLOBAL"]?.length ? before.scores[(draft.perspective as "GLOBAL" | "EU")] : before?.scores.GLOBAL}
                onChange={(s) => setDraft((d) => ({ ...d, scores: s }))}
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="r-horizon" className="eyebrow !text-muted">Horizont</label>
                <HorizonSelect id="r-horizon" value={(draft.horizon as string) ?? null} onChange={(v) => setDraft((d) => ({ ...d, horizon: v }))} allowInherit={draft.perspective === "EU"} />
              </div>
              {draft.perspective === "EU" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="r-note" className="eyebrow !text-muted">Warum Europa anders ist</label>
                  <textarea id="r-note" rows={3} value={(draft.eu_note as string) ?? ""} onChange={(e) => setDraft((d) => ({ ...d, eu_note: e.target.value || null }))} className={input} />
                </div>
              )}
            </>
          ) : editableKeys.length ? (
            editableKeys.map((k) => (
              <FieldInput key={k} k={k} value={fields[k]} onChange={(v) => setField(k, v)} lookups={lookups} focusCode={fields.focus_code as string | undefined} />
            ))
          ) : (
            <p className="text-sm text-muted">Dieser Vorschlag hat keine bearbeitbaren Inhalte.</p>
          )}
          {kind === "attach_signal" && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={!!draft.publish} onChange={(e) => setDraft((d) => ({ ...d, publish: e.target.checked }))} className="size-4" />
              Meldung gleich im Liveticker veröffentlichen
            </label>
          )}
        </div>
      )}

      {mode !== "idle" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-review-note" className="eyebrow !text-muted">{mode === "reject" ? "Begründung (Pflicht)" : "Notiz (optional)"}</label>
          <textarea id="r-review-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={input} placeholder={mode === "reject" ? "Warum passt der Vorschlag nicht?" : "Für die Historie"} />
        </div>
      )}

      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-ink" : "text-[var(--cA)]"}`}>{msg.text}</p>}

      <div className="flex flex-col gap-2">
        {mode === "idle" && (
          <>
            <button type="button" disabled={busy} onClick={() => approve(false)} className={btn.primary}>Freigeben</button>
            <button type="button" disabled={busy} onClick={() => setMode("edit")} className={btn.ghost}>Bearbeiten und freigeben</button>
            <button type="button" disabled={busy} onClick={() => setMode("reject")} className={btn.danger}>Ablehnen …</button>
          </>
        )}
        {mode === "edit" && (
          <>
            <button type="button" disabled={busy} onClick={() => approve(true)} className={btn.primary}>Bearbeitete Fassung freigeben</button>
            <button type="button" disabled={busy} onClick={() => { setMode("idle"); setDraft(structuredClone(payload)); }} className={btn.ghost}>Abbrechen</button>
          </>
        )}
        {mode === "reject" && (
          <>
            <button type="button" disabled={busy || !note.trim()} onClick={reject} className={btn.danger}>Ablehnen</button>
            <button type="button" disabled={busy} onClick={() => setMode("idle")} className={btn.ghost}>Abbrechen</button>
          </>
        )}
      </div>
      <p className="text-xs text-muted">
        Freigeben sichert den alten Stand in der Versionshistorie und veröffentlicht die Änderung im Stadion.
        {kind === "new_trend" ? " Ein neuer Trend erscheint sofort im Radar." : ""}
        {editableKeys.length && mode === "edit" ? ` Bearbeitbar: ${editableKeys.map((k) => FIELD_LABEL[k]).join(", ")}.` : ""}
      </p>
    </Card>
  );
}
