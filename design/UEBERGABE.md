# Übergabe: Entwürfe Cockpit, Netzwerk, Dashboard (Stand 06.11.2026)

Branch `design/03-dashboard` (Basis `dev`), nur Dateien in `design/`. In der App ist noch nichts umgesetzt.
Arbeitsweise und CI wie in `docs/ui-briefing.md` und `docs/ci.md`. Nicht nach `main` pushen. Neue Migrationen nur als neue
Dateien. Jede Änderung an Zugriffsregeln braucht einen Test in `tests/db/rls.test.sql`.

| Entwurf | Datei | Ansehen |
|---|---|---|
| Cockpit (Redaktion) | `design/14-cockpit/index.html` | https://claude.ai/artifact/VtXSpraD9kbZFkquZNA6ny – Reiter „Runde 3“ bis „Runde 6“ |
| Netzwerk: Eingang, Datenbank, Eintrag, Challenge | `design/18-netzwerk/index.html` | https://claude.ai/artifact/77Q4pKLFQKZsKtUhPbr2yb |
| Dashboard 3D (Kundenportal) | `design/03-dashboard/index.html` | https://claude.ai/artifact/KLu2jthLTXfcQyby6mmWHr – Reiter „Vorschlag · Runde 2“ (noch nicht ausdrücklich freigegeben) |

Die Entwürfe sind statische HTML-Seiten mit Beispielinhalten, sie lassen sich per Klick bedienen. Desktop 1440 und Handy 390, dunkel und hell.

---

## 1. Navigation Backend (neu gruppiert)

- Cockpit
- **Inhalte:** Review-Queue, Liveticker, Trends, Trenddatenbank, Quellenverzeichnis
- **Netzwerk:** Eingang, Netzwerk-Datenbank, Challenges (ersetzt „Venture Clienting“ und „Startup-Datenbank“)
- **Agenten:** Scouting, Netzwerk-Manager (neu), Agenten-Protokoll (bisher „Agenten“)
- **Kunden:** Projekte, Kunden, Team
- Zähler an Review-Queue, Liveticker, Eingang, Challenges, Netzwerk-Manager. Am Handy hinter „Menü“, gleiche Gruppen.
- Fehler heute: Das Backend läuft am Handy seitlich über; das ist mit zu beheben.

## 2. Cockpit (`/admin`)

Aufbau Desktop: Navigation links · Hauptbereich · **Live-Feed rechts (400 px)**.

**Kopf:** Datum, Titel „Cockpit“, rechts kleine Knöpfe „4 Vorschläge zur Freigabe →“ (Review-Queue), „⚠ 0 Agentenläufe“ (nur bei 0 als Warnung) und „Eingang · n“ mit blinkender Zahl.

**Limetten-Block = Netzwerk-Funnel** (der einzige Limetten-Block der Seite)
- Stufen: Eingang → Vorevaluiert → In der Datenbank → Shortlist → Pilot → New Spice approved, Zeitraum 90 Tage.
- Jeder Balken ist nach Quelle geteilt: Agent, Redaktion, Kunde/Bewerbung. Die Quelle ist nicht nur an der Tönung erkennbar: „Kunde“ ist zusätzlich schraffiert, und jeder Wert steht als Zahl im Tooltip.
- Daneben „Neu im Eingang“ (3 neueste mit Quelle), „+ Eintrag“ und „n warten auf Vorevaluierung →“.

**Live-Feed (rechts, chronologisch, neueste oben)**
- Kopf: pulsierendes Zeichen „Live“ und „Letzte vor n Min. · hh:mm“. Filter: Alle · Sport & Hosp. · Startups · Cross-Industry. Darunter „n noch nicht im Ticker · n mit unsicherem Trend“.
- Karte: Uhrzeit, Bereich, Relevanz (●●○), Quelle, Schlagzeile (Link zur Quelle).
- **Trend automatisch zugeordnet** mit Treffsicherheit („automatisch · 94 %“). Ein Klick auf den Trend-Chip öffnet die Auswahl mit Alternativen, Suche und „Als neuen Trend vorschlagen“. Unter 60 % steht „unsicher – Trend prüfen“.
- „In den Ticker“ veröffentlicht mit dem gewählten Trend. Danach steht dort „Im Ticker seit …“ mit „Zurückziehen“; ✕ verwirft.
- Ersetzt das Lagebild mit drei Spalten. Die Bereiche werden zu Filtern.
- Neu im Backend: Der Analyst-Agent muss pro Meldung Trend-Vorschläge **mit Prozentwert** liefern (z. B. `trend_suggestions` am Signal).

**Projekte** (getrennt von Anfragen)
- Eingeklappt eine Zeile: Ampel · Name · Kunde · Status in wenigen Worten („Kunde antwortet nicht · 4 T.“) · ✉ offene Mails. Sortiert nach Ampel.
- Ein Klick klappt aus: Phase (6 Stufen: Angefragt, Problem Deep Dive, Shortlist, Pilot, Auswertung, Abgeschlossen), nächste Frist, „Wartet auf“ (wir oder Kunde, seit wann), Knöpfe „Projekt öffnen“ und „Nachricht an Kunde“.
- **Ampel:** Rot = eckig mit „!“, blinkt schnell. Gelb = rund mit ◷, blinkt langsam. Grün = rund mit ✓, ruhig. Abgeschlossen = grau. Bei `prefers-reduced-motion` fester Ring statt Blinken. Der Grund steht immer als Text daneben.
- **Regeln (Schwellen als Einstellung):**
  - Rot: Frist überschritten, oder unsere Rückmeldung länger als 2 Werktage offen.
  - Gelb: Frist in höchstens 3 Werktagen, oder Kundenrückmeldung länger als 3 Tage offen.
  - Grün: sonst.
- **Farben:** Neue Tokens `--ok`, `--warn`, `--alert` (mit `-fg`) in `app/globals.css` für beide Modi anlegen und prüfen. Im Entwurf sind sie aus `--cF`, `--cC` und `--cA` geliehen, das soll nicht so bleiben.
- Vorschlag: Gelb nur bis zum ersten Ansehen blinken lassen.

**Anfragen von Kunden als Pop-up**
- Unten links im Hauptbereich: Zeichen „Anfrage“, Titel, Kunde, Alter. Knöpfe Annehmen · Details · Ablehnen. Bei mehreren „1 von 2 · nächste ›“. Geschlossen bleibt oben der Knopf „Eingang · n“.
- „Details“ zeigt Ziel, Ort, Zeitraum und Budget aus dem Anfrageformular.
- **Annehmen → Projekt anlegen**: Status `scoping` (Problem Deep Dive), erste Frist „Erstgespräch vereinbaren“ (+7 Tage). Das Projekt erscheint mit „Neu“ oben in der Liste.
- Ablehnen: kurze Begründung an den Kunden.

**Ausblick, noch nicht umsetzen:** Postfach je Projekt andocken. Offene Kundenmails werden geflaggt, aus Mails und Meilensteinen entstehen To-dos mit Frist, und die Fristen speisen die Ampel. Vorher Datenschutz klären (welche Postfächer, wer sieht was, Speicherdauer). Gehört auf die Projektseite (Ansicht 19).

## 3. Bewerbungen und Netzwerk-Eingang

**Öffentliches Formular** `/bewerben`, verlinkt von der Login-Seite („Noch kein Zugang? Jetzt bewerben“)
- Schritt 1: Kategorie wählen. Verein, Multiplikator, Betreiber, Investor oder Solution Provider (Startup oder Partner).
- Schritt 2: Organisation, Rolle, E-Mail, Website. Je Kategorie zwei bis drei eigene Felder:
  - Verein: Sportart/Liga, Stadion/Kapazität
  - Betreiber: Art der Venue, Kapazität/Zimmer
  - Multiplikator: Netzwerk, Reichweite
  - Investor: Fokus, Ticketgröße
  - Solution Provider: Angebot (Produkt/Leistung), Reifegrad, Referenzen, Pitchdeck-PDF
- Dazu eine kurze Nachricht und die Datenschutz-Bestätigung. Nach dem Senden: „Danke! Wir melden uns innerhalb von 5 Werktagen.“
- **Es wird kein Konto angelegt** (Regel „keine offene Registrierung“). Spam-Schutz: Rate-Limit und Bestätigung der E-Mail-Adresse.

**Eingang** `/admin/netzwerk/eingang` – zentral für Bewerbungen, Kundenanfragen und eingereichte Challenges
- Ansicht nach Themen: Cluster vom Netzwerk-Manager mit Zusammenfassung und Zahl. Daneben die Eingänge des Clusters (Art, Wer, Worum, Alter) und die Vorschläge des Agenten.
- Umschalter „Liste statt Themen“ für die chronologische Liste.
- Detail einer Bewerbung: Angaben, Nachricht und die Vorprüfung durch den Agenten (Website erreichbar, Dubletten in Kunden und Datenbank, E-Mail-Domain passt zur Website, Zielgruppe). Die Vorprüfung ist grün oder gelb markiert und **entscheidet nicht**.
- **Akzeptieren / On hold / Ablehnen**
  - On hold: Grund (Unterlagen fehlen, Rücksprache intern, Später prüfen) und Wiedervorlage-Datum. Die Wiedervorlage erscheint mit Ampel im Cockpit.
  - Ablehnen: änderbare Textvorlage an den Bewerber.
  - Akzeptieren: eine Box „Wird angelegt“ mit vorbelegten Werten, dann „Anlegen und einladen“:

| Kategorie | wird angelegt |
|---|---|
| Verein, Betreiber | Organisation (Paket Basic, 5 Sitzplätze, Laufzeit 12 Monate) + Eintrag in der Netzwerk-Datenbank, die Ansprechperson wird als Owner eingeladen (Magic-Link) |
| Multiplikator | Eintrag + **Partner-Zugang** (Radar lesen, Kontakte empfehlen, keine Projekte) |
| Investor | Eintrag + **Investor-Zugang** (Radar und öffentlich markierte Einträge der Netzwerk-Datenbank, nichts Vertrauliches) |
| Solution Provider | Eintrag in der Netzwerk-Datenbank (Funnel „Eingang“, Quelle „Bewerbung“), optional sofort Vorevaluierung durch den Agenten; Zugang zum eigenen Profil **nur lesend** mit „Änderung anfragen“ |

- Partner- und Investor-Zugang brauchen **neue Rollen** und RLS-Regeln mit Tests.

## 4. Netzwerk-Datenbank (ersetzt die Startup-Datenbank)

Eine redaktionell kuratierte Datenbank für alle Mitglieder. Aufgebaut nach Rolle und Angebot/Tags.
- **Rollen:** Solution Provider (Typ Startup oder Partner), Verein, Betreiber, Multiplikator, Investor.
- **Liste** `/admin/netzwerk`: Filter nach Rolle (mit Zahl), nach Angebot/Tags und Suche (Name, Angebot, Trendnummer). Spalten: Name (+ Quelle · zuletzt gepflegt), Rolle/Typ, Angebot-Tags, Trends (#), Status (Aufgenommen · In Prüfung · On hold · Archiviert), Beziehung (Kunde, Partner, Siegel „New Spice approved“ als Limetten-Chip). „+ Eintrag“ legt manuell an.
- **Rechts eine Spalte „Netzwerk-Manager“** mit Vorschlägen: aufnehmen und klassifizieren, Tags zusammenlegen, Eintrag veraltet (z. B. neue Referenzen auf der Website), Verbindungen (z. B. Investor ↔ Startup). Je Vorschlag: Übernehmen · Anpassen · Verwerfen.
- **Eintrag** `/admin/netzwerk/[id]`:
  - Kopf: Rolle/Typ, Status, Siegel, Kurzbeschreibung, Klassifizierung als Tags (Rolle, Typ, Angebot, Trends, Reifegrad, Region, „+ Tag“), Sichtbarkeit „nur intern / öffentlich“, Knöpfe „Bearbeiten“ und „Mit Challenge abgleichen“.
  - Reiter **Angebot & Referenzen**: Produkte/Leistungen je mit eigenen Tags und Trends, Referenzen mit Ort, Zeitraum und Ergebnis, Agent-Hinweis zu neu gefundenen Referenzen.
  - Reiter **Verbindungen**: Challenges (mit Passung und Status), Projekte, Bewerbungen mit gleichem Problem, Investoren, ähnliche Anbieter, Partner.
  - Reiter **Kontakt & Vertrauliches**: nur Redaktion, für Kunden erst nach Freigabe im Projekt. Ansprechperson, Preise, Pitchdeck, Notiz.
  - Reiter **Verlauf**.
  - Vereine, Betreiber und Investoren bekommen dieselbe Form, mit „Interessen“ statt „Angebot“.
- **Sichtbarkeit für Kunden (entschieden):** Kunden sehen keine anderen Mitglieder, außer
  1. der Eintrag ist von der Redaktion als **öffentlich** markiert (dann nur die öffentlichen Angaben), oder
  2. die Redaktion hat das Mitglied **einem Projekt des Kunden zugewiesen** (dann nur innerhalb dieses Projekts, z. B. als Partner oder auf der Shortlist).

  Das gilt für alle Rollen und muss in RLS verankert sein, nicht nur in der UI. Tests je Fall: nicht öffentlich und nicht zugewiesen → unsichtbar; öffentlich → nur öffentliche Felder; zugewiesen → nur im eigenen Projekt, nicht im Projekt eines fremden Kunden. Vertrauliches (Kontakt, Preise, Pitchdeck, Notizen) bleibt auch dann verborgen, bis es im Projekt freigegeben ist.
- Bestehende Startups (`startups`) und Kandidaten aus Challenges werden zu Einträgen mit Rolle Solution Provider / Startup. Die Trennung öffentlicher und vertraulicher Angaben bleibt.

**Bausteine für das Schema (Skizze, nicht final):**

| Baustein | Inhalt | pflegt | sieht |
|---|---|---|---|
| Mitglied | Rolle, Typ, Region, Reifegrad, Status, Quelle, Sichtbarkeit (intern/öffentlich) | Redaktion (Agent schlägt vor) | Redaktion; Kunden nur, wenn öffentlich (öffentliche Felder) oder ihrem Projekt zugewiesen |
| Angebot | Produkte/Leistungen eines Solution Providers mit Tags, Trends | nur Redaktion | wie Mitglied |
| Änderungsanfrage | gewünschte Änderung am eigenen Profil (Feld, alt, neu, Kommentar) | Solution Provider stellt, Redaktion entscheidet | Redaktion; der anfragende Provider |
| Interessen | Themen von Vereinen, Betreibern, Investoren | Redaktion | Redaktion |
| Tags | gepflegte Liste, verknüpft mit Trends/Clustern | Redaktion | alle |
| Referenz | Ort, Zeitraum, Ergebnis | Redaktion | Redaktion; öffentlich nach Freigabe |
| Match | Challenge × Angebot, Passung %, Begründung, Status (Vorschlag/Shortlist/verworfen) | Agent schlägt vor, Redaktion entscheidet | Redaktion; Kunde sieht die Shortlist |
| Verbindung | Mitglied × Mitglied mit Grund | Agent schlägt vor, Redaktion entscheidet | Redaktion |
| Projekt-Zuweisung | Mitglied × Projekt mit Rolle im Projekt (Partner, Shortlist) | Redaktion | Redaktion; der Kunde des Projekts |

## 5. Challenges (`/admin/netzwerk/challenges/[id]`)

- Kopf: Challenge, Kunde, Zeichen **„Privat“** bzw. **„Veröffentlicht“**. Rechts der Schalter **Sichtbarkeit** mit zwei Zuständen (entschieden):
  - **Privat** (Standard): Jede Challenge ist zunächst privat und nur für die Redaktion sichtbar.
  - **Veröffentlicht**: Auf Wunsch (des Kunden) veröffentlicht die Redaktion die Challenge; dann sehen sie **alle Mitglieder** mit Zugang. Veröffentlichen geht nur über die Redaktion, mit Bestätigungsdialog, und lässt sich zurücknehmen.
  - In RLS verankern, mit Tests: privat → nur Redaktion; veröffentlicht → alle Mitglieder; vertrauliche Felder (z. B. Budget, Gesprächsnotizen, Deep Dive) bleiben auch bei veröffentlichten Challenges intern.
- Reiter **Problem & Deep Dive**: wie heute (Notion-Deep-Dive, Problem-Briefing, Suchhypothesen).
- Reiter **Matching**:
  - Der Netzwerk-Manager gleicht **zuerst mit der eigenen Datenbank** ab: Angebot-Tags, Trends, Muss-Kriterien, Referenzen; Grundlage ist die Vorevaluierung mit 7 Kriterien.
  - Tabelle: Solution Provider, Passung % mit Balken, „Warum“, Herkunft (Datenbank/Eingang), Knöpfe „Auf Shortlist“ und ✕.
  - Knöpfe „Erneut abgleichen“ und „Zusätzlich im Web suchen“ (bisheriger Scouting-Lauf). Neue Web-Funde landen im Eingang.
  - „Auf Shortlist“ übernimmt den Anbieter ins Projekt des Kunden.
- Reiter **Ähnliches & Verbindungen**: ähnliche Herausforderungen (andere Challenges, Bewerbungen, Anfragen) mit Passung, dazu Vorschläge für Verbindungen. Verbindungen zwischen Kunden nur mit Zustimmung beider.

## 6. Agent „Netzwerk-Manager“ (neu, unter Agenten)

- Fasst Eingänge zusammen und clustert sie nach Thema, Rolle und Angebot.
- Schlägt Klassifizierung und Aufnahme vor, gleicht Challenges mit Angeboten ab, erkennt ähnliche Herausforderungen und mögliche Verbindungen, findet veraltete Einträge und neue Referenzen, schlägt Tag-Bereinigung vor.
- **Regeln wie für alle Agenten (CLAUDE.md):**
  - schreibt nur Vorschläge mit Begründung in eine Prüfliste, nie direkt in die Datenbank;
  - die Redaktion entscheidet;
  - Läufe, Modell und Tokens im Agenten-Protokoll.

## 7. Dashboard 3D (Kundenportal) – Vorschlag Runde 2

Noch nicht ausdrücklich freigegeben; vor der Umsetzung bei Finn bestätigen.
- **Leiste oben:** Journey/Radar · Alle/Hospitality/Public (sichtbar) · „Europa ▾“ (Perspektive im Menü) · Tour. Der Hinweis „Zugang endet“ wandert in den App-Kopf.
- **Liveticker:** angedockt rechts (400 px), gruppiert nach Heute/Gestern/Woche/Früher, Kurztext bei aktuellen Meldungen.
  - Überfährt man eine Meldung oder hat sie den Tastaturfokus, zeigt eine gestrichelte Linie auf den Trend in der Szene; der Trend pulsiert und bekommt sein Etikett. Dafür braucht es die Bildschirmposition aus der 3D-Szene.
  - Eingeklappt: Pille unten rechts mit „Neu · n“ und wechselnder Schlagzeile.

## 8. Offene Fragen an Finn

1. ~~Profil selbst pflegen?~~ Entschieden: **nein**. Solution Provider sehen ihr Profil und können über „Änderung anfragen“ Änderungen vorschlagen. Die Anfrage landet im Eingang (Art „Änderung“) mit Vorher/Nachher; die Redaktion übernimmt, passt an oder lehnt ab.
2. Tags (siehe Erklärung unten): offen.
3. ~~Sollen Kunden andere Mitglieder sehen?~~ Entschieden: nur öffentlich markierte oder ihrem Projekt zugewiesene (siehe Abschnitt 4).
4. ~~Wer sieht veröffentlichte Challenges?~~ Entschieden: privat = nur Redaktion; veröffentlicht = alle Mitglieder (Abschnitt 5).
5. Schwellen der Ampel (2 / 3 Werktage) bestätigen.
6. Blinken: Gelb nur bis zum ersten Ansehen?

**Zu Frage 2 (Tags):** Tags sind die Schlagworte, mit denen wir beschreiben, was ein Solution Provider anbietet (z. B. „Kassensysteme“, „Zapfsysteme“, „Crowd-Management“). Über sie findet der Netzwerk-Manager passende Anbieter für eine Challenge. Zum Start braucht es eine erste Liste. Zwei Wege:
- **A · Trends als Tags:** Jeder der 44 Trends ist ein Tag (z. B. „#24 Mobile Order & In-Seat“). Einfach, aber grob: Ein Kassenanbieter und ein App-Anbieter landen beide unter #24.
- **B · eigene Angebotskategorien (Vorschlag):** Eine Liste von etwa 30–40 Produktkategorien (z. B. Kassensysteme, Zapfsysteme, Bestell-Apps, Sensorik, Energiespeicher). Jede Kategorie wird mit den passenden Trends verknüpft. Genauer beim Matching; der Netzwerk-Manager kann die erste Liste aus den vorhandenen Startups vorschlagen, ihr gebt sie frei.

## 9. Vorgeschlagene Reihenfolge

1. Tokens `--ok/--warn/--alert`, Navigation gruppieren, Fehler am Handy im Backend beheben.
2. Cockpit: Projekte mit Ampel, Anfragen-Pop-up → Projekt, Live-Feed mit „In den Ticker“ (zunächst ohne Prozentwerte, wenn der Agent sie noch nicht liefert).
3. Netzwerk-Datenbank (Migration: Rollen, Typ, Tags, Angebot, Referenzen; bestehende Startups überführen) + Eintragsseite.
4. Bewerbungsformular + Eingang + Akzeptieren-Logik (neue Rollen Partner/Investor mit RLS-Tests).
5. Challenge: Sichtbarkeitsstufen und Matching gegen die Datenbank.
6. Agent Netzwerk-Manager (Clustern, Matching, Verbindungen) über die Vorschlagsliste.
7. Dashboard-Vorschlag nach Bestätigung.
