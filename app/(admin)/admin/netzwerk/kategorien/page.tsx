import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CategoryRow, RunCategoriesButton } from "@/components/admin/network";
import { NetworkNotice } from "@/components/admin/network-notice";
import { Card, Empty, PageHead } from "@/components/admin/ui";
import { trendInfos } from "@/lib/network/load";
import { getNetworkRepo, NetworkMissingError } from "@/lib/network/store";
import { buildRows, countByCategory } from "@/lib/network/view";

export const metadata: Metadata = { title: "Angebotskategorien · Netzwerk-Datenbank" };

export default function CategoriesPage() {
  return (
    <Suspense fallback={<p className="text-muted">Kategorien werden geladen …</p>}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  const head = (
    <PageHead eyebrow="Netzwerk-Datenbank" title="Angebotskategorien">
      Beschreiben, was Mitglieder anbieten oder suchen. Die Trends hängen an den Kategorien – die Trends eines Mitglieds ergeben sich aus seinen Angeboten.{" "}
      <Link href="/admin/netzwerk">← Zur Datenbank</Link>
    </PageHead>
  );
  const loaded = await getNetworkRepo()
    .then((repo) => Promise.all([repo.categories(), repo.members(), repo.offers(), repo.suggestions("pending")]))
    .catch((e) => {
      if (e instanceof NetworkMissingError) return e;
      throw e;
    });
  if (loaded instanceof NetworkMissingError) return <>{head}<NetworkNotice detail={loaded.message} /></>;
  const [categories, members, offers, pending] = loaded;
  const trends = await trendInfos();
  const counts = countByCategory(buildRows(members, offers, categories));
  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);
  const open = pending.filter((s) => s.kind === "category").length;
  return (
    <>
      {head}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="!p-0">
            <ul className="divide-y divide-line">
              <CategoryRow c={null} trends={trends} />
              {active.map((c) => <CategoryRow key={c.id} c={c} count={counts.get(c.id)} trends={trends} />)}
            </ul>
          </Card>
          {!active.length && <Empty>Noch keine Kategorien. Lasst den Netzwerk-Manager eine erste Liste vorschlagen oder legt sie oben an.</Empty>}
          {archived.length > 0 && (
            <Card className="!p-0">
              <h2 className="px-5 pt-4 !text-lg">Archiviert</h2>
              <ul className="divide-y divide-line">{archived.map((c) => <CategoryRow key={c.id} c={c} count={counts.get(c.id)} trends={trends} />)}</ul>
            </Card>
          )}
        </div>
        <Card className="flex flex-col gap-3 self-start">
          <h2 className="!text-xl">Netzwerk-Manager</h2>
          <p className="text-sm">
            Schlägt aus den vorhandenen Einträgen und den Kandidaten aus Challenges eine Kategorienliste (etwa 30–40) mit Trends vor. Ihr übernehmt, passt an oder verwerft.
          </p>
          <RunCategoriesButton />
          {open > 0 && <Link href="/admin/netzwerk/manager" className="text-sm">{open} Vorschläge warten →</Link>}
        </Card>
      </div>
    </>
  );
}
