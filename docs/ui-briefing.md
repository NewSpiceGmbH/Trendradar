# Briefing: Oberfläche New Spice Trendradar

Stand: 06.11.2026. Ziel dieser Phase: die Oberfläche gestalterisch neu denken, **nicht in die App programmieren**.
Entwürfe entstehen als statische HTML-Seiten in `design/` und werden als privater Link (Artifact) zur Ansicht
veröffentlicht. In die App (`dev`) kommt eine Ansicht erst nach Freigabe – dann mit Daten, Tests und Vorschau.

## 0. Arbeitsweise in Claude Code
- **Eine Ansicht nach der anderen**, erst grob (Wireframe), dann fein. Feedback gebündelt.
- **Entwürfe:** `design/<nr>-<ansicht>/index.html` (eine Datei, kein Framework). Farben, Glas und Schriften nur aus
  `app/globals.css` (Tokens kopieren, keine eigenen Hex-Werte), Schriften Archivo 800 + DM Sans (Google Fonts),
  Logo aus `design/logos/`. Inhalte aus `seed/*.json` bzw. den Beispielen unten. Je Entwurf Desktop 1440 px und Handy
  390 px, dunkel und hell.
- **Veröffentlichen:** jede Runde als Artifact an dieselbe Adresse, damit der Link gleich bleibt; Screenshots zum
  Selbstprüfen mit Playwright (vorinstalliert).
- **Heutigen Stand ansehen:** `RADAR_FIXTURES=1 npm run build && RADAR_FIXTURES=1 npx next start -p 3220`, Login über
  die Demo-Zugänge, Seiten wie unten. Die Nummern der Ansichten beziehen sich auf diese Seiten.
- **Nicht anfassen**, solange nicht freigegeben: `app/`, `components/`, `lib/`, Migrationen. Kein Push nach `main`.
- **Sparsam:** keine Builds/Tests für Entwürfe; Screenshots in Gerätepixel 1; pro Ansicht eine neue Session, wenn
  der Verlauf lang wird.

## 1. Worum es geht
Plattform von **New Spice** (Beratung für Sport, Hospitality, Live Entertainment). KI-Agenten recherchieren Trends,
Meldungen und Startups; die New-Spice-Redaktion prüft und gibt frei. Kunden (Clubs, Arenen, Venues, Hotels,
Veranstalter) sehen das Ergebnis und arbeiten mit New Spice an Projekten.

Zwei Bereiche:
- **Kundenportal** (Kunden und Redaktion): Dashboard (3D), 2D-Ansicht, News-Ticker, Projekte
- **Backend „Redaktion“** (nur New Spice): Lagebild, Freigaben, Agenten, Startups, Projekte, Kunden

## 2. Leitlinien (aus den bisherigen Wünschen)
- **Clean, wenig Information auf einmal**, sehr gute Visualisierung des Radars.
- **Interaktives Werkzeug mit Ebenen**, die sich beim Hineinzoomen öffnen (Überblick → Ort/Tribüne → Trend → Detail).
- **Lädt zum Erkunden ein und erzählt eine Geschichte** (geführte Tour „Ein Spieltag 2030“).
- **3D-Stadion in seiner Umgebung** (Referenz: Spectra-Dashboard auf Dribbble, „AI-Powered Real-Time Stadium
  Analytics Dashboard“). Die Umgebung trägt die Customer Journey von zuhause bis ins Stadion.
- **Glas-Optik wie bei Apple** (getönte, unscharfe Flächen mit Lichtkante – Tokens `glass`, `glass-strong`).
- **New-Spice-CI:** Anthrazit, Creme, Sand, Limette als einziger Akzent. Logo oben links, kein Claim, kein großer Titel.
- **Hospitality (VIP) und Public** werden unterschieden – als Filter und je Trend.
- Barrierefrei: Tastatur, Fokus sichtbar, Kontraste geprüft; Clusterfarbe nie die einzige Information.

## 3. Begriffe (bitte genau so verwenden)
- **Trend** mit Nummer **#1–#44**, **Cluster A–G** (Farben `--cA … --cG`):
  A Fan & Guest Experience · B AI, Data & Technology · C Business Models & Monetization ·
  D Venues & Smart Infrastructure · E Culture, Lifestyle & Community · F Sustainability & Resources ·
  G Safety, Inclusion & Participation
- **Fokusfeld:** Hospitality, Infrastruktur, Fan Engagement
- **Spielphasen (Ringe der Arena):** **Anstoß** („Jetzt umsetzen“, Spielfeld), **Aufwärmen** („Kompetenz und
  Piloten aufbauen“, Unterrang), **Scouting** („Systematisch beobachten“, Oberrang)
- **Horizont:** 0–2, 3–5, 6–10 Jahre · **Evidenz:** A/B/C · **Perspektive:** Europa/DACH (Standard) oder Global
- **Score:** sechs Kriterien 1–5, gewichtet (Business Impact 25 %, CX 20 %, Strategic Fit 20 %, Market Readiness 15 %,
  Innovation 10 %, Feasibility 10 %), Gesamtscore mit Dezimalkomma (4,10). Die Logik ist fest, nicht Teil der Gestaltung.
- **Orte der Customer Journey:** Zuhause · Anreise & Parken · Region & Hotel · Vorplatz & Einlass · Im Stadion ·
  Hinter den Kulissen
- **Szenen (begehbare Use-Cases):** Verkaufsstand (Kasse, Mobile Order, Zapfwand, Pfandautomat …), VIP-Lounge
- **Liveticker:** freigegebene Meldungen der Scouts, jeweils einem Trend zugeordnet, mit Link zur Quelle
- **Venture Clienting:** Challenge (Problemstellung) → Problem Deep Dive → Startup-Suche mit Vorevaluierung →
  Startup-Datenbank → Shortlist im Projekt → Pilot → Siegel **„New Spice approved“**

## 4. Ansichten heute

Adressen im Testmodus: Dashboard `/radar` (Journey `?v=journey`, Radar `?v=radar`, Tribüne `?v=radar&c=D`,
Trend `?o=stadion&t=24`, Detail `&d=1`, Szenen `?s=kiosk` / `?s=lounge`), `/news`, `/radar/klassisch`, `/projekte`,
`/projekte/pr-1`, `/login`; Backend `/admin`, `/admin/ticker`, `/admin/scouting`, `/admin/venture/ch-1`,
`/admin/startups`, `/admin/projekte/pr-1`, `/admin/kunden/a`, `/admin/trends`, `/admin/review`.

### Kundenportal
| Nr. | Ansicht | Muss zeigen / können |
|---|---|---|
| 01 | **Login** | Logo, Magic-Link per E-Mail (kein Passwort), Hinweis „nur per Einladung“ |
| 02 | **Dashboard – Tour** | geführte Tour (11 Stationen) über die Szene: große Zahl, Titel, Text, Weiter/Zurück, überspringen |
| 03 | **Dashboard – Journey** | 3D-Stadion in der Stadt, 6 Orte als Beschriftungen mit Trendanzahl, Trends als Punkte über den Orten; oben: Journey/Radar, Alle/Hospitality/Public, Europa/Global, Tour starten; unten: Zahl je Spielphase (der eine Limetten-Block), „x von 44 entdeckt“; rechts: Liveticker-Spalte (einklappbar) |
| 04 | **Dashboard – Radar** | im Stadion: Tribünen = Cluster, Ringe = Spielphasen, Punktgröße = Business Impact |
| 05 | **Tribüne gewählt** | Kamera auf ein Cluster, Seitenpanel mit Trendliste (nach Score) |
| 06 | **Trend-Kurzpanel** | Cluster, Nummer, Name, Score, ein Satz, Phase/Horizont/Ort/Zielgruppe, neueste News, „Mehr erfahren“ |
| 07 | **Trend-Detail (Ebene 3)** | Netzdiagramm der 6 Kriterien, Spielphase als Skala, Relevanz je Branche, Tabs (Anwendung, Markt, News, Startups, Partner, Quellen, Empfehlung), vor/zurück, Link teilen |
| 08/09 | **Szenen** | Verkaufsstand bzw. VIP-Lounge als Diorama mit klickbaren Objekten (Hotspot = Trend) |
| 10 | **News-Ticker** | Meldungen chronologisch, Themenfilter (Cluster), Link zur Quelle, Trend-Chip |
| 11 | **2D-Ansicht** | klassischer Radar (Kreis), Filter, Trendkarte, Methodik – *wird von New Spice selbst überarbeitet* |
| 12/13 | **Projekte (Kunde)** | Liste mit Phasenleiste, Anfrageformular; Projekt: Phase, Shortlist mit „Warum für Sie“, Kosten (wenn freigegeben), Rückmeldung „Interessant/Passt nicht“, Meilensteine, Nachrichten, Dokumente |
| 23–25 | **Handy** | Dashboard, Trend-Detail, Projekt |

Wichtig im Dashboard: Der **Liveticker** ist rechts dauerhaft da, einklappbar; eingeklappt meldet er sich nur
auffällig („Neu · 2“), wenn es ungesehene Meldungen gibt. Trends mit neuer Meldung pulsieren in der Szene.

### Backend „Redaktion“
| Nr. | Ansicht | Muss zeigen / können |
|---|---|---|
| 14 | **Cockpit / Lagebild** | Kennzahlen (offene Vorschläge, Meldungen ohne Freigabe …), drei Spalten: Sport & Hospitality · Startups & Technologie · Cross-Industry, je wichtigste Meldungen mit Relevanz; dazu „Als Nächstes prüfen“, Radar heute |
| 15 | **Liveticker** | Meldungen freigeben/verwerfen, Trend zuordnen, Filter nach Status und Bereich |
| 16 | **Scouting** | „Kader“ der KI-Scouts als Karten (Rückennummer, Revier, Takt, Läufe, Trefferquote, Kosten), Budget, Not-Aus, Tipp einreichen |
| 17 | **Challenge + Deep Dive** | Problem, Rahmen, Agent-Status; Problem Deep Dive: Notion-Link einlesen, Problem-Briefing (Problem, Schmerzpunkte, Ziele, Muss-Kriterien, Suchhypothesen, offene Fragen); Kandidaten mit Vorevaluierung (7 Kriterien, Score, Empfehlung) und Entscheidung |
| 18 | **Startup-Datenbank** | Liste mit Filter, Profil mit öffentlichen und vertraulichen Angaben, „Im Radar veröffentlichen“ |
| 19 | **Projekt (Redaktion)** | Phase, Ansprechperson, Shortlist kuratieren (freigeben, Kosten freigeben, Stand), Meilensteine, Nachrichten (auch intern), Dokumente, Abschluss → Siegel |
| 20 | **Kunde** | Vertrag (Laufzeit, Paket, Sitzplätze), Team, Einladungslinks |
| 21/22 | **Trends, Review-Queue** | Trends bearbeiten mit Vorschau der Arena-Position; Vorschläge der Agenten freigeben |

Weitere Backend-Seiten mit ähnlichem Aufbau: Trenddatenbank, Quellenverzeichnis, Agenten-Protokoll, Team.

## 5. Navigation heute
- **Kundenportal oben:** Logo · Dashboard (3D) · 2D-Ansicht · News-Ticker · Projekte · Hell/Dunkel · Name · Abmelden
  (Redaktion zusätzlich „Redaktion“). Am Handy: 3D · 2D · News · Projekte, Abmelden als Symbol.
- **Backend:** Logo „Redaktion“ · Zum Dashboard; links eine Seitennavigation (Cockpit, Review-Queue, Liveticker,
  Trends, Trenddatenbank, Quellenverzeichnis, Scouting, Venture Clienting, Startup-Datenbank, Projekte, Kunden,
  Agenten, Team) – wird lang, gern neu ordnen (z. B. Gruppen: Inhalte · Agenten · Venture Clienting · Kunden).

## 6. Rahmen, die bleiben
- Farben nur aus den Tokens in `app/globals.css` (CI-Regeln in `docs/ci.md`). Ecken 16 px (Karten), 40 px (Pillen). Abstände 24–48 px.
- Archivo ExtraBold für Überschriften und Zahlen (`num`, gleich breite Ziffern), DM Sans für Text, Eyebrows in
  Versalien mit Laufweite.
- **Ein Limetten-Block je Ansicht** (heute: „Anstoß“-Zahl im Dashboard, „Offene Vorschläge“ im Cockpit).
- Dunkel ist Standard, Hell muss auch funktionieren.
- Vertrauliches (Kosten, Kontakte) ist im Kundenportal nur sichtbar, wenn freigegeben – im Entwurf kennzeichnen.
- Das 3D-Stadion selbst (Szene) lässt sich im Chat nur andeuten: Für Entwürfe einen Screenshot als Hintergrund
  nehmen und die **Bedienoberfläche darüber** gestalten (Leisten, Panels, Ticker, Tour, Beschriftungen).
  Änderungswünsche an der Szene (Kamera, Gebäude, Farben, Punkte) bitte in Worten oder als Skizze festhalten.

## 7. Offene Gestaltungsfragen (Vorschlag zum Einstieg)
1. **Bedienleiste im Dashboard:** vier Pillen-Gruppen nebeneinander – zu viel? Zusammenfassen (z. B. ein „Ansicht &
   Filter“-Menü)?
2. **Liveticker-Spalte:** Breite, Dichte, wie auffällig „Neu“ sein darf; Verhältnis zur Szene.
3. **Ebenen-Übergänge:** Kurzpanel → Detail – Panel rechts, Vollbild oder Karte über der Szene?
4. **Trend-Detail:** sieben Tabs – zu viele? Was gehört auf die erste Ansicht?
5. **Tour:** Erzählweise und Position der Karte; wie fühlt sich „Ein Spieltag 2030“ an?
6. **Handy:** Dashboard als Liste statt 3D? Wie viel Szene braucht es mobil?
7. **Backend:** Seitennavigation gruppieren; Cockpit als Lagebild – dichter oder luftiger?
8. **Projekte im Kundenportal:** eher Projektmanagement (Liste, Meilensteine) oder eher „Journey“ (Phasen als Story)?

## 8. Übergabe nach Freigabe
Je freigegebener Ansicht bitte zusammenfassen:
- Artifact-Link und Datei `design/<nr>-<ansicht>/index.html` (Desktop + Handy, dunkel + hell)
- Notiz `design/<nr>-<ansicht>/UEBERGABE.md` mit den folgenden Punkten
- **Was ist neu** gegenüber heute (Stichpunkte), **was entfällt**
- **Bausteine**, die mehrfach vorkommen (z. B. Glas-Panel, Trend-Chip, Phasenleiste) mit Zuständen (Standard, Hover, aktiv, leer)
- **Interaktionen:** was passiert bei Klick, Hover, Tastatur, Esc; Übergänge/Animationen
- **Texte**, die neu sind oder sich ändern
- **Offene Punkte**

## 9. Beispielinhalte
Echte Trends, Cluster, Spielphasen: `seed/trends.json`, `seed/clusters.json`, `seed/zones.json`.
Ticker, Startups, Projekte, Problem-Briefing: Beispiele im Testmodus in `lib/admin/fixture-repo.ts`,
`lib/venture/fixture.ts`, `lib/projects/fixture.ts`.
