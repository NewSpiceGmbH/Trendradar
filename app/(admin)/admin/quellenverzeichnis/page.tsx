import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, PageHead } from "@/components/admin/ui";
import { Sources } from "@/components/radar/sections";
import { getViewer } from "@/lib/auth/viewer";
import { getRadarData } from "@/lib/radar/get";

export const metadata: Metadata = { title: "Quellenverzeichnis · Redaktion" };

export default function SourcesPage() {
  return (
    <Suspense fallback={<p className="text-muted">Quellen werden geladen …</p>}>
      <SourceList />
    </Suspense>
  );
}

async function SourceList() {
  const viewer = await getViewer();
  if (!viewer?.isEditor) redirect("/radar");
  const data = await getRadarData(viewer);
  return (
    <>
      <PageHead eyebrow="Redaktion" title="Quellenverzeichnis">
        Alle {Object.keys(data.sources).length} Quellen der Trends mit den Trends, die sich darauf stützen. Eigene Zusammenfassungen mit Link;
        Zahlen vor Verwendung im Original prüfen. „o. D.“ = Veröffentlichungsdatum nicht erfasst. Die Kanäle der Scouts stehen unter Scouting → Quellen.
      </PageHead>
      <Card>
        <Sources data={data} />
      </Card>
    </>
  );
}
