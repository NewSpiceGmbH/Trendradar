# New Spice Trendradar

Startpaket für den Aufbau mit Claude Code. Projektkontext und Regeln stehen in `CLAUDE.md`.

## Inhalt

- `CLAUDE.md` – Ziel, Stack, Domänenmodell, Bewertungslogik, Rollen, Roadmap
- `docs/agents.md` – Spezifikation der vier KI-Agenten und der Review-Queue
- `supabase/migrations/0001_init.sql` – Datenbankschema inkl. RLS und Bewertungs-View
- `supabase/migrations/0002_external_access.sql` – Kundenbetrieb: Einladungen, Sitzplätze, Laufzeiten, Merkliste, Notizen
- `supabase/seed.sql` – die 44 Trends, 85 Quellen und 43 Partner aus dem Prototyp
- `seed/*.json` – dieselben Daten als JSON
- `scripts/` – Extraktion aus dem Prototyp und Erzeugung der seed.sql
- `reference/prototype.html` – der ursprüngliche Prototyp als Design-Referenz

## Loslegen

```bash
npm install
cp .env.example .env.local     # Werte aus `npx supabase status -o env` eintragen
npx supabase start             # braucht Docker
npx supabase db reset          # Schema + Seed
npm run dev
```

Prüfen: `npm run lint`, `npm run typecheck`, `npm test` (Bewertungslogik), `npm run test:db` (Zugriffsregeln).
Nach Änderungen an `seed/*.json`: `npm run seed:build && npx supabase db reset`.
