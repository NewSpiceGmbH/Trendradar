import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { NoAccess } from "@/components/app/access";
import { TrendCard } from "@/components/radar/trend-card";
import { getViewer } from "@/lib/auth/viewer";
import { getRadarData } from "@/lib/radar/get";
import { positions } from "@/lib/radar/view";

export const metadata: Metadata = { title: "Trend" };

export default function TrendPage({ params }: PageProps<"/trends/[number]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-4xl px-8 py-16 text-muted">Trend wird geladen …</p>}>
      <Trend params={params} />
    </Suspense>
  );
}

async function Trend({ params }: { params: PageProps<"/trends/[number]">["params"] }) {
  const n = Number((await params).number);
  if (!Number.isInteger(n)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.hasAccess) return <NoAccess viewer={viewer} />;

  const data = await getRadarData(viewer);
  const trend = data.trends.find((t) => t.number === n);
  if (!trend) notFound();
  const pos = positions(data);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-8">
      <nav className="flex items-center justify-between gap-4 text-sm">
        <Link href={`/radar?v=radar&t=${n}&d=1`}>← Im Stadion ansehen</Link>
        <span className="flex gap-4">
          {n > 1 && data.trends.some((t) => t.number === n - 1) && <Link href={`/trends/${n - 1}`}>← #{n - 1}</Link>}
          {data.trends.some((t) => t.number === n + 1) && <Link href={`/trends/${n + 1}`}>#{n + 1} →</Link>}
        </span>
      </nav>
      <p className="text-sm text-muted">Perspektive Europa / DACH · Global-Werte in der Europa-Einordnung</p>
      <TrendCard data={data} trend={trend} pos={pos} persp="EU" headingLevel="h2" />
    </main>
  );
}
