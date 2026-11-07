import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/app/logo";
import { publicCategories } from "@/lib/applications/public";
import { ApplicationForm } from "./application-form";

export const metadata: Metadata = { title: "Bewerben", description: "Bewerbung für das Netzwerk von New Spice: Vereine, Betreiber, Caterer, Multiplikatoren, Investoren und Solution Provider." };

export default function ApplyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:px-8">
      <div className="flex flex-col gap-4">
        <Link href="/login" aria-label="Zur Anmeldung" className="self-start"><Logo className="h-10 w-auto text-ink" /></Link>
        <p className="eyebrow">Netzwerk von New Spice</p>
        <h1 className="!text-[clamp(32px,5vw,52px)]">Jetzt bewerben</h1>
        <p className="max-w-prose text-lg">
          Für Vereine, Betreiber, Caterer, Multiplikatoren, Investoren und Anbieter von Lösungen für Sport, Hospitality und Live Entertainment.
          Wir prüfen jede Bewerbung persönlich und melden uns innerhalb von 5 Werktagen.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted">Formular wird geladen …</p>}>
        <Form />
      </Suspense>
      <p className="text-sm text-muted">Schon Zugang? <Link href="/login">Zur Anmeldung</Link></p>
    </main>
  );
}

async function Form() {
  return <ApplicationForm categories={await publicCategories()} />;
}
