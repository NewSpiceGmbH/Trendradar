"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Perspective } from "@/lib/scoring";
import type { RadarData } from "@/lib/radar/types";
import { positions } from "@/lib/radar/view";
import { Arena } from "./arena";
import { Toolbar, emptyFilters, matches, type Filters } from "./filters";
import { Board, Compare, FocusMatrix, Legend, Method, Paywall, PremiumArea, Sources, TrendTable } from "./sections";
import { TrendCard } from "./trend-card";
import { Button, SectionHead } from "./ui";

export function RadarView({ data }: { data: RadarData }) {
  const pos = useMemo(() => positions(data), [data]);
  const [persp, setPersp] = useState<Perspective>("EU");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selected, setSelected] = useState<number | null>(
    () => [...data.trends].sort((a, b) => pos.EU[b.number].total - pos.EU[a.number].total || a.number - b.number)[0]?.number ?? null,
  );
  const [compare, setCompare] = useState<number[]>([]);

  const visible = useMemo(
    () => new Set(data.trends.filter((t) => matches(t, pos[persp][t.number], filters, data)).map((t) => t.number)),
    [data, pos, persp, filters],
  );
  const sel = data.trends.find((t) => t.number === selected) ?? null;

  const goTo = (n: number) => {
    setSelected(n);
    document.getElementById("arena")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const toggleCompare = (n: number) =>
    setCompare((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c.slice(c.length >= 3 ? 1 : 0), n]));

  let no = 0;
  const next = () => String(++no).padStart(2, "0");

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-20 px-4 pb-24 pt-10 sm:px-8">
      <header className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end">
        <div className="flex flex-col gap-5">
          <p className="eyebrow">Trendradar 2027–2035 · Hospitality · Infrastruktur · Fan Engagement</p>
          <h1>Future of Experiences</h1>
          <p className="max-w-2xl text-lg">
            {data.trends.length} Trends für Sport-, Hospitality- und Live-Venues in sieben Clustern, gewichtet bewertet und in drei Spielphasen eingeordnet. Mit eigener Europa-Perspektive, weil Datenschutz, Tempo und Investitionsrahmen in Europa anders sind als in den USA.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Board data={data} pos={pos} persp={persp} />
          <p className="text-sm text-muted">Alle Scores sind KI-basierte Hypothesen und werden durch ein Expertengremium validiert.</p>
        </div>
      </header>

      {data.insights.length > 0 && (
        <section id="erkenntnisse" className="flex scroll-mt-20 flex-col gap-8">
          <SectionHead no={next()} eyebrow="Executive Summary" title="Zehn Erkenntnisse für Entscheider" />
          <ol className="grid gap-4 md:grid-cols-2">
            {data.insights.map((i, k) => (
              <li key={k} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-t border-line pt-4">
                <span className="num text-2xl text-muted">{k + 1}</span>
                <div className="flex flex-col gap-1">
                  <b className="text-ink">{i.title}</b>
                  <span>{i.body}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section id="methodik" className="flex scroll-mt-20 flex-col gap-8">
        <SectionHead no={next()} eyebrow="Methodik" title="Bewertungsmodell, Spielphasen und Europa-Perspektive" />
        <Method data={data} />
      </section>

      <section id="arena" className="flex scroll-mt-20 flex-col gap-6">
        <SectionHead no={next()} eyebrow="Trendradar" title="Die Arena">
          Punkt anklicken öffnet die Trendkarte. Filter blenden nicht passende Trends ab, der Perspektiv-Schalter verschiebt sie.
        </SectionHead>
        <Toolbar data={data} persp={persp} setPersp={setPersp} filters={filters} setFilters={setFilters} />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-2 sm:p-3">
              <Arena data={data} pos={pos} persp={persp} visible={visible} selected={selected} onSelect={setSelected} />
            </div>
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span>Innen {data.zones.KICKOFF.name} · Mitte {data.zones.WARMUP.name} · außen {data.zones.SCOUTING.name}</span>
              <span>Punktgröße = Business Impact</span>
              <span>Gestrichelt = anders als in der anderen Perspektive</span>
              <span className="num font-normal" role="status">{visible.size} von {data.trends.length} Trends sichtbar</span>
            </p>
          </div>
          <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:rounded-[var(--radius-card)]">
            {sel ? (
              <TrendCard
                data={data}
                trend={sel}
                pos={pos}
                persp={persp}
                actions={
                  <>
                    <Button ghost={!compare.includes(sel.number)} onClick={() => toggleCompare(sel.number)}>
                      {compare.includes(sel.number) ? "Aus Vergleich entfernen" : "Zum Vergleich hinzufügen"}
                    </Button>
                    <Link href={`/trends/${sel.number}`} className="rounded-[var(--radius-pill)] border border-line px-4 py-2 text-sm font-bold text-ink no-underline hover:border-muted">
                      Als eigene Seite öffnen
                    </Link>
                  </>
                }
              />
            ) : (
              <p className="text-muted">Trend in der Arena auswählen.</p>
            )}
          </div>
        </div>
        <Compare data={data} pos={pos} persp={persp} ids={compare} onClear={() => setCompare([])} onSelect={goTo} />
        <Legend data={data} pos={pos} persp={persp} visible={visible} onSelect={goTo} />
      </section>

      <section id="fokus" className="flex scroll-mt-20 flex-col gap-8">
        <SectionHead no={next()} eyebrow="Fokus-Ansicht" title="Cluster × Fokusfeld">
          Alle sieben Cluster, aufgeteilt auf die drei Fokusfelder. Phase und Score folgen der gewählten Perspektive; ein Klick öffnet die Trendkarte.
        </SectionHead>
        <FocusMatrix data={data} pos={pos} persp={persp} onSelect={goTo} />
      </section>

      <section id="datenbank" className="flex scroll-mt-20 flex-col gap-8">
        <SectionHead no={next()} eyebrow="Trenddatenbank" title={`Alle ${data.trends.length} Trends`}>
          Spaltenkopf sortiert, Zeile öffnet die Trendkarte.
        </SectionHead>
        <TrendTable data={data} pos={pos} persp={persp} visible={visible} onSelect={goTo} />
      </section>

      <section id="premium" className="flex scroll-mt-20 flex-col gap-8">
        <SectionHead no={next()} eyebrow="Premium" title="Vom Trend zur Entscheidung" />
        {data.premium ? <PremiumArea data={data} pos={pos} onSelect={goTo} /> : <Paywall />}
      </section>

      <section id="quellen" className="flex scroll-mt-20 flex-col gap-8">
        <SectionHead no={next()} eyebrow="Quellenverzeichnis" title="Quellen">
          Eigene Zusammenfassungen mit Link auf die Quelle; Zahlen vor Verwendung im Original prüfen. „o. D.“ = Veröffentlichungsdatum nicht erfasst.
        </SectionHead>
        <Sources data={data} />
      </section>
    </div>
  );
}
