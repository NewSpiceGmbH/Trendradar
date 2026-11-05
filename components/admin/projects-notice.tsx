import { Card } from "./ui";

/** Hinweis, solange Migration 0010 (Projekte) noch nicht angewendet ist */
export function ProjectsNotice({ detail }: { detail: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <h2 className="!text-xl">Projekte sind noch nicht eingerichtet</h2>
        <p>Die Datenbank kennt die Tabellen für Projekte noch nicht. Sobald der Pull Request mit Migration 0010 gemergt ist, geht es hier los.</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
    </Card>
  );
}
