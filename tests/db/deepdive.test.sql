-- Problem Deep Dive (Migration 0011): Gespräche und Briefing nur für die Redaktion; Kunden und Fremde sehen nichts.
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
insert into t.users (name, id) select n, gen_random_uuid() from unnest(array['editor', 'member']) n;
insert into auth.users (id, email) select id, name || '@test.local' from t.users;
update profiles set platform_role = 'editor' where id = t.uid('editor');
insert into organizations (id, name, tier, seats, access_from) values ('a1100000-0000-0000-0000-000000000011', 'Kunde', 'basic', 5, current_date - 30);
insert into memberships (org_id, user_id, role) values ('a1100000-0000-0000-0000-000000000011', t.uid('member'), 'owner');
insert into challenges (id, title, problem) values ('c1100000-0000-0000-0000-000000000011', 'Bierstand', 'Lange Schlangen in der Halbzeit.');

-- ───────────────────────── Redaktion ─────────────────────────
select t.login('editor');
insert into agent_runs (id, agent, status, challenge_id) values ('a1100000-0000-0000-0000-0000000000a1', 'deepdive', 'running', 'c1100000-0000-0000-0000-000000000011');
insert into deep_dive_sessions (id, challenge_id, title, source, char_count, run_id, created_by) values
  ('d1100000-0000-0000-0000-000000000011', 'c1100000-0000-0000-0000-000000000011', 'Gespräch Betriebsleitung', 'paste', 18000, 'a1100000-0000-0000-0000-0000000000a1', t.uid('editor'));
update deep_dive_sessions set status = 'done', summary = 'Engpass ist die Kasse, nicht das Zapfen.' where id = 'd1100000-0000-0000-0000-000000000011';
update challenges set brief = '{"summary": "Kasse ist der Engpass."}', brief_updated_at = now() where id = 'c1100000-0000-0000-0000-000000000011';
select t.eq((select count(*)::int from deep_dive_sessions where source = 'paste'), 1, 'Redaktion: legt Gespräche an');
select t.eq((select brief ->> 'summary' from challenges where id = 'c1100000-0000-0000-0000-000000000011'), 'Kasse ist der Engpass.', 'Redaktion: speichert das Briefing');
select t.throws($$insert into deep_dive_sessions (challenge_id, title, source) values ('c1100000-0000-0000-0000-000000000011', 'x', 'notion')$$, 'Nur bekannte Quellen', 'check');
select t.throws($$insert into deep_dive_sessions (challenge_id, title, source) values ('c1100000-0000-0000-0000-000000000011', '  ', 'paste')$$, 'Gespräch braucht einen Titel', 'check');
insert into deep_dive_sessions (challenge_id, title, source, source_url) values
  ('c1100000-0000-0000-0000-000000000011', 'Meeting-Notiz', 'notion', 'https://www.notion.so/newspice/Meeting-1234567890abcdef1234567890abcdef');
select t.eq((select count(*)::int from deep_dive_sessions where source = 'notion'), 1, 'Redaktion: Gespräch als Notion-Link');
select t.throws($$insert into deep_dive_sessions (challenge_id, title, source) values ('c1100000-0000-0000-0000-000000000011', 'ohne Link', 'notion')$$,
  'Notion-Gespräch braucht einen Link', 'deep_dive_sessions_notion_url');
select t.throws($$insert into deep_dive_sessions (challenge_id, title, source, source_url) values ('c1100000-0000-0000-0000-000000000011', 'x', 'notion', 'javascript:alert(1)')$$,
  'Nur https-Links', 'check');
reset role;

-- ───────────────────────── Kunden ─────────────────────────
select t.login('member');
select t.eq((select count(*)::int from deep_dive_sessions), 0, 'Member: keine Gespräche');
select t.throws($$insert into deep_dive_sessions (challenge_id, title, source) values ('c1100000-0000-0000-0000-000000000011', 'Eigenes', 'paste')$$, 'Member: kann keine Gespräche anlegen');
update deep_dive_sessions set summary = 'gehackt';
reset role;
select t.eq((select summary from deep_dive_sessions where id = 'd1100000-0000-0000-0000-000000000011'), 'Engpass ist die Kasse, nicht das Zapfen.', 'Member: kann nichts ändern (auch ohne WHERE)');
select t.anon();
select t.eq((select count(*)::int from deep_dive_sessions), 0, 'anon: keine Gespräche');
reset role;

-- ───────────────────────── Ergebnis ─────────────────────────
do $$
declare total int; bad int; names text;
begin
  select count(*), count(*) filter (where not ok), string_agg(name, E'\n  ' order by n) filter (where not ok)
    into total, bad, names from t.results;
  if bad > 0 then
    raise exception E'% von % Deep-Dive-Tests fehlgeschlagen:\n  %', bad, total, names;
  end if;
  raise notice '% Deep-Dive-Tests bestanden', total;
end $$;

rollback;
