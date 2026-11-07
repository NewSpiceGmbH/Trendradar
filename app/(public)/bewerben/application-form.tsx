"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Label } from "@/components/admin/form";
import { btn, input } from "@/components/admin/ui";
import { OFFER_TYPES } from "@/lib/applications/form";
import { submitApplication, type SubmitState } from "@/lib/applications/submit";
import { DETAIL_FIELDS, PARTNER_TYPE_HINT, PARTNER_TYPE_LABEL, PARTNER_TYPES, type PartnerType } from "@/lib/network/types";
import { MATURITY_LABEL, MATURITY_ORDER } from "@/lib/venture/types";

/** Zweistufiges Formular: 1. Partner-Typ, 2. Angaben. Geprüft wird auf dem Server (gleiche Regeln). */
export function ApplicationForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitApplication, { status: "idle" });
  const [type, setType] = useState<PartnerType | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const err = (k: string) => (state.status === "error" ? state.fields?.[k] : undefined);

  if (state.status === "sent") {
    return (
      <section role="status" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-8">
        <h2 className="!text-3xl">Danke!</h2>
        <p className="text-lg">
          {state.confirm
            ? "Wir haben Ihnen eine E-Mail geschickt. Bitte bestätigen Sie darin Ihre Adresse – danach prüfen wir Ihre Bewerbung und melden uns innerhalb von 5 Werktagen."
            : "Ihre Bewerbung ist eingegangen. Wir melden uns innerhalb von 5 Werktagen."}
        </p>
        <Link href="/login" className="self-start">Zur Startseite</Link>
      </section>
    );
  }

  const field = (name: string, label: string, opts: { type?: string; required?: boolean; ph?: string; auto?: string } = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`bw-${name}`}>{label}{opts.required ? " *" : ""}</Label>
      <input id={`bw-${name}`} name={name} type={opts.type ?? "text"} required={opts.required} placeholder={opts.ph} autoComplete={opts.auto}
        aria-invalid={err(name) ? true : undefined} aria-describedby={err(name) ? `bw-${name}-e` : undefined} className={input} />
      {err(name) && <p id={`bw-${name}-e`} className="text-sm text-alert">{err(name)}</p>}
    </div>
  );
  const area = (name: string, label: string, ph = "") => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`bw-${name}`}>{label}</Label>
      <textarea id={`bw-${name}`} name={name} rows={3} placeholder={ph} className={`${input} leading-relaxed`} aria-invalid={err(name) ? true : undefined} />
      {err(name) && <p className="text-sm text-alert">{err(name)}</p>}
    </div>
  );

  return (
    <form action={action} className="flex flex-col gap-6" noValidate={false}>
      {/* Schritt 1 */}
      <fieldset className={`flex flex-col gap-3 ${step === 1 ? "" : "hidden"}`}>
        <legend className="mb-2 text-xl font-bold text-ink">1. Wer sind Sie?</legend>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Partner-Typ">
          {PARTNER_TYPES.map((t) => (
            <label key={t} className={`flex cursor-pointer flex-col gap-1 rounded-[var(--radius-card)] border p-4 ${type === t ? "border-ink bg-sunk" : "border-line hover:border-muted"}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="partnerType" value={t} checked={type === t} onChange={() => setType(t)} />
                <b className="text-ink">{PARTNER_TYPE_LABEL[t]}</b>
              </span>
              <span className="text-sm text-muted">{PARTNER_TYPE_HINT[t]}</span>
            </label>
          ))}
        </div>
        <button type="button" disabled={!type} onClick={() => setStep(2)} className={`${btn.primary} self-start`}>Weiter</button>
      </fieldset>

      {/* Schritt 2 */}
      {type && (
        <fieldset className={`flex flex-col gap-4 ${step === 2 ? "" : "hidden"}`}>
          <legend className="mb-2 flex w-full items-baseline justify-between gap-3 text-xl font-bold text-ink">
            2. Angaben · {PARTNER_TYPE_LABEL[type]}
          </legend>
          <button type="button" onClick={() => setStep(1)} className="self-start text-sm font-bold text-ink underline">← Partner-Typ ändern</button>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("orgName", "Organisation", { required: true, auto: "organization" })}
            {field("website", "Website", { ph: "https://…", auto: "url" })}
            {field("contactName", "Ihr Name", { required: true, auto: "name" })}
            {field("contactRole", "Ihre Rolle", { ph: "z. B. Geschäftsführung", auto: "organization-title" })}
            {field("email", "E-Mail (geschäftlich)", { type: "email", required: true, auto: "email" })}
            {type === "solution_provider" && field("founded", "Gründungsjahr", { type: "number", required: true })}
          </div>
          {DETAIL_FIELDS[type].length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">{DETAIL_FIELDS[type].map((f) => field(`details.${f.key}`, f.label))}</div>
          )}
          {OFFER_TYPES.includes(type) && (
            <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line p-4">
              <p className="text-sm text-muted">{type === "solution_provider" ? "Ihr Angebot" : "Optional: Wenn Sie etwas anbieten (z. B. Flächen, Gastronomie, Services)"}</p>
              {area("offer", type === "solution_provider" ? "Angebot (Produkt / Leistung) *" : "Angebot", "Was bieten Sie an, für wen, mit welchem Nutzen?")}
              {categories.length > 0 && (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="eyebrow !text-muted">Angebotskategorien (bis zu 3)</legend>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-line px-3 py-1 text-sm">
                        <input type="checkbox" name="offerCategoryIds" value={c.id} />{c.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {type === "solution_provider" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bw-maturity">Reifegrad</Label>
                  <select id="bw-maturity" name="maturity" className={input} defaultValue="">
                    <option value="">– bitte wählen –</option>
                    {MATURITY_ORDER.map((m) => <option key={m} value={m}>{MATURITY_LABEL[m]}</option>)}
                  </select>
                </div>
              )}
              {area("referencesText", "Referenzen", "Wo ist Ihr Angebot im Einsatz? Ort, Zeitraum, Ergebnis")}
              {type === "solution_provider" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bw-deck">Pitchdeck (PDF, bis 15 MB)</Label>
                  <input id="bw-deck" name="pitchDeck" type="file" accept="application/pdf,.pdf" className="text-sm" />
                  {err("pitchDeck") && <p className="text-sm text-alert">{err("pitchDeck")}</p>}
                </div>
              )}
            </div>
          )}
          {area("message", "Kurze Nachricht", "Was erhoffen Sie sich vom Netzwerk?")}
          {/* Fangfeld gegen Bots – für Menschen unsichtbar */}
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>Homepage <input name="homepage" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="privacy" required className="mt-1" />
            <span>
              Ich bin einverstanden, dass New Spice meine Angaben zur Prüfung der Bewerbung speichert und mich dazu per E-Mail kontaktiert. *
            </span>
          </label>
          {err("privacy") && <p className="text-sm text-alert">{err("privacy")}</p>}
          {state.status === "error" && <p role="alert" className="rounded-xl border border-line bg-sunk px-3 py-2 text-sm text-ink">{state.message}</p>}
          <button type="submit" disabled={pending} className={`${btn.primary} self-start`}>{pending ? "Wird gesendet …" : "Bewerbung senden"}</button>
          <p className="text-xs text-muted">Es wird kein Konto angelegt. Nach der Prüfung melden wir uns per E-Mail.</p>
        </fieldset>
      )}
    </form>
  );
}
