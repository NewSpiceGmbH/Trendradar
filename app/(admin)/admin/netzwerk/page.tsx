import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SuggestionCard } from "@/components/admin/network";
import { NetworkNotice } from "@/components/admin/network-notice";
import { Seal, StatusBadge, Tag, TrendTags } from "@/components/admin/network-parts";
import { Card, Empty, PageHead, btn, input, timeAgo } from "@/components/admin/ui";
import { trendInfos } from "@/lib/network/load";
import { getNetworkRepo, NetworkMissingError } from "@/lib/network/store";
import { MEMBER_STATUS_LABEL, PARTNER_TYPE_LABEL, PARTNER_TYPES, SOURCE_LABEL, type MemberStatus, type PartnerType } from "@/lib/network/types";
import { buildRows, countByCategory, countByType, filterRows, subtitle } from "@/lib/network/view";
import { getProjectsRepo } from "@/lib/projects/store";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Netzwerk-Datenbank · Redaktion" };

export default function NetworkPage(props: PageProps<"/admin/netzwerk">) {
  return (
    <Suspense fallback={<p className="text-muted">Netzwerk wird geladen …</p>}>
      <Network searchParams={props.searchParams} />
    </Suspense>
  );
}

type Params = Record<string, string | undefined>;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function href(base: Params, patch: Params) {
  const next = { ...base, ...patch };
  const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => Boolean(e[1])));
  const s = qs.toString();
  return s ? `/admin/netzwerk?${s}` : "/admin/netzwerk";
}

const chip = (on: boolean) =>
  `rounded-[var(--radius-pill)] px-3 py-1 text-sm no-underline ${on ? "bg-ink font-bold text-bg" : "border border-line text-ink hover:bg-sunk"}`;

async function Network({ searchParams }: { searchParams: PageProps<"/admin/netzwerk">["searchParams"] }) {
  const q = await searchParams;
  const params: Params = { typ: str(q.typ), kat: str(q.kat), angebot: str(q.angebot), startup: str(q.startup), status: str(q.status), q: str(q.q) };
  const type = PARTNER_TYPES.includes(params.typ as PartnerType) ? (params.typ as PartnerType) : null;
  const status = params.status && params.status in MEMBER_STATUS_LABEL ? (params.status as MemberStatus) : null;

  const head = (
    <PageHead eyebrow="Netzwerk" title="Netzwerk-Datenbank"
      actions={<>
        <Link href="/admin/netzwerk/kategorien" className={btn.ghost}>Angebotskategorien</Link>
        <Link href="/admin/netzwerk/neu" className={btn.primary}>+ Eintrag</Link>
      </>}>
      Alle Mitglieder des Netzwerks, redaktionell gepflegt. Kunden sehen nur öffentlich markierte Einträge oder solche, die ihrem Projekt zugewiesen sind.
    </PageHead>
  );

  const viewer = await getViewer();
  const loaded = await getNetworkRepo()
    .then((repo) => Promise.all([repo.members(), repo.offers(), repo.categories(), repo.suggestions("pending"), repo.customerOrgs()]))
    .catch((e) => {
      if (e instanceof NetworkMissingError) return e;
      throw e;
    });
  if (loaded instanceof NetworkMissingError) return <>{head}<NetworkNotice detail={loaded.message} /></>;
  const [members, offers, categories, suggestions, customerOrgs] = loaded;
  const [trends, orgs] = await Promise.all([trendInfos(), viewer ? getProjectsRepo(viewer).then((r) => r.orgs()).catch(() => []) : []]);
  const trendMap = new Map(trends.map((t) => [t.number, t]));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const rows = buildRows(members, offers, categories);
  const byType = countByType(rows);
  const byCat = countByCategory(rows);
  const active = rows.filter((r) => r.member.status !== "archived").length;
  const list = filterRows(rows, {
    type, category: params.kat ?? null, offers: params.angebot === "1", startup: params.startup === "1", status, q: params.q,
  }, categories);
  const memberNames = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const cats = categories.filter((c) => !c.archived && (byCat.get(c.id) ?? 0) > 0).sort((a, b) => (byCat.get(b.id) ?? 0) - (byCat.get(a.id) ?? 0));

  return (
    <>
      {head}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <form action="/admin/netzwerk" className="flex flex-wrap items-center gap-2">
            {Object.entries(params).filter(([k, v]) => k !== "q" && v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <input name="q" defaultValue={params.q ?? ""} aria-label="Netzwerk durchsuchen" placeholder="Name, Kategorie, Trend (#24) …" className={`${input} max-w-sm`} />
          </form>
          <nav aria-label="Partner-Typ" className="flex flex-wrap gap-1.5">
            <Link href={href(params, { typ: undefined })} aria-current={!type ? "page" : undefined} className={chip(!type)}>Alle · {active}</Link>
            {PARTNER_TYPES.map((t) => (
              <Link key={t} href={href(params, { typ: t })} aria-current={type === t ? "page" : undefined} className={chip(type === t)}>
                {PARTNER_TYPE_LABEL[t]} · {byType[t]}
              </Link>
            ))}
          </nav>
          <nav aria-label="Weitere Filter" className="flex flex-wrap items-center gap-1.5">
            <Link href={href(params, { angebot: params.angebot ? undefined : "1" })} aria-current={params.angebot ? "true" : undefined} className={chip(Boolean(params.angebot))}>bietet etwas an</Link>
            <Link href={href(params, { startup: params.startup ? undefined : "1" })} aria-current={params.startup ? "true" : undefined} className={chip(Boolean(params.startup))}>Startups</Link>
            {(["review", "on_hold", "archived"] as const).map((s) => (
              <Link key={s} href={href(params, { status: status === s ? undefined : s })} aria-current={status === s ? "true" : undefined} className={chip(status === s)}>{MEMBER_STATUS_LABEL[s]}</Link>
            ))}
          </nav>
          {cats.length > 0 && (
            <nav aria-label="Angebotskategorie" className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">Angebot:</span>
              {cats.map((c) => (
                <Link key={c.id} href={href(params, { kat: params.kat === c.id ? undefined : c.id })} aria-current={params.kat === c.id ? "true" : undefined}
                  className={`${chip(params.kat === c.id)} !px-2.5 !py-0.5 !text-xs`}>{c.name} {byCat.get(c.id)}</Link>
              ))}
              {params.kat && <Link href={href(params, { kat: undefined })} className="text-xs">Filter löschen</Link>}
            </nav>
          )}

          <Card className="!p-0">
            {list.length ? (<>
              {/* Handy: Karten statt Tabelle */}
              <ul className="divide-y divide-line sm:hidden">
                {list.map((r) => (
                  <li key={r.member.id}>
                    <Link href={`/admin/netzwerk/${r.member.id}`} className="flex flex-col gap-1.5 px-4 py-3 text-ink no-underline hover:bg-sunk">
                      <span className="flex items-start justify-between gap-2"><b>{r.member.name}</b><StatusBadge status={r.member.status} /></span>
                      <span className="text-xs text-muted">{r.member.partnerTypes.map((t) => PARTNER_TYPE_LABEL[t]).join(" + ")}{subtitle(r.member) ? ` · ${subtitle(r.member)}` : ""}</span>
                      <span className="flex flex-wrap gap-1">
                        {r.categoryIds.map((id) => <Tag key={id}>{catName.get(id)}</Tag>)}
                        <TrendTags numbers={r.trends} trends={trendMap} />
                        {r.member.approved && <Seal />}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-line">
                      <th scope="col" className="px-5 py-3 font-normal">Name</th>
                      <th scope="col" className="px-3 py-3 font-normal">Partner-Typ</th>
                      <th scope="col" className="px-3 py-3 font-normal">Angebot</th>
                      <th scope="col" className="px-3 py-3 font-normal">Trends</th>
                      <th scope="col" className="px-3 py-3 font-normal">Status</th>
                      <th scope="col" className="px-3 py-3 font-normal">Beziehung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.map((r) => {
                      const m = r.member;
                      const customer = customerOrgs.get(m.id);
                      return (
                        <tr key={m.id} className="align-top hover:bg-sunk">
                          <td className="px-5 py-3">
                            <Link href={`/admin/netzwerk/${m.id}`} className="font-bold text-ink no-underline hover:underline">{m.name}</Link>
                            <div className="text-xs whitespace-nowrap text-muted">{SOURCE_LABEL[m.source]} · {timeAgo(m.updatedAt)}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-ink">{m.partnerTypes.map((t) => PARTNER_TYPE_LABEL[t]).join(" + ")}</span>
                            {subtitle(m) && <div className="text-xs text-muted">{subtitle(m)}</div>}
                          </td>
                          <td className="px-3 py-3"><span className="flex flex-wrap gap-1">{r.categoryIds.map((id) => <Tag key={id}>{catName.get(id)}</Tag>)}{!r.categoryIds.length && <span className="text-xs text-muted">–</span>}</span></td>
                          <td className="px-3 py-3"><TrendTags numbers={r.trends} trends={trendMap} /></td>
                          <td className="px-3 py-3"><StatusBadge status={m.status} />{m.published && <div className="mt-1 text-xs text-muted">öffentlich</div>}</td>
                          <td className="px-3 py-3">
                            <span className="flex flex-wrap gap-1">
                              {m.approved && <Seal />}
                              {customer && <Tag>Kunde{orgName.get(customer) ? ` · ${orgName.get(customer)}` : ""}</Tag>}
                              {m.isPartner && <Tag>Partner</Tag>}
                              {!m.approved && !customer && !m.isPartner && <span className="text-xs text-muted">–</span>}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>) : (
              <div className="p-6"><Empty>{members.length ? "Keine Treffer." : "Noch keine Einträge. Sie kommen über Challenges, Bewerbungen oder „+ Eintrag“."}</Empty></div>
            )}
          </Card>
        </div>

        <aside aria-labelledby="nm-h" className="flex flex-col gap-3 xl:border-l xl:border-line xl:pl-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="nm-h" className="!text-xl">Netzwerk-Manager</h2>
            <span className="text-xs text-muted"><b className="num text-ink">{suggestions.length}</b> Vorschläge</span>
          </div>
          <p className="text-sm text-muted">Arbeitet der Redaktion zu. Nichts wird ohne eure Freigabe geändert.</p>
          {suggestions.length ? (
            <ul className="flex flex-col gap-3">
              {suggestions.slice(0, 5).map((s) => <SuggestionCard key={s.id} s={s} trends={trends} memberNames={memberNames} />)}
            </ul>
          ) : <Empty>Keine offenen Vorschläge.</Empty>}
          <Link href="/admin/netzwerk/manager" className="text-sm">Alle Vorschläge und Läufe →</Link>
        </aside>
      </div>
    </>
  );
}
