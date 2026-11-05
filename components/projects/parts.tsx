"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Badge, Card, btn, input, timeAgo } from "@/components/admin/ui";
import {
  addMilestone, addToShortlist, challengeFromProject, completeProject, createDocument, deleteDocument, deleteMilestone, documentUrl,
  postUpdate, removeFromShortlist, requestProject, respondShortlist, saveProject, setMilestoneDone, updateShortlist,
} from "@/lib/projects/actions";
import {
  BUCKET, CUSTOMER_STATUS_LABEL, MAX_FILE_BYTES, PROJECT_PHASES, PROJECT_STATUS_LABEL, fmtBytes,
  type CustomerStatus, type Milestone, type Project, type ProjectDocument, type ProjectStatus, type ProjectUpdate, type ShortlistEntry,
} from "@/lib/projects/types";
import { createClient } from "@/lib/supabase/client";
import { MATURITY_LABEL } from "@/lib/venture/types";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-sm ${m.ok ? "text-ink" : "text-[var(--cA)]"}`}>{m.text}</p> : null);
const fmtDay = (d: string | null) => (d ? new Date(d).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" }) : null);

function useRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Fehler" });
      if (r.ok) after?.();
      router.refresh();
    });
  return { msg, busy, run };
}

// ───────────────────────── Fortschritt ─────────────────────────

export function PhaseTrack({ status, outcome }: { status: ProjectStatus; outcome: Project["outcome"] }) {
  const idx = PROJECT_PHASES.indexOf(status);
  return (
    <div className="flex flex-col gap-2">
      <ol className="grid grid-cols-6 gap-1" aria-label={`Phase: ${PROJECT_STATUS_LABEL[status]}`}>
        {PROJECT_PHASES.map((p, i) => (
          <li key={p} className="flex flex-col gap-1.5">
            <span className={`h-1.5 rounded-full ${status === "cancelled" ? "bg-line" : i <= idx ? "bg-ink" : "bg-line"}`} aria-hidden />
            {/* am Handy nur die aktuelle Phase beschriften, sonst überlappen die Wörter */}
            <span className={`text-[11px] leading-tight ${i === idx ? "font-bold text-ink" : "hidden text-muted sm:inline"}`}>{PROJECT_STATUS_LABEL[p]}</span>
          </li>
        ))}
      </ol>
      {status === "cancelled" && <p className="text-sm text-muted">Projekt abgebrochen.</p>}
      {status === "completed" && outcome && (
        <p className="text-sm text-ink">{outcome === "success" ? "Erfolgreich abgeschlossen." : "Abgeschlossen ohne Umsetzung."}</p>
      )}
    </div>
  );
}

// ───────────────────────── Anfrage (Kunde) ─────────────────────────

export function RequestForm() {
  const router = useRouter();
  const [d, setD] = useState({ title: "", request: "", goal: "", venue: "", timeframe: "", budget: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));
  const send = () =>
    start(async () => {
      const r = await requestProject(d);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      router.push(`/projekte/${r.projectId}`);
    });
  const field = (k: keyof typeof d, label: string, ph: string, area = false) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`rq-${k}`} className="eyebrow !text-muted">{label}</label>
      {area ? (
        <textarea id={`rq-${k}`} rows={4} value={d[k]} onChange={(e) => set(k, e.target.value)} className={`${input} leading-relaxed`} placeholder={ph} />
      ) : (
        <input id={`rq-${k}`} value={d[k]} onChange={(e) => set(k, e.target.value)} className={input} placeholder={ph} />
      )}
    </div>
  );
  return (
    <Card>
      <h2 className="!text-xl">Neues Projekt anfragen</h2>
      <p className="mt-1 text-sm text-muted">Beschreiben Sie, was besser werden soll. Wir suchen passende Startups, stellen eine Auswahl zusammen und begleiten den Piloten.</p>
      <div className="mt-4 flex flex-col gap-4">
        {field("title", "Worum geht es?", "z. B. Kürzere Wartezeiten an den Ständen")}
        {field("request", "Was ist heute das Problem?", "In der Halbzeit stehen unsere Gäste 12 Minuten an …", true)}
        {field("goal", "Woran messen Sie Erfolg?", "z. B. Wartezeit unter 4 Minuten, mehr Umsatz pro Gast")}
        <div className="grid gap-4 sm:grid-cols-3">
          {field("venue", "Ort / Venue", "Arena Nord")}
          {field("timeframe", "Zeitrahmen", "Rückrunde 2027")}
          {field("budget", "Budgetrahmen (optional)", "bis 50.000 €")}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={send} disabled={busy} className={btn.primary}>{busy ? "Wird gesendet …" : "Anfrage senden"}</button>
          <Note m={msg} />
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────── Meilensteine ─────────────────────────

export function Milestones({ projectId, items, editable }: { projectId: string; items: Milestone[]; editable: boolean }) {
  const { msg, busy, run } = useRun();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const done = items.filter((m) => m.doneAt).length;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="!text-xl">Meilensteine</h2>
        {items.length > 0 && <span className="text-sm text-muted"><span className="num text-ink">{done}</span> von {items.length} erledigt</span>}
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {items.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
            {editable ? (
              <input type="checkbox" checked={!!m.doneAt} disabled={busy} onChange={(e) => run(() => setMilestoneDone(m.id, e.target.checked))} aria-label={`${m.title} erledigt`} className="size-4 accent-[var(--ink)]" />
            ) : (
              <span aria-hidden className={`grid size-4 place-items-center rounded-full border text-[10px] ${m.doneAt ? "border-ink bg-ink text-bg" : "border-line"}`}>{m.doneAt ? "✓" : ""}</span>
            )}
            <span className={`flex-1 ${m.doneAt ? "text-muted line-through" : "text-ink"}`}>{m.title}</span>
            {m.dueDate && <span className="text-xs text-muted">{fmtDay(m.dueDate)}</span>}
            {editable && <button type="button" onClick={() => run(() => deleteMilestone(m.id))} className="text-xs text-muted hover:text-ink" aria-label={`${m.title} löschen`}>×</button>}
          </li>
        ))}
        {!items.length && <li className="text-muted">{editable ? "Noch keine Meilensteine." : "Die Meilensteine legt New Spice gemeinsam mit Ihnen fest."}</li>}
      </ul>
      {editable && (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          <input aria-label="Neuer Meilenstein" value={title} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="z. B. Pilot an 4 Ständen" />
          <div className="flex gap-2">
            <input aria-label="Fällig am" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={input} />
            <button type="button" disabled={busy} onClick={() => run(() => addMilestone(projectId, title, due || null), () => { setTitle(""); setDue(""); })} className={btn.ghost}>Hinzufügen</button>
          </div>
        </div>
      )}
      <Note m={msg} />
    </Card>
  );
}

// ───────────────────────── Nachrichten ─────────────────────────

export function Updates({ projectId, items, editor }: { projectId: string; items: ProjectUpdate[]; editor: boolean }) {
  const { msg, busy, run } = useRun();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  return (
    <Card>
      <h2 className="!text-xl">Nachrichten</h2>
      <div className="mt-3 flex flex-col gap-2">
        <textarea aria-label="Nachricht" rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={input}
          placeholder={editor ? "Stand, nächste Schritte, Fragen an den Kunden …" : "Frage oder Rückmeldung an New Spice …"} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => run(() => postUpdate(projectId, body, internal), () => setBody(""))} className={btn.primary}>
            {internal ? "Interne Notiz speichern" : "Senden"}
          </button>
          {editor && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="size-4 accent-[var(--ink)]" />
              Intern (sieht der Kunde nicht)
            </label>
          )}
          <Note m={msg} />
        </div>
      </div>
      <ul className="mt-4 flex flex-col divide-y divide-line text-sm">
        {items.map((u) => (
          <li key={u.id} className={`flex flex-col gap-1 py-3 ${u.internal ? "rounded-lg bg-sunk px-3" : ""}`}>
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <b className="text-ink">{u.authorName}</b>{timeAgo(u.createdAt)}{u.internal && <Badge tone="muted">intern</Badge>}
            </span>
            <span className="whitespace-pre-line text-ink">{u.body}</span>
          </li>
        ))}
        {!items.length && <li className="py-3 text-muted">Noch keine Nachrichten.</li>}
      </ul>
    </Card>
  );
}

// ───────────────────────── Dokumente ─────────────────────────

export function Documents({ projectId, items, editor, userId }: { projectId: string; items: ProjectDocument[]; editor: boolean; userId: string }) {
  const { msg, busy, run } = useRun();
  const [uploading, setUploading] = useState(false);
  const [internal, setInternal] = useState(false);
  const [local, setLocal] = useState<Msg>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setLocal(null);
    if (file.size > MAX_FILE_BYTES) return setLocal({ ok: false, text: "Die Datei ist größer als 50 MB." });
    setUploading(true);
    try {
      // 1. Eintrag anlegen (Datenbank prüft den Zugriff), 2. Datei mit den Rechten des Nutzers in den Speicher
      const r = await createDocument(projectId, { name: file.name, size: file.size, mime: file.type || null }, internal);
      if (!r.ok) return setLocal({ ok: false, text: r.error });
      if (r.stored && r.path) {
        const { error } = await createClient().storage.from(BUCKET).upload(r.path, file, { contentType: file.type || undefined, upsert: false });
        if (error) {
          await deleteDocument(r.docId!);
          return setLocal({ ok: false, text: `Hochladen fehlgeschlagen: ${error.message}` });
        }
      }
      setLocal({ ok: true, text: r.stored ? "Hochgeladen." : "Eintrag angelegt (Testmodus: ohne Datei)." });
      run(async () => ({ ok: true }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const open = (id: string) =>
    run(async () => {
      const r = await documentUrl(id);
      if (r.ok && r.url) window.open(r.url, "_blank", "noopener");
      return r;
    });

  return (
    <Card>
      <h2 className="!text-xl">Dokumente</h2>
      <p className="mt-1 text-sm text-muted">{editor ? "Pitchdecks, Angebote, Auswertungen. Interne Dokumente sieht der Kunde nicht." : "Grundrisse, Anforderungen, Abläufe – alles, was bei der Auswahl hilft. Nur Ihre Organisation und New Spice sehen die Dateien."}</p>
      <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
        {items.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <button type="button" onClick={() => open(d.id)} className="min-w-0 truncate text-left font-bold text-ink hover:underline">{d.name}</button>
            <span className="flex items-center gap-2 text-xs text-muted">
              {d.internal && <Badge tone="muted">intern</Badge>}
              {fmtBytes(d.sizeBytes)} · {d.uploaderName} · {timeAgo(d.createdAt)}
              {(editor || d.uploadedBy === userId) && (
                <button type="button" disabled={busy} onClick={() => run(() => deleteDocument(d.id))} className="hover:text-ink" aria-label={`${d.name} löschen`}>Löschen</button>
              )}
            </span>
          </li>
        ))}
        {!items.length && <li className="py-2 text-muted">Noch keine Dokumente.</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <label className={`${btn.ghost} cursor-pointer`}>
          {uploading ? "Lädt hoch …" : "Datei hochladen"}
          <input ref={fileRef} type="file" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {editor && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="size-4 accent-[var(--ink)]" />
            Intern
          </label>
        )}
        <span className="text-xs text-muted">bis 50 MB</span>
      </div>
      <Note m={local ?? msg} />
    </Card>
  );
}

// ───────────────────────── Shortlist ─────────────────────────

function StartupHead({ e }: { e: ShortlistEntry }) {
  const s = e.startup;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="!text-lg">{s.name}</h3>
        {s.approved && <span className="rounded-[var(--radius-pill)] bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bg">New Spice approved</span>}
      </div>
      <p className="text-xs text-muted">
        {[s.stage && MATURITY_LABEL[s.stage], s.country].filter(Boolean).join(" · ")}
        {s.website && <>{s.stage || s.country ? " · " : ""}<a href={s.website} target="_blank" rel="noopener noreferrer">Website ↗</a></>}
      </p>
      {(s.tagline || s.solution) && <p className="text-sm text-ink">{s.tagline ?? s.solution}</p>}
    </div>
  );
}

function PrivateInfo({ e }: { e: ShortlistEntry }) {
  if (!e.priv) return null;
  const p = e.priv;
  const rows: [string, React.ReactNode][] = [];
  if (p.pricing) rows.push(["Kosten", p.pricing]);
  if (p.pitchDeckUrl) rows.push(["Pitchdeck", <a key="d" href={p.pitchDeckUrl} target="_blank" rel="noopener noreferrer">öffnen ↗</a>]);
  if (p.contactName || p.contactEmail) rows.push(["Kontakt", [p.contactName, p.contactRole, p.contactEmail].filter(Boolean).join(" · ")]);
  if (p.notes) rows.push(["Notiz (intern)", p.notes]);
  if (!rows.length) return null;
  return (
    <dl className="grid gap-x-4 gap-y-1 rounded-xl border border-line p-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>)}
    </dl>
  );
}

/** Kundenansicht: freigegebene Einträge mit Rückmeldung */
export function ShortlistCustomer({ projectId, items }: { projectId: string; items: ShortlistEntry[] }) {
  return (
    <Card>
      <h2 className="!text-xl">Shortlist</h2>
      <p className="mt-1 text-sm text-muted">Von New Spice ausgewählt und vorab geprüft. Sagen Sie uns, was Sie interessiert – wir organisieren die Erstgespräche.</p>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {items.map((e) => <CustomerEntry key={e.startup.id} projectId={projectId} e={e} />)}
        {!items.length && <li className="py-4 text-muted">Wir stellen gerade die Auswahl zusammen.</li>}
      </ul>
    </Card>
  );
}

function CustomerEntry({ projectId, e }: { projectId: string; e: ShortlistEntry }) {
  const { msg, busy, run } = useRun();
  const [note, setNote] = useState(e.customerNote ?? "");
  const answer = (s: Exclude<CustomerStatus, "selected">) => run(() => respondShortlist(projectId, e.startup.id, s, note));
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <StartupHead e={e} />
        <Badge tone={e.customerStatus === "open" ? "muted" : "neutral"}>{CUSTOMER_STATUS_LABEL[e.customerStatus]}</Badge>
      </div>
      {e.rationale && <p className="text-sm"><b className="text-ink">Warum für Sie:</b> {e.rationale}</p>}
      <PrivateInfo e={e} />
      {e.customerStatus !== "selected" && (
        <div className="flex flex-col gap-2">
          <input aria-label={`Ihre Anmerkung zu ${e.startup.name}`} value={note} onChange={(x) => setNote(x.target.value)} className={input} placeholder="Ihre Anmerkung (optional)" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => answer("interested")} className={e.customerStatus === "interested" ? btn.primary : btn.ghost}>Interessant</button>
            <button type="button" disabled={busy} onClick={() => answer("not_interested")} className={e.customerStatus === "not_interested" ? btn.primary : btn.ghost}>Passt nicht</button>
          </div>
        </div>
      )}
      <Note m={msg} />
    </li>
  );
}

/** Redaktion: kuratieren, freigeben, Rückmeldungen sehen, Auswahl festhalten */
export function ShortlistEditor({ projectId, items, options }: { projectId: string; items: ShortlistEntry[]; options: { id: string; name: string; tagline: string | null }[] }) {
  const { msg, busy, run } = useRun();
  const [pick, setPick] = useState("");
  const [why, setWhy] = useState("");
  const onList = new Set(items.map((e) => e.startup.id));
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="!text-xl">Shortlist</h2>
        <span className="text-sm text-muted">{items.filter((e) => e.shared).length} von {items.length} für den Kunden freigegeben</span>
      </div>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {items.map((e) => (
          <li key={e.startup.id} className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <StartupHead e={e} />
              <Link href={`/admin/startups/${e.startup.id}`} className="text-xs">Profil →</Link>
            </div>
            <textarea aria-label={`Begründung für ${e.startup.name}`} rows={2} defaultValue={e.rationale ?? ""} className={input}
              onBlur={(x) => x.target.value !== (e.rationale ?? "") && run(() => updateShortlist(projectId, e.startup.id, { rationale: x.target.value || null }))}
              placeholder="Warum dieses Startup für diesen Kunden? (sieht der Kunde)" />
            <PrivateInfo e={e} />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={e.shared} disabled={busy} onChange={(x) => run(() => updateShortlist(projectId, e.startup.id, { shared: x.target.checked }))} className="size-4 accent-[var(--ink)]" />
                Für den Kunden freigeben
              </label>
              <label className={`flex items-center gap-2 ${e.shared ? "" : "opacity-40"}`}>
                <input type="checkbox" checked={e.sharePrivate} disabled={busy || !e.shared} onChange={(x) => run(() => updateShortlist(projectId, e.startup.id, { sharePrivate: x.target.checked }))} className="size-4 accent-[var(--ink)]" />
                Kosten & Pitchdeck zeigen
              </label>
              <label className="flex items-center gap-2">
                <span className="text-muted">Stand:</span>
                <select value={e.customerStatus} disabled={busy} onChange={(x) => run(() => updateShortlist(projectId, e.startup.id, { customerStatus: x.target.value as CustomerStatus }))} className={`${input} !w-auto !py-1`}>
                  {(Object.keys(CUSTOMER_STATUS_LABEL) as CustomerStatus[]).map((k) => <option key={k} value={k}>{CUSTOMER_STATUS_LABEL[k]}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy} onClick={() => run(() => removeFromShortlist(projectId, e.startup.id))} className="ml-auto text-xs text-muted hover:text-ink">Entfernen</button>
            </div>
            {e.customerNote && <p className="text-sm"><b className="text-ink">Kunde:</b> {e.customerNote}</p>}
          </li>
        ))}
        {!items.length && <li className="py-4 text-muted">Noch leer. Startups aus der Datenbank hinzufügen – oder erst per Challenge suchen lassen.</li>}
      </ul>
      <div className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select aria-label="Startup aus der Datenbank" value={pick} onChange={(e) => setPick(e.target.value)} className={input}>
            <option value="">Startup aus der Datenbank wählen …</option>
            {options.filter((o) => !onList.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}{o.tagline ? ` – ${o.tagline}` : ""}</option>)}
          </select>
          <button type="button" disabled={busy || !pick} onClick={() => run(() => addToShortlist(projectId, pick, why), () => { setPick(""); setWhy(""); })} className={btn.ghost}>Hinzufügen</button>
        </div>
        <input aria-label="Begründung" value={why} onChange={(e) => setWhy(e.target.value)} className={input} placeholder="Begründung (optional, sieht der Kunde nach Freigabe)" />
      </div>
      <Note m={msg} />
    </Card>
  );
}

// ───────────────────────── Steuerung (Redaktion) ─────────────────────────

export function ProjectControl({ project, people }: { project: Project; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const { msg, busy, run } = useRun();
  const [outcome, setOutcome] = useState<"success" | "no_success">("success");
  const [note, setNote] = useState("");
  const closed = project.status === "completed";
  return (
    <Card>
      <h2 className="!text-xl">Steuerung</h2>
      <div className="mt-4 flex flex-col gap-4 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow !text-muted">Phase</span>
          <select value={project.status} disabled={busy || closed} onChange={(e) => run(() => saveProject(project.id, { status: e.target.value as ProjectStatus }))} className={input}>
            {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).filter((s) => s !== "completed" || closed).map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow !text-muted">Ansprechperson bei New Spice</span>
          <select value={project.leadId ?? ""} disabled={busy} onChange={(e) => run(() => saveProject(project.id, { leadId: e.target.value || null }))} className={input}>
            <option value="">– noch offen –</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow !text-muted">Startup-Suche</span>
          {project.challengeId ? (
            <Link href={`/admin/venture/${project.challengeId}`}>Zur Challenge →</Link>
          ) : (
            <button type="button" disabled={busy} className={`${btn.ghost} self-start`}
              onClick={() => run(async () => { const r = await challengeFromProject(project.id); if (r.ok && r.challengeId) router.push(`/admin/venture/${r.challengeId}`); return r; })}>
              Challenge aus der Anfrage anlegen
            </button>
          )}
        </div>
        {!closed && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="eyebrow !text-muted">Projekt abschließen</span>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2"><input type="radio" name="outcome" checked={outcome === "success"} onChange={() => setOutcome("success")} /> Erfolgreich</label>
              <label className="flex items-center gap-2"><input type="radio" name="outcome" checked={outcome === "no_success"} onChange={() => setOutcome("no_success")} /> Ohne Umsetzung</label>
            </div>
            <input aria-label="Ergebnis in einem Satz" value={note} onChange={(e) => setNote(e.target.value)} className={input} placeholder="Ergebnis in einem Satz, z. B. „Wartezeit halbiert“" />
            <p className="text-xs text-muted">Bei Erfolg erhalten die als „Ausgewählt“ markierten Startups das Siegel „New Spice approved“.</p>
            <button type="button" disabled={busy} onClick={() => run(() => completeProject(project.id, outcome, note))} className={`${btn.primary} self-start`}>Abschließen</button>
          </div>
        )}
        {closed && project.outcomeNote && <p className="text-ink">Ergebnis: {project.outcomeNote}</p>}
        <Note m={msg} />
      </div>
    </Card>
  );
}
