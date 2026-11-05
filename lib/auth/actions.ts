"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PERSONAS, isDemoLogin, isFixtureMode } from "./personas";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

export async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Magic-Link nur für bekannte Adressen – Supabase legt mit shouldCreateUser:false keine Konten an. */
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: "Bitte eine gültige E-Mail-Adresse eingeben." };
  if (isFixtureMode()) return { status: "error", message: "Im Testmodus bitte einen Demo-Zugang wählen." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${await origin()}/auth/callback?next=/radar` },
  });
  // Unbekannte Adressen bewusst nicht verraten; nur Rate-Limits melden
  if (error && error.status === 429) {
    return { status: "error", message: "Zu viele Versuche. Bitte in einigen Minuten erneut versuchen." };
  }
  return { status: "sent", message: "Falls die Adresse freigeschaltet ist, ist ein Login-Link unterwegs." };
}

export async function demoLogin(formData: FormData) {
  if (!isDemoLogin()) throw new Error("Demo-Login ist nicht aktiv");
  const persona = PERSONAS.find((p) => p.key === formData.get("persona"));
  if (!persona) throw new Error("Unbekannter Demo-Zugang");

  if (isFixtureMode()) {
    (await cookies()).set("fixture_persona", persona.key, { httpOnly: true, sameSite: "lax", path: "/" });
  } else {
    const password = process.env.DEMO_PASSWORD ?? "trendradar-demo";
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: persona.email, password });
    if (error) redirect(`/login?fehler=${encodeURIComponent("Demo-Zugang nicht verfügbar: " + error.message)}`);
  }
  redirect("/radar");
}

export async function logout() {
  if (isFixtureMode()) (await cookies()).delete("fixture_persona");
  else await (await createClient()).auth.signOut();
  redirect("/login");
}

/**
 * Magic-Link für eine eingeladene Adresse. Nur hier darf Supabase ein neues Konto anlegen – und nur, wenn eine
 * gültige Einladung genau für diese Adresse existiert (sonst bleibt es bei „nur bekannte Adressen“).
 */
export async function sendInviteLink(token: string, _prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { status: "error", message: "Bitte eine gültige E-Mail-Adresse eingeben." };
  if (isFixtureMode()) return { status: "error", message: "Im Testmodus werden Einladungen nicht angenommen." };
  const { lookupInvitation } = await import("./invite");
  const inv = await lookupInvitation(token);
  if (!inv?.valid) return { status: "error", message: "Diese Einladung ist nicht mehr gültig. Bitte bei New Spice eine neue anfordern." };
  if (inv.email.toLowerCase() !== parsed.data) return { status: "error", message: "Die Einladung gilt für eine andere E-Mail-Adresse." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: true, emailRedirectTo: `${await origin()}/auth/callback?next=/invite/${encodeURIComponent(token)}` },
  });
  if (error?.status === 429) return { status: "error", message: "Zu viele Versuche. Bitte in ein paar Minuten erneut." };
  if (error) return { status: "error", message: "Der Link konnte nicht gesendet werden. Bitte später erneut versuchen." };
  return { status: "sent", message: "Wir haben Ihnen einen Login-Link geschickt. Bitte E-Mail öffnen und den Link anklicken." };
}

/** Eingeloggt: Einladung annehmen (accept_invitation prüft Gültigkeit und E-Mail-Adresse) */
export async function acceptInvite(token: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    const msg = /email_mismatch/.test(error.message) ? "Die Einladung gilt für eine andere E-Mail-Adresse." : "Diese Einladung ist nicht mehr gültig.";
    redirect(`/invite/${encodeURIComponent(token)}?fehler=${encodeURIComponent(msg)}`);
  }
  redirect("/radar");
}
