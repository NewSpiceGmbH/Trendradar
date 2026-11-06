import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense, type ReactNode } from "react";
import { CustomerOrgSelect, InterestsEditor, OffersEditor, ReferencesEditor, VisibilitySwitch } from "@/components/admin/network";
import { NetworkNotice } from "@/components/admin/network-notice";
import { Seal, StatusBadge, Tag, TrendTags } from "@/components/admin/network-parts";
import { Card, Empty, PageHead, btn, formatDate } from "@/components/admin/ui";
import { StartupEditor } from "@/components/admin/venture";
import { getViewer } from "@/lib/auth/viewer";
import { trendInfos } from "@/lib/network/load";
import { getNetworkRepo, NetworkMissingError } from "@/lib/network/store";
import { OFFERING_TYPES, PARTNER_TYPE_LABEL, REGION_LABEL, SEEKING_TYPES, SOURCE_LABEL, SUGGESTION_KIND_LABEL } from "@/lib/network/types";
import { buildRows } from "@/lib/network/view";
import { getProjectsRepo } from "@/lib/projects/store";
import { CUSTOMER_STATUS_LABEL, PROJECT_STATUS_LABEL } from "@/lib/projects/types";
import { fmtScore } from "@/lib/venture/scoring";
import { getVentureRepo } from "@/lib/venture/store";
import { CANDIDATE_STATUS_LABEL, MATURITY_LABEL } from "@/lib/venture/types";

export const metadata: Metadata = { title: "Eintrag · Netzwerk-Datenbank" };

export default function MemberPage(props: PageProps<"/admin/netzwerk/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Eintrag wird geladen …</p>}>
      <Member params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

const TABS = [
  { key: "angebot", label: "Angebot & Referenzen" },
  { key: "verbindungen", label: "Verbindungen" },
  { key: "kontakt", label: "Kontakt & Vertrauliches" },
  { key: "verlauf", label: "Verlauf" },
  { key: "bearbeiten", label: "Bearbeiten" },
] as const;

async function Member({ params, searchParams }: { params: PageProps<"/admin/netzwerk/[id]">["params"]; searchParams: PageProps<"/admin/netzwerk/[id]">["searchParams"] }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const tab = TABS.find((t) => t.key === q.reiter) ?? TABS[0];
  const repo = await getNetworkRepo();
  const loaded = await Promise.all([repo.member(id), repo.categories(), repo.offers(), repo.members()]).catch((e) => {
    if (e instanceof NetworkMissingError) return e;
    throw e;
  });
  if (loaded instanceof NetworkMissingError) return <><PageHead eyebrow="Netzwerk-Datenbank" title="Eintrag" /><NetworkNotice detail={loaded.message} /></>;
  const [found, categories, allOffers, members] = loaded;
  if (!found) notFound();
  const { member: m, priv } = found;
  const trends = await trendInfos();
  const trendMap = new Map(trends.map((t) => [t.number, t]));
  const rows = buildRows(members, allOffers, categories);
  const row = rows.find((r) => r.member.id === id)!;
  const offers = allOffers.filter((o) => o.memberId === id);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const offering = m.partnerTypes.some((t) => OFFERING_TYPES.includes(t)) || offers.length > 0;
  const seeking = m.partnerTypes.some((t) => SEEKING_TYPES.includes(t));

  let body: ReactNode;
  if (tab.key === "angebot") {
    const [references, interests] = await Promise.all([repo.references(id), seeking ? repo.interests(id) : Promise.resolve([])]);
    body = (
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-8">
          {offering && <OffersEditor memberId={id} offers={offers} categories={categories} trends={trends} />}
          {seeking && <InterestsEditor memberId={id} value={interests} categories={categories} />}
        </div>
        <ReferencesEditor memberId={id} references={references} />
      </div>
    );
  } else if (tab.key === "verbindungen") {
    const venture = await getVentureRepo();
    const [candidates, challenges, assignments] = await Promise.all([venture.candidates(), venture.challenges(), repo.assignments(id)]);
    const title = new Map(challenges.map((c) => [c.id, c.title]));
    const mine = candidates.filter((c) => c.startupId === id);
    const similar = rows.filter((r) => r.member.id !== id && r.member.status !== "archived" && r.categoryIds.some((c) => row.categoryIds.includes(c))).slice(0, 8);
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="!text-xl">Challenges</h2>
          {mine.length ? (
            <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
              {mine.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2">
                  <Link href={`/admin/venture/${c.challengeId}`}>{title.get(c.challengeId) ?? "Challenge"}</Link>
                  <span className="text-muted">{CANDIDATE_STATUS_LABEL[c.status]} · Score <span className="num text-ink">{fmtScore(c.total)}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted">Noch in keiner Challenge bewertet.</p>}
        </Card>
        <Card>
          <h2 className="!text-xl">Projekte</h2>
          {assignments.length ? (
            <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
              {assignments.map((a) => (
                <li key={a.projectId} className="flex flex-wrap items-baseline justify-between gap-3 py-2">
                  <Link href={`/admin/projekte/${a.projectId}`}>{a.title}{a.orgName ? ` (${a.orgName})` : ""}</Link>
                  <span className="text-muted">
                    {a.role === "partner" ? "Partner" : "Shortlist"} · {a.shared ? `freigegeben · Kunde: ${CUSTOMER_STATUS_LABEL[a.customerStatus]}` : "nicht freigegeben"} · {PROJECT_STATUS_LABEL[a.status]}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted">Keinem Projekt zugewiesen.</p>}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="!text-xl">Ähnliche Einträge</h2>
          <p className="mt-1 text-sm text-muted">Gleiche Angebotskategorie. Verbindungen zu Investoren und Bewerbungen schlägt später der Netzwerk-Manager vor.</p>
          {similar.length ? (
            <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
              {similar.map((r) => (
                <li key={r.member.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2">
                  <Link href={`/admin/netzwerk/${r.member.id}`}>{r.member.name}</Link>
                  <span className="flex flex-wrap gap-1">{r.categoryIds.filter((c) => row.categoryIds.includes(c)).map((c) => <Tag key={c}>{catName.get(c)}</Tag>)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted">Keine Einträge mit gleicher Kategorie.</p>}
        </Card>
      </div>
    );
  } else if (tab.key === "kontakt") {
    const viewer = await getViewer();
    const [orgs, customerOrgs] = await Promise.all([viewer ? getProjectsRepo(viewer).then((r) => r.orgs()).catch(() => []) : [], repo.customerOrgs()]);
    const rowsPriv: [string, ReactNode][] = [
      ["Ansprechperson", [priv.contactName, priv.contactRole].filter(Boolean).join(", ") || null],
      ["E-Mail (geschäftlich)", priv.contactEmail],
      ["Preise", priv.pricing],
      ["Pitchdeck", priv.pitchDeckUrl ? <a href={priv.pitchDeckUrl} target="_blank" rel="noreferrer">öffnen</a> : null],
      ["Notiz Redaktion", priv.notes],
    ];
    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <p role="note" className="rounded-xl border border-line bg-sunk p-3 text-sm">🔒 Nur für die Redaktion. Kunden sehen das erst, wenn ihr es im Projekt freigebt.</p>
          <dl className="mt-4 grid grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            {rowsPriv.map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="m-0 text-ink">{v ?? <span className="text-muted">–</span>}</dd></Fragment>)}
          </dl>
          <Link href={`/admin/netzwerk/${id}?reiter=bearbeiten`} className={`${btn.ghost} mt-4`}>Bearbeiten</Link>
        </Card>
        <Card>
          <CustomerOrgSelect memberId={id} orgId={customerOrgs.get(id) ?? null} orgs={orgs.filter((o) => !o.isInternal).map((o) => ({ id: o.id, name: o.name }))} />
        </Card>
      </div>
    );
  } else if (tab.key === "verlauf") {
    const venture = await getVentureRepo();
    const [candidates, challenges, suggestions] = await Promise.all([venture.candidates(), venture.challenges(), repo.suggestions()]);
    const title = new Map(challenges.map((c) => [c.id, c.title]));
    const events = [
      { at: m.createdAt, text: `Angelegt (Quelle: ${SOURCE_LABEL[m.source]})` },
      ...candidates.filter((c) => c.startupId === id).flatMap((c) => [
        { at: c.createdAt, text: `Vom Agenten für „${title.get(c.challengeId) ?? "Challenge"}“ vorgeschlagen` },
        ...(c.decidedAt ? [{ at: c.decidedAt, text: `Redaktion: ${CANDIDATE_STATUS_LABEL[c.status]}` }] : []),
      ]),
      ...suggestions.filter((s) => s.memberId === id || ((s.payload.member_ids as string[] | undefined) ?? []).includes(id)).map((s) => ({
        at: s.decidedAt ?? s.createdAt, text: `Netzwerk-Manager: ${SUGGESTION_KIND_LABEL[s.kind]} – ${s.title} (${{ pending: "offen", accepted: "übernommen", adjusted: "angepasst übernommen", dismissed: "verworfen" }[s.status]})`,
      })),
      { at: m.updatedAt, text: "Zuletzt gepflegt" },
    ].sort((a, b) => b.at.localeCompare(a.at));
    body = (
      <Card>
        <ul className="flex flex-col gap-2 text-sm">
          {events.map((e, i) => <li key={i} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3"><span className="text-muted">{formatDate(e.at)}</span>{e.text}</li>)}
        </ul>
      </Card>
    );
  } else {
    body = <StartupEditor startup={m} priv={priv} trends={trends.map((t) => ({ number: t.number, name: t.name }))} />;
  }

  const typeLabel = m.partnerTypes.map((t) => PARTNER_TYPE_LABEL[t]).join(" + ") + (m.isStartup ? " · Startup" : "");
  return (
    <>
      <nav aria-label="Pfad" className="text-sm text-muted">
        <Link href="/admin/netzwerk">Netzwerk-Datenbank</Link> › {PARTNER_TYPE_LABEL[m.partnerTypes[0]]}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-3xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[var(--radius-pill)] border border-line px-2.5 py-0.5 text-xs font-bold text-ink">{typeLabel}</span>
            <StatusBadge status={m.status} />
            {m.approved && <Seal />}
          </div>
          <h1 className="!text-[clamp(28px,3vw,40px)]">{m.name}</h1>
          {(m.tagline ?? m.solution) && <p className="max-w-[70ch] text-text">{m.tagline ?? m.solution}</p>}
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/netzwerk/${id}?reiter=bearbeiten`} className={btn.ghost}>Bearbeiten</Link>
            <Link href="/admin/venture" className={btn.primary} title="Matching gegen Challenges folgt mit Schritt 5">Mit Challenge abgleichen</Link>
          </div>
          <VisibilitySwitch id={id} published={m.published} canPublish={m.status === "qualified"} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-xs text-muted">Klassifizierung:</span>
        {row.categoryIds.map((c) => <Tag key={c}>{catName.get(c)}</Tag>)}
        <TrendTags numbers={row.trends} trends={trendMap} />
        {m.stage && <Tag>Reifegrad: {MATURITY_LABEL[m.stage]}</Tag>}
        {m.region && <Tag>{REGION_LABEL[m.region]}</Tag>}
        {m.founded && <Tag>gegründet {m.founded}</Tag>}
        {m.website && <a href={m.website} target="_blank" rel="noreferrer" className="text-xs">{m.domain ?? m.website}</a>}
      </div>
      <nav aria-label="Reiter" className="flex flex-wrap gap-1.5 border-b border-line pb-3">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "angebot" ? `/admin/netzwerk/${id}` : `/admin/netzwerk/${id}?reiter=${t.key}`} aria-current={tab.key === t.key ? "page" : undefined}
            className={`rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-bold no-underline ${tab.key === t.key ? "bg-ink text-bg" : "text-ink hover:bg-sunk"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
      {body ?? <Empty>–</Empty>}
    </>
  );
}
