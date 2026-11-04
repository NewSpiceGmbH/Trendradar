// Extrahiert die fest codierten Daten aus dem HTML-Prototyp nach seed/*.json
// Aufruf: node scripts/extract-prototype.mjs reference/prototype.html seed
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const [, , htmlPath = "reference/prototype.html", outDir = "seed"] = process.argv;
const html = fs.readFileSync(htmlPath, "utf8");

// Liest das Literal nach "const NAME =" per Klammerzählung (Strings werden beachtet)
function literal(name) {
  const m = new RegExp(`const ${name}\\s*=\\s*`).exec(html);
  if (!m) return undefined;
  let i = m.index + m[0].length;
  const open = html[i], close = open === "[" ? "]" : open === "{" ? "}" : null;
  if (!close) return undefined;
  let depth = 0, str = null;
  for (let j = i; j < html.length; j++) {
    const ch = html[j];
    if (str) { if (ch === "\\") j++; else if (ch === str) str = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { str = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      return vm.runInNewContext("(" + html.slice(i, j + 1) + ")");
    }
  }
}

const names = ["TRENDS", "CLUSTERS", "FOCUS", "CRIT", "ZONES", "RINGS", "ORIG", "IND", "INS", "SOURCES", "COLS", "P", "TP", "W"];
fs.mkdirSync(outDir, { recursive: true });
const rename = { P: "partners", TP: "trend_partners", W: "weights" };
for (const n of names) {
  const v = literal(n);
  if (v === undefined) { console.warn(`! ${n} nicht gefunden`); continue; }
  fs.writeFileSync(path.join(outDir, (rename[n] || n.toLowerCase()) + ".json"), JSON.stringify(v, null, 2));
  console.log(`✓ ${n}: ${Array.isArray(v) ? v.length + " Einträge" : Object.keys(v).length + " Schlüssel"}`);
}
