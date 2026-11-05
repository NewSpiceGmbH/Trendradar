import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHead } from "@/components/admin/ui";
import { ChallengeEditor } from "@/components/admin/venture";
import { getAdminRepo } from "@/lib/admin/repo";
import type { ChallengeInput } from "@/lib/venture/store";

export const metadata: Metadata = { title: "Neue Challenge · Venture Clienting" };

const EMPTY: ChallengeInput = {
  title: "", problem: "", goal: "", context: "", audience: "both", journeyStages: [], trendNumbers: [], regions: ["DACH", "EU"],
  minMaturity: "pilot", mustHaves: ["DSGVO-konform"], exclusions: [], leads: [], timeframe: null, budget: null, status: "draft",
  maxCandidates: 8, maxSearches: 15, maxCostUsd: 3, model: "claude-opus-5-5", effort: "high",
};

export default function NewChallengePage() {
  return (
    <Suspense fallback={<p className="text-muted">Wird geladen …</p>}>
      <NewChallenge />
    </Suspense>
  );
}

async function NewChallenge() {
  const trends = (await (await getAdminRepo()).trends()).map((t) => ({ number: t.fields.number, name: t.fields.name })).sort((a, b) => a.number - b.number);
  return (
    <>
      <PageHead eyebrow="Venture Clienting" title="Neue Challenge">
        Beschreibt das Problem so, wie der Kunde es erlebt, und woran ihr Erfolg messt. Daraus leitet der Agent Lösungsansätze und Suchbegriffe ab.
      </PageHead>
      <ChallengeEditor challengeId={null} initial={EMPTY} trends={trends} />
    </>
  );
}
