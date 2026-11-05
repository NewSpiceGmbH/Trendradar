-- Projekte (Migration 0010): Kunden sehen nur Projekte ihrer Organisation (mit gültigem Zugang), von der Shortlist nur
-- Freigegebenes, Vertrauliches nur bei ausdrücklicher Freigabe, nie interne Nachrichten oder Dokumente. Dateien im
-- Speicher folgen denselben Regeln. Läuft in einer Transaktion und wird zurückgerollt.
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
insert into t.users (name, id) select n, gen_random_uuid() from unnest(array['editor', 'kunde', 'kollege', 'fremd', 'expired']) n;
insert into auth.users (id, email) select id, name || '@test.local' from t.users;
update profiles set platform_role = 'editor' where id = t.uid('editor');
insert into organizations (id, name, tier, seats, access_from, access_until) values
  ('a1000000-0000-0000-0000-000000000010', 'Kunde A', 'basic', 5, current_date - 30, null),
  ('b1000000-0000-0000-0000-000000000010', 'Kunde B', 'basic', 5, current_date - 30, null),
  ('c1000000-0000-0000-0000-000000000010', 'Kunde C (abgelaufen)', 'basic', 5, current_date - 60, current_date - 1);
insert into memberships (org_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000010', t.uid('kunde'), 'owner'),
  ('a1000000-0000-0000-0000-000000000010', t.uid('kollege'), 'member'),
  ('b1000000-0000-0000-0000-000000000010', t.uid('fremd'), 'owner'),
  ('c1000000-0000-0000-0000-000000000010', t.uid('expired'), 'owner');

insert into startups (id, name, domain, status, published) values
  ('51000000-0000-0000-0000-000000000001', 'QueueLess', 'queueless.example', 'qualified', false),
  ('51000000-0000-0000-0000-000000000002', 'TapFlow', 'tapflow.example', 'qualified', false),
  ('51000000-0000-0000-0000-000000000003', 'Geheim AG', 'geheim.example', 'qualified', false);
insert into startup_private (startup_id, pricing, pitch_deck_url) values
  ('51000000-0000-0000-0000-000000000001', '2.000 € im Monat', 'https://example.org/deck-q.pdf'),
  ('51000000-0000-0000-0000-000000000002', '500 € je Stand', 'https://example.org/deck-t.pdf');

-- ───────────────────────── Anfrage durch den Kunden ─────────────────────────
select t.login('kunde');
insert into projects (id, org_id, title, request, requested_by) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000010', 'Bierstand schneller', 'Halbzeit: 12 Minuten Wartezeit.', t.uid('kunde'));
select t.throws($$insert into projects (org_id, title, requested_by) values ('b1000000-0000-0000-0000-000000000010', 'Fremde Org', t.uid('kunde'))$$,
  'Kunde: keine Anfrage für eine fremde Organisation');
select t.throws($$insert into projects (org_id, title, requested_by, status) values ('a1000000-0000-0000-0000-000000000010', 'Gleich im Pilot', t.uid('kunde'), 'pilot')$$,
  'Kunde: Anfrage nur im Status „angefragt“');
select t.throws($$insert into projects (org_id, title, requested_by) values ('a1000000-0000-0000-0000-000000000010', 'Im Namen anderer', t.uid('kollege'))$$,
  'Kunde: Anfrage nur im eigenen Namen');
update projects set status = 'pilot';
update projects set status = 'pilot' where id = 'e1000000-0000-0000-0000-000000000001';
reset role;
select t.eq((select status from projects where id = 'e1000000-0000-0000-0000-000000000001'), 'requested', 'Kunde: kann den Status nicht ändern (auch ohne WHERE)');

select t.login('expired');
select t.throws($$insert into projects (org_id, title, requested_by) values ('c1000000-0000-0000-0000-000000000010', 'Abgelaufen', t.uid('expired'))$$,
  'Abgelaufene Org: keine Anfrage');
reset role;

-- ───────────────────────── Redaktion kuratiert ─────────────────────────
select t.login('editor');
update projects set status = 'shortlist', lead_id = t.uid('editor') where id = 'e1000000-0000-0000-0000-000000000001';
insert into project_milestones (project_id, title, due_date) values ('e1000000-0000-0000-0000-000000000001', 'Erstgespräche', current_date + 14);
insert into project_startups (project_id, startup_id, rationale, shared, share_private) values
  ('e1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Kasse ohne Schlange', true, true),
  ('e1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'Selbstzapfen', true, false),
  ('e1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', 'noch in Prüfung', false, false);
insert into project_updates (project_id, author_id, body, internal) values
  ('e1000000-0000-0000-0000-000000000001', t.uid('editor'), 'Shortlist steht.', false),
  ('e1000000-0000-0000-0000-000000000001', t.uid('editor'), 'Intern: Marge prüfen.', true);
insert into project_documents (id, project_id, name, path, internal, uploaded_by) values
  ('d1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Shortlist.pdf', 'e1000000-0000-0000-0000-000000000001/shortlist.pdf', false, t.uid('editor')),
  ('d1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'Kalkulation.xlsx', 'e1000000-0000-0000-0000-000000000001/kalkulation.xlsx', true, t.uid('editor'));
insert into storage.objects (bucket_id, name) values
  ('project-files', 'e1000000-0000-0000-0000-000000000001/shortlist.pdf'),
  ('project-files', 'e1000000-0000-0000-0000-000000000001/kalkulation.xlsx');
select t.throws($$insert into project_startups (project_id, startup_id, shared, share_private) values ('e1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', false, true)
  on conflict (project_id, startup_id) do update set share_private = true$$, 'Vertrauliches nur zusammen mit Freigabe', 'project_startups_private_needs_share');
select t.throws($$insert into project_documents (project_id, name, path) values ('e1000000-0000-0000-0000-000000000001', 'x', 'anderes-projekt/x.pdf')$$,
  'Dokumentpfad muss im Projekt liegen', 'project_documents_path_in_project');
select t.throws($$select complete_project('e1000000-0000-0000-0000-000000000001', 'success')$$, 'Erfolg nur mit ausgewähltem Startup', 'ausgewählt');
reset role;

-- ───────────────────────── Was der Kunde sieht ─────────────────────────
select t.login('kollege');
select t.eq((select count(*)::int from projects), 1, 'Kollege: sieht das Projekt der eigenen Org');
select t.eq((select count(*)::int from project_milestones), 1, 'Kollege: sieht die Meilensteine');
select t.eq((select count(*)::int from project_startups), 2, 'Kollege: nur freigegebene Shortlist-Einträge');
select t.eq((select count(*)::int from startups), 2, 'Kollege: Startups aus der Shortlist sichtbar, auch unveröffentlicht');
select t.eq((select count(*)::int from startups where name = 'Geheim AG'), 0, 'Kollege: nicht freigegebenes Startup bleibt verborgen');
select t.eq((select count(*)::int from startup_private), 1, 'Kollege: Vertrauliches nur mit Freigabe');
select t.eq((select pricing from startup_private), '2.000 € im Monat', 'Kollege: Kosten des freigegebenen Startups');
select t.eq((select count(*)::int from project_updates), 1, 'Kollege: keine internen Nachrichten');
select t.eq((select count(*)::int from project_documents), 1, 'Kollege: keine internen Dokumente');
select t.eq((select count(*)::int from storage.objects), 1, 'Kollege: im Speicher nur die freigegebene Datei');
-- Rückmeldung, Nachricht, Upload
select respond_shortlist('e1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'interested', 'Gern Erstgespräch');
select t.throws($$select respond_shortlist('e1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'selected')$$,
  'Kunde: kann nicht selbst „ausgewählt“ setzen', 'Unbekannte');
select t.throws($$select respond_shortlist('e1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', 'interested')$$,
  'Kunde: keine Rückmeldung auf nicht freigegebene Einträge', 'Kein Zugriff');
update project_startups set rationale = 'gehackt', share_private = true;
insert into project_updates (project_id, author_id, body) values ('e1000000-0000-0000-0000-000000000001', t.uid('kollege'), 'Passt Termin am Montag?');
select t.throws($$insert into project_updates (project_id, author_id, body, internal) values ('e1000000-0000-0000-0000-000000000001', t.uid('kollege'), 'x', true)$$,
  'Kunde: keine internen Nachrichten schreiben');
insert into project_documents (project_id, name, path, uploaded_by) values
  ('e1000000-0000-0000-0000-000000000001', 'Grundriss.pdf', 'e1000000-0000-0000-0000-000000000001/grundriss.pdf', t.uid('kollege'));
insert into storage.objects (bucket_id, name) values ('project-files', 'e1000000-0000-0000-0000-000000000001/grundriss.pdf');
select t.throws($$insert into storage.objects (bucket_id, name) values ('project-files', 'e1000000-0000-0000-0000-000000000001/ohne-eintrag.pdf')$$,
  'Kunde: Datei nur mit vorherigem Dokumenteintrag');
select t.throws($$insert into project_documents (project_id, name, path, uploaded_by, internal) values ('e1000000-0000-0000-0000-000000000001', 'x', 'e1000000-0000-0000-0000-000000000001/x', t.uid('kollege'), true)$$,
  'Kunde: keine internen Dokumente anlegen');
delete from project_documents where id = 'd1000000-0000-0000-0000-000000000001';
reset role;
select t.eq((select customer_status from project_startups where startup_id = '51000000-0000-0000-0000-000000000001'), 'interested', 'Rückmeldung gespeichert');
select t.eq((select count(*)::int from project_startups where rationale = 'gehackt' or (share_private and startup_id <> '51000000-0000-0000-0000-000000000001')), 0,
  'Kunde: kann Shortlist nicht direkt ändern (auch ohne WHERE)');
select t.eq((select count(*)::int from project_updates where body = 'Passt Termin am Montag?'), 1, 'Kunde: Nachricht geschrieben');
select t.eq((select count(*)::int from project_documents where id = 'd1000000-0000-0000-0000-000000000001'), 1, 'Kunde: kann fremde Dokumente nicht löschen');
select t.eq((select count(*)::int from storage.objects where name like '%grundriss.pdf'), 1, 'Kunde: eigene Datei hochgeladen');

-- ───────────────────────── Fremde und Abgelaufene ─────────────────────────
select t.login('fremd');
select t.eq((select count(*)::int from projects), 0, 'Fremde Org: kein Projekt');
select t.eq((select count(*)::int from project_startups), 0, 'Fremde Org: keine Shortlist');
select t.eq((select count(*)::int from startups), 0, 'Fremde Org: keine Startups');
select t.eq((select count(*)::int from startup_private), 0, 'Fremde Org: nichts Vertrauliches');
select t.eq((select count(*)::int from storage.objects), 0, 'Fremde Org: keine Dateien');
select t.throws($$insert into project_updates (project_id, author_id, body) values ('e1000000-0000-0000-0000-000000000001', t.uid('fremd'), 'Hallo')$$,
  'Fremde Org: keine Nachricht in fremdes Projekt');
reset role;
-- Org läuft ab: Kunde A verliert den Zugriff
update organizations set access_until = current_date - 1 where id = 'a1000000-0000-0000-0000-000000000010';
select t.login('kunde');
select t.eq((select count(*)::int from projects), 0, 'Abgelaufener Zugang: keine Projekte mehr');
select t.eq((select count(*)::int from storage.objects), 0, 'Abgelaufener Zugang: keine Dateien mehr');
reset role;
update organizations set access_until = null where id = 'a1000000-0000-0000-0000-000000000010';
select t.anon();
select t.eq((select count(*)::int from projects), 0, 'anon: keine Projekte');
reset role;

-- ───────────────────────── Abschluss und Siegel ─────────────────────────
select t.login('kunde');
select t.throws($$select complete_project('e1000000-0000-0000-0000-000000000001', 'success')$$, 'Kunde: kann nicht abschließen');
reset role;
select t.login('editor');
update project_startups set customer_status = 'selected' where startup_id = '51000000-0000-0000-0000-000000000001';
select t.eq(complete_project('e1000000-0000-0000-0000-000000000001', 'success', 'Wartezeit halbiert'), 1, 'Abschluss: ein Startup erhält das Siegel');
reset role;
select t.eq((select approved from startups where id = '51000000-0000-0000-0000-000000000001'), true, 'QueueLess ist „New Spice approved“');
select t.eq((select approved from startups where id = '51000000-0000-0000-0000-000000000002'), false, 'TapFlow (nicht ausgewählt) nicht');
select t.eq((select status || '/' || outcome from projects where id = 'e1000000-0000-0000-0000-000000000001'), 'completed/success', 'Projekt abgeschlossen mit Erfolg');
select t.throws($$update projects set status = 'completed', outcome = null where id = 'e1000000-0000-0000-0000-000000000001'$$,
  'Abgeschlossen nur mit Ergebnis', 'projects_outcome_on_completion');

-- ───────────────────────── Mitgliederliste ─────────────────────────
select t.login('kollege');
select t.eq((select count(*)::int from org_members('a1000000-0000-0000-0000-000000000010')), 2, 'Kollege: sieht die eigene Org');
select t.eq((select count(*)::int from org_members('b1000000-0000-0000-0000-000000000010')), 0, 'Kollege: sieht keine fremde Org');
reset role;
select t.login('editor');
select t.eq((select count(*)::int from org_members('b1000000-0000-0000-0000-000000000010')), 1, 'Redaktion: sieht jede Org');
reset role;
select t.anon();
select t.throws($$select * from org_members('a1000000-0000-0000-0000-000000000010')$$, 'anon: darf die Funktion nicht aufrufen');
reset role;

-- ───────────────────────── Ergebnis ─────────────────────────
do $$
declare total int; bad int; names text;
begin
  select count(*), count(*) filter (where not ok), string_agg(name, E'\n  ' order by n) filter (where not ok)
    into total, bad, names from t.results;
  if bad > 0 then
    raise exception E'% von % Projekt-Tests fehlgeschlagen:\n  %', bad, total, names;
  end if;
  raise notice '% Projekt-Tests bestanden', total;
end $$;

rollback;
