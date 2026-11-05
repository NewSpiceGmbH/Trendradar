import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChannelLibrary } from "@/components/admin/channel-editor";
import { Card, MigrationNotice, PageHead } from "@/components/admin/ui";
import { MigrationMissingError } from "@/lib/admin/types";
import { getScoutingRepo } from "@/lib/agents/store";

export const metadata: Metadata = { title: "Quellen · Scouting · Redaktion" };

export default function ChannelsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Quellen werden geladen …</p>}>
      <Channels />
    </Suspense>
  );
}

async function Channels() {
  const repo = await getScoutingRepo();
  let channels, scouts;
  try {
    [channels, scouts] = await Promise.all([repo.channels(), repo.scouts()]);
  } catch (e) {
    if (e instanceof MigrationMissingError) return <MigrationNotice detail={e.message} />;
    throw e;
  }
  const usage: Record<string, number> = {};
  for (const s of scouts) for (const id of s.channelIds) usage[id] = (usage[id] ?? 0) + 1;
  return (
    <>
      <nav className="text-sm"><Link href="/admin/scouting">← Scouting</Link></nav>
      <PageHead eyebrow="Scouting" title="Quellen-Bibliothek">
        Alle angedockten Quellen. Jeder Scout bedient sich daraus. Zugangsdaten stehen nie hier, sondern als Umgebungsvariable in Vercel.
      </PageHead>
      <Card>
        <ChannelLibrary channels={channels} usage={usage} />
      </Card>
    </>
  );
}
