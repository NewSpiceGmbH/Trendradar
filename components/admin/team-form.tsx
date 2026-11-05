"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setRole } from "@/lib/admin/actions";
import { btn, input } from "./ui";

/** Rolle per E-Mail vergeben (Konto muss in Supabase existieren) */
export function TeamForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setR] = useState<"editor" | "admin">("editor");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setRole(email, role);
          setMsg(r.ok ? { ok: true, text: r.message ?? "Gespeichert." } : { ok: false, text: r.error });
          if (r.ok) { setEmail(""); router.refresh(); }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@newspice.de" aria-label="E-Mail-Adresse" className={input} />
        <select value={role} onChange={(e) => setR(e.target.value as "editor" | "admin")} aria-label="Rolle" className={input}>
          <option value="editor">Editor – prüfen und freigeben</option>
          <option value="admin">Admin – zusätzlich Team</option>
        </select>
        <button disabled={busy} className={btn.primary}>Rolle vergeben</button>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-ink" : "text-[var(--cA)]"}`}>{msg.text}</p>}
    </form>
  );
}

/** Rolle ändern oder entziehen */
export function RoleButtons({ email, role, self }: { email: string; role: "admin" | "editor"; self: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (r: "admin" | "editor" | "none") =>
    start(async () => {
      const res = await setRole(email, r);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  if (self) return <span className="text-xs text-muted">Das bist du</span>;
  return (
    <span className="flex flex-wrap items-center gap-3 text-xs">
      <button type="button" disabled={busy} onClick={() => run(role === "admin" ? "editor" : "admin")} className="font-bold text-ink underline">
        {role === "admin" ? "Zu Editor machen" : "Zu Admin machen"}
      </button>
      <button type="button" disabled={busy} onClick={() => run("none")} className="text-muted underline hover:text-ink">Zugang entziehen</button>
      {error && <span className="text-[var(--cA)]">{error}</span>}
    </span>
  );
}
