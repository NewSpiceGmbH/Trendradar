"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TrendTable } from "@/components/radar/sections";
import type { RadarData } from "@/lib/radar/types";
import { PERSPECTIVE_LABEL, positions } from "@/lib/radar/view";
import type { Perspective } from "@/lib/scoring";

/** Trenddatenbank im Backend: sortierbare Tabelle aller veröffentlichten Trends mit CSV-Export */
export function TrendDatabase({ data }: { data: RadarData }) {
  const router = useRouter();
  const pos = useMemo(() => positions(data), [data]);
  const all = useMemo(() => new Set(data.trends.map((t) => t.number)), [data]);
  const [persp, setPersp] = useState<Perspective>("EU");
  return (
    <div className="flex flex-col gap-4">
      <span className="glass inline-flex self-start rounded-[var(--radius-pill)] p-0.5" role="group" aria-label="Perspektive">
        {(["EU", "GLOBAL"] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={persp === p}
            onClick={() => setPersp(p)}
            className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm font-bold ${persp === p ? "bg-ink text-bg" : "text-ink"}`}
          >
            {PERSPECTIVE_LABEL[p]}
          </button>
        ))}
      </span>
      <TrendTable data={data} pos={pos} persp={persp} visible={all} onSelect={(n) => router.push(`/admin/trends/${n}`)} />
    </div>
  );
}
