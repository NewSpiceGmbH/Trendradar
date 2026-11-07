import { Card } from "./ui";

/** Hinweis, solange Migration 0015 noch nicht angewendet ist */
export function ApplicationsNotice({ detail }: { detail: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Datenbank noch nicht bereit</p>
        <h2 className="!text-2xl">Migration 0015 fehlt</h2>
        <p>Der Eingang braucht die Erweiterung aus Pull Request „Migration 0015: Bewerbungen, Änderungsanfragen, Zugangsarten“. Sobald er nach <code>main</code> übernommen ist, funktioniert diese Seite.</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
    </Card>
  );
}
