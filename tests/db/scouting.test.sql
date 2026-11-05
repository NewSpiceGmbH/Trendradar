-- Scouting (Migration 0007): Scouts, Quellenkanäle, Tipps und Medien nur für die Redaktion; Kunden sehen
-- ausschließlich freigegebene Medien zu Meldungen, die sie lesen dürfen. Läuft in einer Transaktion und wird zurückgerollt.
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
insert into t.users (name, id) select n, gen_random_uuid() from unnest(array['admin', 'editor', 'member', 'nobody']) n;
insert into auth.users (id, email) select id, name || '@test.local' from t.users;
update profiles set platform_role = 'admin'  where id = t.uid('admin');
update profiles set platform_role = 'editor' where id = t.uid('editor');
insert into organizations (id, name, tier, seats, access_from) values
  ('a0a0a0a0-0000-0000-0000-000000000000', 'Kunde (aktiv)', 'basic', 5, current_date - 30);
insert into memberships (org_id, user_id, role) values ('a0a0a0a0-0000-0000-0000-000000000000', t.uid('member'), 'member');

insert into signals (id, title, url, trend_id, published_at, scout_id) values
  ('61000000-0000-0000-0000-000000000001', 'Freigegeben', 'https://example.org/a', t.tid(25), now(), (select id from scouts where key = 'fnb')),
  ('61000000-0000-0000-0000-000000000002', 'Nicht freigegeben', 'https://example.org/b', t.tid(25), null, (select id from scouts where key = 'fnb'));
insert into signal_media (signal_id, kind, url, embed_url, rights, approved) values
  ('61000000-0000-0000-0000-000000000001', 'video', 'https://www.youtube.com/watch?v=x', 'https://www.youtube-nocookie.com/embed/x', 'embed', true),
  ('61000000-0000-0000-0000-000000000001', 'image', 'https://example.org/bild.jpg', null, 'unclear', false),
  ('61000000-0000-0000-0000-000000000002', 'image', 'https://example.org/bild2.jpg', null, 'press', true);

-- ───────────────────────── Startdaten ─────────────────────────
select t.eq((select count(*)::int from scouts), 7, 'Startkader: 7 Scouts');
select t.eq((select count(*)::int from scouts where active), 0, 'Startkader: alle inaktiv bis zum API-Schlüssel');
select t.eq((select count(*)::int from source_channels where key in ('stadionwelt', 'linkedin', 'websuche')), 3, 'Startquellen: Stadionwelt, LinkedIn, Websuche');
select t.eq((select count(*)::int from source_channels where not verified), (select count(*)::int from source_channels), 'Startquellen: alle als ungeprüft markiert');
select t.eq((select count(*)::int from scout_channels sc join source_channels c on c.id = sc.channel_id where c.key = 'linkedin'), 7, 'LinkedIn für alle Scouts');
select t.eq((select monthly_budget_usd from scouting_settings), 200.00::numeric, 'Monatsbudget 200 $');

-- ───────────────────────── Regeln in der Datenbank ─────────────────────────
select t.throws($$insert into signal_media (signal_id, kind, url, rights, approved) values ('61000000-0000-0000-0000-000000000002', 'image', 'https://example.org/c.jpg', 'unclear', true)$$,
  'Bild mit unklaren Rechten lässt sich nicht freigeben', 'signal_media_rights_before_approval');
select t.throws($$insert into signal_media (signal_id, kind, url, rights) values ('61000000-0000-0000-0000-000000000002', 'video', 'https://www.youtube.com/watch?v=y', 'embed')$$,
  'Video nur eingebettet', 'signal_media_video_embed');
select t.throws($$insert into signal_media (signal_id, kind, url, embed_url, rights) values ('61000000-0000-0000-0000-000000000002', 'video', 'https://example.org/v', 'https://evil.example/embed', 'embed')$$,
  'Einbettung nur von YouTube (ohne Cookies) oder Vimeo', 'check');
select t.throws($$update source_channels set secret_ref = 'sk-ant-api03-geheim' where key = 'websuche'$$,
  'Quellen speichern nur den Namen einer Umgebungsvariable, nie den Schlüssel', 'check');
select t.throws($$update scouts set max_searches = 500 where key = 'fnb'$$, 'Suchbudget pro Lauf begrenzt', 'check');

-- ───────────────────────── Kunden und Fremde ─────────────────────────
select t.anon();
select t.eq((select count(*)::int from scouts), 0, 'anon: keine Scouts');
select t.eq((select count(*)::int from signal_media), 0, 'anon: keine Medien');
reset role;

select t.login('member');
select t.eq((select count(*)::int from scouts), 0, 'Member: keine Scouts');
select t.eq((select count(*)::int from source_channels), 0, 'Member: keine Quellenkanäle');
select t.eq((select count(*)::int from scout_tips), 0, 'Member: keine Tipps');
select t.eq((select count(*)::int from scouting_settings), 0, 'Member: kein Budget');
select t.eq((select count(*)::int from signal_media), 1, 'Member: nur freigegebenes Medium zu freigegebener Meldung');
select t.eq((select kind from signal_media limit 1), 'video', 'Member: das eingebettete Video');
update scouts set active = true;
select t.eq((select count(*)::int from scouts where active), 0, 'Member: kann keine Scouts einschalten');
select t.throws($$insert into scout_tips (url) values ('https://www.linkedin.com/posts/x')$$, 'Member: kann keine Tipps einreichen');
reset role;
select t.eq((select count(*)::int from scouts where active), 0, 'Member-Versuch ohne Wirkung');

-- ───────────────────────── Redaktion ─────────────────────────
select t.login('editor');
select t.eq((select count(*)::int from signal_media), 3, 'Editor: sieht alle Medien');
update scouts set active = true, briefing = briefing || ' Test.' where key = 'fnb';
select t.eq((select count(*)::int from scouts where active), 1, 'Editor: schaltet Scout ein');
insert into source_channels (name, kind, url, domains, secret_ref) values ('Mein Feed', 'rss', 'https://example.org/feed', '{example.org}', 'EXAMPLE_FEED_TOKEN');
select t.eq((select count(*)::int from source_channels where name = 'Mein Feed'), 1, 'Editor: dockt Quelle an');
insert into scout_tips (url, note, submitted_by) values ('https://www.linkedin.com/posts/beispiel', 'Spannend', auth.uid());
select t.eq((select count(*)::int from scout_tips where status = 'open'), 1, 'Editor: reicht Tipp ein');
update signal_media set rights = 'press', credit = 'Hersteller', approved = true where url = 'https://example.org/bild.jpg';
select t.eq((select count(*)::int from signal_media where approved), 3, 'Editor: gibt Bild mit geklärtem Recht frei');
update scouting_settings set paused = true;
select t.eq((select paused from scouting_settings), true, 'Editor: Not-Aus für alle Scouts');
reset role;

select t.login('member');
select t.eq((select count(*)::int from signal_media), 2, 'Member: sieht neu freigegebenes Bild');
reset role;

-- ───────────────────────── Ergebnis ─────────────────────────
do $$
declare total int; bad int; names text;
begin
  select count(*), count(*) filter (where not ok), string_agg(name, E'\n  ' order by n) filter (where not ok)
    into total, bad, names from t.results;
  if bad > 0 then
    raise exception E'% von % Scouting-Tests fehlgeschlagen:\n  %', bad, total, names;
  end if;
  raise notice '% Scouting-Tests bestanden', total;
end $$;

rollback;
