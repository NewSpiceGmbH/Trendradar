import { Card } from "./ui";

/** Hinweis, solange Migration 0014 noch nicht angewendet ist */
export function NetworkNotice({ detail }: { detail: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Datenbank noch nicht bereit</p>
        <h2 className="!text-2xl">Migration 0014 fehlt</h2>
        <p>
          Die Netzwerk-Datenbank braucht die Erweiterung aus Pull Request „Migration 0014: Netzwerk-Datenbank“. Sobald er nach <code>main</code> übernommen
          ist, wendet Supabase sie an und diese Seite funktioniert.
        </p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
    </Card>
  );
}
