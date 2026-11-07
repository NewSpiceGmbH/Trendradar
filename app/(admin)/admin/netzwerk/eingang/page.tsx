import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense, type ReactNode } from "react";
import { ApplicationsNotice } from "@/components/admin/applications-notice";
import { ApplicationActions, ChangeActions, PitchDeckButton } from "@/components/admin/inbox";
import { Badge, Card, Empty, PageHead, formatDate, timeAgo } from "@/components/admin/ui";
import { precheckFlags } from "@/lib/applications/precheck";
import { ApplicationsMissingError, getApplicationsRepo } from "@/lib/applications/store";
import {
  APPLICATION_STATUS_LABEL, AUTO_APPLY_FIELDS, CHANGE_FIELD_LABEL, CHANGE_STATUS_LABEL, HOLD_REASON_LABEL, KIND_LABEL, acceptDefaults, kindOf,
  type Application, type ChangeRequest,
} from "@/lib/applications/types";
import { getViewer } from "@/lib/auth/viewer";
import { mailConfigured } from "@/lib/mail/send";
import { getNetworkRepo } from "@/lib/network/store";
import { DETAIL_FIELDS, PARTNER_TYPE_LABEL } from "@/lib/network/types";
import { getProjectsRepo } from "@/lib/projects/store";
import type { Project } from "@/lib/projects/types";
import { MATURITY_LABEL } from "@/lib/venture/types";

export const metadata: Metadata = { title: "Eingang · Netzwerk" };

export default function InboxPage(props: PageProps<"/admin/netzwerk/eingang">) {
  return (
    <Suspense fallback={<p className="text-muted">Eingang wird geladen …</p>}>
      <Inbox searchParams={props.searchParams} />
    </Suspense>
  );
}

type Kind = "bewerbung" | "empfehlung" | "aenderung" | "anfrage";
const KIND_TEXT: Record<Kind, string> = { bewerbung: "Bewerbung", empfehlung: "Empfehlung", aenderung: "Änderung", anfrage: "Kundenanfrage" };
interface Item { key: string; kind: Kind; who: string; what: string; status: string; at: string; done: boolean; held: boolean; href: string; due?: string | null }

const VIEWS = [
  { key: "offen", label: "Offen" },
  { key: "hold", label: "On hold" },
  { key: "erledigt", label: "Erledigt" },
] as const;

async function Inbox({ searchParams }: { searchParams: PageProps<"/admin/netzwerk/eingang">["searchParams"] }) {
  const q = await searchParams;
  const view = VIEWS.find((v) => v.key === q.zeige) ?? VIEWS[0];
  const selected = typeof q.id === "string" ? q.id : null;
  const head = (
    <PageHead eyebrow="Netzwerk" title="Eingang">
      Bewerbungen, Empfehlungen von Partnern, Änderungswünsche von Solution Providern und Anfragen von Kunden. Die Ansicht nach Themen folgt mit dem Netzwerk-Manager.
    </PageHead>
  );
  const viewer = (await getViewer())!;
  const repo = await getApplicationsRepo();
  const loaded = await Promise.all([repo.applications(), repo.changeRequests()]).catch((e) => {
    if (e instanceof ApplicationsMissingError) return e;
    throw e;
  });
  if (loaded instanceof ApplicationsMissingError) return <>{head}<ApplicationsNotice detail={loaded.message} /></>;
  const [apps, changes] = loaded;
  const projects = await getProjectsRepo(viewer).then((r) => r.projects()).catch(() => [] as Project[]);
  const today = new Date().toISOString().slice(0, 10);

  const items: Item[] = [
    ...apps.filter((a) => a.status !== "unconfirmed").map((a) => ({
      key: `app:${a.id}`, kind: (a.source === "partner" ? "empfehlung" : "bewerbung") as Kind, who: a.orgName,
      what: `${PARTNER_TYPE_LABEL[a.partnerType]}${a.message ? ` · ${a.message}` : ""}`, status: APPLICATION_STATUS_LABEL[a.status], at: a.createdAt,
      done: a.status === "accepted" || a.status === "rejected", held: a.status === "on_hold", href: `?id=app:${a.id}`, due: a.holdUntil,
    })),
    ...changes.map((c) => ({
      key: `cr:${c.id}`, kind: "aenderung" as Kind, who: c.memberName ?? "Eintrag", what: `${CHANGE_FIELD_LABEL[c.field]}: ${c.newValue}`,
      status: CHANGE_STATUS_LABEL[c.status], at: c.createdAt, done: c.status !== "open", held: false, href: `?id=cr:${c.id}`,
    })),
    ...projects.filter((p) => p.status === "requested").map((p) => ({
      key: `pr:${p.id}`, kind: "anfrage" as Kind, who: p.orgName ?? "Kunde", what: p.title, status: "Neu", at: p.createdAt, done: false, held: false,
      href: `/admin/projekte/${p.id}`,
    })),
  ];
  const list = items
    .filter((i) => (view.key === "erledigt" ? i.done : view.key === "hold" ? i.held : !i.done && !i.held) || (view.key === "offen" && i.held && i.due != null && i.due <= today))
    .sort((a, b) => b.at.localeCompare(a.at));
  const counts = { offen: items.filter((i) => !i.done && (!i.held || (i.due != null && i.due <= today))).length, hold: items.filter((i) => i.held).length };
  const unconfirmed = apps.filter((a) => a.status === "unconfirmed").length;
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const z = patch.zeige !== undefined ? patch.zeige : view.key !== "offen" ? view.key : null;
    if (z && z !== "offen") p.set("zeige", z);
    if (patch.id) p.set("id", patch.id);
    const s = p.toString();
    return s ? `/admin/netzwerk/eingang?${s}` : "/admin/netzwerk/eingang";
  };

  let detail: ReactNode = <Empty>Eintrag links auswählen.</Empty>;
  if (selected?.startsWith("app:")) {
    const a = apps.find((x) => x.id === selected.slice(4));
    if (a) detail = await ApplicationDetail({ a });
  } else if (selected?.startsWith("cr:")) {
    const c = changes.find((x) => x.id === selected.slice(3));
    if (c) detail = <ChangeDetail c={c} />;
  }

  return (
    <>
      {head}
      <nav aria-label="Ansicht" className="flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => (
          <Link key={v.key} href={qs({ zeige: v.key, id: null })} aria-current={view.key === v.key ? "page" : undefined}
            className={`rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-bold no-underline ${view.key === v.key ? "bg-ink text-bg" : "border border-line text-ink hover:bg-sunk"}`}>
            {v.label}{v.key !== "erledigt" ? ` · ${counts[v.key]}` : ""}
          </Link>
        ))}
        {unconfirmed > 0 && <span className="text-xs text-muted">{unconfirmed} warten noch auf die Bestätigung ihrer E-Mail-Adresse</span>}
      </nav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="!p-0 self-start">
          {list.length ? (
            <ul className="divide-y divide-line">
              {list.map((i) => {
                const active = selected === i.key.replace(/^pr:.*/, "");
                const overdue = i.held && i.due != null && i.due <= today;
                return (
                  <li key={i.key}>
                    <Link href={i.href.startsWith("?") ? qs({ id: i.key }) : i.href} aria-current={active ? "true" : undefined}
                      className={`flex flex-col gap-1 px-4 py-3 text-ink no-underline hover:bg-sunk ${active ? "bg-sunk" : ""}`}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted">{KIND_TEXT[i.kind]}</span>
                        <span className="text-xs text-muted">{timeAgo(i.at)}</span>
                      </span>
                      <b>{i.who}</b>
                      <span className="line-clamp-2 text-sm text-text">{i.what}</span>
                      <span className="flex flex-wrap gap-1.5 text-xs">
                        <Badge tone="muted">{i.status}</Badge>
                        {i.held && i.due && <span className={overdue ? "font-bold text-alert" : "text-muted"}>Wiedervorlage {new Date(i.due).toLocaleDateString("de-DE")}{overdue ? " · fällig" : ""}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <div className="p-6"><Empty>{view.key === "offen" ? "Alles erledigt." : "Nichts hier."}</Empty></div>}
        </Card>
        <section aria-label="Details" className="flex min-w-0 flex-col gap-4">{detail}</section>
      </div>
    </>
  );
}

async function ApplicationDetail({ a }: { a: Application }) {
  const categories = await getNetworkRepo().then((r) => r.categories()).catch(() => []);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const flags = a.precheck ? precheckFlags(a.precheck) : null;
  const kind = kindOf(a.partnerType);
  const rows: [string, ReactNode][] = [
    ["Partner-Typ", PARTNER_TYPE_LABEL[a.partnerType]],
    ["Ansprechperson", [a.contactName, a.contactRole].filter(Boolean).join(", ") || null],
    ["E-Mail", <a key="m" href={`mailto:${a.email}`}>{a.email}</a>],
    ["Website", a.website ? <a key="w" href={a.website} target="_blank" rel="noreferrer noopener">{a.website}</a> : null],
    ["Gründungsjahr", a.founded],
    ...DETAIL_FIELDS[a.partnerType].map((f) => [f.label, a.details[f.key] ?? null] as [string, ReactNode]),
    ["Angebot", a.offer],
    ["Kategorien", a.offerCategoryIds.map((id) => catName.get(id)).filter(Boolean).join(", ") || null],
    ["Reifegrad", a.maturity ? MATURITY_LABEL[a.maturity] : null],
    ["Referenzen", a.referencesText],
    ["Eingegangen", `${formatDate(a.createdAt)}${a.source === "partner" ? " · Empfehlung eines Partners" : a.emailConfirmedAt ? " · E-Mail bestätigt" : ""}`],
  ];
  return (
    <>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{a.source === "partner" ? "Empfehlung" : "Bewerbung"}</Badge>
          <Badge tone="muted">{APPLICATION_STATUS_LABEL[a.status]}</Badge>
          {a.status === "on_hold" && a.holdReason && <span className="text-xs text-muted">{HOLD_REASON_LABEL[a.holdReason]} · Wiedervorlage {a.holdUntil ? new Date(a.holdUntil).toLocaleDateString("de-DE") : "–"}</span>}
        </div>
        <h2 className="!text-3xl">{a.orgName}</h2>
        {a.message && <blockquote className="border-l-2 border-line pl-3 text-text">{a.message}</blockquote>}
        <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          {rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="m-0 whitespace-pre-line text-ink">{v}</dd></Fragment>)}
        </dl>
        {a.pitchDeckPath && <PitchDeckButton path={a.pitchDeckPath} />}
      </Card>
      {flags && (
        <Card className={`flex flex-col gap-2 border-l-4 ${flags.ok ? "!border-l-ok" : "!border-l-warn"}`}>
          <p className="eyebrow !text-muted">Vorprüfung · entscheidet nicht</p>
          <p className="text-sm font-bold text-ink">{flags.ok ? "✓ Nichts Auffälliges" : "◷ Bitte genauer ansehen"}</p>
          {!flags.ok && <ul className="list-disc pl-5 text-sm">{flags.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          <p className="text-xs text-muted">
            Website {a.precheck!.website === "ok" ? "erreichbar" : a.precheck!.website === "none" ? "nicht angegeben" : "nicht erreichbar"} ·
            {" "}E-Mail-Domain {a.precheck!.emailDomainMatch == null ? "nicht prüfbar" : a.precheck!.emailDomainMatch ? "passt zur Website" : "passt nicht"} ·
            {" "}{a.precheck!.duplicates.length ? `${a.precheck!.duplicates.length} mögliche Dublette(n)` : "keine Dubletten"}
          </p>
        </Card>
      )}
      <ApplicationActions key={a.id} id={a.id} defaults={acceptDefaults(a)} kindLabel={KIND_LABEL[kind]} customer={kind === "customer"} mailReady={mailConfigured()}
        closed={a.status === "accepted"
          ? <>Angenommen {formatDate(a.decidedAt)}. {a.memberId && <Link href={`/admin/netzwerk/${a.memberId}`}>Zum Eintrag →</Link>}</>
          : a.status === "rejected"
            ? <>Abgelehnt {formatDate(a.decidedAt)}.{a.decisionNote && <span className="mt-2 block whitespace-pre-line text-muted">{a.decisionNote}</span>}</>
            : null} />
    </>
  );
}

function ChangeDetail({ c }: { c: ChangeRequest }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2"><Badge>Änderung</Badge><Badge tone="muted">{CHANGE_STATUS_LABEL[c.status]}</Badge></div>
      <h2 className="!text-3xl"><Link href={`/admin/netzwerk/${c.memberId}`} className="no-underline">{c.memberName ?? "Eintrag"}</Link></h2>
      <p className="text-sm text-muted">Feld: <b className="text-ink">{CHANGE_FIELD_LABEL[c.field]}</b> · {formatDate(c.createdAt)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3"><p className="eyebrow !text-muted">Vorher</p><p className="mt-1 whitespace-pre-line text-sm">{c.oldValue ?? "–"}</p></div>
        <div className="rounded-xl border border-ink p-3"><p className="eyebrow !text-muted">Nachher</p><p className="mt-1 whitespace-pre-line text-sm text-ink">{c.newValue}</p></div>
      </div>
      {c.comment && <p className="text-sm">Kommentar: {c.comment}</p>}
      <ChangeActions key={c.id} cr={c} autoApply={AUTO_APPLY_FIELDS.includes(c.field)}
        closed={c.status === "open" ? null : `Entschieden ${formatDate(c.decidedAt)}${c.decisionNote ? ` · ${c.decisionNote}` : ""}`} />
    </Card>
  );
}
