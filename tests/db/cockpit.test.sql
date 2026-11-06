-- Cockpit (Migration 0013): Einstellungen nur für die Redaktion; „gesehen“ setzt nur die Redaktion.
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
insert into t.users (name, id) select n, gen_random_uuid() from unnest(array['editor', 'kunde']) n;
insert into auth.users (id, email) select id, name || '@test.local' from t.users;
update profiles set platform_role = 'editor' where id = t.uid('editor');
insert into organizations (id, name, tier, seats, access_from) values ('a1300000-0000-0000-0000-000000000013', 'Kunde', 'basic', 5, current_date - 30);
insert into memberships (org_id, user_id, role) values ('a1300000-0000-0000-0000-000000000013', t.uid('kunde'), 'owner');
insert into projects (id, org_id, title, requested_by) values ('e1300000-0000-0000-0000-000000000013', 'a1300000-0000-0000-0000-000000000013', 'Projekt', t.uid('kunde'));

select t.eq((select response_workdays from app_settings), 3::smallint, 'Standard: 3 Werktage');
select t.throws($$update app_settings set response_workdays = 0$$, 'Schwelle mindestens 1 Werktag', 'check');
select t.throws($$insert into app_settings (id) values (2)$$, 'Nur eine Einstellungszeile', 'check');

-- ───────────────────────── Redaktion ─────────────────────────
select t.login('editor');
update app_settings set response_workdays = 5;
update projects set editor_seen_at = now() where id = 'e1300000-0000-0000-0000-000000000013';
select t.eq((select response_workdays from app_settings), 5::smallint, 'Redaktion: ändert die Schwelle');
select t.ok((select editor_seen_at is not null from projects where id = 'e1300000-0000-0000-0000-000000000013'), 'Redaktion: markiert Projekt als gesehen');
reset role;
update projects set editor_seen_at = null;

-- ───────────────────────── Kunde ─────────────────────────
select t.login('kunde');
select t.eq((select count(*)::int from app_settings), 0, 'Kunde: sieht keine Einstellungen');
update app_settings set response_workdays = 1;
update projects set editor_seen_at = now();
update projects set editor_seen_at = now() where id = 'e1300000-0000-0000-0000-000000000013';
reset role;
select t.eq((select response_workdays from app_settings), 5::smallint, 'Kunde: kann die Schwelle nicht ändern');
select t.ok((select editor_seen_at is null from projects where id = 'e1300000-0000-0000-0000-000000000013'), 'Kunde: kann „gesehen“ nicht setzen (auch ohne WHERE)');

-- ───────────────────────── Ergebnis ─────────────────────────
do $$
declare total int; bad int; names text;
begin
  select count(*), count(*) filter (where not ok), string_agg(name, E'\n  ' order by n) filter (where not ok)
    into total, bad, names from t.results;
  if bad > 0 then
    raise exception E'% von % Cockpit-Tests fehlgeschlagen:\n  %', bad, total, names;
  end if;
  raise notice '% Cockpit-Tests bestanden', total;
end $$;

rollback;
