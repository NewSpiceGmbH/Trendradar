import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TrendDatabase } from "@/components/admin/trend-database";
import { Card, PageHead } from "@/components/admin/ui";
import { getViewer } from "@/lib/auth/viewer";
import { getRadarData } from "@/lib/radar/get";

export const metadata: Metadata = { title: "Trenddatenbank · Redaktion" };

export default function DatabasePage() {
  return (
    <Suspense fallback={<p className="text-muted">Trenddatenbank wird geladen …</p>}>
      <Database />
    </Suspense>
  );
}

async function Database() {
  const viewer = await getViewer();
  if (!viewer?.isEditor) redirect("/radar");
  const data = await getRadarData(viewer);
  return (
    <>
      <PageHead eyebrow="Redaktion" title="Trenddatenbank">
        Alle {data.trends.length} veröffentlichten Trends mit Scores je Kriterium. Spaltenkopf sortiert, Zeile öffnet den Trend zum Bearbeiten.
        Nur für die Redaktion – Kunden sehen die Tabelle nicht.
      </PageHead>
      <Card>
        <TrendDatabase data={data} />
      </Card>
    </>
  );
}
