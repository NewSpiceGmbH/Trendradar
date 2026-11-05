import { Card } from "./ui";

/** Hinweis, solange Migration 0009 (Venture Clienting) noch nicht angewendet ist */
export function VentureNotice({ detail }: { detail: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <h2 className="!text-xl">Venture Clienting ist noch nicht eingerichtet</h2>
        <p>Die Datenbank kennt die Tabellen für Challenges und Startups noch nicht. Sobald der Pull Request mit Migration 0009 gemergt ist, geht es hier los.</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
    </Card>
  );
}
