-- Venture Clienting (Migration 0009): Challenges, Kandidaten und Vertrauliches nur für die Redaktion; Kunden sehen
-- ausschließlich veröffentlichte Profile der qualifizierten Datenbank. Aufnahme nur über decide_candidate().
-- Läuft in einer Transaktion und wird zurückgerollt.
begin;

-- ───────────────────────── Test-Helfer (wie in rls.test.sql) ─────────────────────────
create schema t;
create table t.users (name text primary key, id uuid not null);
create table t.results (n serial, ok boolean not null, name text not null);
grant usage on schema t to anon, authenticated;
grant select on t.users to anon, authenticated;

create function t.ok(cond boolean, name text) returns void
language plpgsql security definer set search_path = t as $$
begin
  insert into t.results (ok, name) values (coalesce(cond, false), name);
  if not coalesce(cond, false) then raise warning 'FEHLER: %', name; end if;
end $$;

create function t.eq(actual anyelement, expected anyelement, name text) returns void
language plpgsql as $$
begin
  perform t.ok(actual is not distinct from expected,
               name || case when actual is distinct from expected
                            then format(' – erwartet %s, ist %s', expected, actual) else '' end);
end $$;

create function t.throws(sql text, name text, expected_msg text default null) returns void
language plpgsql as $$
begin
  execute sql;
  perform t.ok(false, name || ' – kein Fehler');
exception when others then
  perform t.ok(expected_msg is null or sqlerrm like '%' || expected_msg || '%',
               name || case when expected_msg is null or sqlerrm like '%' || expected_msg || '%'
                            then '' else ' – falscher Fehler: ' || sqlerrm end);
end $$;

create function t.login(who text) returns void
language plpgsql as $$
declare uid uuid;
begin
  select id into uid from t.users where name = who;
  if uid is null then raise exception 'Testnutzer % unbekannt', who; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function t.anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

create function t.uid(who text) returns uuid language sql stable as $$ select id from t.users where name = who $$;
create function t.tid(n int) returns int language sql stable as $$ select id from public.trends where number = n $$;
grant execute on all functions in schema t to anon, authenticated;

-- ───────────────────────── Testdaten ─────────────────────────
insert into t.users (name, id) select n, gen_random_uuid() from unnest(array['editor', 'member', 'expired', 'nobody']) n;
insert into auth.users (id, email) select id, name || '@test.local' from t.users;
update profiles set platform_role = 'editor' where id = t.uid('editor');
insert into organizations (id, name, tier, seats, access_from, access_until) values
  ('a0a0a0a0-0000-0000-0000-000000000009', 'Kunde (aktiv)', 'basic', 5, current_date - 30, null),
  ('b0b0b0b0-0000-0000-0000-000000000009', 'Kunde (abgelaufen)', 'basic', 5, current_date - 60, current_date - 1);
insert into memberships (org_id, user_id, role) values
  ('a0a0a0a0-0000-0000-0000-000000000009', t.uid('member'), 'member'),
  ('b0b0b0b0-0000-0000-0000-000000000009', t.uid('expired'), 'member');

insert into challenges (id, title, problem, trend_numbers) values
  ('c9000000-0000-0000-0000-000000000001', 'Wartezeit am Bierstand', 'In der Halbzeit 12 Minuten Wartezeit.', '{24,25}'),
  ('c9000000-0000-0000-0000-000000000002', 'Einlass beschleunigen', 'Lange Schlangen am Drehkreuz.', '{18}');
insert into agent_runs (id, agent, status, challenge_id) values
  ('a9000000-0000-0000-0000-000000000001', 'venture', 'succeeded', 'c9000000-0000-0000-0000-000000000001');
insert into startup_candidates (id, challenge_id, run_id, name, website, domain, summary, scores, total, recommendation) values
  ('d9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
   'QueueLess', 'https://queueless.example', 'queueless.example', 'Kamerabasierte Kasse.', '[]', 4.10, 'shortlist'),
  ('d9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
   'Zapf AG', 'https://zapf.example', 'zapf.example', 'Selbstzapf-Wand.', '[]', 3.20, 'watch'),
  ('d9000000-0000-0000-0000-000000000003', 'c9000000-0000-0000-0000-000000000002', null,
   'QueueLess', 'https://www.queueless.example', 'queueless.example', 'Auch für den Einlass.', '[]', 3.80, 'shortlist'),
  ('d9000000-0000-0000-0000-000000000004', 'c9000000-0000-0000-0000-000000000002', null,
   'Nope GmbH', null, null, 'Passt nicht.', '[]', 1.50, 'no_fit');

-- ───────────────────────── Regeln in der Datenbank ─────────────────────────
select t.throws($$insert into startup_candidates (challenge_id, name, summary, scores, total, recommendation) values ('c9000000-0000-0000-0000-000000000001', 'X', 'x', '[]', 6, 'shortlist')$$,
  'Gesamtscore nur 1–5', 'check');
select t.throws($$insert into startup_candidates (challenge_id, name, summary, scores, total, recommendation) values ('c9000000-0000-0000-0000-000000000001', 'X', 'x', '[]', 3, 'super')$$,
  'Nur bekannte Empfehlungen', 'check');
select t.throws($$insert into startup_candidates (challenge_id, name, domain, summary, scores, total, recommendation) values ('c9000000-0000-0000-0000-000000000001', 'QueueLess 2', 'queueless.example', 'x', '[]', 3, 'watch')$$,
  'Pro Challenge jedes Startup nur einmal', 'unique');
select t.throws($$insert into startups (name, published, status) values ('Archiv', true, 'archived')$$,
  'Archivierte Profile lassen sich nicht veröffentlichen', 'startups_publish_qualified');
select t.throws($$insert into agent_runs (agent, status) values ('magic', 'running')$$, 'Agent-Art geprüft', 'check');

-- ───────────────────────── Kunden ohne Rechte ─────────────────────────
select t.login('member');
select t.throws($$select decide_candidate('d9000000-0000-0000-0000-000000000001', 'qualified')$$, 'Member: kann nicht über Kandidaten entscheiden');
select t.eq((select count(*)::int from challenges), 0, 'Member: keine Challenges');
select t.eq((select count(*)::int from startup_candidates), 0, 'Member: keine Kandidaten');
reset role;
select t.eq((select count(*)::int from startups), 0, 'Vor der Entscheidung ist die Datenbank leer');

-- ───────────────────────── Entscheidungen der Redaktion ─────────────────────────
select t.login('editor');
select t.throws($$select decide_candidate('d9000000-0000-0000-0000-000000000004', 'rejected', '  ')$$, 'Ablehnen nur mit Begründung', 'Begründung');
select t.throws($$select decide_candidate('d9000000-0000-0000-0000-000000000004', 'maybe')$$, 'Nur bekannte Entscheidungen', 'Unbekannte');
select decide_candidate('d9000000-0000-0000-0000-000000000004', 'rejected', 'Kein Bezug zum Stadion.');
select decide_candidate('d9000000-0000-0000-0000-000000000001', 'qualified');
select decide_candidate('d9000000-0000-0000-0000-000000000002', 'watch');
select t.eq((select count(*)::int from startups), 1, 'Aufnehmen legt ein Profil an, Beobachten nicht');
select t.eq((select trend_numbers from startups where domain = 'queueless.example'), '{24,25}'::int[], 'Profil übernimmt die Trends der Challenge');
select t.eq((select startup_id from startup_candidates where id = 'd9000000-0000-0000-0000-000000000001'),
            (select id from startups where domain = 'queueless.example'), 'Kandidat ist mit dem Profil verknüpft');
select t.eq((select decided_by from startup_candidates where id = 'd9000000-0000-0000-0000-000000000001'), t.uid('editor'), 'Entscheidung wird protokolliert');
select t.throws($$select decide_candidate('d9000000-0000-0000-0000-000000000001', 'rejected', 'doch nicht')$$, 'Zweimal entscheiden geht nicht', 'bereits entschieden');
-- gleiches Startup in einer zweiten Challenge: kein zweites Profil, Trends werden ergänzt
select decide_candidate('d9000000-0000-0000-0000-000000000003', 'qualified');
select t.eq((select count(*)::int from startups), 1, 'Gleiche Domain: kein zweites Profil');
select t.eq((select trend_numbers from startups where domain = 'queueless.example'), '{18,24,25}'::int[], 'Trends der zweiten Challenge ergänzt');
-- beobachtet und später doch aufgenommen
select decide_candidate('d9000000-0000-0000-0000-000000000002', 'qualified');
select t.eq((select count(*)::int from startups), 2, 'Beobachtet, später aufgenommen');
insert into startup_private (startup_id, pricing, contact_email) select id, '2.000 € im Monat', 'sales@queueless.example' from startups where domain = 'queueless.example';
update startups set published = true where domain = 'queueless.example';
reset role;

-- ───────────────────────── Kunden: nur Veröffentlichtes ─────────────────────────
select t.login('member');
select t.eq((select count(*)::int from startups), 1, 'Member: nur das veröffentlichte Profil');
select t.eq((select name from startups), 'QueueLess', 'Member: sieht das Kurzprofil');
select t.eq((select count(*)::int from startup_private), 0, 'Member: keine Kontakte, Preise oder Pitchdecks');
select t.eq((select count(*)::int from agent_runs where agent = 'venture'), 0, 'Member: keine Agentenläufe');
update startups set approved = true;
update startups set approved = true where domain = 'queueless.example';
select t.throws($$insert into startups (name) values ('Eigenes Startup')$$, 'Member: kann keine Profile anlegen');
select t.throws($$insert into challenges (title) values ('Eigene Challenge')$$, 'Member: kann keine Challenges anlegen');
reset role;
select t.eq((select count(*)::int from startups where approved), 0, 'Member: kann kein Siegel setzen (auch ohne WHERE)');

select t.login('expired');
select t.eq((select count(*)::int from startups), 0, 'Abgelaufene Org: keine Startups');
reset role;
select t.login('nobody');
select t.eq((select count(*)::int from startups), 0, 'Ohne Org: keine Startups');
reset role;
select t.anon();
select t.eq((select count(*)::int from startups), 0, 'anon: keine Startups');
reset role;

-- Archivieren nimmt das Profil aus dem Radar
select t.login('editor');
update startups set published = false, status = 'archived' where domain = 'queueless.example';
reset role;
select t.login('member');
select t.eq((select count(*)::int from startups), 0, 'Member: archiviertes Profil verschwindet');
reset role;

-- ───────────────────────── Ergebnis ─────────────────────────
do $$
declare total int; bad int; names text;
begin
  select count(*), count(*) filter (where not ok), string_agg(name, E'\n  ' order by n) filter (where not ok)
    into total, bad, names from t.results;
  if bad > 0 then
    raise exception E'% von % Venture-Tests fehlgeschlagen:\n  %', bad, total, names;
  end if;
  raise notice '% Venture-Tests bestanden', total;
end $$;

rollback;
