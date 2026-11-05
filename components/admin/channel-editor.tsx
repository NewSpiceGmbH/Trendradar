"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveChannel } from "@/lib/agents/actions";
import { CHANNEL_LABEL, CHANNEL_READY, REGION_LABEL, VERTICAL_LABEL, type Channel, type ChannelKind, type Region, type Vertical } from "@/lib/agents/types";
import { Badge, btn, input } from "./ui";

type Draft = Omit<Channel, "id" | "key">;

const EMPTY: Draft = { name: "", kind: "website", url: "", domains: [], verticals: [], region: "DACH", language: "de", access: "open", secretRef: null, notes: null, active: true, verified: false };

const HINT: Partial<Record<ChannelKind, string>> = {
  website: "Startseite oder Rubrik (z. B. Pressebereich). Der Scout liest frei zugängliche Inhalte.",
  rss: "Adresse des Feeds (meist …/feed oder …/rss). Neue Einträge gehen bei jedem Lauf an den Scout.",
  youtube: "Kanal-Adresse der Form https://www.youtube.com/channel/UC… – braucht YOUTUBE_API_KEY in Vercel.",
  linkedin: "Öffentliche Artikel über die Websuche, Beiträge per Tipp. Kein automatisches Auslesen (Nutzungsbedingungen).",
  newsletter: "Kommt mit Paket C: eigene Eingangsadresse für Newsletter.",
  upload: "Kommt mit Paket C: Studien und PDFs hochladen.",
  api: "Kommt mit Paket C: eigene Schnittstelle mit Zugangsdaten aus einer Umgebungsvariable.",
  mcp: "Kommt mit Paket C: MCP-Server als universeller Anschluss für weitere Werkzeuge.",
  web_search: "Eingebaute Websuche; mit Domains auf bestimmte Seiten eingrenzen (leer = ganzes Web).",
};

function Form({ id, initial, onDone }: { id: string | null; initial: Draft; onDone: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [domains, setDomains] = useState(initial.domains.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-sunk/50 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveChannel(id, { ...d, url: d.url || null, domains: domains.split(/[,\s]+/).filter(Boolean) });
          if (!r.ok) return setError(r.error);
          setError(null);
          onDone();
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm"><span className="eyebrow !text-muted">Name</span><input value={d.name} onChange={(e) => set("name", e.target.value)} className={input} required /></label>
      <label className="flex flex-col gap-1 text-sm"><span className="eyebrow !text-muted">Typ</span>
        <select value={d.kind} onChange={(e) => set("kind", e.target.value as ChannelKind)} className={input}>
          {(Object.entries(CHANNEL_LABEL) as [ChannelKind, string][]).map(([k, l]) => <option key={k} value={k}>{l}{CHANNEL_READY.includes(k) ? "" : " (folgt)"}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted sm:col-span-2">{HINT[d.kind]}</p>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2"><span className="eyebrow !text-muted">Adresse</span><input value={d.url ?? ""} onChange={(e) => set("url", e.target.value)} className={input} placeholder="https://…" /></label>
      <label className="flex flex-col gap-1 text-sm"><span className="eyebrow !text-muted">Domains (für die Suche)</span><input value={domains} onChange={(e) => setDomains(e.target.value)} className={input} placeholder="stadionwelt.de" /></label>
      <label className="flex flex-col gap-1 text-sm"><span className="eyebrow !text-muted">Zugang</span>
        <select value={d.access} onChange={(e) => set("access", e.target.value as Draft["access"])} className={input}>
          <option value="open">frei</option><option value="subscription">Abo</option><option value="licensed">Lizenz</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm"><span className="eyebrow !text-muted">Region</span>
        <select value={d.region ?? ""} onChange={(e) => set("region", (e.target.value || null) as Region | null)} className={input}>
          <option value="">–</option>{(Object.entries(REGION_LABEL) as [Region, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm"><span className="eyebrow !text-muted">Zugangsdaten (Name der Umgebungsvariable)</span>
        <input value={d.secretRef ?? ""} onChange={(e) => set("secretRef", e.target.value.toUpperCase() || null)} className={input} placeholder="z. B. YOUTUBE_API_KEY" />
      </label>
      <div className="flex flex-wrap gap-1.5 sm:col-span-2" role="group" aria-label="Branchen">
        {(Object.entries(VERTICAL_LABEL) as [Vertical, string][]).map(([k, l]) => {
          const on = d.verticals.includes(k);
          return <button key={k} type="button" aria-pressed={on} onClick={() => set("verticals", on ? d.verticals.filter((x) => x !== k) : [...d.verticals, k])} className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm ${on ? "bg-ink font-bold text-bg" : "border border-line text-text"}`}>{l}</button>;
        })}
      </div>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2"><span className="eyebrow !text-muted">Notiz</span><input value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} className={input} /></label>
      <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.active} onChange={(e) => set("active", e.target.checked)} className="size-4" />aktiv</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.verified} onChange={(e) => set("verified", e.target.checked)} className="size-4" />Adresse geprüft</label>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--cA)] sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={busy} className={btn.primary}>Speichern</button>
        <button type="button" onClick={onDone} className={btn.ghost}>Abbrechen</button>
      </div>
    </form>
  );
}

export function ChannelLibrary({ channels, usage }: { channels: Channel[]; usage: Record<string, number> }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {editing === "neu" ? <Form id={null} initial={EMPTY} onDone={() => setEditing(null)} /> : (
        <button type="button" onClick={() => setEditing("neu")} className={`${btn.primary} self-start`}>Quelle andocken</button>
      )}
      <ul className="flex flex-col divide-y divide-line">
        {channels.map((c) => (
          <li key={c.id} className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-ink">{c.name}</b>
                  <Badge>{CHANNEL_LABEL[c.kind]}</Badge>
                  {c.access !== "open" && <Badge tone="muted">{c.access === "subscription" ? "Abo" : "Lizenz"}</Badge>}
                  {!c.active && <Badge tone="muted">inaktiv</Badge>}
                  {!c.verified && c.kind !== "web_search" && <Badge tone="muted">Adresse ungeprüft</Badge>}
                  {!CHANNEL_READY.includes(c.kind) && <Badge tone="muted">folgt</Badge>}
                </div>
                {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="truncate text-sm">{c.url}</a>}
                {c.notes && <p className="text-sm text-muted">{c.notes}</p>}
                <p className="text-xs text-muted">{usage[c.id] ?? 0} Scouts nutzen diese Quelle{c.secretRef ? ` · Zugangsdaten aus ${c.secretRef}` : ""}</p>
              </div>
              {editing !== c.id && <button type="button" onClick={() => setEditing(c.id)} className={btn.ghost}>Bearbeiten</button>}
            </div>
            {editing === c.id && <Form id={c.id} initial={(({ id: _i, key: _k, ...rest }) => (void _i, void _k, rest))(c)} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
