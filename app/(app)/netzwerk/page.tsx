import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NoAccess } from "@/components/app/access";
import { Seal, Tag, TrendTags } from "@/components/admin/network-parts";
import { Card, Empty } from "@/components/admin/ui";
import { getViewer } from "@/lib/auth/viewer";
import { getNetworkRepo, NetworkMissingError } from "@/lib/network/store";
import { PARTNER_TYPE_LABEL } from "@/lib/network/types";
import { buildRows } from "@/lib/network/view";
import { getRadarData } from "@/lib/radar/get";
import { MATURITY_LABEL } from "@/lib/venture/types";

export const metadata: Metadata = { title: "Netzwerk" };

export default function NetworkPublicPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
      <Suspense fallback={<p className="text-muted">Netzwerk wird geladen …</p>}>
        <Network />
      </Suspense>
    </main>
  );
}

/**
 * Öffentlich markierte Einträge der Netzwerk-Datenbank für alle Mitglieder mit Zugang (Kunden, Partner, Investoren).
 * RLS liefert nur, was der Nutzer sehen darf; hier zusätzlich nur „öffentlich“ (Projektzuweisungen stehen im Projekt).
 * Vertrauliches (Kontakt, Preise, Pitchdeck) ist nicht dabei.
 */
async function Network() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.hasAccess) return <NoAccess viewer={viewer} />;
  const repo = await getNetworkRepo();
  const loaded = await Promise.all([repo.members(), repo.offers(), repo.categories(), getRadarData(viewer)]).catch((e) => {
    if (e instanceof NetworkMissingError) return null;
    throw e;
  });
  const head = (
    <header className="flex flex-col gap-2">
      <p className="eyebrow">Netzwerk von New Spice</p>
      <h1 className="!text-[clamp(32px,4vw,48px)]">Netzwerk</h1>
      <p className="max-w-2xl text-lg">Ausgewählte Anbieter und Partner aus Sport, Hospitality und Live Entertainment, von New Spice geprüft. Kontakt stellt Ihre Ansprechperson bei New Spice her.</p>
    </header>
  );
  if (!loaded) return <>{head}<Empty>Das Netzwerk wird gerade eingerichtet.</Empty></>;
  const [members, offers, categories, radar] = loaded;
  const visible = members.filter((m) => m.published && m.status === "qualified");
  const rows = buildRows(visible, offers, categories);
  const trendMap = new Map(radar.trends.map((t) => [t.number, { number: t.number, name: t.name, cluster: t.cluster }]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  return (
    <>
      {head}
      {rows.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map(({ member: m, categoryIds, trends }) => (
            <li key={m.id}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-muted">{m.partnerTypes.map((t) => PARTNER_TYPE_LABEL[t]).join(" + ")}{m.isStartup ? " · Startup" : ""}</span>
                  {m.approved && <Seal />}
                </div>
                <h2 className="!text-xl">{m.name}</h2>
                {(m.tagline ?? m.solution) && <p className="text-sm">{m.tagline ?? m.solution}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                  {categoryIds.map((id) => <Tag key={id}>{catName.get(id)}</Tag>)}
                  <TrendTags numbers={trends} trends={trendMap} />
                  {m.stage && <Tag>{MATURITY_LABEL[m.stage]}</Tag>}
                </div>
                {m.website && <a href={m.website} target="_blank" rel="noreferrer noopener" className="text-sm">{m.domain ?? m.website}</a>}
              </Card>
            </li>
          ))}
        </ul>
      ) : <Empty>Noch keine öffentlichen Einträge.</Empty>}
    </>
  );
}
