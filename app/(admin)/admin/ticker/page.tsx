import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignalRow } from "@/components/admin/signal-row";
import { Card, Empty, PageHead, timeAgo } from "@/components/admin/ui";
import { getAdminRepo } from "@/lib/admin/repo";
import type { Signal } from "@/lib/admin/types";

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
  const repo = await getAdminRepo();
  const [signals, trends] = await Promise.all([repo.signals(), repo.trends()]);
  const list = signals.filter(tab.test);
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
            href={t.key === "offen" ? "/admin/ticker" : `/admin/ticker?tab=${t.key}`}
            aria-current={tab.key === t.key ? "page" : undefined}
            className={`rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-bold no-underline ${tab.key === t.key ? "bg-ink text-bg" : "glass text-ink"}`}
          >
            {t.label} <span className="num opacity-70">{signals.filter(t.test).length}</span>
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
