import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignalRow } from "@/components/admin/signal-row";
import { Card, Empty, PageHead, timeAgo } from "@/components/admin/ui";
import { getAdminRepo } from "@/lib/admin/repo";
import type { Signal } from "@/lib/admin/types";
import { LANES, LANE_LABEL, type Lane } from "@/lib/agents/types";

export const metadata: Metadata = { title: "Liveticker · Redaktion" };

const TABS = [
  { key: "offen", label: "Wartet auf Freigabe", test: (s: Signal) => s.status !== "dismissed" && !s.publishedAt },
  { key: "live", label: "Im Ticker", test: (s: Signal) => !!s.publishedAt },
  { key: "verworfen", label: "Verworfen", test: (s: Signal) => s.status === "dismissed" },
] as const;

export default function TickerPage(props: PageProps<"/admin/ticker">) {
  return (
    <Suspense fallback={<p className="text-muted">Meldungen werden geladen …</p>}>
      <Ticker searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Ticker({ searchParams }: { searchParams: PageProps<"/admin/ticker">["searchParams"] }) {
  const q = await searchParams;
  const tab = TABS.find((t) => t.key === q.tab) ?? TABS[0];
  const lane = (LANES as string[]).includes(String(q.lane)) ? (q.lane as Lane) : null;
  const repo = await getAdminRepo();
  const [all, trends] = await Promise.all([repo.signals(), repo.trends()]);
  const signals = lane ? all.filter((s) => (s.lane ?? "sport_hospitality") === lane) : all;
  const list = signals.filter(tab.test);
  const href = (t: string, l: Lane | null) => {
    const p = new URLSearchParams();
    if (t !== "offen") p.set("tab", t);
    if (l) p.set("lane", l);
    const s = p.toString();
    return s ? `/admin/ticker?${s}` : "/admin/ticker";
  };
  const options = trends.filter((t) => t.fields.status !== "archived").map((t) => ({ id: t.id, number: t.fields.number, name: t.fields.name }));

  return (
    <>
      <PageHead eyebrow="Redaktion" title="Liveticker">
        Meldungen, die die Agenten gefunden haben. Jede Meldung erscheint erst nach eurer Freigabe im Ticker – und nur, wenn sie einem veröffentlichten Trend zugeordnet ist.
      </PageHead>
      <nav aria-label="Ansicht" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key, lane)}
            aria-current={tab.key === t.key ? "page" : undefined}
            className={`rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-bold no-underline ${tab.key === t.key ? "bg-ink text-bg" : "glass text-ink"}`}
          >
            {t.label} <span className="num opacity-70">{signals.filter(t.test).length}</span>
          </Link>
        ))}
      </nav>
      <nav aria-label="Bereich" className="-mt-4 flex flex-wrap gap-2 text-sm">
        {[null, ...LANES].map((l) => (
          <Link
            key={l ?? "alle"}
            href={href(tab.key, l)}
            aria-current={lane === l ? "page" : undefined}
            className={`rounded-[var(--radius-pill)] border px-3 py-1 no-underline ${lane === l ? "border-ink font-bold text-ink" : "border-line text-muted hover:text-ink"}`}
          >
            {l ? LANE_LABEL[l] : "Alle Bereiche"}
          </Link>
        ))}
      </nav>
      <Card className="!p-0">
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((s) => <SignalRow key={s.id} signal={s} trends={options} found={timeAgo(s.foundAt)} />)}
          </ul>
        ) : (
          <div className="p-6">
            <Empty>{tab.key === "offen" ? "Keine neuen Meldungen. Der Scout-Agent liefert sie, sobald er läuft." : "Keine Einträge."}</Empty>
          </div>
        )}
      </Card>
    </>
  );
}
