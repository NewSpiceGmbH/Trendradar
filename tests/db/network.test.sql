-- Netzwerk-Datenbank (Migration 0014): Kunden sehen andere Mitglieder nur, wenn sie öffentlich markiert oder einem
-- eigenen Projekt zugewiesen und freigegeben sind; Vertrauliches, Interessen, Beziehung und Vorschläge nur die Redaktion.
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

insert into t.users (name, id) select n, gen_random_uuid() from unnest(array['editor', 'kunde', 'fremd', 'expired', 'nobody']) n;
insert into auth.users (id, email) select id, name || '@test.local' from t.users;
update profiles set platform_role = 'editor' where id = t.uid('editor');
insert into organizations (id, name, tier, seats, access_from, access_until) values
  ('a0000000-0000-0000-0000-000000000014', 'Kunde A', 'basic', 5, current_date - 30, null),
  ('b0000000-0000-0000-0000-000000000014', 'Kunde B', 'basic', 5, current_date - 30, null),
  ('e0000000-0000-0000-0000-000000000014', 'Kunde (abgelaufen)', 'basic', 5, current_date - 60, current_date - 1);
insert into memberships (org_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000014', t.uid('kunde'), 'member'),
  ('b0000000-0000-0000-0000-000000000014', t.uid('fremd'), 'member'),
  ('e0000000-0000-0000-0000-000000000014', t.uid('expired'), 'member');

-- Mitglieder: öffentlich, intern, intern aber im Projekt von Kunde A, intern auf der Shortlist ohne Freigabe
insert into startups (id, name, partner_types, is_startup, published, status) values
  ('51000000-0000-0000-0000-000000000001', 'TapFlow', '{solution_provider}', true, true, 'qualified'),
  ('51000000-0000-0000-0000-000000000002', 'Intern GmbH', '{solution_provider}', false, false, 'qualified'),
  ('51000000-0000-0000-0000-000000000003', 'Projektpartner AG', '{solution_provider,caterer}', false, false, 'qualified'),
  ('51000000-0000-0000-0000-000000000004', 'Noch nicht freigegeben', '{solution_provider}', true, false, 'qualified'),
  ('51000000-0000-0000-0000-000000000005', 'FC Beispiel', '{club}', false, true, 'qualified'),
  ('51000000-0000-0000-0000-000000000006', 'In Prüfung', '{solution_provider}', true, false, 'review');
insert into startup_private (startup_id, pricing) select id, 'geheim' from startups where id::text like '51000000%';
insert into member_internal (member_id, org_id) values ('51000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000014');

insert into offer_categories (id, name, trend_numbers) values
  ('0c000000-0000-0000-0000-000000000001', 'Zapfsysteme', '{25}'),
  ('0c000000-0000-0000-0000-000000000002', 'Kassensysteme', '{19,26}');
insert into member_offers (id, member_id, title) values
  ('0f000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'TapFlow Wall'),
  ('0f000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002', 'Interne Kasse'),
  ('0f000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000003', 'Partner-Kasse'),
  ('0f000000-0000-0000-0000-000000000004', '51000000-0000-0000-0000-000000000004', 'Unfreigegeben');
insert into member_offer_categories (offer_id, category_id) values
  ('0f000000-0000-0000-0000-000000000001', '0c000000-0000-0000-0000-000000000001'),
  ('0f000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-000000000002'),
  ('0f000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000002');
insert into member_interests (member_id, category_id) values ('51000000-0000-0000-0000-000000000005', '0c000000-0000-0000-0000-000000000002');
insert into member_references (member_id, client, published) values
  ('51000000-0000-0000-0000-000000000001', 'Arena Süd', true),
  ('51000000-0000-0000-0000-000000000001', 'Vertraulicher Pilot', false),
  ('51000000-0000-0000-0000-000000000002', 'Interne Referenz', true),
  ('51000000-0000-0000-0000-000000000003', 'Partner-Referenz', true);

insert into projects (id, org_id, title) values
  ('9a000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000014', 'Halbzeit-Gastro'),
  ('9b000000-0000-0000-0000-000000000014', 'b0000000-0000-0000-0000-000000000014', 'Fremdes Projekt');
insert into project_startups (project_id, startup_id, shared, role) values
  ('9a000000-0000-0000-0000-000000000014', '51000000-0000-0000-0000-000000000003', true, 'partner'),
  ('9a000000-0000-0000-0000-000000000014', '51000000-0000-0000-0000-000000000004', false, 'shortlist');
insert into agent_runs (id, agent, status) values ('a1000000-0000-0000-0000-000000000014', 'network', 'succeeded');
insert into network_suggestions (run_id, kind, title, rationale, payload) values
  ('a1000000-0000-0000-0000-000000000014', 'category', 'Kategorie „Bestell-Apps“', 'Drei Einträge bieten Mobile Order an.', '{"name": "Bestell-Apps", "trend_numbers": [24]}');

-- ───────────────────────── Regeln in der Datenbank ─────────────────────────
select t.throws($$insert into startups (name, partner_types) values ('X', '{}')$$, 'Mindestens ein Partner-Typ', 'startups_partner_types');
select t.throws($$insert into startups (name, partner_types) values ('X', '{startup}')$$, 'Nur feste Partner-Typen', 'startups_partner_types');
select t.throws($$insert into startups (name, status) values ('X', 'pending')$$, 'Nur bekannte Status', 'startups_status_check');
select t.throws($$insert into startups (name, status, published) values ('X', 'review', true)$$, 'In Prüfung lässt sich nicht veröffentlichen', 'startups_publish_qualified');
select t.throws($$insert into offer_categories (name) values (' zapfsysteme ')$$, 'Kategorienamen eindeutig (Groß/Klein egal)', 'offer_categories_name');
select t.throws($$insert into network_suggestions (kind, title, rationale) values ('category', 'X', ' ')$$, 'Vorschlag nur mit Begründung', 'check');
select t.throws($$insert into project_startups (project_id, startup_id, role) values ('9b000000-0000-0000-0000-000000000014', '51000000-0000-0000-0000-000000000001', 'boss')$$, 'Nur bekannte Rollen im Projekt', 'check');

-- ───────────────────────── Redaktion ─────────────────────────
select t.login('editor');
select t.eq((select count(*)::int from startups where id::text like '51000000%'), 6, 'Redaktion: alle Mitglieder');
select t.eq((select count(*)::int from member_offers), 4, 'Redaktion: alle Angebote');
select t.eq((select count(*)::int from member_references), 4, 'Redaktion: alle Referenzen');
select t.eq((select count(*)::int from member_interests), 1, 'Redaktion: Interessen');
select t.eq((select count(*)::int from member_internal), 1, 'Redaktion: Beziehung');
select t.eq((select count(*)::int from network_suggestions), 1, 'Redaktion: Vorschläge des Netzwerk-Managers');
insert into offer_categories (name, trend_numbers) values ('Bestell-Apps', '{24}');
update network_suggestions set status = 'accepted', decided_by = auth.uid(), decided_at = now();
reset role;

-- ───────────────────────── Kunde A ─────────────────────────
select t.login('kunde');
select t.eq((select array_agg(name order by name) from startups), '{"FC Beispiel","Projektpartner AG",TapFlow}'::text[],
  'Kunde: nur öffentliche und dem eigenen Projekt freigegebene Mitglieder');
select t.eq((select count(*)::int from startups where id = '51000000-0000-0000-0000-000000000004'), 0, 'Kunde: zugewiesen, aber nicht freigegeben → unsichtbar');
select t.eq((select count(*)::int from startups where id = '51000000-0000-0000-0000-000000000006'), 0, 'Kunde: In Prüfung → unsichtbar');
select t.eq((select array_agg(title order by title) from member_offers), '{Partner-Kasse,"TapFlow Wall"}'::text[], 'Kunde: Angebote nur sichtbarer Mitglieder');
select t.eq((select count(*)::int from member_offer_categories), 2, 'Kunde: Kategorien nur sichtbarer Angebote');
select t.eq((select array_agg(client order by client) from member_references), '{"Arena Süd",Partner-Referenz}'::text[], 'Kunde: nur freigegebene Referenzen sichtbarer Mitglieder');
select t.eq((select count(*)::int from offer_categories), 3, 'Kunde: Angebotskategorien sieht jeder mit Zugang');
select t.eq((select count(*)::int from startup_private), 0, 'Kunde: kein Vertrauliches ohne Freigabe im Projekt');
select t.eq((select count(*)::int from member_interests), 0, 'Kunde: keine Interessen');
select t.eq((select count(*)::int from member_internal), 0, 'Kunde: keine Beziehungen (auch nicht die eigene)');
select t.eq((select count(*)::int from network_suggestions), 0, 'Kunde: keine Vorschläge');
select t.eq((select count(*)::int from agent_runs where agent = 'network'), 0, 'Kunde: keine Läufe des Netzwerk-Managers');
-- Schreiben: ohne WHERE versuchen (siehe CLAUDE.md)
update startups set published = true;
update member_references set published = true;
update offer_categories set trend_numbers = '{1}';
delete from member_offers;
select t.throws($$insert into offer_categories (name) values ('Eigene Kategorie')$$, 'Kunde: kann keine Kategorien anlegen');
select t.throws($$insert into member_offers (member_id, title) values ('51000000-0000-0000-0000-000000000001', 'Fake')$$, 'Kunde: kann keine Angebote anlegen');
select t.throws($$insert into network_suggestions (kind, title, rationale) values ('admit', 'X', 'Y')$$, 'Kunde: kann keine Vorschläge anlegen');
select t.throws($$insert into member_internal (member_id) values ('51000000-0000-0000-0000-000000000001')$$, 'Kunde: kann keine Beziehung anlegen');
reset role;
select t.eq((select count(*)::int from startups where published), 2, 'Kunde: kann nichts veröffentlichen (ohne WHERE)');
select t.eq((select count(*)::int from member_references where published), 3, 'Kunde: kann keine Referenz freigeben');
select t.eq((select count(*)::int from offer_categories where trend_numbers = '{1}'), 0, 'Kunde: kann Kategorien nicht ändern');
select t.eq((select count(*)::int from member_offers), 4, 'Kunde: kann keine Angebote löschen');

-- Freigabe von Kosten und Pitchdeck im Projekt
update project_startups set share_private = true where startup_id = '51000000-0000-0000-0000-000000000003';
select t.login('kunde');
select t.eq((select count(*)::int from startup_private), 1, 'Kunde: Vertrauliches nach Freigabe im eigenen Projekt');
reset role;

-- ───────────────────────── Fremder Kunde B ─────────────────────────
select t.login('fremd');
select t.eq((select array_agg(name order by name) from startups), '{"FC Beispiel",TapFlow}'::text[], 'Fremder Kunde: Projektpartner von Kunde A unsichtbar');
select t.eq((select count(*)::int from member_offers where member_id = '51000000-0000-0000-0000-000000000003'), 0, 'Fremder Kunde: keine Angebote aus fremdem Projekt');
select t.eq((select count(*)::int from member_references where member_id = '51000000-0000-0000-0000-000000000003'), 0, 'Fremder Kunde: keine Referenzen aus fremdem Projekt');
select t.eq((select count(*)::int from startup_private), 0, 'Fremder Kunde: kein Vertrauliches');
select t.eq((select count(*)::int from member_internal), 0, 'Fremder Kunde: sieht nicht, wer Kunde ist');
reset role;

-- ───────────────────────── Ohne gültigen Zugang ─────────────────────────
select t.login('expired');
select t.eq((select count(*)::int from startups), 0, 'Abgelaufene Org: keine Mitglieder');
select t.eq((select count(*)::int from offer_categories), 0, 'Abgelaufene Org: keine Kategorien');
select t.eq((select count(*)::int from member_references), 0, 'Abgelaufene Org: keine Referenzen');
reset role;
select t.login('nobody');
select t.eq((select count(*)::int from startups), 0, 'Ohne Org: keine Mitglieder');
select t.eq((select count(*)::int from member_offers), 0, 'Ohne Org: keine Angebote');
reset role;
select t.anon();
select t.eq((select count(*)::int from startups), 0, 'anon: keine Mitglieder');
select t.eq((select count(*)::int from offer_categories), 0, 'anon: keine Kategorien');
select t.eq((select count(*)::int from member_offers), 0, 'anon: keine Angebote');
reset role;

-- ───────────────────────── Aufnahme aus Challenges ─────────────────────────
insert into challenges (id, title) values ('c0000000-0000-0000-0000-000000000014', 'Wartezeit');
insert into startup_candidates (id, challenge_id, name, domain, founded, summary, scores, total, recommendation) values
  ('d0000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000014', 'Alt AG', 'alt.example', 2001, 'x', '[]', 3, 'shortlist'),
  ('d1000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000014', 'Jung GmbH', 'jung.example', extract(year from current_date)::int - 2, 'x', '[]', 3, 'shortlist');
select t.login('editor');
select decide_candidate('d0000000-0000-0000-0000-000000000014', 'qualified');
select decide_candidate('d1000000-0000-0000-0000-000000000014', 'qualified');
reset role;
select t.eq((select source from startups where domain = 'alt.example'), 'agent', 'Aufnahme aus Challenge: Quelle Agent');
select t.eq((select partner_types from startups where domain = 'alt.example'), '{solution_provider}'::text[], 'Aufnahme aus Challenge: Solution Provider');
select t.eq((select is_startup from startups where domain = 'alt.example'), false, 'Gegründet 2001: kein Startup');
select t.eq((select is_startup from startups where domain = 'jung.example'), true, 'Vor 2 Jahren gegründet: Startup');

-- ───────────────────────── Ergebnis ─────────────────────────
do $$
declare total int; bad int; names text;
begin
  select count(*), count(*) filter (where not ok), string_agg(name, E'\n  ' order by n) filter (where not ok)
    into total, bad, names from t.results;
  if bad > 0 then
    raise exception E'% von % Netzwerk-Tests fehlgeschlagen:\n  %', bad, total, names;
  end if;
  raise notice '% Netzwerk-Tests bestanden', total;
end $$;

rollback;
