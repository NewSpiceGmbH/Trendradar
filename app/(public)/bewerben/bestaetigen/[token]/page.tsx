import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/app/logo";
import { btn } from "@/components/admin/ui";
import { confirmApplication } from "@/lib/applications/submit";

export const metadata: Metadata = { title: "Bewerbung bestätigen" };

/** Bestätigung per Knopf: Mail-Scanner öffnen Links, klicken aber keine Knöpfe */
export default function ConfirmPage(props: PageProps<"/bewerben/bestaetigen/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-8">
      <Logo className="h-10 w-auto self-start text-ink" />
      <Suspense fallback={<p className="text-muted">…</p>}>
        <Confirm params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Confirm({ params, searchParams }: { params: PageProps<"/bewerben/bestaetigen/[token]">["params"]; searchParams: PageProps<"/bewerben/bestaetigen/[token]">["searchParams"] }) {
  const [{ token }, q] = await Promise.all([params, searchParams]);
  if (q.ergebnis === "ok") {
    return (
      <section role="status" className="flex flex-col gap-3">
        <h1 className="!text-4xl">Danke, bestätigt!</h1>
        <p className="text-lg">Ihre Bewerbung ist bei uns eingegangen. Wir melden uns innerhalb von 5 Werktagen.</p>
      </section>
    );
  }
  if (q.ergebnis === "ungueltig") {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="!text-4xl">Link nicht gültig</h1>
        <p className="text-lg">Dieser Link wurde schon verwendet oder ist unbekannt. Ist Ihre Bewerbung bereits bestätigt, müssen Sie nichts weiter tun.</p>
        <Link href="/bewerben">Neue Bewerbung</Link>
      </section>
    );
  }
  async function confirm() {
    "use server";
    const r = await confirmApplication(token);
    redirect(`/bewerben/bestaetigen/${encodeURIComponent(token)}?ergebnis=${r.ok ? "ok" : "ungueltig"}`);
  }
  return (
    <section className="flex flex-col gap-4">
      <h1 className="!text-4xl">Bewerbung bestätigen</h1>
      <p className="text-lg">Bitte bestätigen Sie, dass Sie sich beim New Spice Trendradar beworben haben.</p>
      <form action={confirm}><button type="submit" className={btn.primary}>E-Mail-Adresse bestätigen</button></form>
    </section>
  );
}
