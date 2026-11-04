import type { ReactNode } from "react";
import type { Perspective } from "@/lib/scoring";
import type { RadarData, RadarTrend } from "@/lib/radar/types";
import { ORIGIN_LABEL, clusterFg, clusterVar, fmt, moved, type Positions } from "@/lib/radar/view";
import { ZonePill } from "./zone-pill";

const Lock = () => (
  <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

const Tag = ({ children }: { children: ReactNode }) => (
  <span className="rounded-[var(--radius-pill)] border border-line px-2.5 py-0.5 text-xs text-text">{children}</span>
);

export function SourceLink({ data, id }: { data: RadarData; id: string }) {
  const s = data.sources[id];
  if (!s) return <span className="text-muted">[{id}]</span>;
  return (
    <span>
      <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
        [{id}] {s.publisher}: {s.title}
      </a>{" "}
      <span className="text-muted">({s.publishedLabel ?? "o. D."})</span>
    </span>
  );
}

interface Props {
  data: RadarData;
  trend: RadarTrend;
  pos: Positions;
  persp: Perspective;
  /** zusätzliche Aktionen, z. B. „Zum Vergleich hinzufügen“ */
  actions?: ReactNode;
  headingLevel?: "h2" | "h3";
}

export function TrendCard({ data, trend: t, pos, persp, actions, headingLevel = "h3" }: Props) {
  const p = pos[persp][t.number];
  const g = pos.GLOBAL[t.number], e = pos.EU[t.number];
  const H = headingLevel;
  const focus = data.focus.find((f) => f.code === t.focus);
  const knowledgeBase = t.sourceIds.length === 0 || t.uncertain;

  return (
    <article className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-7" aria-live="polite">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="num grid size-11 shrink-0 place-items-center rounded-full text-lg" style={{ background: clusterVar(t.cluster), color: clusterFg(t.cluster) }}>
            {t.number}
          </span>
          <div className="min-w-0">
            <p className="eyebrow !text-muted">
              {t.cluster} · {data.clusters.find((c) => c.code === t.cluster)?.name}
            </p>
            <H className="!text-2xl">{t.name}</H>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <b className="num text-4xl leading-none text-ink">{fmt(p.total)}</b>
          <span className="text-xs text-muted">Score {persp === "EU" ? "Europa" : "Global"}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <ZonePill zone={p.zone} name={data.zones[p.zone].name} />
        <Tag>{p.horizon} Jahre</Tag>
        <Tag>
          {focus?.name} · {t.subtopic}
        </Tag>
        <Tag>Signale: {ORIGIN_LABEL[t.origin]}</Tag>
        <Tag>Evidenz {t.evidence}</Tag>
        {t.mandatory && <Tag>Pflicht</Tag>}
        {knowledgeBase && <Tag>Wissensbasis, zu validieren</Tag>}
      </div>

      <p className="text-ink">{t.description}</p>

      {t.eu && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-sunk p-4 text-sm">
          <p className="eyebrow">Europa-Einordnung</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Global <b className="num text-ink">{fmt(g.total)}</b></span>
            <ZonePill zone={g.zone} name={data.zones[g.zone].name} />
            <span>{g.horizon} J.</span>
            <span aria-hidden>→</span>
            <span>Europa <b className="num text-ink">{fmt(e.total)}</b></span>
            <ZonePill zone={e.zone} name={data.zones[e.zone].name} />
            <span>{e.horizon} J.</span>
            {moved(pos, t.number) && <span className="text-muted">· andere Phase</span>}
          </div>
          {t.eu.note && <p>{t.eu.note}</p>}
          {t.eu.sourceIds.length > 0 && (
            <div className="flex flex-col gap-1 text-xs">
              {t.eu.sourceIds.map((s) => <SourceLink key={s} data={data} id={s} />)}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_96px_20px] items-center gap-x-3 gap-y-1.5 text-sm" role="table" aria-label="Bewertung je Kriterium">
        {data.criteria.map((c, i) => {
          const v = p.scores[i];
          const differs = persp === "EU" && v !== t.global.scores[i];
          return (
            <div key={c.idx} role="row" className="contents">
              <span role="cell">
                {c.name} <span className="text-muted">{Math.round(c.weight * 100)} %</span>
              </span>
              <span role="cell" className="h-1.5 overflow-hidden rounded-full bg-sunk" aria-hidden>
                <i className="block h-full rounded-full" style={{ width: `${v * 20}%`, background: differs ? "var(--accent)" : "var(--ink)" }} />
              </span>
              <span role="cell" className="num text-right text-ink" title={differs ? `Global: ${t.global.scores[i]}` : undefined}>
                {v}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {data.industries.map((ind, i) => (
          <span key={ind.code}>
            {ind.name}{" "}
            <span className="tracking-widest text-ink" title={`Relevanz ${t.relevance[i]} von 3`} aria-label={`Relevanz ${t.relevance[i]} von 3`}>
              {"●".repeat(t.relevance[i])}
              <span className="text-line">{"●".repeat(3 - t.relevance[i])}</span>
            </span>
          </span>
        ))}
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        {[
          ["Anwendungsfälle", t.useCases],
          ["Best Practices", t.bestPractice],
          ["Markt- und Innovationssignale", t.signals],
          ["Chancen", t.opportunities],
          ["Risiken", t.risks],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1">
              <dt className="eyebrow !text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>

      {t.partnerKeys.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="eyebrow !text-muted">Lösungen &amp; Partner (Beispiele)</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {t.partnerKeys.map((k) => {
              const pa = data.partners[k];
              if (!pa) return null;
              return (
                <li key={k} className="flex flex-col rounded-xl border border-line p-3">
                  <b className="text-ink">{pa.name}</b>
                  <span>{pa.role}</span>
                  <span className="text-xs text-muted">
                    {pa.knowledgeBase
                      ? "Wissensbasis, zu validieren"
                      : pa.sourceIds.map((s, i) => (
                          <span key={s}>
                            {i > 0 && " · "}
                            <a href={data.sources[s]?.url} target="_blank" rel="noopener noreferrer">{s}</a>
                          </span>
                        ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {data.premium ? (
        <div className="flex flex-col gap-1 rounded-xl border-l-4 border-accent bg-sunk p-4 text-sm">
          <b className="text-ink">Handlungsempfehlung</b>
          <span>{t.premium?.recommendation ?? "Für diesen Trend ist noch keine Empfehlung gepflegt."}</span>
          {data.cases
            .filter((c) => c.trendNumbers.includes(t.number))
            .map((c) => (
              <span key={c.id} className="mt-2">
                <b className="text-ink">Umgesetzt mit New Spice:</b> {c.title}
                {c.result ? ` – ${c.result}` : ""}
              </span>
            ))}
        </div>
      ) : (
        <div className="flex gap-3 rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          <Lock />
          <div>
            <b className="block text-ink">Handlungsempfehlung · Premium</b>
            Konkrete Empfehlung, Priorisierung und umgesetzte New-Spice-Cases zu diesem Trend sind im Premium-Bereich freigeschaltet.
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 text-sm">
        <p className="eyebrow !text-muted">Quellen</p>
        {t.sourceIds.length ? (
          t.sourceIds.map((s) => <SourceLink key={s} data={data} id={s} />)
        ) : (
          <span className="text-muted">Keine verlinkte Primärquelle – Evidenz C, Validierung erforderlich.</span>
        )}
      </div>

      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}
