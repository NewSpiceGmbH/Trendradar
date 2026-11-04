import type { Viewer } from "@/lib/auth/viewer";

/** Hinweis vor Ablauf des Zugangs (30 Tage vorher) */
export function ExpiryNotice({ viewer }: { viewer: Viewer }) {
  const o = viewer.activeOrg;
  if (viewer.isEditor || !o || o.daysLeft == null || o.daysLeft > 30) return null;
  return (
    <div role="status" className="border-b border-line bg-surface">
      <p className="mx-auto max-w-[1320px] px-4 py-2 text-sm sm:px-8">
        <b className="text-ink">Ihr Zugang für {o.name} endet {o.daysLeft === 0 ? "heute" : `in ${o.daysLeft} Tagen`}</b>{" "}
        (am {new Date(o.accessUntil!).toLocaleDateString("de-DE")}). Zur Verlängerung hilft Ihre Ansprechperson bei New Spice.
      </p>
    </div>
  );
}

export function NoAccess({ viewer }: { viewer: Viewer }) {
  const expired = viewer.orgs.find((o) => !o.active && o.accessUntil && o.accessUntil < new Date().toISOString().slice(0, 10));
  const future = viewer.orgs.find((o) => !o.active && o.accessFrom > new Date().toISOString().slice(0, 10));
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-24">
      <p className="eyebrow">Kein Zugang</p>
      <h1 className="!text-5xl">
        {expired ? "Ihr Zugang ist abgelaufen" : future ? "Ihr Zugang startet bald" : "Noch kein Zugang freigeschaltet"}
      </h1>
      <p className="text-lg">
        {expired
          ? `Der Zugang für ${expired.name} endete am ${new Date(expired.accessUntil!).toLocaleDateString("de-DE")}.`
          : future
            ? `Der Zugang für ${future.name} beginnt am ${new Date(future.accessFrom).toLocaleDateString("de-DE")}.`
            : "Ihr Konto ist noch keiner Organisation zugeordnet."}{" "}
        Ihre Ansprechperson bei New Spice hilft weiter.
      </p>
    </main>
  );
}
