import type { ReactNode } from "react";
import { MEMBER_STATUS_LABEL, type MemberStatus } from "@/lib/network/types";

/** Kleine Bausteine der Netzwerk-Datenbank (Server und Client) */

export interface TrendInfo { number: number; name: string; cluster: string }

export function TrendTag({ t }: { t: TrendInfo }) {
  return (
    <span title={t.name} className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-line px-2 py-0.5 text-xs font-bold text-ink">
      <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: `var(--c${t.cluster})` }} />#{t.number}
      <span className="sr-only"> {t.name}</span>
    </span>
  );
}

export function TrendTags({ numbers, trends }: { numbers: number[]; trends: Map<number, TrendInfo> }) {
  const list = numbers.map((n) => trends.get(n)).filter((t): t is TrendInfo => Boolean(t));
  if (!list.length) return <span className="text-xs text-muted">–</span>;
  return <span className="flex flex-wrap gap-1">{list.map((t) => <TrendTag key={t.number} t={t} />)}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-[var(--radius-pill)] bg-sunk px-2 py-0.5 text-xs text-ink">{children}</span>;
}

const STATUS_TONE: Record<MemberStatus, string> = {
  qualified: "bg-ok text-ok-fg",
  review: "bg-warn text-warn-fg",
  on_hold: "border border-line text-ink",
  archived: "border border-line text-muted",
};

/** Status mit Text (Farbe nie allein) */
export function StatusBadge({ status }: { status: MemberStatus }) {
  return <span className={`inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-bold ${STATUS_TONE[status]}`}>{MEMBER_STATUS_LABEL[status]}</span>;
}

/** Siegel „New Spice approved“ als Limetten-Chip */
export function Seal() {
  return <span className="inline-flex items-center whitespace-nowrap rounded-[var(--radius-pill)] bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">New Spice approved</span>;
}
