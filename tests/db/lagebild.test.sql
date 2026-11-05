-- Lagebild (Migration 0008): Bereiche („Lanes“) für Scouts und Meldungen, neue Scouts und Quellen.
-- Kunden sehen weiterhin weder Scouts noch unveröffentlichte Meldungen. Läuft in einer Transaktion und wird zurückgerollt.
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
insert into organizations (id, name, tier, seats, access_from) values
  ('a0a0a0a0-0000-0000-0000-000000000008', 'Kunde (aktiv)', 'basic', 5, current_date - 30);
insert into memberships (org_id, user_id, role) values ('a0a0a0a0-0000-0000-0000-000000000008', t.uid('member'), 'member');

insert into signals (id, title, url, trend_id, published_at, scout_id, lane) values
  ('68000000-0000-0000-0000-000000000001', 'Startup-Runde', 'https://example.org/s1', null, null, (select id from scouts where key = 'startups'), 'startup_tech'),
  ('68000000-0000-0000-0000-000000000002', 'Flughafen: Self-Checkout', 'https://example.org/s2', t.tid(26), now(), (select id from scouts where key = 'crossindustry'), 'cross_industry');

-- ───────────────────────── Startdaten ─────────────────────────
select t.eq((select lane from scouts where key = 'startups'), 'startup_tech', 'Scout „Startups & Tech“ im Bereich Startups & Technologie');
select t.eq((select lane from scouts where key = 'crossindustry'), 'cross_industry', 'Scout „Cross-Industry“ im Bereich Cross-Industry');
select t.eq((select count(*)::int from scouts where key in ('startups', 'crossindustry') and active), 0, 'Neue Scouts starten inaktiv');
select t.eq((select count(*)::int from scouts where lane = 'sport_hospitality'), 7, 'Bisherige Scouts bleiben bei Sport & Hospitality');
select t.eq((select count(*)::int from scout_channels sc join scouts s on s.id = sc.scout_id where s.key = 'startups'), 6, 'Startup-Scout: 6 Quellen');
select t.eq((select count(*)::int from scout_channels sc join scouts s on s.id = sc.scout_id
  join source_channels c on c.id = sc.channel_id where s.key = 'crossindustry' and c.key = 'fte'), 1, 'Cross-Industry-Scout nutzt Future Travel Experience');
select t.eq((select count(*)::int from source_channels where key in ('sifted', 'eu_startups', 'techcrunch', 'gruenderszene', 'fte', 'airport_tech', 'railway_tech', 'retaildive') and not verified), 8,
  'Neue Startquellen: 8, als ungeprüft markiert');

-- ───────────────────────── Regeln in der Datenbank ─────────────────────────
select t.throws($$update scouts set lane = 'crypto' where key = 'startups'$$, 'Nur bekannte Bereiche für Scouts', 'check');
select t.throws($$update signals set lane = 'crypto' where id = '68000000-0000-0000-0000-000000000001'$$, 'Nur bekannte Bereiche für Meldungen', 'check');

-- ───────────────────────── Redaktion ─────────────────────────
select t.login('editor');
select t.eq((select count(*)::int from signals where lane = 'startup_tech' and id::text like '68000000%'), 1, 'Redaktion: sieht Startup-Meldungen');
select t.eq((select count(*)::int from scouts where lane <> 'sport_hospitality'), 2, 'Redaktion: sieht die neuen Scouts');
reset role;

-- ───────────────────────── Kunden ─────────────────────────
select t.login('member');
select t.eq((select count(*)::int from scouts), 0, 'Member: keine Scouts, auch nicht die neuen');
select t.eq((select count(*)::int from signals where id::text like '68000000%'), 1, 'Member: nur die freigegebene Meldung zu einem Trend');
select t.eq((select lane from signals where id = '68000000-0000-0000-0000-000000000002'), 'cross_industry', 'Member: Bereich der freigegebenen Meldung lesbar');
update signals set lane = 'startup_tech' where id = '68000000-0000-0000-0000-000000000002';
update signals set lane = 'startup_tech';
reset role;
select t.eq((select lane from signals where id = '68000000-0000-0000-0000-000000000002'), 'cross_industry', 'Member: kann den Bereich nicht ändern (auch ohne WHERE)');

-- ───────────────────────── Ergebnis ─────────────────────────
do $$
declare total int; bad int; names text;
begin
  select count(*), count(*) filter (where not ok), string_agg(name, E'\n  ' order by n) filter (where not ok)
    into total, bad, names from t.results;
  if bad > 0 then
    raise exception E'% von % Lagebild-Tests fehlgeschlagen:\n  %', bad, total, names;
  end if;
  raise notice '% Lagebild-Tests bestanden', total;
end $$;

rollback;
