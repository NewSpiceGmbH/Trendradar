"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { addDeepDive, applyBrief, deleteDeepDive, saveBrief } from "@/lib/venture/actions";
import {
  CONSTRAINT_LABEL, EMPTY_BRIEF, constraintFrom, constraintLines, hypoFrom, hypoLines, linesOf, listFrom, painFrom, painLines, stakeFrom, stakeLines,
  type Brief,
} from "@/lib/venture/brief";
import type { DeepDiveSession } from "@/lib/venture/types";
import { Label } from "./form";
import { Badge, Card, Empty, btn, input, timeAgo } from "./ui";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-sm ${m.ok ? "text-ink" : "text-[var(--cA)]"}`}>{m.text}</p> : null);

/**
 * Problem Deep Dive an der Challenge: Gespräche (Transkripte aus Notion KI) hinzufügen, das konsolidierte Briefing
 * prüfen und bearbeiten, dann als Scouting-Grundlage übernehmen.
 */
export function DeepDivePanel({ challengeId, sessions, brief, briefUpdatedAt }: { challengeId: string; sessions: DeepDiveSession[]; brief: Brief | null; briefUpdatedAt: string | null }) {
  return (
    <section aria-labelledby="deep-dive" className="flex flex-col gap-4">
      <div>
        <h2 id="deep-dive" className="!text-2xl">Problem Deep Dive</h2>
        <p className="text-sm text-muted">
          Gespräche mit dem Kunden – z. B. von Notion KI transkribiert – hier einfügen. Ein Agent führt alles zu einem Problem-Briefing zusammen.
          Die Transkripte werden nur ausgewertet, nicht gespeichert; Namen werden zu Rollen.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <BriefView challengeId={challengeId} brief={brief} updatedAt={briefUpdatedAt} />
        <div className="flex flex-col gap-6">
          <AddSession challengeId={challengeId} />
          <Sessions items={sessions} />
        </div>
      </div>
    </section>
  );
}

function AddSession({ challengeId }: { challengeId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const submit = (form: FormData) =>
    start(async () => {
      if (mode === "paste") form.delete("file");
      else form.delete("text");
      const r = await addDeepDive(challengeId, form);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Gestartet." } : { ok: false, text: r.error });
      if (r.ok) formRef.current?.reset();
      router.refresh();
    });
  return (
    <Card>
      <h3 className="!text-lg">Gespräch hinzufügen</h3>
      <form ref={formRef} action={submit} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5"><Label htmlFor="dd-title">Titel</Label><input id="dd-title" name="title" className={input} placeholder="z. B. Gespräch mit der Gastronomie" /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="dd-date">Datum</Label><input id="dd-date" name="heldOn" type="date" className={input} /></div>
        <div className="glass inline-flex self-start rounded-[var(--radius-pill)] p-0.5" role="group" aria-label="Quelle">
          {(["paste", "upload"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm font-bold ${mode === m ? "bg-ink text-bg" : "text-ink"}`}>
              {m === "paste" ? "Einfügen" : "Datei"}
            </button>
          ))}
        </div>
        {mode === "paste" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dd-text">Transkript oder Notion-KI-Zusammenfassung</Label>
            <textarea id="dd-text" name="text" rows={8} className={`${input} font-mono text-xs`} placeholder="In Notion alles markieren, kopieren und hier einfügen …" />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dd-file">Notion-Export (Markdown, Text, HTML oder PDF, bis 4 MB)</Label>
            <input id="dd-file" name="file" type="file" accept=".md,.markdown,.txt,.html,.htm,.pdf,text/plain,text/markdown,text/html,application/pdf" className="text-sm" />
            <p className="text-xs text-muted">In Notion: ••• → Exportieren → Markdown & CSV oder PDF.</p>
          </div>
        )}
        <button disabled={busy} className={btn.primary}>{busy ? "Wird übergeben …" : "Auswerten"}</button>
        <Note m={msg} />
      </form>
    </Card>
  );
}

function Sessions({ items }: { items: DeepDiveSession[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Card>
      <h3 className="!text-lg">Gespräche</h3>
      <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
        {items.map((s) => (
          <li key={s.id} className="flex flex-col gap-1 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-ink">{s.title}</b>
              <Badge tone={s.status === "failed" ? "warn" : s.status === "processing" ? "muted" : "neutral"}>
                {s.status === "processing" ? "wird ausgewertet" : s.status === "failed" ? "fehlgeschlagen" : "ausgewertet"}
              </Badge>
            </div>
            <span className="text-xs text-muted">
              {[s.heldOn && new Date(s.heldOn).toLocaleDateString("de-DE"), s.fileName ?? (s.source === "paste" ? "eingefügt" : null), s.charCount && `${Math.round(s.charCount / 1000)} Tsd. Zeichen`, timeAgo(s.createdAt)].filter(Boolean).join(" · ")}
            </span>
            {s.summary && <p>{s.summary}</p>}
            {s.error && <p className="text-xs text-[var(--cA)]">{s.error}</p>}
            <button type="button" disabled={busy} onClick={() => start(async () => { await deleteDeepDive(s.id); router.refresh(); })} className="self-start text-xs text-muted hover:text-ink">Entfernen</button>
          </li>
        ))}
        {!items.length && <li className="py-3 text-muted">Noch kein Gespräch.</li>}
      </ul>
    </Card>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1"><p className="eyebrow !text-muted">{title}</p>{children}</div>
);
const Bullets = ({ xs }: { xs: string[] }) => (xs.length ? <ul className="list-disc pl-5">{xs.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="text-muted">–</p>);

function BriefView({ challengeId, brief, updatedAt }: { challengeId: string; brief: Brief | null; updatedAt: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const apply = () =>
    start(async () => {
      const r = await applyBrief(challengeId);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Übernommen." } : { ok: false, text: r.error });
      router.refresh();
    });

  if (editing) return <BriefEditor challengeId={challengeId} initial={brief ?? EMPTY_BRIEF} onDone={() => { setEditing(false); router.refresh(); }} />;
  if (!brief) {
    return (
      <Card>
        <h3 className="!text-lg">Problem-Briefing</h3>
        <div className="mt-3"><Empty>Noch kein Briefing. Fügt das erste Gespräch hinzu – oder schreibt es selbst.</Empty></div>
        <button type="button" onClick={() => setEditing(true)} className={`${btn.ghost} mt-3`}>Selbst schreiben</button>
      </Card>
    );
  }
  const b = brief;
  return (
    <Card className="flex flex-col gap-5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="!text-lg">Problem-Briefing</h3>
          {updatedAt && <p className="text-xs text-muted">zuletzt aktualisiert {timeAgo(updatedAt)}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className={btn.ghost}>Bearbeiten</button>
          <button type="button" onClick={apply} disabled={busy} className={btn.primary}>Als Scouting-Grundlage übernehmen</button>
        </div>
      </div>
      <Note m={msg} />
      {b.summary && <p className="text-base text-ink">{b.summary}</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Section title="Problem"><p>{b.problem || "–"}</p></Section>
        <Section title="Heute"><p>{b.current_process || "–"}</p></Section>
        <Section title="Ursachen"><Bullets xs={b.root_causes} /></Section>
        <Section title="Schmerzpunkte">
          {b.pain_points.length ? (
            <ul className="list-disc pl-5">{b.pain_points.map((p) => <li key={p.text}>{p.text}{p.evidence && <b className="text-ink"> · {p.evidence}</b>}{p.from && <span className="text-xs text-muted"> ({p.from})</span>}</li>)}</ul>
          ) : <p className="text-muted">–</p>}
        </Section>
        <Section title="Ziel"><p>{b.goal || "–"}</p></Section>
        <Section title="Erfolgskriterien"><Bullets xs={b.success_criteria} /></Section>
        <Section title="Muss-Kriterien"><Bullets xs={b.must_haves} /></Section>
        <Section title="Wunsch-Kriterien"><Bullets xs={b.nice_to_haves} /></Section>
        <Section title="Kommt nicht in Frage"><Bullets xs={b.exclusions} /></Section>
        <Section title="Rahmen"><Bullets xs={[...b.constraints.map((c) => `${CONSTRAINT_LABEL[c.topic]}: ${c.text}`), ...(b.timeframe && !b.constraints.some((c) => c.topic === "zeit") ? [`Zeitrahmen: ${b.timeframe}`] : []), ...(b.budget && !b.constraints.some((c) => c.topic === "budget") ? [`Budget: ${b.budget}`] : [])]} /></Section>
        <Section title="Beteiligte"><Bullets xs={b.stakeholders.map((s) => (s.interest ? `${s.role} – ${s.interest}` : s.role))} /></Section>
        <Section title="Vorhandene Systeme"><Bullets xs={b.existing_systems} /></Section>
      </div>
      <Section title="Suchhypothesen">
        {b.search_hypotheses.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {b.search_hypotheses.map((h) => (
              <li key={h.approach} className="rounded-xl border border-line p-3">
                <b className="text-ink">{h.approach}</b>
                {h.keywords.length > 0 && <p className="text-xs">Suchbegriffe: {h.keywords.join(", ")}</p>}
                {h.analogies.length > 0 && <p className="text-xs text-muted">Analogien: {h.analogies.join(", ")}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="text-muted">–</p>}
      </Section>
      <div className="grid gap-5 sm:grid-cols-2">
        <Section title="Offene Fragen fürs nächste Gespräch"><Bullets xs={b.open_questions} /></Section>
        {b.contradictions.length > 0 && <Section title="Widersprüche"><Bullets xs={b.contradictions} /></Section>}
      </div>
      {b.context && <Section title="Kontext"><p>{b.context}</p></Section>}
    </Card>
  );
}

function BriefEditor({ challengeId, initial, onDone }: { challengeId: string; initial: Brief; onDone: () => void }) {
  const [text, setText] = useState({
    summary: initial.summary, problem: initial.problem, current_process: initial.current_process, context: initial.context, goal: initial.goal,
    timeframe: initial.timeframe ?? "", budget: initial.budget ?? "",
    root_causes: linesOf(initial.root_causes), pain_points: painLines(initial.pain_points), stakeholders: stakeLines(initial.stakeholders),
    success_criteria: linesOf(initial.success_criteria), must_haves: linesOf(initial.must_haves), nice_to_haves: linesOf(initial.nice_to_haves),
    exclusions: linesOf(initial.exclusions), constraints: constraintLines(initial.constraints), existing_systems: linesOf(initial.existing_systems),
    search_hypotheses: hypoLines(initial.search_hypotheses), open_questions: linesOf(initial.open_questions), contradictions: linesOf(initial.contradictions),
  });
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const set = (k: keyof typeof text, v: string) => setText((x) => ({ ...x, [k]: v }));
  const save = () =>
    start(async () => {
      const brief: Brief = {
        summary: text.summary.trim(), problem: text.problem.trim(), current_process: text.current_process.trim(), context: text.context.trim(), goal: text.goal.trim(),
        timeframe: text.timeframe.trim() || null, budget: text.budget.trim() || null,
        root_causes: listFrom(text.root_causes), pain_points: painFrom(text.pain_points), stakeholders: stakeFrom(text.stakeholders),
        success_criteria: listFrom(text.success_criteria), must_haves: listFrom(text.must_haves), nice_to_haves: listFrom(text.nice_to_haves),
        exclusions: listFrom(text.exclusions), constraints: constraintFrom(text.constraints), existing_systems: listFrom(text.existing_systems),
        search_hypotheses: hypoFrom(text.search_hypotheses), open_questions: listFrom(text.open_questions), contradictions: listFrom(text.contradictions),
      };
      const r = await saveBrief(challengeId, brief);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      onDone();
    });
  const area = (k: keyof typeof text, label: string, rows = 3, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`bf-${k}`}>{label}</Label>
      <textarea id={`bf-${k}`} rows={rows} value={text[k]} onChange={(e) => set(k, e.target.value)} className={`${input} leading-relaxed`} />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
  const one = "eins pro Zeile";
  return (
    <Card className="flex flex-col gap-4">
      <h3 className="!text-lg">Problem-Briefing bearbeiten</h3>
      {area("summary", "Zusammenfassung", 3)}
      <div className="grid gap-4 sm:grid-cols-2">
        {area("problem", "Problem", 4)}{area("current_process", "Heute (Ist-Ablauf)", 4)}
        {area("root_causes", "Ursachen", 3, one)}{area("pain_points", "Schmerzpunkte", 3, "Schmerzpunkt | Beleg/Zahl | Gespräch")}
        {area("goal", "Ziel", 2)}{area("success_criteria", "Erfolgskriterien", 3, one)}
        {area("must_haves", "Muss-Kriterien", 3, one)}{area("nice_to_haves", "Wunsch-Kriterien", 3, one)}
        {area("exclusions", "Kommt nicht in Frage", 2, one)}{area("constraints", "Rahmen", 3, "Thema: Text – Technik, Betrieb, Budget, Zeit, Datenschutz, Sonstiges")}
        {area("stakeholders", "Beteiligte (nur Rollen)", 3, "Rolle | Interesse")}{area("existing_systems", "Vorhandene Systeme", 2, one)}
      </div>
      {area("search_hypotheses", "Suchhypothesen", 4, "Ansatz | Suchbegriffe, … | Analogien, …")}
      <div className="grid gap-4 sm:grid-cols-2">
        {area("open_questions", "Offene Fragen", 3, one)}{area("contradictions", "Widersprüche", 3, one)}
      </div>
      {area("context", "Kontext", 2)}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="bf-time">Zeitrahmen</Label><input id="bf-time" value={text.timeframe} onChange={(e) => set("timeframe", e.target.value)} className={input} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="bf-budget">Budget</Label><input id="bf-budget" value={text.budget} onChange={(e) => set("budget", e.target.value)} className={input} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className={btn.primary}>{busy ? "Speichert …" : "Briefing speichern"}</button>
        <button type="button" onClick={onDone} className={btn.ghost}>Abbrechen</button>
        <Note m={msg} />
      </div>
    </Card>
  );
}
