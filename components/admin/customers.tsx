"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inviteToOrg, removeMember, revokeInvite, saveOrg } from "@/lib/projects/actions";
import { inviteOpen, type Invitation, type Member, type OrgInput } from "@/lib/projects/types";
import { Label, Toggles } from "./form";
import { Badge, Card, btn, input, timeAgo } from "./ui";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-sm ${m.ok ? "text-ink" : "text-[var(--cA)]"}`}>{m.text}</p> : null);

export function OrgEditor({ orgId, initial }: { orgId: string | null; initial: OrgInput }) {
  const router = useRouter();
  const [d, setD] = useState<OrgInput>(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const set = <K extends keyof OrgInput>(k: K, v: OrgInput[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = () =>
    start(async () => {
      const r = await saveOrg(orgId, d);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Gespeichert." });
      if (!orgId && r.orgId) router.push(`/admin/kunden/${r.orgId}`);
      router.refresh();
    });
  return (
    <Card>
      <h2 className="!text-xl">Vertrag</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="o-name">Organisation</Label><input id="o-name" value={d.name} onChange={(e) => set("name", e.target.value)} className={input} placeholder="z. B. FC Beispiel GmbH" /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="o-from">Zugang ab</Label><input id="o-from" type="date" value={d.accessFrom} onChange={(e) => set("accessFrom", e.target.value)} className={input} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="o-until">Zugang bis (leer = unbefristet)</Label><input id="o-until" type="date" value={d.accessUntil ?? ""} onChange={(e) => set("accessUntil", e.target.value || null)} className={input} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="o-seats">Sitzplätze</Label><input id="o-seats" type="number" min={1} value={d.seats} onChange={(e) => set("seats", Number(e.target.value))} className={input} /></div>
        <Toggles label="Paket" options={{ basic: "Basic", premium: "Premium" }} value={[d.tier]} onChange={(v) => set("tier", (v.at(-1) ?? d.tier) as OrgInput["tier"])} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className={btn.primary}>{busy ? "Speichert …" : orgId ? "Speichern" : "Kunden anlegen"}</button>
        <Note m={msg} />
      </div>
    </Card>
  );
}

export function TeamPanel({ orgId, seats, members, invitations }: { orgId: string; seats: number; members: Member[]; invitations: Invitation[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>(members.some((m) => m.role === "owner") ? "member" : "owner");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const open = invitations.filter((i) => inviteOpen(i));
  const free = seats - members.length - open.length;
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? "Gespeichert." } : { ok: false, text: r.error ?? "Fehler" });
      router.refresh();
    });
  const invite = () =>
    start(async () => {
      const r = await inviteToOrg(orgId, email, role);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Einladung angelegt." });
      setLink(r.link ?? null);
      setEmail("");
      router.refresh();
    });
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* Zwischenablage nicht verfügbar */ }
  };

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="!text-xl">Team</h2>
        <span className="text-sm text-muted"><span className="num text-ink">{members.length + open.length}</span> von {seats} Plätzen belegt</span>
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex flex-col"><b className="text-ink">{m.name || m.email}</b><span className="text-xs text-muted">{m.email}</span></span>
            <span className="flex items-center gap-2">
              <Badge tone={m.role === "owner" ? "neutral" : "muted"}>{m.role === "owner" ? "Owner" : "Member"}</Badge>
              <button type="button" disabled={busy} onClick={() => run(() => removeMember(orgId, m.userId))} className="text-xs text-muted hover:text-ink">Entfernen</button>
            </span>
          </li>
        ))}
        {open.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex flex-col"><span className="text-ink">{i.email}</span><span className="text-xs text-muted">eingeladen {timeAgo(i.createdAt)} · gültig bis {new Date(i.expiresAt).toLocaleDateString("de-DE")}</span></span>
            <span className="flex items-center gap-2">
              <Badge tone="muted">Einladung offen</Badge>
              <button type="button" disabled={busy} onClick={() => run(() => revokeInvite(i.id))} className="text-xs text-muted hover:text-ink">Zurückziehen</button>
            </span>
          </li>
        ))}
        {!members.length && !open.length && <li className="py-2 text-muted">Noch niemand. Ladet zuerst die Ansprechperson als Owner ein – sie kann danach ihr Team selbst einladen.</li>}
      </ul>

      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
        <Label htmlFor="inv-email">Einladen</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="name@kunde.de" />
          <select aria-label="Rolle" value={role} onChange={(e) => setRole(e.target.value as Member["role"])} className={`${input} sm:w-40`}>
            <option value="owner">Owner</option>
            <option value="member">Member</option>
          </select>
          <button type="button" disabled={busy || free < 1} onClick={invite} className={btn.primary}>Einladen</button>
        </div>
        {free < 1 && <p className="text-xs text-muted">Alle Plätze belegt. Für mehr Plätze oben im Vertrag erhöhen.</p>}
        {link && (
          <div className="flex flex-col gap-2 rounded-xl border border-line p-3 text-sm">
            <span>Einladungslink (14 Tage gültig). Bis der E-Mail-Versand eingerichtet ist, bitte selbst an die Person schicken:</span>
            <code className="break-all text-xs text-ink">{link}</code>
            <button type="button" onClick={copy} className={`${btn.ghost} self-start`}>{copied ? "Kopiert" : "Link kopieren"}</button>
          </div>
        )}
        <Note m={msg} />
      </div>
    </Card>
  );
}
