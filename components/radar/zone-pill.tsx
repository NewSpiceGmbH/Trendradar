import type { Zone } from "@/lib/scoring";

const STYLE: Record<Zone, string> = {
  KICKOFF: "text-accent-ink",
  WARMUP: "text-ink",
  SCOUTING: "text-muted",
};

/** Spielphase als Label. Die Phase steht immer als Text da, nie nur als Farbe. */
export function ZonePill({ zone, name }: { zone: Zone; name: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.1em] ${STYLE[zone]}`}>
      <span aria-hidden className={zone === "SCOUTING" ? "size-2 rounded-full border border-current" : "size-2 rounded-full bg-current"} />
      {name}
    </span>
  );
}
