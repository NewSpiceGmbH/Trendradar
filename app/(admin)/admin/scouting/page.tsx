import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ScoutCard, SettingsForm, TipForm } from "@/components/admin/scouting";
import { Badge, Card, Empty, MigrationNotice, PageHead, btn, timeAgo } from "@/components/admin/ui";
import { MigrationMissingError } from "@/lib/admin/types";
import { isFixtureMode } from "@/lib/auth/personas";
import { getScoutingRepo } from "@/lib/agents/store";

export const metadata: Metadata = { title: "Scouting · Redaktion" };

export default function ScoutingPage() {
  return (
    <Suspense fallback={<p className="text-muted">Scouting wird geladen …</p>}>
      <Scouting />
    </Suspense>
  );
}

async function Scouting() {
  const repo = await getScoutingRepo();
  let data;
  try {
    const [scouts, channels, settings, spent, stats, tips] = await Promise.all([repo.scouts(), repo.channels(), repo.settings(), repo.monthSpendUsd(), repo.runStats(), repo.tips()]);
    data = { scouts, channels, settings, spent, stats, tips };
  } catch (e) {
    if (e instanceof MigrationMissingError) return <MigrationNotice detail={e.message} />;
    throw e;
  }
  const { scouts, channels, settings, spent, stats, tips } = data;
  const apiReady = !!process.env.ANTHROPIC_API_KEY && !isFixtureMode();
  const name = new Map(channels.map((c) => [c.id, c.name]));
  const openTips = tips.filter((t) => t.status === "open");

  return (
    <>
      <PageHead
        eyebrow="Redaktion"
        title="Scouting"
        actions={
          <>
            <Link href="/admin/scouting/quellen" className={btn.ghost}>Quellen ({channels.length})</Link>
            <Link href="/admin/scouting/neu" className={btn.primary}>Neuer Scout</Link>
          </>
        }
      >
        Euer Scouting-Stab: Jeder Scout hat sein Revier, seinen Auftrag und seine Quellen. Was er findet, landet als Meldung im Liveticker und als Vorschlag in der Review-Queue – veröffentlicht wird erst nach eurer Freigabe.
      </PageHead>

      {!apiReady && (
        <Card>
          <p className="eyebrow">Noch nicht startklar</p>
          <p className="mt-1">
            {isFixtureMode()
              ? "Testmodus: Scouts lassen sich konfigurieren, aber nicht starten."
              : "Für echte Läufe fehlt der Claude-API-Schlüssel. In Vercel unter Settings → Environment Variables als ANTHROPIC_API_KEY eintragen (Preview und Production), danach neu deployen."}
          </p>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4 md:grid-cols-2">
          {scouts.map((s) => (
            <ScoutCard key={s.id} scout={s} stats={stats[s.id]} channelNames={s.channelIds.map((id) => name.get(id) ?? "?")} apiReady={apiReady} />
          ))}
          {!scouts.length && <Empty>Noch keine Scouts.</Empty>}
        </div>
        <div className="flex flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <h2 className="!text-xl">Budget</h2>
            <div className="mt-3"><SettingsForm settings={settings} spent={spent} /></div>
          </Card>
          <Card>
            <h2 className="!text-xl">Tipp einreichen</h2>
            <p className="mt-1 mb-3 text-sm text-muted">Ein Link, den ein Scout auswerten soll – etwa ein LinkedIn-Beitrag, ein Artikel oder ein Video.</p>
            <TipForm scouts={scouts.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))} />
            {tips.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-3 text-sm">
                {tips.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex flex-col">
                    <a href={t.url} target="_blank" rel="noopener noreferrer" className="truncate">{t.url}</a>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge tone={t.status === "open" ? "neutral" : "muted"}>{{ open: "wartet", done: "ausgewertet", failed: "fehlgeschlagen" }[t.status]}</Badge>
                      {timeAgo(t.createdAt)}{t.error ? ` · ${t.error}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {openTips.length > 0 && <p className="mt-2 text-xs text-muted">{openTips.length} Tipps warten auf den nächsten Lauf.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
