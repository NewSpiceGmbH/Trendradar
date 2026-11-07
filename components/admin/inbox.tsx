"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptApplication, decideChange, holdApplication, pitchDeckLink, rejectApplication } from "@/lib/applications/actions";
import { HOLD_REASON_LABEL, type AcceptOptions, type ChangeRequest, type HoldReason } from "@/lib/applications/types";
import { REJECTION_TEMPLATE } from "@/lib/mail/templates";
import { Label } from "./form";
import { Card, btn, input } from "./ui";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-sm ${m.ok ? "text-ink" : "text-alert"}`}>{m.text}</p> : null);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Text zum Kopieren (Einladungslink, Absage), wenn keine Mail verschickt wurde */
function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <textarea readOnly value={value} rows={value.length > 120 ? 6 : 2} className={`${input} font-mono text-xs`} aria-label={label} />
      <button type="button" className={`${btn.ghost} self-start !py-1 text-xs`}
        onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true))}>{copied ? "Kopiert" : "Kopieren"}</button>
    </div>
  );
}

export function ApplicationActions({ id, defaults, kindLabel, mailReady, customer, closed }: {
  id: string; defaults: AcceptOptions; kindLabel: string; mailReady: boolean; customer: boolean;
  /** bereits entschieden: Zusammenfassung statt Knöpfen (die Box bleibt stehen, damit Link und Text nach dem Neuladen bleiben) */
  closed?: React.ReactNode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"accept" | "hold" | "reject" | null>(null);
  const [o, setO] = useState(defaults);
  const [reason, setReason] = useState<HoldReason>("documents");
  const [until, setUntil] = useState(inDays(14));
  const [text, setText] = useState(REJECTION_TEMPLATE);
  const [send, setSend] = useState(mailReady);
  const [msg, setMsg] = useState<Msg>(null);
  const [copy, setCopy] = useState<{ label: string; value: string } | null>(null);
  const [memberHref, setMemberHref] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string; link?: string; mailText?: string; memberId?: string; mailed?: boolean }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Fehler" });
      setMsg({ ok: true, text: r.message ?? "Erledigt." });
      if (r.link && !r.mailed) setCopy({ label: "Einladungslink", value: r.link });
      else if (r.mailText) setCopy({ label: "Text der Absage (zum Kopieren)", value: r.mailText });
      if (r.memberId) setMemberHref(`/admin/netzwerk/${r.memberId}`);
      setMode(null);
      router.refresh();
    });

  if (msg?.ok) {
    return (
      <Card className="flex flex-col gap-3">
        <Note m={msg} />
        {copy && <CopyBox {...copy} />}
        {memberHref && <a href={memberHref} className="text-sm">Zum Eintrag in der Netzwerk-Datenbank →</a>}
      </Card>
    );
  }
  if (closed) return <Card className="text-sm">{closed}</Card>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-expanded={mode === "accept"} onClick={() => setMode(mode === "accept" ? null : "accept")} className={btn.primary}>Akzeptieren</button>
        <button type="button" aria-expanded={mode === "hold"} onClick={() => setMode(mode === "hold" ? null : "hold")} className={btn.ghost}>On hold</button>
        <button type="button" aria-expanded={mode === "reject"} onClick={() => setMode(mode === "reject" ? null : "reject")} className={btn.danger}>Ablehnen</button>
      </div>

      {mode === "accept" && (
        <Card className="flex flex-col gap-3">
          <h3 className="!text-lg">Wird angelegt</h3>
          <ul className="list-disc pl-5 text-sm">
            <li>Eintrag in der Netzwerk-Datenbank (Quelle „Bewerbung“, Status „Aufgenommen“, nur intern sichtbar)</li>
            <li>{customer ? "Organisation als Kunde" : kindLabel}</li>
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1"><Label htmlFor="ac-name">Organisation</Label>
              <input id="ac-name" value={o.orgName} onChange={(e) => setO({ ...o, orgName: e.target.value })} className={input} /></div>
            <div className="flex flex-col gap-1"><Label htmlFor="ac-tier">Paket</Label>
              <select id="ac-tier" value={o.tier} onChange={(e) => setO({ ...o, tier: e.target.value as AcceptOptions["tier"] })} className={input}>
                <option value="basic">Basic</option><option value="premium">Premium</option>
              </select></div>
            <div className="flex flex-col gap-1"><Label htmlFor="ac-seats">Sitzplätze</Label>
              <input id="ac-seats" type="number" min={1} max={500} value={o.seats} onChange={(e) => setO({ ...o, seats: Number(e.target.value) })} className={input} /></div>
            <div className="flex flex-col gap-1"><Label htmlFor="ac-months">Laufzeit (Monate, leer = unbefristet)</Label>
              <input id="ac-months" type="number" min={1} max={60} value={o.months ?? ""} onChange={(e) => setO({ ...o, months: e.target.value ? Number(e.target.value) : null })} className={input} /></div>
          </div>
          {!customer && o.months === 1 && <p className="text-xs text-muted">1 Monat kostenlos, danach Abo (Abrechnung folgt).</p>}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={o.invite} onChange={(e) => setO({ ...o, invite: e.target.checked })} />
            Ansprechperson als Owner einladen{mailReady ? " (Einladung per E-Mail)" : " (Link zum Kopieren)"}
          </label>
          <button type="button" disabled={busy} onClick={() => run(() => acceptApplication(id, o))} className={`${btn.primary} self-start`}>
            {busy ? "Legt an …" : o.invite ? "Anlegen und einladen" : "Anlegen"}
          </button>
        </Card>
      )}

      {mode === "hold" && (
        <Card className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1"><Label htmlFor="hd-reason">Grund</Label>
              <select id="hd-reason" value={reason} onChange={(e) => setReason(e.target.value as HoldReason)} className={input}>
                {(Object.keys(HOLD_REASON_LABEL) as HoldReason[]).map((k) => <option key={k} value={k}>{HOLD_REASON_LABEL[k]}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><Label htmlFor="hd-until">Wiedervorlage am</Label>
              <input id="hd-until" type="date" value={until} min={inDays(0)} onChange={(e) => setUntil(e.target.value)} className={input} /></div>
          </div>
          <button type="button" disabled={busy} onClick={() => run(() => holdApplication(id, reason, until))} className={`${btn.primary} self-start`}>Auf Wiedervorlage setzen</button>
        </Card>
      )}

      {mode === "reject" && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-col gap-1"><Label htmlFor="rj-text">Text an den Bewerber</Label>
            <textarea id="rj-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} className={`${input} leading-relaxed`} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={send} disabled={!mailReady} onChange={(e) => setSend(e.target.checked)} />
            {mailReady ? "Per E-Mail senden" : "Mailversand noch nicht eingerichtet – Text danach kopieren"}
          </label>
          <button type="button" disabled={busy} onClick={() => run(() => rejectApplication(id, text, send))} className={`${btn.danger} self-start`}>Ablehnen</button>
        </Card>
      )}
      <Note m={msg} />
    </div>
  );
}

export function PitchDeckButton({ path }: { path: string }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  return (
    <span className="flex flex-col gap-1">
      <button type="button" disabled={busy} className={`${btn.ghost} self-start !py-1 text-xs`}
        onClick={() => start(async () => {
          const r = await pitchDeckLink(path);
          if (r.ok && r.url) window.open(r.url, "_blank", "noopener");
          else setMsg({ ok: false, text: r.ok ? "Nicht verfügbar." : r.error });
        })}>Pitchdeck öffnen (PDF)</button>
      <Note m={msg} />
    </span>
  );
}

export function ChangeActions({ cr, autoApply, closed }: { cr: ChangeRequest; autoApply: boolean; closed?: React.ReactNode }) {
  const router = useRouter();
  const [value, setValue] = useState(cr.newValue);
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"adjust" | "reject" | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const run = (status: "accepted" | "adjusted" | "rejected") => start(async () => {
    const r = await decideChange(cr.id, status, status === "adjusted" ? value : null, note || null);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.message ?? "Erledigt." });
    router.refresh();
  });
  if (msg?.ok) return <Note m={msg} />;
  if (closed) return <p className="text-sm text-muted">{closed}</p>;
  return (
    <div className="flex flex-col gap-3">
      {!autoApply && <p className="text-xs text-muted">Dieses Feld wird nicht automatisch geändert. Nach dem Übernehmen bitte im Eintrag pflegen.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run("accepted")} className={btn.primary}>Übernehmen</button>
        <button type="button" disabled={busy} aria-expanded={mode === "adjust"} onClick={() => setMode(mode === "adjust" ? null : "adjust")} className={btn.ghost}>Anpassen</button>
        <button type="button" disabled={busy} aria-expanded={mode === "reject"} onClick={() => setMode(mode === "reject" ? null : "reject")} className={btn.danger}>Ablehnen</button>
      </div>
      {mode === "adjust" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="cr-value">Neuer Inhalt</Label>
          <textarea id="cr-value" rows={3} value={value} onChange={(e) => setValue(e.target.value)} className={input} />
          <button type="button" disabled={busy} onClick={() => run("adjusted")} className={`${btn.primary} self-start`}>Angepasst übernehmen</button>
        </div>
      )}
      {mode === "reject" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="cr-note">Begründung (für die Redaktion)</Label>
          <input id="cr-note" value={note} onChange={(e) => setNote(e.target.value)} className={input} />
          <button type="button" disabled={busy} onClick={() => run("rejected")} className={`${btn.danger} self-start`}>Ablehnen</button>
        </div>
      )}
      <Note m={msg} />
    </div>
  );
}
