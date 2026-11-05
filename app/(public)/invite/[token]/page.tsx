import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/app/logo";
import { acceptInvite } from "@/lib/auth/actions";
import { lookupInvitation } from "@/lib/auth/invite";
import { getViewer } from "@/lib/auth/viewer";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Einladung" };

export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-8">
      <Logo className="h-10 w-auto self-start text-ink" />
      <Suspense fallback={<p className="text-muted">Einladung wird geprüft …</p>}>
        <Invite params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Invite({ params, searchParams }: { params: PageProps<"/invite/[token]">["params"]; searchParams: PageProps<"/invite/[token]">["searchParams"] }) {
  const { token } = await params;
  const q = await searchParams;
  const [inv, viewer] = await Promise.all([lookupInvitation(token), getViewer()]);
  const error = typeof q.fehler === "string" ? q.fehler : null;

  if (!inv || !inv.valid) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="!text-4xl">Einladung nicht gültig</h1>
        <p className="text-lg">
          {inv?.reason === "accepted" ? "Diese Einladung wurde bereits angenommen." : inv?.reason === "expired" ? "Diese Einladung ist abgelaufen." : "Den Link kennen wir nicht."}{" "}
          Ihre Ansprechperson bei New Spice schickt Ihnen gern eine neue.
        </p>
        <Link href="/login">Zur Anmeldung</Link>
      </section>
    );
  }

  const accept = acceptInvite.bind(null, token);
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Einladung</p>
        <h1 className="!text-4xl">Willkommen beim Trendradar</h1>
        <p className="text-lg">Sie wurden {inv.role === "owner" ? "als Ansprechperson" : "ins Team"} von <b className="text-ink">{inv.orgName}</b> eingeladen.</p>
      </div>
      {error && <p role="alert" className="rounded-xl border border-line p-3 text-ink">{error}</p>}
      {viewer ? (
        viewer.email.toLowerCase() === inv.email.toLowerCase() ? (
          <form action={accept}>
            <button className="rounded-[var(--radius-pill)] bg-accent px-6 py-3 font-bold text-on-accent">Einladung annehmen</button>
          </form>
        ) : (
          <p>Sie sind als <b className="text-ink">{viewer.email}</b> angemeldet, die Einladung gilt aber für eine andere Adresse. Bitte abmelden und mit der eingeladenen Adresse anmelden.</p>
        )
      ) : (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <p>Zur Bestätigung schicken wir einen Login-Link an die eingeladene Adresse. Ein Passwort brauchen Sie nicht.</p>
          <InviteForm token={token} email={inv.email} />
        </div>
      )}
    </section>
  );
}
