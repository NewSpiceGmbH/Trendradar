"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveScout } from "@/lib/agents/actions";
import { CHANNEL_LABEL, CHANNEL_READY, LANE_LABEL, MODEL_OPTIONS, REGION_LABEL, VERTICAL_LABEL, type Channel, type Lane, type Region, type Scout, type Vertical } from "@/lib/agents/types";
import { STAGE_OPTIONS } from "@/lib/admin/labels";
import { Card, btn, input } from "./ui";

type Draft = Omit<Scout, "id" | "lastRunAt" | "key">;

const Label = ({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="eyebrow !text-muted">{children}</label>
);

function Toggles<T extends string>({ options, value, onChange, label }: { options: Record<T, string>; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {(Object.entries(options) as [T, string][]).map(([k, l]) => {
          const on = value.includes(k);
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
              className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm ${on ? "bg-ink font-bold text-bg" : "border border-line text-text hover:text-ink"}`}>
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const words = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

export function ScoutEditor({ scoutId, initial, channels, clusters, trends }: {
  scoutId: string | null;
  initial: Draft;
  channels: Channel[];
  clusters: { code: string; name: string }[];
  trends: { number: number; name: string }[];
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [kw, setKw] = useState(initial.keywords.join(", "));
  const [ex, setEx] = useState(initial.exclusions.join(", "));
  const [watch, setWatch] = useState(initial.watchTrends.join(", "));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = () =>
    start(async () => {
      const watchTrends = watch.split(/[,\s#]+/).map(Number).filter((n) => trends.some((t) => t.number === n));
      const r = await saveScout(scoutId, { ...d, keywords: words(kw), exclusions: words(ex), watchTrends });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Gespeichert." });
      if (!scoutId && r.scoutId) router.push(`/admin/scouting/${r.scoutId}`);
      router.refresh();
    });

  const estimate = d.maxSearches * 0.01 + (d.model === "claude-opus-5-5" ? 0.6 : 0.3);
  const perMonth = d.cadence === "daily" ? 30 : d.cadence === "weekly" ? 4.3 : 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <h2 className="!text-xl">Rolle</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
            <div className="flex flex-col gap-1.5"><Label htmlFor="s-name">Name</Label><input id="s-name" value={d.name} onChange={(e) => set("name", e.target.value)} className={input} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="s-role">Rolle</Label><input id="s-role" value={d.role ?? ""} onChange={(e) => set("role", e.target.value || null)} className={input} placeholder="Scout Hospitality · Premium" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="s-nr">Rückennummer</Label><input id="s-nr" type="number" min={1} max={99} value={d.shirtNumber ?? ""} onChange={(e) => set("shirtNumber", e.target.value ? Number(e.target.value) : null)} className={input} /></div>
          </div>
        </Card>

        <Card>
          <h2 className="!text-xl">Auftrag</h2>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-brief">Briefing in eigenen Worten</Label>
              <textarea id="s-brief" rows={5} value={d.briefing} onChange={(e) => set("briefing", e.target.value)} className={`${input} leading-relaxed`} placeholder="Worauf soll der Scout achten? Welche Fragen sollen seine Berichte beantworten?" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5"><Label htmlFor="s-kw">Stichwörter (mit Komma)</Label><input id="s-kw" value={kw} onChange={(e) => setKw(e.target.value)} className={input} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="s-ex">Nicht melden</Label><input id="s-ex" value={ex} onChange={(e) => setEx(e.target.value)} className={input} placeholder="z. B. Transfergerüchte, Ergebnisse" /></div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-watch">Beobachtungsliste (Trendnummern)</Label>
              <input id="s-watch" value={watch} onChange={(e) => setWatch(e.target.value)} className={input} placeholder="z. B. 24, 25, 31" />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="!text-xl">Revier</h2>
          <div className="mt-4 flex flex-col gap-4">
            {d.lane && (
              <Toggles label="Bereich im Lagebild" options={LANE_LABEL} value={[d.lane]} onChange={(v) => set("lane", (v.at(-1) ?? d.lane) as Lane)} />
            )}
            <Toggles label="Branchen" options={VERTICAL_LABEL} value={d.verticals} onChange={(v) => set("verticals", v as Vertical[])} />
            <Toggles label="Regionen" options={REGION_LABEL} value={d.regions} onChange={(v) => set("regions", v as Region[])} />
            <Toggles label="Cluster" options={Object.fromEntries(clusters.map((c) => [c.code, `${c.code} · ${c.name}`]))} value={d.clusters} onChange={(v) => set("clusters", v)} />
            <Toggles label="Orte der Journey" options={STAGE_OPTIONS} value={d.journeyStages} onChange={(v) => set("journeyStages", v)} />
            <Toggles label="Zielgruppe" options={{ both: "Hospitality & Public", vip: "Hospitality", public: "Public" }} value={[d.audience]} onChange={(v) => set("audience", (v.at(-1) ?? "both") as Draft["audience"])} />
            <Toggles label="Sprachen der Quellen" options={{ de: "Deutsch", en: "Englisch", fr: "Französisch", es: "Spanisch", it: "Italienisch", nl: "Niederländisch" }} value={d.languages} onChange={(v) => set("languages", v)} />
          </div>
        </Card>

        <Card>
          <h2 className="!text-xl">Quellen</h2>
          <p className="mt-1 text-sm text-muted">Neue Quellen in der Quellen-Bibliothek andocken.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {channels.map((c) => {
              const on = d.channelIds.includes(c.id);
              return (
                <li key={c.id}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${on ? "border-ink" : "border-line"} ${c.active ? "" : "opacity-60"}`}>
                    <input type="checkbox" checked={on} onChange={() => set("channelIds", on ? d.channelIds.filter((x) => x !== c.id) : [...d.channelIds, c.id])} className="mt-0.5 size-4" />
                    <span className="flex flex-col">
                      <b className="text-ink">{c.name}</b>
                      <span className="text-xs text-muted">
                        {CHANNEL_LABEL[c.kind]}{c.access !== "open" ? " · Abo" : ""}{!c.active ? " · inaktiv" : ""}{!CHANNEL_READY.includes(c.kind) ? " · folgt" : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="flex flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
        <Card className="flex flex-col gap-4">
          <h2 className="!text-xl">Takt und Budget</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="s-cad">Takt</Label>
              <select id="s-cad" value={d.cadence} onChange={(e) => set("cadence", e.target.value as Draft["cadence"])} className={input}>
                <option value="daily">täglich</option><option value="weekly">wöchentlich</option><option value="manual">nur per Klick</option>
              </select>
            </div>
            {d.cadence === "weekly" && (
              <div className="flex flex-col gap-1.5"><Label htmlFor="s-wd">Wochentag</Label>
                <select id="s-wd" value={d.runWeekday ?? 1} onChange={(e) => set("runWeekday", Number(e.target.value))} className={input}>
                  {["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"].map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
                </select>
              </div>
            )}
            {d.cadence !== "manual" && (
              <div className="flex flex-col gap-1.5"><Label htmlFor="s-h">Uhrzeit</Label>
                <select id="s-h" value={d.runHour} onChange={(e) => set("runHour", Number(e.target.value))} className={input}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5"><Label htmlFor="s-ms">Suchen pro Lauf</Label><input id="s-ms" type="number" min={1} max={50} value={d.maxSearches} onChange={(e) => set("maxSearches", Number(e.target.value))} className={input} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="s-mx">Meldungen höchstens</Label><input id="s-mx" type="number" min={1} max={30} value={d.maxSignals} onChange={(e) => set("maxSignals", Number(e.target.value))} className={input} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="s-mc">Kosten höchstens ($)</Label><input id="s-mc" type="number" min={0.5} step={0.5} value={d.maxCostUsd} onChange={(e) => set("maxCostUsd", Number(e.target.value))} className={input} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="s-ev">Mindest-Evidenz</Label>
              <select id="s-ev" value={d.minEvidence} onChange={(e) => set("minEvidence", e.target.value as Draft["minEvidence"])} className={input}>
                <option value="A">A · belegt</option><option value="B">B · Pilot/Signal</option><option value="C">C · auch Ankündigungen</option>
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5"><Label htmlFor="s-model">Modell</Label>
              <select id="s-model" value={d.model} onChange={(e) => set("model", e.target.value)} className={input}>
                {Object.entries(MODEL_OPTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5"><Label htmlFor="s-eff">Gründlichkeit</Label>
              <select id="s-eff" value={d.effort} onChange={(e) => set("effort", e.target.value as Draft["effort"])} className={input}>
                <option value="low">zügig</option><option value="medium">ausgewogen</option><option value="high">gründlich (teurer)</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={d.deliverMedia} onChange={(e) => set("deliverMedia", e.target.checked)} className="size-4" />Videos und Bilder mitliefern</label>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={d.active} onChange={(e) => set("active", e.target.checked)} className="size-4" />Im Einsatz (läuft nach Zeitplan)</label>
          <p className="text-xs text-muted">
            Grobe Schätzung: etwa {estimate.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $ pro Lauf{perMonth ? `, rund ${Math.round(estimate * perMonth)} $ im Monat` : ""}. Tatsächliche Kosten stehen im Protokoll.
          </p>
          {msg && <p role="status" className={`text-sm ${msg.ok ? "text-ink" : "text-[var(--cA)]"}`}>{msg.text}</p>}
          <button type="button" onClick={save} disabled={busy} className={btn.primary}>{scoutId ? "Speichern" : "Scout anlegen"}</button>
        </Card>
      </div>
    </div>
  );
}
