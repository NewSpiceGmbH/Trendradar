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

1. Ordner als neues Git-Repo anlegen und auf GitHub pushen.
2. Supabase CLI installieren, dann `supabase init` (vorhandene Dateien behalten) und `supabase start`.
3. `supabase db reset` spielt Schema und Seed-Daten ein.
4. Im Repo `claude` starten, z. B. mit:
   „Lies CLAUDE.md und docs/agents.md. Plane Phase 1 der Roadmap und leg mir den Plan vor, bevor du baust.“
