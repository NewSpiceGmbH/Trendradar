# New-Spice-CI für den Trendradar

Verbindlich für Farben, Schriften und Formen. Der Prototyp (`reference/prototype.html`) bleibt Referenz für
Inhalt, Begriffe, Aufbau und Interaktion – bei Farbe und Typografie gilt diese CI.
Umsetzung: `app/globals.css` (Tokens) und `app/layout.tsx` (Schriften).

## Farben (Markenpalette)

| Rolle | Hex | Token | Verwendung |
|---|---|---|---|
| Anthrazit (Hintergrund) | `#1D1D1D` | `--bg` | Seitenhintergrund, Text auf Limette |
| Karten-Grau | `#2B2A27` | `--surface` | Karten und Blöcke auf dunklem Grund |
| Linien-Grau | `#3D3B37` | `--line` | Trennlinien, Tabellenlinien |
| Creme (Haupttext) | `#FCF4E6` | `--ink` | Überschriften und Haupttext |
| Sand (Fließtext) | `#D9CFBD` | `--text` | Untertexte, Beschreibungen |
| Warmgrau (Meta) | `#A8A195` | `--muted` | Footer, Quellen, Labels |
| Limette (Akzent) | `#C2E689` | `--accent` | Große Zahlen, Eyebrows, Highlight-Karten |
| Dunkelgrün | `#253912` | `--on-accent` | Text auf Limetten-Flächen |
| Hellgrund für Bilder | `#FAF8F4` | `--image-bg` | Hinterlegung bei Plänen/Screenshots |
| Logo-Weiß | `#F3EFE6` | `--logo` | New-Spice-, Casualfood- und Partnerlogos |

Basis ist die Casualfood-Website (Anthrazit, Limette, Dunkelgrün direkt übernommen; dort zusätzlich Creme
`#FCF4E6` und Sand `#F2E5CF` als helle Hintergründe).

**Faustregel:** Pro Ansicht genau ein Limetten-Block als Blickfang, alles andere bleibt Anthrazit/Grau.

## Ableitungen für die Plattform

- **Dunkel ist Standard** (Markenansicht). Hell gibt es per `<html data-theme="light">` auf Basis der Website-
  Hintergründe: Grund Creme `#FCF4E6`, Karten `#FAF8F4`, vertieft Sand `#F2E5CF`, Text Anthrazit,
  Meta `#655F55`. Limette als *Schrift* ist auf Creme zu hell (1,4:1), deshalb dort `--accent-ink: #4A6B1A`
  (5,6:1). Limetten-*Flächen* mit Dunkelgrün bleiben in beiden Modi gleich.
- **Clusterfarben A–G** sind nicht Teil der CI. Sie behalten die Farbtöne des Prototyps (Rot, Blau, Ocker,
  Petrol, Violett, Grün, Pink), sind aber für Anthrazit bzw. Creme neu abgestuft und geprüft
  (dataviz-Validator: Helligkeitsband, Chroma, Farbfehlsichtigkeit für benachbarte Arena-Segmente inkl. G↔A,
  Kontrast ≥ 3:1 zum Grund). Die Trendnummer im Dot nutzt `--cX-fg` (Creme oder Anthrazit, ≥ 4,5:1).
  Clusterfarbe nie allein: Segmentlage, Buchstabe/Legende und Tabellenansicht tragen die Zuordnung mit.
  Limette ist für Akzente reserviert und wird nie als Clusterfarbe verwendet.
- Keine Monospace-Schrift: Zahlen, Scores und IDs in Archivo mit gleich breiten Ziffern (Utility `num`).

## Typografie

| Einsatz | Schrift | Schnitt |
|---|---|---|
| Überschriften & Zahlen | Archivo | ExtraBold (800) |
| Fließtext | DM Sans | Regular (400) / Bold (700) |
| Eyebrows/Labels | DM Sans | Bold, Versalien, Laufweite ≈ 0,125 em (3 px bei 24 px), Limette oder Warmgrau |

Titel: Laufweite −1 px bei 72 px (≈ −0,014 em), Zeilenhöhe 1,1. Folien-Größen (120/72/44/32 px) sind für
1920 px Breite gedacht; im Web skalieren sie mit `clamp()` (h1 bis 72 px, h2 bis 44 px, h3 bis 32 px).
Beide Schriften kommen über `next/font` vom eigenen Server.

## Formen und Layout

- Ecken: 16 px für Karten und Bilder (`--radius-card`), 40 px für Pillen/Chips (`--radius-pill`).
- Abstände: 24–48 px zwischen Elementen.
- Logos immer einfarbig in `--logo`, freigestellt.
- Folienformat (1920 × 1080, Ränder 128/160 px, Footer mit Quelle links und Seitenzahl/Logo rechts) gilt für
  Exporte und Präsentationen, nicht für die Web-Oberfläche.
