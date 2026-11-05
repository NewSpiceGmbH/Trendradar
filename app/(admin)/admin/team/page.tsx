import type { Metadata } from "next";
import { Suspense } from "react";
import { RoleButtons, TeamForm } from "@/components/admin/team-form";
import { Badge, Card, PageHead } from "@/components/admin/ui";
import { getAdminRepo } from "@/lib/admin/repo";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Team · Redaktion" };

export default function TeamPage() {
  return (
    <Suspense fallback={<p className="text-muted">Team wird geladen …</p>}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const viewer = await getViewer();
  if (viewer?.platformRole !== "admin") {
    return <Card><p>Nur Admins verwalten das Team.</p></Card>;
  }
  const team = await (await getAdminRepo()).team();
  return (
    <>
      <PageHead eyebrow="Redaktion" title="Team">
        Wer im Backend prüfen und freigeben darf. Editor: Review-Queue, Liveticker und Trends. Admin: zusätzlich diese Seite.
      </PageHead>
      <Card>
        <h2 className="!text-xl">Rolle vergeben</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Das Konto muss in Supabase existieren (Authentication → Users → Add user). Danach meldet sich die Person per Login-Link an.
        </p>
        <TeamForm />
      </Card>
      <Card className="!p-0">
        <ul className="divide-y divide-line">
          {team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <span className="flex flex-col">
                <b className="text-ink">{m.displayName && m.displayName !== m.email ? m.displayName : m.email}</b>
                <span className="text-xs text-muted">{m.email}</span>
              </span>
              <span className="flex flex-wrap items-center gap-4">
                <Badge>{m.role === "admin" ? "Admin" : "Editor"}</Badge>
                <RoleButtons email={m.email} role={m.role} self={m.id === viewer.id} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
