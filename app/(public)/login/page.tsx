import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { demoLogin } from "@/lib/auth/actions";
import { PERSONAS, demoLoginDiagnosis, isDemoLogin } from "@/lib/auth/personas";
import { MagicLinkForm } from "./magic-link-form";

export const metadata: Metadata = { title: "Anmelden" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 content-center gap-10 px-4 py-16 sm:px-8 md:grid-cols-2">
      <div className="flex flex-col gap-5">
        <p className="eyebrow">New Spice · Future of Experiences</p>
        <h1>Trendradar</h1>
        <p className="max-w-prose text-lg">
          44 Trends für Sport, Hospitality und Live Entertainment – bewertet, eingeordnet und mit Europa-Perspektive.
        </p>
        <p className="text-sm text-muted">Zugang nur per Einladung. Fragen? Ihre Ansprechperson bei New Spice hilft weiter.</p>
      </div>

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8">
          <h2 className="!text-2xl">Anmelden</h2>
          <Suspense>
            <LoginError searchParams={searchParams} />
          </Suspense>
          <MagicLinkForm />
        </section>

        <Suspense>
          <DemoLogins />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginError({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const fehler = (await searchParams).fehler;
  if (!fehler) return null;
  return (
    <p role="alert" className="rounded-lg border border-line bg-sunk px-3 py-2 text-sm text-ink">
      {String(fehler)}
    </p>
  );
}

/** Zur Anfragezeit prüfen, nicht beim Build: so wirkt DEMO_LOGIN ohne neuen Build. */
async function DemoLogins() {
  await connection();
  if (!isDemoLogin()) {
    const hint = demoLoginDiagnosis();
    return hint ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{hint}</p> : null;
  }
  return (
          <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-dashed border-line p-6 sm:p-8" aria-labelledby="demo-h">
            <h2 id="demo-h" className="!text-xl">Demo-Zugänge</h2>
            <p className="text-sm text-muted">Nur in der Vorschau. Zeigt, wer was sieht – mit echten Zugriffsregeln.</p>
            <form action={demoLogin} className="grid gap-2">
              {PERSONAS.map((p) => (
                <button
                  key={p.key}
                  name="persona"
                  value={p.key}
                  className="flex flex-col items-start rounded-xl border border-line bg-sunk px-4 py-3 text-left transition hover:border-muted"
                >
                  <span className="font-bold text-ink">{p.label}</span>
                  <span className="text-sm text-muted">{p.description}</span>
                </button>
              ))}
            </form>
          </section>
  );
}
