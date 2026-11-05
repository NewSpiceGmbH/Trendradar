import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ExpiryNotice, NoAccess } from "@/components/app/access";
import { NewsPage } from "@/components/stadium/news-page";
import { getViewer } from "@/lib/auth/viewer";
import { getRadarData } from "@/lib/radar/get";

export const metadata: Metadata = { title: "News-Ticker" };

export default function Page() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-8 py-16 text-muted">News werden geladen …</p>}>
      <News />
    </Suspense>
  );
}

async function News() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.hasAccess) return <NoAccess viewer={viewer} />;
  const data = await getRadarData(viewer);
  return (
    <>
      <ExpiryNotice viewer={viewer} />
      <NewsPage data={data} editor={viewer.isEditor} />
    </>
  );
}
