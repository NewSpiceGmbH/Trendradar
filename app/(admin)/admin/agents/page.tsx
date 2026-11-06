import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, Empty, PageHead, formatDate } from "@/components/admin/ui";
import { getAdminRepo } from "@/lib/admin/repo";

export const metadata: Metadata = { title: "Agenten · Redaktion" };

const AGENTS = [
  { key: "scout", name: "Scout", text: "Sucht täglich neue Signale je Branche – Launches, Piloten, Studien, Regulierung. Liefert Meldungen für den Liveticker." },
  { key: "analyst", name: "Analyst", text: "Ordnet Meldungen einem Trend zu oder schlägt einen neuen Trend vor (nur mit mindestens zwei unabhängigen Signalen)." },
  { key: "scorer", name: "Scorer", text: "Bewertet nach den sechs Kriterien, global und für Europa, mit Begründung je Kriterium." },
  { key: "editor", name: "Editor / QA", text: "Prüft Quellen, Dubletten und Ton, bevor ein Vorschlag in die Review-Queue geht." },
  { key: "network", name: "Netzwerk-Manager", text: "Schlägt Angebotskategorien und Klassifizierungen für die Netzwerk-Datenbank vor; später auch Clustern des Eingangs, Matching und Verbindungen." },
] as const;

const LINKS: Partial<Record<(typeof AGENTS)[number]["key"], { href: string; label: string }>> = {
  scout: { href: "/admin/scouting", label: "Zum Scouting-Stab" },
  network: { href: "/admin/netzwerk/manager", label: "Zum Netzwerk-Manager" },
};

export default function AgentsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Agentenläufe werden geladen …</p>}>
      <Agents />
    </Suspense>
  );
}

async function Agents() {
  const runs = await (await getAdminRepo()).runs();
  return (
    <>
      <PageHead eyebrow="Redaktion" title="Agenten">
        Agenten mit klar getrennten Aufgaben. Sie schreiben nie direkt in die Trends, sondern nur Vorschläge und Meldungen.
      </PageHead>
      <div className="grid gap-4 md:grid-cols-2">
        {AGENTS.map((a) => {
          const last = runs.find((r) => (r.agent as string) === a.key);
          const link = LINKS[a.key];
          return (
            <Card key={a.key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="!text-xl">{a.name}</h2>
                <Badge tone="muted">{last ? `zuletzt ${formatDate(last.startedAt)}` : link ? "bereit" : "folgt"}</Badge>
              </div>
              <p className="text-sm">{a.text}</p>
              {link ? (
                <Link href={link.href} className="glass mt-1 self-start rounded-[var(--radius-pill)] px-4 py-2 text-sm font-bold text-ink no-underline">{link.label}</Link>
              ) : (
                <span className="mt-1 text-xs text-muted">Folgt mit Paket B (Kette Analyst → Scorer → QA).</span>
              )}
            </Card>
          );
        })}
      </div>
      <Card>
        <h2 className="!text-xl">Protokoll</h2>
        <p className="mt-1 text-sm text-muted">Jeder Lauf mit Modell, Token-Verbrauch und Fehlern.</p>
        {runs.length ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-2 font-normal">Agent</th><th className="py-2 font-normal">Status</th><th className="py-2 font-normal">Modell</th><th className="py-2 font-normal">Tokens</th><th className="py-2 font-normal">Suchen</th><th className="py-2 font-normal">Kosten</th><th className="py-2 font-normal">Start</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 text-ink">{r.scoutName ?? r.agent}</td>
                  <td className="py-2">{{ running: "läuft", succeeded: "fertig", failed: "fehlgeschlagen" }[r.status]}{r.error ? ` – ${r.error}` : ""}</td>
                  <td className="py-2 text-muted">{r.model ?? "–"}</td>
                  <td className="num py-2">{((r.inputTokens ?? 0) + (r.outputTokens ?? 0)).toLocaleString("de-DE")}</td>
                  <td className="num py-2">{r.searches ?? "–"}</td>
                  <td className="num py-2">{r.costUsd != null ? `${r.costUsd.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $` : "–"}</td>
                  <td className="py-2 text-muted">{formatDate(r.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mt-4"><Empty>Noch keine Läufe. Scouts unter „Scouting“ einsetzen oder per Klick starten (Claude-API-Schlüssel in Vercel nötig).</Empty></div>
        )}
      </Card>
    </>
  );
}
