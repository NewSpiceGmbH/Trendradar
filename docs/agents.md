# Agenten-Spezifikation

Vier Agenten mit klar getrennten Aufgaben. Jeder Lauf ist ein Eintrag in `agent_runs`. Ausgaben sind
strukturiertes JSON (über Tool-Use mit festem Schema erzwingen, nicht Freitext parsen) und werden vor dem
Speichern mit Zod validiert.

```
Scout ──► signals ──► Analyst ──► proposals (attach_signal / new_trend / update_trend)
                                       │
                         Scorer ◄──────┘  ──► proposals (score_change)
                                       │
                         Editor ◄──────┘  prüft Quellen, Dubletten, Ton ──► Review-Queue (Mensch)
```

## 1. Scout

- **Ziel**: Neue Signale finden (Launches, Pilotprojekte, Studien, Regulierung, Deals) im Sport-,
  Hospitality- und Live-Entertainment-Umfeld, Schwerpunkt DACH/Europa, mit Blick auf US-Vorreiter.
- **Werkzeuge**: Web-Search; optional eine gepflegte Liste bevorzugter Quellen (Fachmedien, Verbände, Ligen).
- **Eingabe**: Zeitraum (z. B. letzte 14 Tage), optional Fokus auf Cluster, Fokusfeld oder einzelne Trends.
- **Ausgabe je Signal**: `title`, `summary` (2–3 Sätze, Deutsch), `url`, `publisher`, `published_on`,
  `suggested_trend_numbers[]`.
- **Regeln**: Nur Signale mit konkreter, erreichbarer URL. Dubletten über `signals.url` vermeiden.
  Pressemitteilungen von Anbietern als solche kennzeichnen.

## 2. Analyst

- **Ziel**: Signale einordnen.
- **Eingabe**: neue Signale + kompakte Liste aller Trends (Nummer, Name, Cluster, Beschreibung).
- **Ausgabe**: je Signal eine von drei Optionen:
  - `attach_signal`: gehört zu Trend #n; optional Vorschlag, `best_practice` oder `signals_summary` zu ergänzen.
  - `new_trend`: vollständiger Trendentwurf mit allen Feldern aus `trends` plus Relevanz je Branche.
  - `dismiss`: nicht relevant, mit Grund.
- **Regeln**: Einen neuen Trend nur vorschlagen, wenn mindestens zwei unabhängige Signale ihn stützen.

## 3. Scorer

- **Ziel**: Bewertung nach dem 6-Kriterien-Modell, für GLOBAL und – bei Abweichung – EU.
- **Ausgabe** (`score_change`):
  ```json
  { "perspective": "EU", "horizon": "3–5",
    "scores": [{ "criterion": 1, "score": 4, "rationale": "…" }, …],
    "eu_note": "Warum Europa anders einzuordnen ist (DSGVO, EU AI Act, Fankultur …)" }
  ```
- **Regeln**: Die Gewichte und Zonenregeln kennt der Scorer, berechnet aber nicht selbst. Die Plattform
  zeigt in der Review-Queue an, ob sich die Zone durch den Vorschlag ändern würde.

## 4. Editor / QA

- **Ziel**: Qualitätssicherung vor der menschlichen Freigabe.
- **Prüft**: URL erreichbar (HTTP-Status in `sources.last_http_status`), Quelle stützt die Aussage
  tatsächlich (Seite abrufen und abgleichen), keine Dubletten zu bestehenden Trends, Ton und Länge wie im
  Prototyp (kurz, sachlich, Deutsch, Quellenverweise im Format `[s13]`).
- **Ausgabe**: Proposal bleibt `pending`, ergänzt um einen QA-Bericht im `payload.qa`.

## Review-Queue (Mensch)

- Ansicht je Proposal: Vorher/Nachher-Diff, Quellen mit Links, Begründung, QA-Bericht,
  Auswirkung auf Score und Zone.
- Aktionen: Freigeben, Bearbeiten und freigeben, Ablehnen (mit Notiz).
- Freigabe läuft serverseitig in einer Transaktion: Snapshot nach `trend_versions`, Änderungen anwenden,
  Proposal auf `approved` setzen.

## Kosten und Steuerung

- Läufe zunächst nur manuell aus `/admin/agents`; später Zeitplan (z. B. Scout wöchentlich).
- Budget-Grenze je Lauf (max. Suchanfragen, max. Tokens) als Parameter.
- Prompts als versionierte Dateien in `lib/agents/prompts/`, damit Änderungen nachvollziehbar sind.
