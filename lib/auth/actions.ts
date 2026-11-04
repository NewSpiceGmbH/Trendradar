"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PERSONAS, isDemoLogin, isFixtureMode } from "./personas";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

async function origin() {
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
