import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RecommendForm } from "@/components/app/network-forms";
import { Badge, Card } from "@/components/admin/ui";
import { getApplicationsRepo } from "@/lib/applications/store";
import type { Application } from "@/lib/applications/types";
import { getViewer } from "@/lib/auth/viewer";
import { PARTNER_TYPE_LABEL } from "@/lib/network/types";

export const metadata: Metadata = { title: "Kontakt empfehlen" };

export default function RecommendPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
      <Suspense fallback={<p className="text-muted">…</p>}>
        <Recommend />
      </Suspense>
    </main>
  );
}

async function Recommend() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canRecommend) redirect("/radar");
  const mine = await getApplicationsRepo().then((r) => r.myRecommendations(viewer.id)).catch(() => [] as Application[]);
  // Status nur grob zeigen: Partner sehen nicht, wie die Redaktion entscheidet
  const state = (a: Application) => (a.status === "accepted" ? "im Netzwerk" : a.status === "rejected" ? "abgeschlossen" : "in Prüfung");
  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{viewer.orgs.find((o) => o.kind === "partner")?.name ?? "Partner"}</p>
        <h1 className="!text-[clamp(32px,4vw,48px)]">Kontakt empfehlen</h1>
        <p className="max-w-2xl text-lg">Sie kennen einen Verein, eine Venue oder einen Anbieter, der ins Netzwerk passt? Empfehlen Sie den Kontakt – die Redaktion meldet sich dort.</p>
      </header>
      <Card><RecommendForm /></Card>
      {mine.length > 0 && (
        <Card>
          <h2 className="!text-xl">Ihre Empfehlungen</h2>
          <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
            {mine.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span><b className="text-ink">{a.orgName}</b> <span className="text-muted">· {PARTNER_TYPE_LABEL[a.partnerType]}</span></span>
                <Badge tone="muted">{state(a)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
