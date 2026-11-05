"use client";

import { useRouter } from "next/navigation";
import type { RadarData } from "@/lib/radar/types";
import { TickerColumn } from "./ticker";

/** News-Ticker als eigene Seite; ein Klick auf den Trend öffnet ihn im Dashboard */
export function NewsPage({ data, editor }: { data: RadarData; editor: boolean }) {
  const router = useRouter();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-0 sm:px-8 sm:py-6">
      <h1 className="sr-only">News-Ticker</h1>
      <div className="glass flex min-h-[60vh] flex-col sm:rounded-[var(--radius-card)]">
        <TickerColumn data={data} editor={editor} active={null} onHover={() => {}} onSelectTrend={(n) => router.push(`/radar?t=${n}&d=1`)} />
      </div>
    </main>
  );
}
