# Übergabe: Entwürfe Cockpit, Netzwerk, Dashboard (Stand 06.11.2026)

Branch `design/03-dashboard` (Basis `dev`), nur Dateien in `design/`. In der App ist noch nichts umgesetzt.
Arbeitsweise und CI wie in `docs/ui-briefing.md` und `docs/ci.md`. Nicht nach `main` pushen. Neue Migrationen nur als neue
Dateien. Jede Änderung an Zugriffsregeln braucht einen Test in `tests/db/rls.test.sql`.

| Entwurf | Datei | Ansehen |
|---|---|---|
| Cockpit (Redaktion) | `design/14-cockpit/index.html` | https://claude.ai/artifact/VtXSpraD9kbZFkquZNA6ny – maßgeblich: **Runde 5** (Gesamtbild: Funnel, Live-Feed, Projekte, Anfragen-Pop-up), Runde 3 (Live-Feed mit Trend-Auswahl im Detail), Runde 4 (Ampel-Regeln, Ausblick Postfach). Runde 6 (Bewerbungsseite) ist durch den Netzwerk-Eingang ersetzt; Runde 1–2 sind Vorstufen. |
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
- **Regeln (entschieden: einheitlich 3 Werktage; als Einstellung änderbar):**
  - Rot: Frist überschritten, oder unsere Rückmeldung länger als 3 Werktage offen.
  - Gelb: Frist in höchstens 3 Werktagen, oder Kundenrückmeldung länger als 3 Werktage offen.
  - Grün: sonst.
- **Farben:** Neue Tokens `--ok`, `--warn`, `--alert` (mit `-fg`) in `app/globals.css` für beide Modi anlegen und prüfen. Im Entwurf sind sie aus `--cF`, `--cC` und `--cA` geliehen, das soll nicht so bleiben.
- **Blinken (entschieden):** Rot blinkt, bis das Problem gelöst ist. Gelb blinkt nur, bis jemand aus der Redaktion das Projekt einmal angesehen hat (aufgeklappt oder geöffnet), danach ruhig gelb.

**Anfragen von Kunden als Pop-up**
- Unten links im Hauptbereich: Zeichen „Anfrage“, Titel, Kunde, Alter. Knöpfe Annehmen · Details · Ablehnen. Bei mehreren „1 von 2 · nächste ›“. Geschlossen bleibt oben der Knopf „Eingang · n“.
- „Details“ zeigt Ziel, Ort, Zeitraum und Budget aus dem Anfrageformular.
- **Annehmen → Projekt anlegen**: Status `scoping` (Problem Deep Dive), erste Frist „Erstgespräch vereinbaren“ (+7 Tage). Das Projekt erscheint mit „Neu“ oben in der Liste.
- Ablehnen: kurze Begründung an den Kunden.

**Handy (390 px):** oben ein Umschalter „Übersicht | Live · n“. Übersicht = Funnel (kompakt), Hinweis auf neue Anfragen, Projekte als Zeilen mit Ampel; Live = der Feed mit denselben Karten und Aktionen. Anfragen-Pop-up unten über die volle Breite. Navigation hinter „Menü“.

**Ausblick, noch nicht umsetzen:** Postfach je Projekt andocken. Offene Kundenmails werden geflaggt, aus Mails und Meilensteinen entstehen To-dos mit Frist, und die Fristen speisen die Ampel. Vorher Datenschutz klären (welche Postfächer, wer sieht was, Speicherdauer). Gehört auf die Projektseite (Ansicht 19).

## 3. Bewerbungen und Netzwerk-Eingang

**Öffentliches Formular** `/bewerben`, verlinkt von der Login-Seite („Noch kein Zugang? Jetzt bewerben“)
- Schritt 1: Partner-Typ wählen: Verein, Caterer, Betreiber, Multiplikator, Investor oder Solution Provider (entspricht den Partner-Typ-Tags in Abschnitt 4). Bei Solution Provider wird das Gründungsjahr abgefragt; daraus ergibt sich das Merkmal „Startup“.
- Schritt 2: Organisation, Rolle, E-Mail, Website. Je Kategorie zwei bis drei eigene Felder:
  - Verein: Sportart/Liga, Stadion/Kapazität
  - Betreiber: Art der Venue, Kapazität/Zimmer
  - Multiplikator: Netzwerk, Reichweite
  - Investor: Fokus, Ticketgröße
  - Caterer: Art der Gastronomie, Standorte/Venues
  - Solution Provider: Gründungsjahr, Angebot (Produkt/Leistung, Auswahl aus den Angebotskategorien), Reifegrad, Referenzen, Pitchdeck-PDF
  - Wer etwas anbietet (Solution Provider, Caterer, auch Betreiber), kann zusätzlich Angebot und Referenzen angeben.
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
| Verein, Betreiber, Caterer | Organisation (Paket Basic, 5 Sitzplätze, Laufzeit 12 Monate) + Eintrag in der Netzwerk-Datenbank, die Ansprechperson wird als Owner eingeladen (Magic-Link) |
| Multiplikator | Eintrag + **Partner-Zugang** (Radar lesen, Kontakte empfehlen, keine Projekte) |
| Investor | Eintrag + **Investor-Zugang** (Radar und öffentlich markierte Einträge der Netzwerk-Datenbank, nichts Vertrauliches) |
| Solution Provider (auch Startups) | Eintrag in der Netzwerk-Datenbank (Funnel „Eingang“, Quelle „Bewerbung“), optional sofort Vorevaluierung durch den Agenten; Zugang zum eigenen Profil **nur lesend** mit „Änderung anfragen“ |

- Partner- und Investor-Zugang brauchen **neue Rollen** und RLS-Regeln mit Tests.

## 4. Netzwerk-Datenbank (ersetzt die Startup-Datenbank)

Eine redaktionell kuratierte Datenbank für alle Mitglieder. Aufgebaut über **zwei Arten von Tags** (entschieden):
- **Partner-Typ** (klassifiziert das Mitglied, mehrere möglich, z. B. Betreiber + Caterer): **Verein, Caterer, Betreiber, Multiplikator, Investor, Solution Provider.** Feste Liste, nur die Redaktion ändert sie. Etablierte Anbieter (z. B. Kassenhersteller, Energieversorger) ordnet die Redaktion als Solution Provider oder passenden Typ zu.
- **Merkmal „Startup“** (die einzige Zusatzkategorie, entschieden): Ein Startup ist grundsätzlich ein Unternehmen, das **jünger als 5 Jahre** ist. Das Merkmal wird aus dem Gründungsjahr vorgeschlagen und von der Redaktion bestätigt; sie kann es im Einzelfall überschreiben. Wird ein Startup 5 Jahre alt, schlägt der Netzwerk-Manager vor, das Merkmal zu entfernen. Filter „Startups“ in der Liste und im Funnel.
- **Angebotskategorien** (Weg B, eigene Liste, etwa 30–40, z. B. Kassensysteme, Zapfsysteme, Bestell-Apps, Sensorik, Energiespeicher, Mehrweg): beschreiben, was ein Mitglied anbietet. **Die Trends hängen an den Angebotskategorien**, nicht am Mitglied: Kategorie „Bestell-Apps“ → #24, „Kassensysteme“ → #19, #26. Die Trends eines Mitglieds ergeben sich aus seinen Kategorien.
- Filter „bietet etwas an“: alle Mitglieder mit mindestens einem Angebot (meist Solution Provider, aber auch Caterer oder Betreiber).
- Die erste Kategorienliste schlägt der Netzwerk-Manager aus den vorhandenen Startups und Kandidaten vor; die Redaktion gibt sie frei und pflegt sie danach.
- **Liste** `/admin/netzwerk`: Filter nach Partner-Typ (mit Zahl), nach Angebotskategorie, „bietet etwas an“ und Suche (Name, Kategorie, Trendnummer – über die Kategorien). Spalten: Name (+ Quelle · zuletzt gepflegt), Partner-Typ, Angebotskategorien, Trends (abgeleitet), Status (Aufgenommen · In Prüfung · On hold · Archiviert), Beziehung (Kunde, Partner, Siegel „New Spice approved“ als Limetten-Chip). „+ Eintrag“ legt manuell an.
- **Rechts eine Spalte „Netzwerk-Manager“** mit Vorschlägen: aufnehmen und klassifizieren, Tags zusammenlegen, Eintrag veraltet (z. B. neue Referenzen auf der Website), Verbindungen (z. B. Investor ↔ Startup). Je Vorschlag: Übernehmen · Anpassen · Verwerfen.
- **Eintrag** `/admin/netzwerk/[id]`:
  - Kopf: Partner-Typ, Status, Siegel, Kurzbeschreibung, Klassifizierung (Partner-Typ, Angebotskategorien mit den daraus folgenden Trends, Reifegrad, Region), Sichtbarkeit „nur intern / öffentlich“, Knöpfe „Bearbeiten“ und „Mit Challenge abgleichen“.
  - Reiter **Angebot & Referenzen**: Produkte/Leistungen je mit Angebotskategorien (Trends kommen über die Kategorie), Referenzen mit Ort, Zeitraum und Ergebnis, Agent-Hinweis zu neu gefundenen Referenzen.
  - Reiter **Verbindungen**: Challenges (mit Passung und Status), Projekte, Bewerbungen mit gleichem Problem, Investoren, ähnliche Anbieter, Partner.
  - Reiter **Kontakt & Vertrauliches**: nur Redaktion, für Kunden erst nach Freigabe im Projekt. Ansprechperson, Preise, Pitchdeck, Notiz.
  - Reiter **Verlauf**.
  - Mitglieder ohne Angebot (Vereine, Investoren, Multiplikatoren) bekommen dieselbe Form, mit „Interessen“ (ebenfalls Angebotskategorien, z. B. Investor interessiert sich für „Kassensysteme“) statt „Angebot“.
- **Sichtbarkeit für Kunden (entschieden):** Kunden sehen keine anderen Mitglieder, außer
  1. der Eintrag ist von der Redaktion als **öffentlich** markiert (dann nur die öffentlichen Angaben), oder
  2. die Redaktion hat das Mitglied **einem Projekt des Kunden zugewiesen** (dann nur innerhalb dieses Projekts, z. B. als Partner oder auf der Shortlist).

  Das gilt für alle Rollen und muss in RLS verankert sein, nicht nur in der UI. Tests je Fall: nicht öffentlich und nicht zugewiesen → unsichtbar; öffentlich → nur öffentliche Felder; zugewiesen → nur im eigenen Projekt, nicht im Projekt eines fremden Kunden. Vertrauliches (Kontakt, Preise, Pitchdeck, Notizen) bleibt auch dann verborgen, bis es im Projekt freigegeben ist.
- Bestehende Startups (`startups`) und Kandidaten aus Challenges werden zu Einträgen mit Partner-Typ Solution Provider; das Merkmal Startup ergibt sich aus dem Gründungsjahr (Feld `founded` gibt es schon bei Kandidaten). Die Trennung öffentlicher und vertraulicher Angaben bleibt.

**Bausteine für das Schema (Skizze, nicht final):**

| Baustein | Inhalt | pflegt | sieht |
|---|---|---|---|
| Mitglied | Partner-Typ(en), Gründungsjahr, Merkmal Startup (vorgeschlagen bei < 5 Jahren, überschreibbar), Region, Reifegrad, Status, Quelle, Sichtbarkeit (intern/öffentlich) | Redaktion (Agent schlägt vor) | Redaktion; Kunden nur, wenn öffentlich (öffentliche Felder) oder ihrem Projekt zugewiesen |
| Angebot | Produkte/Leistungen eines Mitglieds mit Angebotskategorien | nur Redaktion | wie Mitglied |
| Änderungsanfrage | gewünschte Änderung am eigenen Profil (Feld, alt, neu, Kommentar) | Solution Provider stellt, Redaktion entscheidet | Redaktion; der anfragende Provider |
| Interessen | Angebotskategorien, die ein Mitglied sucht (Vereine, Betreiber, Investoren) | Redaktion | Redaktion |
| Partner-Typ | feste Liste: Verein, Caterer, Betreiber, Multiplikator, Investor, Solution Provider | Redaktion | alle |
| Angebotskategorie | eigene Liste (ca. 30–40), je Kategorie verknüpfte Trends | Redaktion; Agent schlägt Ergänzungen und Zusammenlegungen vor | alle |
| Referenz | Ort, Zeitraum, Ergebnis | Redaktion | Redaktion; öffentlich nach Freigabe |
| Match | Challenge × Angebot (über Angebotskategorien), Passung %, Begründung, Status (Vorschlag/Shortlist/verworfen) | Agent schlägt vor, Redaktion entscheidet | Redaktion; Kunde sieht die Shortlist |
| Verbindung | Mitglied × Mitglied mit Grund | Agent schlägt vor, Redaktion entscheidet | Redaktion |
| Projekt-Zuweisung | Mitglied × Projekt mit Rolle im Projekt (Partner, Shortlist) | Redaktion | Redaktion; der Kunde des Projekts |

## 5. Challenges (`/admin/netzwerk/challenges/[id]`)

- Kopf: Challenge, Kunde, Zeichen **„Privat“** bzw. **„Veröffentlicht“**. Rechts der Schalter **Sichtbarkeit** mit zwei Zuständen (entschieden):
  - **Privat** (Standard): Jede Challenge ist zunächst privat. Sichtbar für die Redaktion und den Kunden, dem sie gehört (er sieht seine eigene Challenge immer).
  - **Veröffentlicht**: Auf Wunsch (des Kunden) veröffentlicht die Redaktion die Challenge; dann sehen sie **alle Mitglieder** mit Zugang. Veröffentlichen geht nur über die Redaktion, mit Bestätigungsdialog, und lässt sich zurücknehmen.
  - In RLS verankern, mit Tests: privat → Redaktion und eigener Kunde, kein anderer Kunde; veröffentlicht → alle Mitglieder; vertrauliche Felder (z. B. Budget, Gesprächsnotizen, Deep Dive) bleiben auch bei veröffentlichten Challenges intern.
- Reiter **Problem & Deep Dive**: wie heute (Notion-Deep-Dive, Problem-Briefing, Suchhypothesen).
- Reiter **Matching**:
  - Der Netzwerk-Manager gleicht **zuerst mit der eigenen Datenbank** ab: Die Challenge bekommt Angebotskategorien (vom Agenten vorgeschlagen), darüber werden passende Angebote gefunden; dazu Muss-Kriterien und Referenzen; Grundlage ist die Vorevaluierung mit 7 Kriterien.
  - Tabelle: Solution Provider, Passung % mit Balken, „Warum“, Herkunft (Datenbank/Eingang), Knöpfe „Auf Shortlist“ und ✕.
  - Knöpfe „Erneut abgleichen“ und „Zusätzlich im Web suchen“ (bisheriger Scouting-Lauf). Neue Web-Funde landen im Eingang.
  - „Auf Shortlist“ übernimmt den Anbieter ins Projekt des Kunden.
- Reiter **Ähnliches & Verbindungen**: ähnliche Herausforderungen (andere Challenges, Bewerbungen, Anfragen) mit Passung, dazu Vorschläge für Verbindungen. Verbindungen zwischen Kunden nur mit Zustimmung beider.

## 6. Agent „Netzwerk-Manager“ (neu, unter Agenten)

- Fasst Eingänge zusammen und clustert sie nach Thema, Rolle und Angebot.
- Schlägt Klassifizierung (Partner-Typ, Angebotskategorien) und Aufnahme vor, gleicht Challenges mit Angeboten ab, erkennt ähnliche Herausforderungen und mögliche Verbindungen, findet veraltete Einträge und neue Referenzen, schlägt Tag-Bereinigung vor.
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
2. ~~Tags?~~ Entschieden: Partner-Typ-Tags (Verein, Caterer, Betreiber, Multiplikator, Investor, Solution Provider), Merkmal Startup (< 5 Jahre) + eigene Angebotskategorien (Weg B); Trends hängen an den Kategorien (Abschnitt 4).
3. ~~Sollen Kunden andere Mitglieder sehen?~~ Entschieden: nur öffentlich markierte oder ihrem Projekt zugewiesene (siehe Abschnitt 4).
4. ~~Wer sieht veröffentlichte Challenges?~~ Entschieden: privat = nur Redaktion; veröffentlicht = alle Mitglieder (Abschnitt 5).
5. ~~Schwellen der Ampel?~~ Entschieden: einheitlich 3 Werktage (Abschnitt 2).
6. ~~Blinken?~~ Entschieden: Gelb nur bis zum ersten Ansehen (Abschnitt 2).

7. ~~Etablierte Anbieter?~~ Entschieden: kein eigener Typ; die Redaktion ordnet sie als Solution Provider (oder passenden Typ) zu. „Startup“ ist die einzige Zusatzkategorie.

Alle offenen Fragen sind damit beantwortet.

## 9. Vorgeschlagene Reihenfolge

1. Tokens `--ok/--warn/--alert`, Navigation gruppieren, Fehler am Handy im Backend beheben.
2. Cockpit: Projekte mit Ampel, Anfragen-Pop-up → Projekt, Live-Feed mit „In den Ticker“ (zunächst ohne Prozentwerte, wenn der Agent sie noch nicht liefert).
3. Netzwerk-Datenbank (Migration: Partner-Typen, Angebotskategorien mit Trend-Verknüpfung, Angebote, Interessen, Referenzen; bestehende Startups überführen) + Eintragsseite. Erste Kategorienliste vom Agenten vorschlagen lassen.
4. Bewerbungsformular + Eingang + Akzeptieren-Logik (neue Rollen Partner/Investor mit RLS-Tests).
5. Challenge: Sichtbarkeitsstufen und Matching gegen die Datenbank.
6. Agent Netzwerk-Manager (Clustern, Matching, Verbindungen) über die Vorschlagsliste.
7. Dashboard-Vorschlag nach Bestätigung.
