# New Spice Trendradar

Startpaket für den Aufbau mit Claude Code. Projektkontext und Regeln stehen in `CLAUDE.md`.

## Inhalt

- `CLAUDE.md` – Ziel, Stack, Domänenmodell, Bewertungslogik, Rollen, Roadmap
- `docs/agents.md` – Spezifikation der vier KI-Agenten und der Review-Queue
- `supabase/migrations/0001_init.sql` – Datenbankschema inkl. RLS und Bewertungs-View
- `supabase/migrations/0002_external_access.sql` – Kundenbetrieb: Einladungen, Sitzplätze, Laufzeiten, Merkliste, Notizen
- `supabase/migrations/0004_initial_content.sql` – die 44 Trends, 85 Quellen und 43 Partner aus dem Prototyp
- `supabase/migrations/0005_demo_accounts.sql` – Demo-Zugänge für den Prototyp (vor Livegang entfernen)
- `seed/*.json` – dieselben Daten als JSON
- `scripts/` – Extraktion aus dem Prototyp und Erzeugung der Startinhalte-Migration
- `reference/prototype.html` – der ursprüngliche Prototyp als Design-Referenz

## Loslegen

```bash
npm install
cp .env.example .env.local     # Werte aus `npx supabase status -o env` eintragen
npx supabase start             # braucht Docker
npx supabase db reset          # Schema + Seed
npm run dev
```

Prüfen: `npm run lint`, `npm run typecheck`, `npm test` (Bewertungslogik), `npm run test:db` (Zugriffsregeln),
`npm run test:e2e` (Klickpfade im Testmodus).

Ohne Datenbank ausprobieren: `RADAR_FIXTURES=1 npm run dev` – Login über die Demo-Zugänge, Daten aus `seed/*.json`.

## Vorschau (Vercel + Supabase-Branching)

Einrichtung im Vercel-Projekt `trendradar` (Team New Spice):
- Settings → Environments → Production → Branch Tracking: `main`. Jeder andere Branch bzw. Pull Request baut eine Preview.
- Supabase-Integration ohne Präfix verbunden, „Supabase Preview Branch“ nur für Preview.
- Funktionen laufen in Frankfurt (`vercel.json`: `fra1`).

- Vercel-Umgebungsvariablen: `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (bzw. `…_ANON_KEY`)
  setzt die Supabase-Vercel-Integration. Zusätzlich **nur für „Preview“**: `DEMO_LOGIN=1` (Name exakt so, Großschreibung
  zählt). Vercel übernimmt geänderte Variablen erst mit dem nächsten Deployment.
- Inhalte und Demo-Zugänge kommen per Migration (0004/0005) in die Datenbank, auch ohne Supabase-Branching. Damit gibt es
  fünf Demo-Zugänge (Redaktion, Owner, Member, Premium, abgelaufen; Passwort `trendradar-demo`).
- In Produktion: kein `DEMO_LOGIN`, keine Demo-Konten. Login nur per Magic-Link für eingeladene Adressen.
Nach Änderungen an `seed/*.json`: `npm run seed:build && npx supabase db reset`.

## Scouting (Agenten)

Backend unter `/admin/scouting`. Für echte Läufe in Vercel (Production und Preview, als Secret):
- `ANTHROPIC_API_KEY` – Claude-API (Modell je Scout einstellbar, Standard Claude Opus 5.5). Schlüssel in einem Workspace anlegen; sonst zusätzlich
  `ANTHROPIC_WORKSPACE_ID` (Config, `wrkspc_…`) setzen
- `CRON_SECRET` – schützt den Zeitplan (`vercel.json`: stündlich `/api/scouting/cron`; Vercel ruft Zeitpläne nur in Produktion auf, in Vorschauen per „Lauf starten“)
- `SUPABASE_SECRET_KEY` bzw. `SUPABASE_SERVICE_ROLE_KEY` – setzt die Supabase-Integration; damit schreiben die Scouts Meldungen
- optional `YOUTUBE_API_KEY` für Quellen vom Typ YouTube

Neue Variablen wirken erst mit dem nächsten Deployment.

## Venture Clienting

Backend unter `/admin/venture` (Challenges) und `/admin/startups` (qualifizierte Startup-Datenbank).
- Eine Challenge beschreibt ein konkretes Problem (Ist, Ziel, Muss-Kriterien, Rahmen). „Startups suchen“ startet den
  Venture-Agenten (`lib/venture/`): Suchstrategie, Recherche, Vorevaluierung nach 7 gewichteten Kriterien, Empfehlung.
- Der Agent schreibt nur Kandidaten (`startup_candidates`). In die Datenbank kommt ein Startup ausschließlich über
  `decide_candidate()` (Redaktion). Kontakt, Kosten und Pitchdeck liegen getrennt in `startup_private` (nur Redaktion).
- Veröffentlichte Profile sehen Kunden im Trenddetail unter „Startups“. Budget und Not-Aus teilen sich Scouts und Venture-Agent.

## Kunden und Projekte

- `/admin/kunden`: Organisationen mit Laufzeit, Paket und Sitzplätzen; Einladungen als Link (14 Tage gültig).
  Die eingeladene Person öffnet `/invite/<token>`, bekommt einen Magic-Link an genau diese Adresse und nimmt an.
  E-Mail-Versand der Einladung selbst folgt mit eigenem SMTP-Dienst (Resend).
- `/projekte` (Kunden): Projekt anfragen, Fortschritt, Shortlist mit Rückmeldung, Nachrichten, Dokumente.
- `/admin/projekte` (Redaktion): Anfrage → Challenge für den Venture-Agenten → kuratierte Shortlist (einzeln freigeben,
  Kosten/Pitchdeck optional) → Meilensteine → Abschluss. Bei Erfolg erhalten ausgewählte Startups „New Spice approved“.
- Dokumente liegen im privaten Supabase-Bucket `project-files`; die Speicherregeln folgen den Einträgen in
  `project_documents` (Migration 0010).
