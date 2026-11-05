"use client";

import { useActionState } from "react";
import { sendInviteLink, type LoginState } from "@/lib/auth/actions";

export function InviteForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendInviteLink.bind(null, token), { status: "idle" });
  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-bold text-ink">E-Mail-Adresse</label>
      <input id="email" name="email" type="email" required defaultValue={email} autoComplete="email"
        className="rounded-xl border border-line bg-sunk px-4 py-3 text-ink placeholder:text-muted" />
      <button disabled={pending} className="rounded-[var(--radius-pill)] bg-accent px-5 py-3 font-bold text-on-accent disabled:opacity-60">
        {pending ? "Wird gesendet …" : "Login-Link senden"}
      </button>
      {state.message && <p role="status" className={state.status === "error" ? "text-sm text-ink" : "text-sm text-muted"}>{state.message}</p>}
    </form>
  );
}
