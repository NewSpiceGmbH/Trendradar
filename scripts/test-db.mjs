// Führt die Datenbank-Tests in tests/db/*.test.sql aus. Jede Testdatei läuft in einer Transaktion
// und wird zurückgerollt; Fehler brechen mit Exit-Code ≠ 0 ab.
//
//   Nacktes Postgres (CI):  DATABASE_URL=postgres://postgres@localhost:5432/postgres node scripts/test-db.mjs --fresh
//     → legt die Datenbank trendradar_test neu an, spielt Stub, Migrationen und Seed ein, testet.
//   Supabase lokal:         npx supabase db reset && DATABASE_URL=$(npx supabase status -o env | …DB_URL) node scripts/test-db.mjs
//     → testet direkt gegen die bestehende Datenbank.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const fresh = process.argv.includes("--fresh");

const psql = (dbUrl, args) =>
  execFileSync("psql", [dbUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const file = (dbUrl, f, quiet = false) => psql(dbUrl, [...(quiet ? ["-o", "/dev/null"] : []), "-f", f]);

let target = url;
if (fresh) {
  const u = new URL(url);
  psql(url, ["-c", "drop database if exists trendradar_test with (force)", "-c", "create database trendradar_test"]);
  u.pathname = "/trendradar_test";
  target = u.toString();
  file(target, "tests/db/supabase-stub.sql");
  const migrations = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  for (const m of migrations) file(target, path.join("supabase/migrations", m));
  console.log(`✓ ${migrations.length} Migrationen eingespielt (inkl. Startinhalte und Demo-Zugänge)`);
}

const tests = fs.readdirSync("tests/db").filter((f) => f.endsWith(".test.sql")).sort();
let failed = 0;
for (const t of tests) {
  try {
    file(target, path.join("tests/db", t), true);
    console.log(`✓ ${t}`);
  } catch {
    console.error(`✗ ${t}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
