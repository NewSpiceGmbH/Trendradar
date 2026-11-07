import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Fragment, Suspense, type ReactNode } from "react";
import { ChangeRequestForm } from "@/components/app/network-forms";
import { Seal, Tag } from "@/components/admin/network-parts";
import { Badge, Card, Empty, formatDate } from "@/components/admin/ui";
import { getApplicationsRepo } from "@/lib/applications/store";
import { CHANGE_FIELD_LABEL, CHANGE_STATUS_LABEL, type ChangeRequest } from "@/lib/applications/types";
import { getViewer } from "@/lib/auth/viewer";
import { getNetworkRepo } from "@/lib/network/store";
import { PARTNER_TYPE_LABEL } from "@/lib/network/types";
import { MATURITY_LABEL } from "@/lib/venture/types";

export const metadata: Metadata = { title: "Mein Profil" };

export default function ProfilePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-8">
      <Suspense fallback={<p className="text-muted">Profil wird geladen …</p>}>
        <Profile />
      </Suspense>
    </main>
  );
}

/** Solution Provider: eigenes Profil nur lesend; Änderungen laufen als Anfrage über die Redaktion */
async function Profile() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.providerMemberId) redirect("/radar");
  const id = viewer.providerMemberId;
  const repo = await getNetworkRepo();
  const [found, offers, references, categories] = await Promise.all([repo.member(id), repo.offers(id), repo.references(id), repo.categories()]);
  if (!found) return <Empty>Ihr Profil ist noch nicht freigeschaltet. Ihre Ansprechperson bei New Spice hilft weiter.</Empty>;
  const changes = await getApplicationsRepo().then((r) => r.changeRequests()).then((c) => c.filter((x) => x.memberId === id)).catch(() => [] as ChangeRequest[]);
  const { member: m, priv } = found;
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const rows: [string, ReactNode][] = [
    ["Website", m.website ? <a href={m.website} target="_blank" rel="noreferrer noopener">{m.website}</a> : null],
    ["Gründungsjahr", m.founded],
    ["Reifegrad", m.stage ? MATURITY_LABEL[m.stage] : null],
    ["Ansprechperson", [priv.contactName, priv.contactRole, priv.contactEmail].filter(Boolean).join(", ") || null],
  ];
  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Mein Profil im Netzwerk von New Spice</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{m.partnerTypes.map((t) => PARTNER_TYPE_LABEL[t]).join(" + ")}{m.isStartup ? " · Startup" : ""}</Badge>
          {m.approved && <Seal />}
          <Badge tone="muted">{m.published ? "öffentlich im Netzwerk" : "nur für New Spice sichtbar"}</Badge>
        </div>
        <h1 className="!text-[clamp(32px,4vw,48px)]">{m.name}</h1>
        {(m.tagline ?? m.solution) && <p className="max-w-2xl text-lg">{m.tagline ?? m.solution}</p>}
        <p className="text-sm text-muted">Ihr Profil pflegt die Redaktion von New Spice. Änderungen fragen Sie unten an.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Card>
            <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="m-0 text-ink">{v}</dd></Fragment>)}
            </dl>
          </Card>
          <Card>
            <h2 className="!text-xl">Angebot</h2>
            {offers.length ? (
              <ul className="mt-3 flex flex-col gap-3">
                {offers.map((o) => (
                  <li key={o.id} className="flex flex-col gap-1">
                    <b className="text-ink">{o.title}</b>
                    {o.description && o.description !== o.title && <p className="text-sm">{o.description}</p>}
                    <span className="flex flex-wrap gap-1">{o.categoryIds.map((c) => <Tag key={c}>{catName.get(c)}</Tag>)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted">Noch kein Angebot erfasst.</p>}
          </Card>
          <Card>
            <h2 className="!text-xl">Referenzen</h2>
            {references.length ? (
              <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
                {references.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span><b className="text-ink">{r.client}</b>{r.period && ` · ${r.period}`}{r.result && ` · ${r.result}`}</span>
                    <span className="text-xs text-muted">{r.published ? "für Kunden sichtbar" : "nur intern"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted">Noch keine Referenzen erfasst.</p>}
          </Card>
        </div>
        <aside className="flex flex-col gap-6">
          <Card>
            <h2 className="!text-xl">Änderung anfragen</h2>
            <div className="mt-3">
              <ChangeRequestForm current={{ name: m.name, website: m.website, tagline: m.tagline, solution: m.solution, contact: [priv.contactName, priv.contactEmail].filter(Boolean).join(", ") || null }} />
            </div>
          </Card>
          {changes.length > 0 && (
            <Card>
              <h2 className="!text-lg">Ihre Anfragen</h2>
              <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
                {changes.map((c) => (
                  <li key={c.id} className="flex flex-col gap-0.5 py-2">
                    <span className="flex justify-between gap-2"><b className="text-ink">{CHANGE_FIELD_LABEL[c.field]}</b><span className="text-xs text-muted">{CHANGE_STATUS_LABEL[c.status]}</span></span>
                    <span className="line-clamp-2">{c.newValue}</span>
                    <span className="text-xs text-muted">{formatDate(c.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
