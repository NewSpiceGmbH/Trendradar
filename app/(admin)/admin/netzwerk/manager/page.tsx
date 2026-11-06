import type { Metadata } from "next";
import { Suspense } from "react";
import { RunCategoriesButton, SuggestionCard } from "@/components/admin/network";
import { NetworkNotice } from "@/components/admin/network-notice";
import { Badge, Card, Empty, PageHead, formatDate } from "@/components/admin/ui";
import { trendInfos } from "@/lib/network/load";
import { getNetworkRepo, NetworkMissingError } from "@/lib/network/store";
import { SUGGESTION_KIND_LABEL } from "@/lib/network/types";

export const metadata: Metadata = { title: "Netzwerk-Manager · Agenten" };

export default function ManagerPage() {
  return (
    <Suspense fallback={<p className="text-muted">Vorschläge werden geladen …</p>}>
      <Manager />
    </Suspense>
  );
}

const STATUS = { pending: "offen", accepted: "übernommen", adjusted: "angepasst", dismissed: "verworfen" } as const;
const usd = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD" });

async function Manager() {
  const head = (
    <PageHead eyebrow="Agenten" title="Netzwerk-Manager">
      Fasst Eingänge zusammen, schlägt Klassifizierung und Kategorien vor und findet Verbindungen. Er schreibt nur Vorschläge mit Begründung – die Redaktion entscheidet.
    </PageHead>
  );
  const loaded = await getNetworkRepo()
    .then((repo) => Promise.all([repo.suggestions(), repo.runs(), repo.members()]))
    .catch((e) => {
      if (e instanceof NetworkMissingError) return e;
      throw e;
    });
  if (loaded instanceof NetworkMissingError) return <>{head}<NetworkNotice detail={loaded.message} /></>;
  const [suggestions, runs, members] = loaded;
  const trends = await trendInfos();
  const memberNames = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const open = suggestions.filter((s) => s.status === "pending");
  const done = suggestions.filter((s) => s.status !== "pending").slice(0, 30);
  return (
    <>
      {head}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="open-h" className="flex min-w-0 flex-col gap-3">
          <h2 id="open-h" className="!text-xl">Offene Vorschläge · <span className="num">{open.length}</span></h2>
          {open.length ? <ul className="grid gap-3 lg:grid-cols-2">{open.map((s) => <SuggestionCard key={s.id} s={s} trends={trends} memberNames={memberNames} />)}</ul>
            : <Empty>Keine offenen Vorschläge.</Empty>}
          {done.length > 0 && (
            <Card>
              <h2 className="!text-lg">Entschieden</h2>
              <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
                {done.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span>{SUGGESTION_KIND_LABEL[s.kind]}: {s.title}</span>
                    <span className="text-xs text-muted">{STATUS[s.status]} · {formatDate(s.decidedAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
        <aside className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h2 className="!text-xl">Aufgaben</h2>
            <p className="text-sm">Kategorienliste aus den vorhandenen Einträgen vorschlagen. Clustern des Eingangs, Matching und Verbindungen folgen.</p>
            <RunCategoriesButton />
          </Card>
          <Card>
            <h2 className="!text-xl">Läufe</h2>
            {runs.length ? (
              <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
                {runs.map((r) => (
                  <li key={r.id} className="flex flex-col gap-0.5 py-2">
                    <span className="flex items-center justify-between gap-2">
                      {formatDate(r.startedAt)}
                      <Badge tone={r.status === "failed" ? "warn" : "muted"}>{r.status === "succeeded" ? "fertig" : r.status === "running" ? "läuft" : "Fehler"}</Badge>
                    </span>
                    <span className="text-xs text-muted">
                      {[r.task === "categories" ? "Kategorien" : r.task, r.suggestions != null ? `${r.suggestions} Vorschläge` : null, r.model,
                        r.inputTokens != null ? `${r.inputTokens.toLocaleString("de-DE")} / ${(r.outputTokens ?? 0).toLocaleString("de-DE")} Tokens` : null,
                        r.costUsd != null ? usd.format(r.costUsd) : null].filter(Boolean).join(" · ")}
                    </span>
                    {r.error && <span className="text-xs text-alert">{r.error}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted">Noch keine Läufe.</p>}
          </Card>
        </aside>
      </div>
    </>
  );
}
