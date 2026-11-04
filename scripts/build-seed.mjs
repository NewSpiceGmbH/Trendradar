// Erzeugt supabase/seed.sql aus seed/*.json (Ausgabe von extract-prototype.mjs).
// Aufruf: node scripts/build-seed.mjs   →  danach: supabase db reset
import fs from "node:fs";

const J = (f) => JSON.parse(fs.readFileSync(`seed/${f}.json`, "utf8"));
const trends = J("trends"), clusters = J("clusters"), focus = J("focus"), crit = J("crit");
const weights = J("weights"), zones = J("zones"), ind = J("ind"), ins = J("ins");
const sources = J("sources"), partners = J("partners"), tp = J("trend_partners");

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const b = (v) => (v ? "true" : "false");
const out = [];
const ins_ = (table, cols, rows) => {
  if (!rows.length) return;
  out.push(`insert into ${table} (${cols.join(", ")}) values\n  ${rows.map((r) => `(${r.join(", ")})`).join(",\n  ")};\n`);
};

// Datumslabel wie „22.01.2025“ → ISO-Datum, sonst null
const isoDate = (d) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const IND_CODES = { "Sport": "SPORT", "Hospitality": "HOSPITALITY", "Live Entertainment": "LIVE" };

out.push("-- Automatisch erzeugt von scripts/build-seed.mjs – nicht von Hand bearbeiten.\nbegin;\n");

ins_("clusters", ["code", "name", "position"],
  Object.entries(clusters).map(([k, v], i) => [q(k), q(v.n), i]));
ins_("focus_fields", ["code", "name", "description"],
  Object.entries(focus).map(([k, v]) => [q(k), q(v.n), q(v.d)]));
ins_("subtopics", ["focus_code", "name", "position"],
  Object.entries(focus).flatMap(([k, v]) => v.st.map((s, i) => [q(k), q(s), i])));
ins_("industries", ["code", "name", "position"], ind.map((n, i) => [q(IND_CODES[n]), q(n), i]));
ins_("criteria", ["idx", "name", "weight"], crit.map((n, i) => [i + 1, q(n), weights[i]]));
ins_("zones", ["code", "name", "tagline"], Object.entries(zones).map(([k, v]) => [q(k), q(v.n), q(v.s)]));
ins_("insights", ["title", "body", "position"], ins.map(([t, d], i) => [q(t), q(d), i]));

ins_("sources", ["id", "title", "publisher", "published_label", "published_on", "url"],
  Object.entries(sources).map(([k, s]) => [q(k), q(s.t), q(s.p), q(s.d), q(isoDate(s.d)), q(s.u)]));

ins_("partners", ["key", "name", "role", "knowledge_base"],
  Object.entries(partners).map(([k, p]) => [q(k), q(p.n), q(p.r), b(p.kb)]));
ins_("partner_sources", ["partner_key", "source_id"],
  Object.entries(partners).flatMap(([k, p]) => p.s.map((s) => [q(k), q(s)])));

ins_("trends", ["number", "name", "cluster_code", "focus_code", "subtopic_id", "origin", "description",
  "use_cases", "best_practice", "signals_summary", "opportunities", "risks", "evidence", "uncertain",
  "mandatory", "status"],
  trends.map((t) => [t.id, q(t.n), q(t.c), q(t.fo),
    `(select id from subtopics where focus_code = ${q(t.fo)} and name = ${q(t.st)})`,
    q(t.orig), q(t.d), q(t.use), q(t.bp), q(t.sig), q(t.opp), q(t.risk), q(t.ev),
    b(t.unc), b(t.comp), q("published")]));

const tid = (n) => `(select id from trends where number = ${n})`;

ins_("trend_perspectives", ["trend_id", "perspective", "horizon", "note"], trends.flatMap((t) => {
  const rows = [[tid(t.id), q("GLOBAL"), q(t.tta), "null"]];
  if (t.eu) rows.push([tid(t.id), q("EU"), q(t.eu.tta ?? null), q(t.eu.note ?? null)]);
  return rows;
}));

ins_("trend_scores", ["trend_id", "perspective", "criterion", "score"], trends.flatMap((t) => [
  ...t.sc.map((s, i) => [tid(t.id), q("GLOBAL"), i + 1, s]),
  ...(t.eu?.sc ?? []).map((s, i) => [tid(t.id), q("EU"), i + 1, s]),
]));

ins_("trend_relevance", ["trend_id", "industry_code", "relevance"],
  trends.flatMap((t) => t.rel.map((r, i) => [tid(t.id), q(IND_CODES[ind[i]]), r])));

ins_("trend_sources", ["trend_id", "source_id", "perspective"], trends.flatMap((t) => [
  ...t.src.map((s) => [tid(t.id), q(s), q("GLOBAL")]),
  ...(t.eu?.src ?? []).map((s) => [tid(t.id), q(s), q("EU")]),
]));

ins_("trend_partners", ["trend_id", "partner_key", "position"],
  Object.entries(tp).flatMap(([n, keys]) => keys.map((k, i) => [tid(n), q(k), i])));

out.push("commit;\n");
fs.mkdirSync("supabase", { recursive: true });
fs.writeFileSync("supabase/seed.sql", out.join("\n"));
console.log(`✓ supabase/seed.sql geschrieben (${trends.length} Trends, ${Object.keys(sources).length} Quellen, ${Object.keys(partners).length} Partner)`);
