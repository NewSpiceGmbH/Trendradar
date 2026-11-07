"use client";

import { useState, useTransition } from "react";
import { Label } from "@/components/admin/form";
import { btn, input } from "@/components/admin/ui";
import { recommendContact, requestChange } from "@/lib/applications/actions";
import { CHANGE_FIELD_LABEL, type ChangeField } from "@/lib/applications/types";
import { PARTNER_TYPE_LABEL, PARTNER_TYPES, type PartnerType } from "@/lib/network/types";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-sm ${m.ok ? "text-ink" : "text-alert"}`}>{m.text}</p> : null);

/** Solution Provider: Änderung am eigenen Profil anfragen (die Redaktion entscheidet) */
export function ChangeRequestForm({ current }: { current: Partial<Record<ChangeField, string | null>> }) {
  const [field, setField] = useState<ChangeField>("tagline");
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const old = current[field] ?? null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cr-field">Was soll sich ändern?</Label>
        <select id="cr-field" value={field} onChange={(e) => setField(e.target.value as ChangeField)} className={input}>
          {(Object.keys(CHANGE_FIELD_LABEL) as ChangeField[]).map((k) => <option key={k} value={k}>{CHANGE_FIELD_LABEL[k]}</option>)}
        </select>
      </div>
      {old && <p className="text-sm text-muted">Bisher: {old}</p>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cr-new">Neu</Label>
        <textarea id="cr-new" rows={3} value={value} onChange={(e) => setValue(e.target.value)} className={input} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cr-comment">Kommentar (optional)</Label>
        <input id="cr-comment" value={comment} onChange={(e) => setComment(e.target.value)} className={input} />
      </div>
      <button type="button" disabled={busy} className={`${btn.primary} self-start`}
        onClick={() => start(async () => {
          const r = await requestChange(field, old, value, comment);
          setMsg(r.ok ? { ok: true, text: r.message ?? "Gesendet." } : { ok: false, text: r.error });
          if (r.ok) { setValue(""); setComment(""); }
        })}>Änderung anfragen</button>
      <Note m={msg} />
    </div>
  );
}

/** Partner: Kontakt empfehlen */
export function RecommendForm() {
  const empty = { partnerType: "club" as PartnerType, orgName: "", contactName: "", email: "", website: "", message: "", consent: false };
  const [d, setD] = useState(empty);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const f = (k: "orgName" | "contactName" | "email" | "website", label: string, type = "text") => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`rc-${k}`}>{label}</Label>
      <input id={`rc-${k}`} type={type} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} className={input} />
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rc-type">Partner-Typ</Label>
        <select id="rc-type" value={d.partnerType} onChange={(e) => setD({ ...d, partnerType: e.target.value as PartnerType })} className={input}>
          {PARTNER_TYPES.map((t) => <option key={t} value={t}>{PARTNER_TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {f("orgName", "Organisation")}{f("website", "Website")}{f("contactName", "Ansprechperson")}{f("email", "E-Mail", "email")}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rc-msg">Warum passt der Kontakt?</Label>
        <textarea id="rc-msg" rows={3} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} className={input} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={d.consent} onChange={(e) => setD({ ...d, consent: e.target.checked })} className="mt-1" />
        Der Kontakt ist damit einverstanden, dass ich seine Angaben an New Spice weitergebe.
      </label>
      <button type="button" disabled={busy} className={`${btn.primary} self-start`}
        onClick={() => start(async () => {
          const r = await recommendContact(d);
          setMsg(r.ok ? { ok: true, text: r.message ?? "Gesendet." } : { ok: false, text: r.error });
          if (r.ok) setD(empty);
        })}>Empfehlung senden</button>
      <Note m={msg} />
    </div>
  );
}
