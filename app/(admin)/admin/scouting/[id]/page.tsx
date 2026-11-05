import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ScoutEditor } from "@/components/admin/scout-editor";
import { Card, MigrationNotice, PageHead, formatDate } from "@/components/admin/ui";
import { getAdminRepo } from "@/lib/admin/repo";
import { MigrationMissingError } from "@/lib/admin/types";
import { getScoutingRepo } from "@/lib/agents/store";
import type { Scout } from "@/lib/agents/types";

export const metadata: Metadata = { title: "Scout · Redaktion" };

const EMPTY: Omit<Scout, "id" | "lastRunAt" | "key"> = {
  name: "", role: null, shirtNumber: null, briefing: "", keywords: [], exclusions: [], verticals: [], clusters: [], journeyStages: [],
  audience: "both", regions: ["DACH", "EU"], languages: ["de", "en"], watchTrends: [], cadence: "daily", runHour: 5, runWeekday: null,
  maxSearches: 12, maxCostUsd: 2, maxSignals: 8, deliverMedia: true, minEvidence: "B", model: "claude-opus-5-5", effort: "medium",
  active: false, channelIds: [],
};

export default function ScoutPage(props: PageProps<"/admin/scouting/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Scout wird geladen …</p>}>
      <Edit params={props.params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: PageProps<"/admin/scouting/[id]">["params"] }) {
  const { id } = await params;
  const isNew = id === "neu";
  const [repo, admin] = await Promise.all([getScoutingRepo(), getAdminRepo()]);
  let scouts, channels;
  try {
    [scouts, channels] = await Promise.all([repo.scouts(), repo.channels()]);
  } catch (e) {
    if (e instanceof MigrationMissingError) return <MigrationNotice detail={e.message} />;
    throw e;
  }
  const [lookups, trends] = await Promise.all([admin.lookups(), admin.trends()]);
  const scout = isNew ? null : scouts.find((s) => s.id === id);
  if (!isNew && !scout) notFound();
  const initial = scout ? (({ id: _i, lastRunAt: _l, key: _k, ...rest }) => (void _i, void _l, void _k, rest))(scout) : { ...EMPTY, channelIds: channels.filter((c) => c.kind === "web_search").map((c) => c.id) };

  return (
    <>
      <nav className="text-sm"><Link href="/admin/scouting">← Scouting</Link></nav>
      <PageHead eyebrow={isNew ? "Neuer Scout" : `Scout${scout!.shirtNumber ? ` · Nr. ${scout!.shirtNumber}` : ""}`} title={isNew ? "Neuer Scout" : scout!.name}>
        {scout?.lastRunAt ? `Letzter Lauf ${formatDate(scout.lastRunAt)}.` : "Noch kein Lauf."}
      </PageHead>
      {!isNew && (
        <Card><p className="text-sm">Ergebnisse dieses Scouts erscheinen im <Link href="/admin/ticker">Liveticker</Link>; Kosten und Fehler je Lauf unter <Link href="/admin/agents">Agenten</Link>.</p></Card>
      )}
      <ScoutEditor
        key={scout?.id ?? "neu"}
        scoutId={scout?.id ?? null}
        initial={initial}
        channels={channels}
        clusters={lookups.clusters}
        trends={trends.filter((t) => t.fields.status === "published").map((t) => ({ number: t.fields.number, name: t.fields.name }))}
      />
    </>
  );
}
