"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createMember, decideSuggestion, deleteOffer, deleteReference, runCategoriesNow, saveCategory, saveCustomerOrg, saveInterests, saveOffer,
  saveReference, setPublished,
} from "@/lib/network/actions";
import {
  MEMBER_STATUS_LABEL, PARTNER_TYPE_HINT, PARTNER_TYPE_LABEL, PARTNER_TYPES, SUGGESTION_KIND_LABEL, suggestStartup,
  type CategoryPayload, type MemberReference, type MemberStatus, type Offer, type OfferCategory, type PartnerType, type Suggestion,
} from "@/lib/network/types";
import { Label, Toggles } from "./form";
import { TrendTags, type TrendInfo } from "./network-parts";
import { Card, btn, input } from "./ui";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-sm ${m.ok ? "text-ink" : "text-alert"}`}>{m.text}</p> : null);
const parseTrends = (s: string, known: Map<number, TrendInfo>) =>
  [...new Set(s.split(/[,\s#]+/).map(Number).filter((n) => known.has(n)))].sort((a, b) => a - b);

/** Aktion ausführen, Meldung zeigen, Seite neu laden */
function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Gespeichert." });
      after?.();
      router.refresh();
    });
  return { msg, busy, run };
}

// ───────────────────────── Netzwerk-Manager ─────────────────────────

export function SuggestionCard({ s, trends, memberNames }: { s: Suggestion; trends: TrendInfo[]; memberNames: Record<string, string> }) {
  const known = new Map(trends.map((t) => [t.number, t]));
  const { msg, busy, run } = useAction();
  const p = s.payload as unknown as Partial<CategoryPayload>;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name ?? "");
  const [desc, setDesc] = useState(p.description ?? "");
  const [trendText, setTrendText] = useState((p.trend_numbers ?? []).join(", "));
  const isCategory = s.kind === "category";
  const members = (p.member_ids ?? []).map((id) => memberNames[id]).filter(Boolean);

  return (
    <li className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line p-3">
      <p className="eyebrow !text-[11px] !text-muted">{SUGGESTION_KIND_LABEL[s.kind]}</p>
      <p className="text-sm font-bold text-ink">{s.title}</p>
      <p className="text-sm">{s.rationale}</p>
      {isCategory && !editing && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {p.description && <span className="w-full">{p.description}</span>}
          <TrendTags numbers={p.trend_numbers ?? []} trends={known} />
          {members.length > 0 && <span>· {members.join(", ")}</span>}
        </div>
      )}
      {editing && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1"><Label htmlFor={`sg-n-${s.id}`}>Name</Label><input id={`sg-n-${s.id}`} value={name} onChange={(e) => setName(e.target.value)} className={input} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`sg-d-${s.id}`}>Beschreibung</Label><input id={`sg-d-${s.id}`} value={desc} onChange={(e) => setDesc(e.target.value)} className={input} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`sg-t-${s.id}`}>Trends (Nummern)</Label><input id={`sg-t-${s.id}`} value={trendText} onChange={(e) => setTrendText(e.target.value)} className={input} /></div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <button type="button" disabled={busy} className={btn.primary}
              onClick={() => run(() => decideSuggestion(s.id, "adjust", { name, description: desc || null, trend_numbers: parseTrends(trendText, known), member_ids: p.member_ids ?? [] }))}>
              Angepasst übernehmen
            </button>
            <button type="button" disabled={busy} className={btn.ghost} onClick={() => setEditing(false)}>Abbrechen</button>
          </>
        ) : (
          <>
            {isCategory && <button type="button" disabled={busy} className={btn.primary} onClick={() => run(() => decideSuggestion(s.id, "accept"))}>Übernehmen</button>}
            {isCategory && <button type="button" disabled={busy} className={btn.ghost} onClick={() => setEditing(true)}>Anpassen</button>}
            <button type="button" disabled={busy} className={btn.danger} onClick={() => run(() => decideSuggestion(s.id, "dismiss"))}>Verwerfen</button>
          </>
        )}
      </div>
      <Note m={msg} />
    </li>
  );
}

export function RunCategoriesButton() {
  const { msg, busy, run } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={busy} className={btn.ghost} onClick={() => run(runCategoriesNow)}>
        {busy ? "Startet …" : "Kategorienliste vorschlagen"}
      </button>
      <Note m={msg} />
    </div>
  );
}

// ───────────────────────── Eintrag ─────────────────────────

export function VisibilitySwitch({ id, published, canPublish }: { id: string; published: boolean; canPublish: boolean }) {
  const { msg, busy, run } = useAction();
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex items-center gap-2 text-sm text-muted" role="group" aria-label="Sichtbarkeit">
        Sichtbarkeit
        <span className="inline-flex rounded-[var(--radius-pill)] border border-line p-0.5">
          {[false, true].map((v) => (
            <button key={String(v)} type="button" aria-pressed={published === v} disabled={busy || (v && !canPublish)}
              onClick={() => published !== v && run(() => setPublished(id, v))}
              className={`rounded-[var(--radius-pill)] px-3 py-1 text-xs font-bold disabled:opacity-40 ${published === v ? "bg-ink text-bg" : "text-ink"}`}>
              {v ? "öffentlich" : "nur intern"}
            </button>
          ))}
        </span>
      </div>
      {!canPublish && !published && <p className="text-xs text-muted">Öffentlich erst, wenn der Eintrag aufgenommen ist.</p>}
      <Note m={msg} />
    </div>
  );
}

function CategoryPicker({ id, categories, value, onChange, label }: { id: string; categories: OfferCategory[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  const options = Object.fromEntries(categories.filter((c) => !c.archived || value.includes(c.id)).map((c) => [c.id, c.name])) as Record<string, string>;
  if (!Object.keys(options).length) return <p id={id} className="text-xs text-muted">Noch keine Angebotskategorien angelegt.</p>;
  return <Toggles label={label} options={options} value={value} onChange={onChange} />;
}

function OfferForm({ memberId, offer, categories, trends, onDone }: {
  memberId: string; offer: Offer | null; categories: OfferCategory[]; trends: Map<number, TrendInfo>; onDone?: () => void;
}) {
  const { msg, busy, run } = useAction();
  const [title, setTitle] = useState(offer?.title ?? "");
  const [desc, setDesc] = useState(offer?.description ?? "");
  const [cats, setCats] = useState<string[]>(offer?.categoryIds ?? []);
  const fid = offer?.id ?? "neu";
  const derived = [...new Set(categories.filter((c) => cats.includes(c.id) && !c.archived).flatMap((c) => c.trendNumbers))].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1"><Label htmlFor={`of-t-${fid}`}>Produkt / Leistung</Label><input id={`of-t-${fid}`} value={title} onChange={(e) => setTitle(e.target.value)} className={input} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor={`of-d-${fid}`}>Beschreibung</Label><textarea id={`of-d-${fid}`} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} className={input} /></div>
      <CategoryPicker id={`of-c-${fid}`} label="Angebotskategorien" categories={categories} value={cats} onChange={setCats} />
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">Trends über die Kategorien: <TrendTags numbers={derived} trends={trends} /></p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={btn.primary}
          onClick={() => run(() => saveOffer(offer?.id ?? null, memberId, { title, description: desc || null, categoryIds: cats }), () => {
            if (!offer) { setTitle(""); setDesc(""); setCats([]); }
            onDone?.();
          })}>
          {offer ? "Angebot speichern" : "Angebot hinzufügen"}
        </button>
        {offer && <button type="button" disabled={busy} className={btn.danger} onClick={() => run(() => deleteOffer(offer.id))}>Entfernen</button>}
      </div>
      <Note m={msg} />
    </div>
  );
}

export function OffersEditor({ memberId, offers, categories, trends }: { memberId: string; offers: Offer[]; categories: OfferCategory[]; trends: TrendInfo[] }) {
  const known = new Map(trends.map((t) => [t.number, t]));
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(offers.length === 0);
  const name = new Map(categories.map((c) => [c.id, c]));
  return (
    <section aria-labelledby="angebot-h" className="flex flex-col gap-3">
      <h2 id="angebot-h" className="!text-xl">Angebot</h2>
      {offers.map((o) => (
        <Card key={o.id} className="!p-4">
          {open === o.id ? (
            <OfferForm memberId={memberId} offer={o} categories={categories} trends={known} onDone={() => setOpen(null)} />
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <b className="text-ink">{o.title}</b>
                <button type="button" className="text-xs font-bold text-ink underline" onClick={() => setOpen(o.id)} aria-label={`${o.title} bearbeiten`}>Bearbeiten</button>
              </div>
              {o.description && <p className="text-sm">{o.description}</p>}
              <div className="flex flex-wrap items-center gap-1">
                {o.categoryIds.map((id) => name.get(id)).filter(Boolean).map((c) => <span key={c!.id} className="rounded-[var(--radius-pill)] bg-sunk px-2 py-0.5 text-xs text-ink">{c!.name}</span>)}
                <TrendTags numbers={[...new Set(o.categoryIds.flatMap((id) => (name.get(id) && !name.get(id)!.archived ? name.get(id)!.trendNumbers : [])))].sort((a, b) => a - b)} trends={known} />
              </div>
            </div>
          )}
        </Card>
      ))}
      {adding ? (
        <Card className="!p-4"><OfferForm memberId={memberId} offer={null} categories={categories} trends={known} /></Card>
      ) : (
        <button type="button" className={`${btn.ghost} self-start`} onClick={() => setAdding(true)}>+ Angebot</button>
      )}
    </section>
  );
}

function ReferenceForm({ memberId, r, onDone }: { memberId: string; r: MemberReference | null; onDone?: () => void }) {
  const { msg, busy, run } = useAction();
  const [d, setD] = useState({ client: r?.client ?? "", period: r?.period ?? "", result: r?.result ?? "", url: r?.url ?? "", published: r?.published ?? false });
  const fid = r?.id ?? "neu";
  const f = (k: "client" | "period" | "result" | "url", label: string, ph = "") => (
    <div className="flex flex-col gap-1"><Label htmlFor={`rf-${k}-${fid}`}>{label}</Label>
      <input id={`rf-${k}-${fid}`} value={d[k]} placeholder={ph} onChange={(e) => setD((x) => ({ ...x, [k]: e.target.value }))} className={input} /></div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">{f("client", "Wo / bei wem", "Arena Süd")}{f("period", "Zeitraum", "Pilot 2025")}{f("result", "Ergebnis", "−40 % Wartezeit")}</div>
      {f("url", "Quelle (Link)", "https://…")}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={d.published} onChange={(e) => setD((x) => ({ ...x, published: e.target.checked }))} />
        Für Kunden freigeben (sichtbar, wenn der Eintrag öffentlich oder einem Projekt zugewiesen ist)
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={btn.primary}
          onClick={() => run(() => saveReference(r?.id ?? null, memberId, { ...d, period: d.period || null, result: d.result || null, url: d.url || null }), () => {
            if (!r) setD({ client: "", period: "", result: "", url: "", published: false });
            onDone?.();
          })}>
          {r ? "Referenz speichern" : "Referenz hinzufügen"}
        </button>
        {r && <button type="button" disabled={busy} className={btn.danger} onClick={() => run(() => deleteReference(r.id))}>Entfernen</button>}
      </div>
      <Note m={msg} />
    </div>
  );
}

export function ReferencesEditor({ memberId, references }: { memberId: string; references: MemberReference[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="ref-h" className="flex flex-col gap-3">
      <h2 id="ref-h" className="!text-xl">Referenzen</h2>
      {references.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-card)] border border-line">
          {references.map((r) => (
            <li key={r.id} className="p-3">
              {open === r.id ? <ReferenceForm memberId={memberId} r={r} onDone={() => setOpen(null)} /> : (
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span><b className="text-ink">{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.client}</a> : r.client}</b>
                    {r.period && <span className="text-muted"> · {r.period}</span>}{r.result && <> · {r.result}</>}</span>
                  <span className="flex items-center gap-3 text-xs">
                    <span className="text-muted">{r.published ? "freigegeben" : "nur intern"}</span>
                    <button type="button" className="font-bold text-ink underline" onClick={() => setOpen(r.id)} aria-label={`Referenz ${r.client} bearbeiten`}>Bearbeiten</button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">Noch keine Referenzen.</p>}
      {adding ? <Card className="!p-4"><ReferenceForm memberId={memberId} r={null} /></Card>
        : <button type="button" className={`${btn.ghost} self-start`} onClick={() => setAdding(true)}>+ Referenz</button>}
    </section>
  );
}

export function InterestsEditor({ memberId, value, categories }: { memberId: string; value: string[]; categories: OfferCategory[] }) {
  const { msg, busy, run } = useAction();
  const [v, setV] = useState(value);
  return (
    <section aria-labelledby="int-h" className="flex flex-col gap-3">
      <h2 id="int-h" className="!text-xl">Interessen</h2>
      <p className="text-sm text-muted">Angebotskategorien, nach denen das Mitglied sucht. Nur für die Redaktion.</p>
      <CategoryPicker id="int-cats" label="Sucht" categories={categories} value={v} onChange={setV} />
      <button type="button" disabled={busy} className={`${btn.primary} self-start`} onClick={() => run(() => saveInterests(memberId, v))}>Interessen speichern</button>
      <Note m={msg} />
    </section>
  );
}

export function CustomerOrgSelect({ memberId, orgId, orgs }: { memberId: string; orgId: string | null; orgs: { id: string; name: string }[] }) {
  const { msg, busy, run } = useAction();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="nw-org">Beziehung „Kunde“ (nur Redaktion)</Label>
      <select id="nw-org" disabled={busy} defaultValue={orgId ?? ""} className={input} onChange={(e) => run(() => saveCustomerOrg(memberId, e.target.value || null))}>
        <option value="">– kein Kunde –</option>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <Note m={msg} />
    </div>
  );
}

// ───────────────────────── Kategorien ─────────────────────────

export function CategoryRow({ c, count, trends }: { c: OfferCategory | null; count?: number; trends: TrendInfo[] }) {
  const known = new Map(trends.map((t) => [t.number, t]));
  const { msg, busy, run } = useAction();
  const [editing, setEditing] = useState(!c);
  const [name, setName] = useState(c?.name ?? "");
  const [desc, setDesc] = useState(c?.description ?? "");
  const [trendText, setTrendText] = useState(c?.trendNumbers.join(", ") ?? "");
  const fid = c?.id ?? "neu";
  if (!editing && c) {
    return (
      <li className="grid gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
        <span className="flex min-w-0 flex-col">
          <b className={c.archived ? "text-muted line-through" : "text-ink"}>{c.name}</b>
          {c.description && <span className="text-xs text-muted">{c.description}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted"><TrendTags numbers={c.trendNumbers} trends={known} /> · {count ?? 0} Einträge</span>
        <span className="flex gap-3 text-xs">
          <button type="button" className="font-bold text-ink underline" onClick={() => setEditing(true)} aria-label={`${c.name} bearbeiten`}>Bearbeiten</button>
          <button type="button" disabled={busy} className="font-bold text-ink underline"
            onClick={() => run(() => saveCategory(c.id, { ...c, archived: !c.archived }))}>{c.archived ? "Wiederherstellen" : "Archivieren"}</button>
        </span>
        <span className="sm:col-span-3"><Note m={msg} /></span>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
        <div className="flex flex-col gap-1"><Label htmlFor={`cat-n-${fid}`}>Name</Label><input id={`cat-n-${fid}`} value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Kassensysteme" /></div>
        <div className="flex flex-col gap-1"><Label htmlFor={`cat-d-${fid}`}>Beschreibung</Label><input id={`cat-d-${fid}`} value={desc} onChange={(e) => setDesc(e.target.value)} className={input} placeholder="Kassen, Cashless, Checkout-frei" /></div>
        <div className="flex flex-col gap-1"><Label htmlFor={`cat-t-${fid}`}>Trends (Nummern)</Label><input id={`cat-t-${fid}`} value={trendText} onChange={(e) => setTrendText(e.target.value)} className={input} placeholder="19, 26" /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={btn.primary}
          onClick={() => run(() => saveCategory(c?.id ?? null, { name, description: desc || null, trendNumbers: parseTrends(trendText, known), archived: c?.archived ?? false }), () => {
            if (c) setEditing(false);
            else { setName(""); setDesc(""); setTrendText(""); }
          })}>
          {c ? "Speichern" : "Kategorie anlegen"}
        </button>
        {c && <button type="button" className={btn.ghost} onClick={() => setEditing(false)}>Abbrechen</button>}
      </div>
      <Note m={msg} />
    </li>
  );
}

// ───────────────────────── Neuer Eintrag ─────────────────────────

export function NewMemberForm() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [types, setTypes] = useState<PartnerType[]>(["solution_provider"]);
  const [founded, setFounded] = useState("");
  const [status, setStatus] = useState<MemberStatus>("review");
  const year = founded ? Number(founded) : null;
  const suggested = suggestStartup(year);
  const [startup, setStartup] = useState<boolean | null>(null);
  const isStartup = startup ?? suggested ?? false;
  const typeOptions = Object.fromEntries(PARTNER_TYPES.map((t) => [t, PARTNER_TYPE_LABEL[t]])) as Record<PartnerType, string>;
  const statusOptions = { review: MEMBER_STATUS_LABEL.review, qualified: MEMBER_STATUS_LABEL.qualified, on_hold: MEMBER_STATUS_LABEL.on_hold } as Record<MemberStatus, string>;

  const submit = () => start(async () => {
    const r = await createMember({ name, website: website || null, partnerTypes: types, founded: year, isStartup, status });
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    router.push(`/admin/netzwerk/${r.memberId}?reiter=bearbeiten`);
  });

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="nm-name">Name</Label><input id="nm-name" value={name} onChange={(e) => setName(e.target.value)} className={input} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="nm-web">Website</Label><input id="nm-web" value={website} onChange={(e) => setWebsite(e.target.value)} className={input} placeholder="https://…" /></div>
        </div>
        <Toggles label="Partner-Typ (mehrere möglich)" options={typeOptions} value={types} onChange={setTypes} />
        <p className="text-xs text-muted">{types.map((t) => `${PARTNER_TYPE_LABEL[t]}: ${PARTNER_TYPE_HINT[t]}`).join(" · ")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="nm-founded">Gründungsjahr</Label>
            <input id="nm-founded" type="number" value={founded} onChange={(e) => { setFounded(e.target.value); setStartup(null); }} className={input} /></div>
          <div className="flex flex-col gap-1.5">
            <Label>Merkmal „Startup“</Label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isStartup} onChange={(e) => setStartup(e.target.checked)} />
              Startup (jünger als 5 Jahre){suggested != null && startup == null ? " – aus dem Gründungsjahr vorgeschlagen" : ""}
            </label>
          </div>
        </div>
        <Toggles label="Status" options={statusOptions} value={[status]} onChange={(v) => setStatus(v.at(-1) ?? status)} />
        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={submit} className={`${btn.primary} self-start`}>{busy ? "Legt an …" : "Eintrag anlegen"}</button>
          <Note m={msg} />
        </div>
      </div>
    </Card>
  );
}
