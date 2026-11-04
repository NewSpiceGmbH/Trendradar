const CLUSTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[1260px] flex-col gap-8 px-4 py-16 sm:px-8">
      <p className="eyebrow">New Spice · Future of Experiences</p>
      <h1>Trendradar</h1>
      <p className="max-w-prose text-lg">
        Grundgerüst steht. Login, Arena und Redaktion folgen in den nächsten Schritten der Roadmap.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-[var(--radius-card)] bg-accent p-8 text-on-accent">
          <p className="num text-7xl leading-none">44</p>
          <p className="mt-2 font-bold">Trends in der Arena</p>
        </section>
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-8">
          <p className="eyebrow !text-muted">Cluster</p>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Clusterfarben">
            {CLUSTERS.map((c) => (
              <li
                key={c}
                className="num grid size-10 place-items-center rounded-full text-sm"
                style={{ background: `var(--c${c})`, color: `var(--c${c}-fg)` }}
              >
                {c}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
