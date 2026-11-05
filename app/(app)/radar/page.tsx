import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ExpiryNotice, NoAccess } from "@/components/app/access";
import { StadiumView } from "@/components/stadium";
import { getViewer } from "@/lib/auth/viewer";
import { getRadarData } from "@/lib/radar/get";

export const metadata: Metadata = { title: "Arena" };

export default function RadarPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-[1320px] px-8 py-16 text-muted">Stadion wird geladen …</p>}>
      <Radar />
    </Suspense>
  );
}

async function Radar() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.hasAccess) return <NoAccess viewer={viewer} />;
  const data = await getRadarData(viewer);
  return (
    <StadiumView data={data} notice={<ExpiryNotice viewer={viewer} overlay />} />
  );
}
