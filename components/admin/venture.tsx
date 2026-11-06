"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STAGE_OPTIONS } from "@/lib/admin/labels";
import { decideCandidate, runChallengeNow, saveChallenge, saveStartup } from "@/lib/venture/actions";
import { fmtScore } from "@/lib/venture/scoring";
import type { ChallengeInput, StartupInput } from "@/lib/venture/store";
import {
  CANDIDATE_STATUS_LABEL, CHALLENGE_STATUS_LABEL, CRITERIA, MATURITY_LABEL, RECOMMENDATION_LABEL,
  type Candidate, type ChallengeStatus, type Maturity, type Startup, type StartupPrivate,
} from "@/lib/venture/types";
import { DETAIL_FIELDS, MEMBER_STATUS_LABEL, PARTNER_TYPE_LABEL, PARTNER_TYPES, suggestStartup, type PartnerType } from "@/lib/network/types";
import { Label, Toggles, lines } from "./form";
import { Badge, Card, btn, input } from "./ui";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role="status" className={`text-sm ${m.ok ? "text-ink" : "text-[var(--cA)]"}`}>{m.text}</p> : null);

const REGION = { DACH: "DACH", EU: "Europa", US: "USA", GLOBAL: "Global" } as const;
const PARTNER_OPTIONS = Object.fromEntries(PARTNER_TYPES.map((t) => [t, PARTNER_TYPE_LABEL[t]])) as Record<PartnerType, string>;
const MIN_MATURITY = { idea: MATURITY_LABEL.idea, prototype: MATURITY_LABEL.prototype, pilot: MATURITY_LABEL.pilot, market: MATURITY_LABEL.market } as const;

// ───────────────────────── Challenge ─────────────────────────

export function ChallengeEditor({ challengeId, initial, trends }: {
  challengeId: string | null;
  initial: ChallengeInput;
  trends: { number: number; name: string }[];
}) {
  const router = useRouter();
  const [d, setD] = useState<ChallengeInput>(initial);
  const [must, setMust] = useState(initial.mustHaves.join("\n"));
  const [excl, setExcl] = useState(initial.exclusions.join("\n"));
  const [leads, setLeads] = useState(initial.leads.join("\n"));
  const [trendText, setTrendText] = useState(initial.trendNumbers.join(", "));
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const set = <K extends keyof ChallengeInput>(k: K, v: ChallengeInput[K]) => setD((x) => ({ ...x, [k]: v }));
  const trendNumbers = trendText.split(/[,\s#]+/).map(Number).filter((n) => trends.some((t) => t.number === n));

  const save = () =>
    start(async () => {
      const r = await saveChallenge(challengeId, { ...d, mustHaves: lines(must), exclusions: lines(excl), leads: lines(leads), trendNumbers });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Gespeichert." });
      router.push(`/admin/venture/${r.challengeId ?? challengeId}`);
      router.refresh();
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <h2 className="!text-xl">Problemstellung</h2>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-title">Titel</Label>
              <input id="c-title" value={d.title} onChange={(e) => set("title", e.target.value)} className={input} placeholder="z. B. Wartezeit am Bierstand in der Halbzeit" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-problem">Problem – was ist heute?</Label>
              <textarea id="c-problem" rows={4} value={d.problem} onChange={(e) => set("problem", e.target.value)} className={`${input} leading-relaxed`}
                placeholder="In der Halbzeit stehen die Gäste 12 Minuten am Bierstand an. Viele geben auf …" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-goal">Ziel und Erfolgskriterien</Label>
              <textarea id="c-goal" rows={3} value={d.goal} onChange={(e) => set("goal", e.target.value)} className={`${input} leading-relaxed`}
                placeholder="Wartezeit unter 4 Minuten, Umsatz pro Gast +10 %" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-context">Kontext</Label>
              <textarea id="c-context" rows={3} value={d.context} onChange={(e) => set("context", e.target.value)} className={`${input} leading-relaxed`}
                placeholder="Venue-Typ, Größe, vorhandene Systeme, Abläufe, Besonderheiten" />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="!text-xl">Rahmen</h2>
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-must">Muss-Kriterien (eins pro Zeile)</Label>
                <textarea id="c-must" rows={4} value={must} onChange={(e) => setMust(e.target.value)} className={input} placeholder={"DSGVO-konform\nAnbindung an Kassensystem X"} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-excl">Kommt nicht in Frage (eins pro Zeile)</Label>
                <textarea id="c-excl" rows={4} value={excl} onChange={(e) => setExcl(e.target.value)} className={input} placeholder="Firmen oder Ansätze" />
              </div>
            </div>
            <Toggles label="Mindestreife" options={MIN_MATURITY} value={[d.minMaturity]} onChange={(v) => set("minMaturity", (v.at(-1) ?? d.minMaturity) as ChallengeInput["minMaturity"])} />
            <Toggles label="Regionen" options={REGION} value={d.regions} onChange={(v) => set("regions", v as ChallengeInput["regions"])} />
            <Toggles label="Zielgruppe" options={{ both: "Hospitality & Public", vip: "Hospitality", public: "Public" }} value={[d.audience]} onChange={(v) => set("audience", (v.at(-1) ?? "both") as ChallengeInput["audience"])} />
            <Toggles label="Orte der Journey" options={STAGE_OPTIONS} value={d.journeyStages} onChange={(v) => set("journeyStages", v)} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5"><Label htmlFor="c-trends">Trends (Nummern)</Label><input id="c-trends" value={trendText} onChange={(e) => setTrendText(e.target.value)} className={input} placeholder="24, 25" /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="c-time">Zeitrahmen</Label><input id="c-time" value={d.timeframe ?? ""} onChange={(e) => set("timeframe", e.target.value)} className={input} placeholder="Pilot in der Rückrunde" /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="c-budget">Budgetrahmen</Label><input id="c-budget" value={d.budget ?? ""} onChange={(e) => set("budget", e.target.value)} className={input} placeholder="Pilot bis 50.000 €" /></div>
            </div>
            {trendNumbers.length > 0 && (
              <p className="text-xs text-muted">{trendNumbers.map((n) => `#${n} ${trends.find((t) => t.number === n)?.name}`).join(" · ")}</p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="!text-xl">Hinweise aus dem Team</h2>
          <p className="mt-1 text-sm text-muted">Startups, Links (z. B. LinkedIn, Messe) oder Namen, die der Agent vorrangig prüfen soll – eins pro Zeile.</p>
          <textarea aria-label="Hinweise aus dem Team" rows={3} value={leads} onChange={(e) => setLeads(e.target.value)} className={`${input} mt-3`} placeholder="https://www.linkedin.com/posts/…" />
        </Card>
      </div>

      <aside className="flex flex-col gap-6">
        <Card>
          <h2 className="!text-xl">Agent</h2>
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><Label htmlFor="c-max">Kandidaten</Label><input id="c-max" type="number" min={1} max={20} value={d.maxCandidates} onChange={(e) => set("maxCandidates", Number(e.target.value))} className={input} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="c-search">Suchen</Label><input id="c-search" type="number" min={1} max={50} value={d.maxSearches} onChange={(e) => set("maxSearches", Number(e.target.value))} className={input} /></div>
            </div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="c-cost">Kostengrenze je Lauf ($)</Label><input id="c-cost" type="number" min={0.5} step={0.5} value={d.maxCostUsd} onChange={(e) => set("maxCostUsd", Number(e.target.value))} className={input} /></div>
            <Toggles label="Modell" options={{ "claude-opus-5-5": "Opus 5.5", "claude-sonnet-5-5": "Sonnet 5.5" }} value={[d.model as "claude-opus-5-5" | "claude-sonnet-5-5"]} onChange={(v) => set("model", v.at(-1) ?? d.model)} />
            <Toggles label="Gründlichkeit" options={{ low: "Schnell", medium: "Normal", high: "Gründlich" }} value={[d.effort]} onChange={(v) => set("effort", (v.at(-1) ?? d.effort) as ChallengeInput["effort"])} />
            <Toggles label="Status" options={CHALLENGE_STATUS_LABEL} value={[d.status]} onChange={(v) => set("status", (v.at(-1) ?? d.status) as ChallengeStatus)} />
            <p className="text-xs text-muted">Ein Lauf kostet etwa {(d.maxSearches * 0.01 + (d.model === "claude-opus-5-5" ? 1.2 : 0.6)).toFixed(2).replace(".", ",")} $. Das Monatsbudget unter Scouting gilt auch hier.</p>
          </div>
        </Card>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={save} disabled={busy} className={btn.primary}>{busy ? "Speichert …" : challengeId ? "Speichern" : "Challenge anlegen"}</button>
          {challengeId && <Link href={`/admin/venture/${challengeId}`} className={btn.ghost}>Abbrechen</Link>}
          <Note m={msg} />
        </div>
      </aside>
    </div>
  );
}

export function RunChallengeButton({ challengeId, disabled }: { challengeId: string; disabled?: boolean }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" disabled={busy || disabled} className={btn.primary}
        onClick={() => start(async () => { const r = await runChallengeNow(challengeId); setMsg(r.ok ? { ok: true, text: r.message ?? "Gestartet." } : { ok: false, text: r.error }); })}>
        {busy ? "Startet …" : "Startups suchen"}
      </button>
      <Note m={msg} />
    </div>
  );
}

// ───────────────────────── Kandidaten ─────────────────────────

const REC_TONE: Record<Candidate["recommendation"], "neutral" | "muted" | "warn"> = { shortlist: "neutral", watch: "muted", no_fit: "warn" };

export function CandidateCard({ c, startupHref }: { c: Candidate; startupHref: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(c.status === "pending" && c.recommendation === "shortlist");
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const decide = (d: "qualified" | "watch" | "rejected") =>
    start(async () => {
      const r = await decideCandidate(c.id, d, d === "rejected" ? note : null);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Gespeichert." });
      setRejecting(false);
      router.refresh();
    });
  const by = new Map(c.scores.map((s) => [s.criterion, s]));
  const openDecision = c.status === "pending" || c.status === "watch";

  return (
    <li className="flex flex-col gap-3 py-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="!text-lg">{c.name}</h3>
            <Badge tone={REC_TONE[c.recommendation]}>Empfehlung: {RECOMMENDATION_LABEL[c.recommendation]}</Badge>
            {c.status !== "pending" && <Badge tone="muted">{CANDIDATE_STATUS_LABEL[c.status]}</Badge>}
            {c.uncertain && <Badge tone="warn">Wissensbasis, zu validieren</Badge>}
            {c.example && <Badge tone="muted">Beispiel · Testmodus</Badge>}
          </div>
          <p className="text-xs text-muted">
            {[c.website && <a key="w" href={c.website} target="_blank" rel="noopener noreferrer">{c.domain ?? c.website}</a>, c.country, c.founded && `gegründet ${c.founded}`, c.stage && MATURITY_LABEL[c.stage], c.funding]
              .filter(Boolean).flatMap((x, i) => (i ? [" · ", x] : [x]))}
          </p>
          <p className="text-sm text-ink">{c.summary}</p>
          {c.approach && <p className="text-sm text-muted">{c.approach}</p>}
        </div>
        <div className="flex flex-col items-end">
          <span className="num text-4xl leading-none text-ink">{fmtScore(c.total)}</span>
          <span className="text-xs text-muted">Vorevaluierung</span>
        </div>
      </div>

      {c.mustHaveGaps.length > 0 && (
        <p className="rounded-xl border border-[color-mix(in_srgb,var(--cA)_50%,transparent)] px-3 py-2 text-sm">
          <b className="text-ink">Muss-Kriterien offen:</b> {c.mustHaveGaps.join(" · ")}
        </p>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="self-start text-sm font-bold text-ink hover:underline">
        {open ? "Bewertung ausblenden" : "Bewertung je Kriterium, Quellen und offene Fragen"}
      </button>
      {open && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <table className="w-full text-sm">
            <caption className="sr-only">Bewertung je Kriterium</caption>
            <tbody>
              {CRITERIA.map((k) => {
                const s = by.get(k.key);
                return (
                  <tr key={k.key} className="border-t border-line align-top">
                    <th scope="row" className="w-40 py-2 pr-3 text-left font-normal text-muted">{k.label}<span className="block text-[11px]">{Math.round(k.weight * 100)} %</span></th>
                    <td className="num w-8 py-2 text-lg text-ink">{s?.score ?? "–"}</td>
                    <td className="py-2">
                      {s?.rationale ?? <span className="text-muted">nicht bewertet</span>}
                      {s?.source_url && <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-xs">Beleg ↗</a>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-col gap-4 text-sm">
            {c.openQuestions.length > 0 && (
              <div><p className="eyebrow !text-muted">Fürs Erstgespräch</p><ul className="mt-1 list-disc pl-5">{c.openQuestions.map((q) => <li key={q}>{q}</li>)}</ul></div>
            )}
            <div>
              <p className="eyebrow !text-muted">Quellen</p>
              <ul className="mt-1 flex flex-col gap-1">{c.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title ?? s.url}</a></li>)}</ul>
            </div>
          </div>
        </div>
      )}

      {c.decisionNote && <p className="text-xs text-muted">Notiz: {c.decisionNote}</p>}
      {openDecision ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => decide("qualified")} className={btn.primary}>In die Datenbank</button>
            {c.status !== "watch" && <button type="button" disabled={busy} onClick={() => decide("watch")} className={btn.ghost}>Beobachten</button>}
            <button type="button" disabled={busy} onClick={() => setRejecting((v) => !v)} className={btn.danger} aria-expanded={rejecting}>Ablehnen</button>
          </div>
          {rejecting && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input aria-label={`Begründung für die Ablehnung von ${c.name}`} value={note} onChange={(e) => setNote(e.target.value)} className={input} placeholder="Warum passt es nicht? (Pflicht)" />
              <button type="button" disabled={busy} onClick={() => decide("rejected")} className={btn.danger}>Ablehnung speichern</button>
            </div>
          )}
          <Note m={msg} />
        </div>
      ) : startupHref ? (
        <Link href={startupHref} className="self-start text-sm">Zum Profil in der Datenbank →</Link>
      ) : null}
    </li>
  );
}

// ───────────────────────── Startup-Profil ─────────────────────────

export function StartupEditor({ startup, priv, trends }: { startup: Startup; priv: StartupPrivate; trends: { number: number; name: string }[] }) {
  const router = useRouter();
  const { id, createdAt: _c, updatedAt: _u, domain: _d, approved: _a, ...rest } = startup;
  void _c; void _u; void _d; void _a;
  const [d, setD] = useState<StartupInput>(rest);
  const [p, setP] = useState<StartupPrivate>(priv);
  const [trendText, setTrendText] = useState(startup.trendNumbers.join(", "));
  const [tags, setTags] = useState(startup.tags.join(", "));
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const set = <K extends keyof StartupInput>(k: K, v: StartupInput[K]) => setD((x) => ({ ...x, [k]: v }));
  const setPriv = <K extends keyof StartupPrivate>(k: K, v: string) => setP((x) => ({ ...x, [k]: v || null }));
  const trendNumbers = trendText.split(/[,\s#]+/).map(Number).filter((n) => trends.some((t) => t.number === n));
  const suggested = suggestStartup(d.founded);
  const startupHint = suggested == null || suggested === d.isStartup ? null
    : suggested ? "Laut Gründungsjahr jünger als 5 Jahre – Merkmal „Startup“ setzen?" : "Laut Gründungsjahr 5 Jahre oder älter – Merkmal „Startup“ entfernen?";
  const detailFields = d.partnerTypes.flatMap((t) => DETAIL_FIELDS[t]);

  const save = (patch: Partial<StartupInput> = {}) =>
    start(async () => {
      const next = { ...d, ...patch, trendNumbers, tags: tags.split(",").map((x) => x.trim()).filter(Boolean) };
      const r = await saveStartup(id, next, p);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setD(next);
      setMsg({ ok: true, text: r.message ?? "Gespeichert." });
      router.refresh();
    });

  const field = (k: keyof StartupInput, label: string, ph = "") => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`st-${k}`}>{label}</Label>
      <input id={`st-${k}`} value={(d[k] as string | null) ?? ""} onChange={(e) => set(k, (e.target.value || null) as never)} className={input} placeholder={ph} />
    </div>
  );
  const area = (k: keyof StartupInput, label: string, ph = "") => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`st-${k}`}>{label}</Label>
      <textarea id={`st-${k}`} rows={3} value={(d[k] as string | null) ?? ""} onChange={(e) => set(k, (e.target.value || null) as never)} className={`${input} leading-relaxed`} placeholder={ph} />
    </div>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <h2 className="!text-xl">Klassifizierung</h2>
          <div className="mt-4 flex flex-col gap-4">
            <Toggles label="Partner-Typ (mehrere möglich)" options={PARTNER_OPTIONS} value={d.partnerTypes} onChange={(v) => set("partnerTypes", v)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.isStartup} onChange={(e) => set("isStartup", e.target.checked)} />
                Merkmal „Startup“ (jünger als 5 Jahre)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.isPartner} onChange={(e) => set("isPartner", e.target.checked)} />
                Partner von New Spice
              </label>
            </div>
            {startupHint && <p role="note" className="text-xs text-muted">{startupHint}</p>}
            <Toggles label="Region" options={REGION} value={d.region ? [d.region] : []} onChange={(v) => set("region", (v.at(-1) ?? null) as Startup["region"])} />
            {detailFields.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {detailFields.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`dt-${f.key}`}>{f.label}</Label>
                    <input id={`dt-${f.key}`} value={d.details[f.key] ?? ""} className={input}
                      onChange={(e) => set("details", Object.fromEntries(Object.entries({ ...d.details, [f.key]: e.target.value }).filter(([, x]) => x)))} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="!text-xl">Profil</h2>
          <p className="mt-1 text-sm text-muted">Öffentliche Angaben: Kunden sehen sie, sobald der Eintrag öffentlich ist oder ihrem Projekt zugewiesen wird. Nur Angaben zur Organisation, keine Personen.</p>
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">{field("name", "Name")}{field("website", "Website", "https://…")}</div>
            {field("tagline", "In einem Satz", "Kasse ohne Schlange für Stadien und Arenen")}
            {area("solution", "Lösung")}
            {area("useCases", "Einsatzfälle")}
            {area("referenceCustomers", "Referenzen (öffentlich bekannt)")}
            <div className="grid gap-4 sm:grid-cols-4">
              {field("country", "Land")}{field("city", "Stadt")}
              <div className="flex flex-col gap-1.5"><Label htmlFor="st-founded">Gegründet</Label><input id="st-founded" type="number" value={d.founded ?? ""} onChange={(e) => set("founded", e.target.value ? Number(e.target.value) : null)} className={input} /></div>
              {field("teamSize", "Teamgröße", "z. B. 25")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">{field("funding", "Finanzierung", "Seed, 6 Mio. € (2025)")}{field("logoUrl", "Logo (https, mit Nutzungsrecht)")}</div>
            <Toggles label="Reifegrad" options={MATURITY_LABEL} value={d.stage ? [d.stage] : []} onChange={(v) => set("stage", (v.at(-1) ?? null) as Maturity | null)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5"><Label htmlFor="st-trends">Trends direkt (bisherige Zuordnung; sonst über Angebotskategorien)</Label><input id="st-trends" value={trendText} onChange={(e) => setTrendText(e.target.value)} className={input} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="st-tags">Schlagwörter (mit Komma)</Label><input id="st-tags" value={tags} onChange={(e) => setTags(e.target.value)} className={input} /></div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="!text-xl">Vertraulich</h2>
          <p className="mt-1 text-sm text-muted">Nur für die Redaktion. Kunden sehen das nie – später nur in der Shortlist ihres Projekts, wenn ihr es freigebt.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {(["contactName", "contactRole", "contactEmail"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-1.5">
                <Label htmlFor={`pv-${k}`}>{{ contactName: "Kontakt", contactRole: "Funktion", contactEmail: "E-Mail (geschäftlich)" }[k]}</Label>
                <input id={`pv-${k}`} value={p[k] ?? ""} onChange={(e) => setPriv(k, e.target.value)} className={input} />
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label htmlFor="pv-pricing">Kosten / Preismodell</Label><input id="pv-pricing" value={p.pricing ?? ""} onChange={(e) => setPriv("pricing", e.target.value)} className={input} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="pv-deck">Pitchdeck (https-Link)</Label><input id="pv-deck" value={p.pitchDeckUrl ?? ""} onChange={(e) => setPriv("pitchDeckUrl", e.target.value)} className={input} /></div>
          </div>
          <div className="mt-4 flex flex-col gap-1.5"><Label htmlFor="pv-notes">Notizen</Label><textarea id="pv-notes" rows={3} value={p.notes ?? ""} onChange={(e) => setPriv("notes", e.target.value)} className={input} /></div>
        </Card>
      </div>

      <aside className="flex flex-col gap-6">
        <Card className={d.published ? "!border-ink" : ""}>
          <h2 className="!text-xl">Sichtbarkeit</h2>
          <p className="mt-1 text-sm text-muted">
            {d.published ? "Öffentlich: Kunden sehen die öffentlichen Angaben, auch beim Trend im Radar." : "Nur intern. Kunden sehen den Eintrag nur, wenn er ihrem Projekt zugewiesen und freigegeben ist."}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" disabled={busy || d.status !== "qualified"} onClick={() => save({ published: !d.published })} className={d.published ? btn.ghost : btn.primary}>
              {d.published ? "Nur intern sichtbar machen" : "Öffentlich machen"}
            </button>
            {startup.approved && <Badge>New Spice approved</Badge>}
          </div>
        </Card>
        <Card>
          <h2 className="!text-xl">Status</h2>
          <div className="mt-3">
            <Toggles label="Status" options={MEMBER_STATUS_LABEL} value={[d.status]}
              onChange={(v) => setD((x) => ({ ...x, status: (v.at(-1) ?? x.status) as Startup["status"], published: v.at(-1) !== "qualified" ? false : x.published }))} />
          </div>
        </Card>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => save()} disabled={busy} className={btn.primary}>{busy ? "Speichert …" : "Speichern"}</button>
          <Note m={msg} />
        </div>
      </aside>
    </div>
  );
}
