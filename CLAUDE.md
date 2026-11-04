# New Spice Trendradar

Plattform mit Login, auf der KI-Agenten einen Trendradar für Sport, Hospitality und Live Entertainment
recherchieren, bewerten und pflegen. Eine Redaktion bei New Spice prüft und gibt frei. Kunden sehen das
Ergebnis als interaktiven Radar („Die Arena“).

Der Ausgangspunkt ist der HTML-Prototyp „Future of Experiences Radar“ in `reference/prototype.html`.
Er ist die **verbindliche Referenz für Inhalt, Begriffe, Aufbau und Interaktion**. Farben, Schriften und Formen
kommen aus der New-Spice-CI (`docs/ci.md`). Nicht kopieren, sondern in Komponenten nachbauen; die Daten kommen
aus der Datenbank.

## Stack

- Next.js (App Router, TypeScript, Server Components), Tailwind CSS
- Supabase: Postgres, Auth (E-Mail-Magic-Link, später SSO), Row-Level-Security, Storage
- Claude API (`@anthropic-ai/sdk`) mit Web-Search-Tool für die Agenten; Modell per `ANTHROPIC_MODEL` konfigurierbar
- Langlaufende Agenten-Jobs über eine Job-Queue (Vorschlag: Trigger.dev oder Inngest), nicht in normalen API-Routen,
  weil Recherche-Läufe die Timeouts von Serverless-Funktionen überschreiten
- Hosting: Vercel (App) + Supabase (DB)

## Repo-Struktur (Ziel)

```
app/                    Next.js-Routen
  (public)/login        Login
  (app)/radar           Arena, Filter, Trenddetail, Vergleich
  (app)/trends/[number] Trenddetail als eigene Seite (teilbar)
  (app)/premium         Top 10, Chancenfelder, Roadmap, Cases
  (admin)/review        Review-Queue für Agenten-Vorschläge
  (admin)/trends        Redaktionelle Bearbeitung
  (admin)/agents        Agenten-Läufe starten und protokollieren
  (admin)/customers     Kunden-Organisationen, Laufzeiten, Sitzplätze, Nutzung
  (app)/team            Owner verwaltet Team und Einladungen
  (public)/invite/[token] Einladung annehmen
  (public)/legal        Impressum, Datenschutz, Nutzungsbedingungen
components/radar/       Arena-SVG, Dots, Tooltip, Filterchips …
lib/scoring.ts          Bewertungslogik (muss identisch zur View trend_positions sein)
lib/agents/             Scout, Analyst, Scorer, Editor (siehe docs/agents.md)
lib/supabase/           Clients (Browser, Server, Service-Role nur serverseitig)
supabase/migrations/    SQL-Migrationen
supabase/seed.sql       Erzeugt aus seed/*.json – nicht von Hand bearbeiten
scripts/                extract-prototype.mjs, build-seed.mjs
seed/                   Aus dem Prototyp extrahierte Daten (JSON)
reference/              prototype.html
```

## Domänenmodell

Das Schema steht in `supabase/migrations/0001_init.sql`. Zentrale Begriffe:

- **Trend**: 44 Stück im Seed, öffentliche Nummer `#1 … #44` (`trends.number`, nicht die interne `id`).
- **Cluster** A–G: Fan & Guest Experience · AI, Data & Technology · Business Models & Monetization ·
  Venues & Smart Infrastructure · Culture, Lifestyle & Community · Sustainability & Resources ·
  Safety, Inclusion & Participation.
- **Fokusfelder** mit Unterthemen: Hospitality (HOS), Infrastruktur (INF), Fan Engagement (FAN).
- **Branchenrelevanz** 1–3 je Branche: Sport, Hospitality, Live Entertainment.
- **Herkunft**: EU, US, GLOBAL.
- **Evidenz** A/B/C (Annahme, mit Redaktion bestätigen: A = durch Primärquellen belegt,
  B = teilweise belegt, C = Wissensbasis/nicht verifiziert).
- **Perspektiven**: GLOBAL und EU. Die EU-Perspektive ist die Standardansicht. EU-Werte werden nur
  gespeichert, wenn sie abweichen (Horizont, Scores, Begründung `note`, eigene Quellen); sonst gilt GLOBAL.
- **Spielphasen (Zonen / Ringe der Arena)**: Anstoß (KICKOFF, „Jetzt umsetzen“), Aufwärmen
  (WARMUP, „Kompetenz und Piloten aufbauen“), Scouting (SCOUTING, „Systematisch beobachten“).

### Bewertungslogik – nicht ändern ohne Rücksprache

Sechs Kriterien, Scores 1–5, Gewichte:
Business Impact 0,25 · CX Impact 0,20 · Strategic Fit 0,20 · Market Readiness 0,15 ·
Innovation Potential 0,10 · Feasibility 0,10.

```
total = round(Σ score_i × weight_i, 2)
SCOUTING, wenn Horizont = 6–10 oder Market Readiness ≤ 2
KICKOFF,  wenn Horizont = 0–2 und (total ≥ 3,5 oder mandatory)
sonst WARMUP
```

Die View `trend_positions` setzt das in SQL um und ist gegen den Prototyp verifiziert (alle 88 Positionen
identisch). `lib/scoring.ts` muss dieselben Ergebnisse liefern; ein Unit-Test prüft das gegen
`seed/trends.json`. Die Position der Dots innerhalb eines Rings folgt `layout()` im Prototyp
(Sortierung nach total absteigend, dann Nummer) – dort nachlesen.

### Premium

Der Prototyp sieht einen gesperrten Premium-Bereich vor (Variable `PREMIUM`, Schloss-Icon), dessen Inhalte
in der Datei nicht enthalten sind: Top 10 mit „Warum priorisiert“, Handlungsempfehlung je Trend (`rec`),
Chancenfelder mit Partnern, Roadmap, umgesetzte New-Spice-Projekte (Cases). Im Schema existieren dafür bisher
`trend_premium` und `cases`. Chancenfelder und Roadmap sind noch zu modellieren, sobald die Inhalte vorliegen.

## Rollen & Zugriff

Die Plattform dient **intern und extern**: New Spice pflegt den Radar, Kunden (Clubs, Venues, Hotels,
Veranstalter) nutzen ihn über eigene Zugänge. Zugriffsregeln: `0001_init.sql` und `0002_external_access.sql`.

| Rolle | Wer | Darf |
|---|---|---|
| `admin` / `editor` (`profiles.platform_role`) | New-Spice-Redaktion | Alles redaktionell; Kunden-Orgs anlegen, Laufzeit/Sitzplätze/Tier setzen |
| `owner` (`memberships.role`) | Ansprechpartner beim Kunden | Kolleg:innen einladen und entfernen (bis `seats`), alles was `member` darf |
| `member` | Nutzer beim Kunden | Radar lesen, Merkliste, Notizen der eigenen Org, CSV-Export |

- **Vertrieb per Einladung, keine offene Registrierung.** Die Redaktion legt eine Organisation an und lädt den
  Owner ein; der Owner lädt sein Team ein. `accept_invitation(token)` prüft Gültigkeit, Ablauf und dass die
  E-Mail-Adresse des eingeloggten Nutzers zur Einladung passt. Der Magic-Link-Login darf keine Konten für
  Fremde anlegen: Login nur für bekannte Adressen oder über einen Einladungslink.
- **Laufzeit**: `organizations.access_from/access_until`. Abgelaufene Orgs sehen nichts mehr (in RLS verankert,
  nicht nur in der UI). Die UI zeigt rechtzeitig einen Hinweis vor Ablauf.
- **Tier**: `basic` sieht den Radar, `premium` zusätzlich die Premium-Inhalte.
- **Vertraulichkeit**: Notizen und Priorisierungen in `org_trend_notes` sieht nur die eigene Organisation –
  ausdrücklich auch nicht die New-Spice-Redaktion. Kunden sehen nie andere Kunden.
- RLS ist überall aktiv. Der Service-Role-Key wird ausschließlich serverseitig verwendet (Agenten-Jobs,
  Admin-Aktionen, E-Mail-Versand), niemals im Browser-Bundle. Kein Code darf RLS umgehen, um Kunden Daten
  anzuzeigen.
- Agenten, Review-Queue und Rohsignale sind rein intern; Kunden sehen nur freigegebene Inhalte.

### Anforderungen aus dem externen Betrieb

- **Recht**: Impressum, Datenschutzerklärung, Nutzungsbedingungen, AV-Vertrag als Vorlage für Kunden.
  Hosting in der EU (Supabase-Region Frankfurt, Vercel-Funktionen in `fra1`). Nur technisch notwendige Cookies.
- **Quellen und Urheberrecht**: Eigene Zusammenfassungen mit Link auf die Quelle; keine Volltexte oder
  längeren Zitate fremder Artikel speichern oder anzeigen.
- **Sicherheit**: Rate-Limiting für Login und Export, Sicherheits-Header (CSP), Abhängigkeiten aktuell halten,
  automatisierte RLS-Tests für jede Rolle (Redaktion, Owner, Member, abgelaufene Org, fremde Org).
- **Kundenerfolg**: `usage_events` protokolliert Nutzung ohne Inhalte; Auswertung nur für die Redaktion.
- **Später**: SSO (SAML/Microsoft Entra) für größere Kunden, Abrechnung (z. B. Stripe), Logo des Kunden im Kopf.

## Agenten

Details in `docs/agents.md`. Unverhandelbare Regeln:

1. Agenten schreiben **nie** direkt in `trends` oder verknüpfte Tabellen, sondern nur in `signals`,
   `proposals` und `agent_runs`. Veröffentlicht wird ausschließlich durch eine Freigabe in der Review-Queue.
2. Jede inhaltliche Aussage braucht eine Quelle mit erreichbarer URL. Ohne Quelle höchstens Evidenz C
   und `uncertain = true`, und das wird in der UI sichtbar gekennzeichnet („Wissensbasis, zu validieren“).
3. Jeder Score-Vorschlag enthält eine Begründung pro Kriterium.
4. Jede Freigabe erzeugt einen Eintrag in `trend_versions` (Snapshot vorher), damit Bewegungen im Radar
   nachvollziehbar sind.
5. Token-Verbrauch und Modell pro Lauf werden in `agent_runs` protokolliert.

## Design

- **CI in `docs/ci.md`** – Tokens in `app/globals.css`. Nur Tokens verwenden (`bg-surface`, `text-muted`,
  `text-accent-ink` …), keine Hex-Werte in Komponenten.
- Dunkel (Anthrazit) ist Standard, Hell (Creme) per `data-theme="light"`.
- Typografie: Archivo ExtraBold (Überschriften, Zahlen, Scores – Utility `num`), DM Sans (Text, Eyebrows –
  Utility `eyebrow`).
- Genau ein Limetten-Block je Ansicht als Blickfang. Limette nie als Clusterfarbe.
- Clusterfarben `--cA … --cG` mit Schriftfarbe `--cA-fg …`; geprüft für beide Modi. Bei Änderungen erneut
  validieren (Farbfehlsichtigkeit benachbarter Segmente, Kontrast).
- Ecken 16 px (Karten), 40 px (Pillen/Chips); Abstände 24–48 px.
- Sprache der Oberfläche: Deutsch. Typografische Anführungszeichen („…“) und Dezimalkomma bei Scores (3,85).
- Fachbegriffe des Prototyps beibehalten: Arena, Anstoß, Aufwärmen, Scouting, Cluster, Fokusfeld, Horizont.
- Barrierefreiheit: Arena per Tastatur bedienbar, Tooltips auch per Fokus, Kontraste prüfen.

## Arbeitsweise

- Next.js 16 weicht in vielen Punkten vom Trainingsstand ab (`proxy.ts` statt Middleware, Cache Components,
  `LayoutProps`/`PageProps`). Vor neuem Code die passende Doku in `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`).
- Supabase ist per GitHub-Integration angebunden: Migrationen in `supabase/migrations/` werden beim Merge in den
  Produktionsbranch auf das Supabase-Projekt angewendet. `supabase/config.toml` gilt für lokale Instanzen und Preview-Branches.
- Schema nur über neue Dateien in `supabase/migrations/` ändern, nie bestehende Migrationen editieren.
- Jede Änderung an Zugriffsregeln braucht einen Test in `tests/db/rls.test.sql`, der ohne die Änderung fehlschlägt.
  Ausführen: `npm run test:db -- --fresh` gegen ein beliebiges Postgres (`DATABASE_URL`) oder nach
  `supabase db reset` direkt gegen die lokale Supabase-Datenbank (`npm run test:db`).
  Achtung bei UPDATE-Tests: Mit `WHERE` prüft Postgres die neue Zeile zusätzlich gegen die SELECT-Regel –
  Angriffe deshalb auch ohne `WHERE` testen.
- Nach Änderungen an `seed/*.json`: `node scripts/build-seed.mjs && supabase db reset`.
- Typen aus der DB erzeugen: `supabase gen types typescript --local > lib/supabase/types.ts`.
- Tests: Vitest für `lib/scoring.ts` und Agenten-Parser; Playwright für Login und Radar.
- Keine Secrets im Repo. `.env.local` (Vorlage: `.env.example`) enthält `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (alternativ der alte `…_ANON_KEY`), `SUPABASE_SECRET_KEY`
  (alternativ `SUPABASE_SERVICE_ROLE_KEY`), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.
- Der Secret-/Service-Role-Key nur über `lib/supabase/admin.ts` (ist `server-only`).
- Erst planen, dann bauen: Bei größeren Aufgaben zuerst einen kurzen Plan vorlegen.

## Roadmap

1. **Kern**: Next.js-Setup, Supabase lokal, Login per Einladung, Rollen, Radar aus der DB nachbauen (Arena,
   Filter, Perspektive EU/Global, Trenddetail, Vergleich, Tabelle, Quellen, CSV-Export), Admin-Bearbeitung,
   Kundenverwaltung (Orgs anlegen, einladen, Laufzeit), Team-Seite für Owner, Merkliste, Notizen,
   Rechtsseiten, RLS-Tests je Rolle.
2. **Agenten**: Review-Queue, Scout → Analyst → Scorer → Editor, zunächst manuell per Button gestartet.
3. **Automatisierung**: Zeitplan, Linkprüfung der Quellen, Benachrichtigungen, Radar-Bewegung über `trend_versions`,
   Premium-Module (Chancenfelder, Roadmap), Nutzungsauswertung je Kunde.
4. **Skalierung extern**: SSO, Abrechnung, Kunden-Branding, ggf. kundenspezifische Gewichtung der Kriterien.
