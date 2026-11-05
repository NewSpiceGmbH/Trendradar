"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreVersion } from "@/lib/admin/actions";

/** Stellt eine Version wieder her (der aktuelle Stand wird vorher selbst als Version gesichert) */
export function RestoreButton({ versionId }: { versionId: number }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (!confirm) {
    return <button type="button" onClick={() => setConfirm(true)} className="text-xs font-bold text-ink underline hover:opacity-80">Wiederherstellen</button>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">Diesen Stand wiederherstellen?</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => start(async () => {
          const r = await restoreVersion(versionId);
          if (r.ok) { setConfirm(false); router.refresh(); } else setError(r.error);
        })}
        className="font-bold text-ink underline"
      >
        Ja
      </button>
      <button type="button" onClick={() => setConfirm(false)} className="text-muted underline">Nein</button>
      {error && <span className="text-[var(--cA)]">{error}</span>}
    </span>
  );
}
