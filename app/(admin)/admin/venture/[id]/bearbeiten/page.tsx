import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHead } from "@/components/admin/ui";
import { ChallengeEditor } from "@/components/admin/venture";
import { getAdminRepo } from "@/lib/admin/repo";
import { getVentureRepo } from "@/lib/venture/store";

export const metadata: Metadata = { title: "Challenge bearbeiten · Venture Clienting" };

export default function EditChallengePage(props: PageProps<"/admin/venture/[id]/bearbeiten">) {
  return (
    <Suspense fallback={<p className="text-muted">Wird geladen …</p>}>
      <Edit params={props.params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: PageProps<"/admin/venture/[id]/bearbeiten">["params"] }) {
  const { id } = await params;
  const [c, trends] = await Promise.all([(await getVentureRepo()).challenge(id), (await getAdminRepo()).trends()]);
  if (!c) notFound();
  const { id: _i, lastRunAt: _l, createdAt: _c, ...input } = c;
  void _i; void _l; void _c;
  return (
    <>
      <PageHead eyebrow="Venture Clienting" title="Challenge bearbeiten" />
      <ChallengeEditor challengeId={id} initial={input} trends={trends.map((t) => ({ number: t.fields.number, name: t.fields.name })).sort((a, b) => a.number - b.number)} />
    </>
  );
}
