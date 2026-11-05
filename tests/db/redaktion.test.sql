-- Redaktions-Backend (Migration 0006): Felder, Liveticker-Sichtbarkeit, Bearbeiten/Freigeben/Ablehnen,
-- Versionen und Wiederherstellen, Teamverwaltung. Läuft in einer Transaktion und wird zurückgerollt.
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

insert into trends (number, name, cluster_code, focus_code, origin, description, evidence, status)
values (998, 'Entwurf', 'A', 'FAN', 'EU', 'Noch nicht veröffentlicht', 'C', 'draft');

insert into signals (id, title, url, trend_id) values
  ('51000000-0000-0000-0000-000000000001', 'Neu, nicht freigegeben', 'https://example.org/1', t.tid(27)),
  ('51000000-0000-0000-0000-000000000002', 'Freigegeben', 'https://example.org/2', t.tid(27)),
  ('51000000-0000-0000-0000-000000000003', 'Freigegeben, aber Entwurf', 'https://example.org/3', t.tid(998)),
  ('51000000-0000-0000-0000-000000000004', 'Wartet auf Zuordnung', 'https://example.org/4', null);
update signals set published_at = now() where id in ('51000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003');

insert into proposals (id, kind, target_trend_id, payload, rationale) values
  ('52000000-0000-0000-0000-000000000001', 'score_change', t.tid(10),
   '{"perspective": "EU", "horizon": "3–5", "eu_note": "Pilot in München", "scores": [
      {"criterion": 1, "score": 4, "rationale": "a"}, {"criterion": 2, "score": 4, "rationale": "b"},
      {"criterion": 3, "score": 4, "rationale": "c"}, {"criterion": 4, "score": 3, "rationale": "d"},
      {"criterion": 5, "score": 3, "rationale": "e"}, {"criterion": 6, "score": 3, "rationale": "f"}]}', 'Neue Belege'),
  ('52000000-0000-0000-0000-000000000002', 'attach_signal', t.tid(24),
   '{"signal_id": "51000000-0000-0000-0000-000000000004", "publish": true}', 'Passt zu Mobile Order'),
  ('52000000-0000-0000-0000-000000000003', 'new_trend', null,
   '{"fields": {"name": "Smart Parking & E-Laden", "cluster_code": "D", "focus_code": "INF", "origin": "EU",
     "description": "Parkplatz buchen, laden, bezahlen in einer App.", "evidence": "B", "journey_stage": "anreise"},
     "scores": {"GLOBAL": [{"criterion": 1, "score": 3}, {"criterion": 2, "score": 4}, {"criterion": 3, "score": 3},
                            {"criterion": 4, "score": 4}, {"criterion": 5, "score": 2}, {"criterion": 6, "score": 4}]},
     "perspectives": {"GLOBAL": {"horizon": "0–2"}},
     "relevance": {"SPORT": 3, "HOSPITALITY": 1, "LIVE": 3}}', 'Zwei Signale'),
  ('52000000-0000-0000-0000-000000000004', 'new_source', t.tid(32),
   '{"title": "Studie Fan-Mobilität", "publisher": "Verband", "url": "https://example.org/studie"}', 'Beleg'),
  ('52000000-0000-0000-0000-000000000005', 'update_trend', t.tid(26),
   '{"fields": {"risks": "Abhängigkeit von Zahlungsanbietern"}}', 'Ergänzung');

-- ───────────────────────── Felder ─────────────────────────
select t.eq((select journey_stage from trends where number = 18), 'einlass', 'Startwert Ort: #18 Einlass');
select t.eq((select journey_stage from trends where number = 9), 'stadion', 'Startwert Ort: #9 Im Stadion (Standard)');
select t.eq((select audience from trends where number = 13), 'vip', 'Startwert Zielgruppe: #13 Hospitality');
select t.eq((select audience from trends where number = 26), 'public', 'Startwert Zielgruppe: #26 Public');
select t.throws($$update trends set journey_stage = 'mond' where number = 1$$, 'Ort nur aus fester Liste', 'check');
select t.throws($$update signals set trend_id = null where id = '51000000-0000-0000-0000-000000000002'$$,
  'Freigegebene Meldung braucht einen Trend', 'signals_published_needs_trend');

-- ───────────────────────── Liveticker-Sichtbarkeit ─────────────────────────
select t.anon();
select t.eq((select count(*)::int from signals), 0, 'anon: keine Meldungen');
reset role;
select t.login('nobody');
select t.eq((select count(*)::int from signals), 0, 'ohne Org: keine Meldungen');
reset role;
select t.login('member');
select t.eq((select count(*)::int from signals), 1, 'Member: nur freigegebene Meldung zu veröffentlichtem Trend');
select t.eq((select title from signals limit 1), 'Freigegeben', 'Member: richtige Meldung');
select t.eq((select count(*)::int from trend_positions), 88, 'Member: Radar läuft unverändert (44 × 2 Perspektiven)');
-- gesperrtes UPDATE betrifft wegen RLS 0 Zeilen (kein Fehler) – geprüft wird die Wirkung
update signals set published_at = now();
select t.eq((select count(*)::int from signals where published_at is not null), 1, 'Member: Freigabeversuch ohne Wirkung');
select t.throws($$select edit_trend(t.tid(1), '{"fields": {"name": "x"}}')$$, 'Member: kann nicht bearbeiten', 'nur_redaktion');
select t.throws($$select approve_proposal('52000000-0000-0000-0000-000000000001')$$, 'Member: kann nicht freigeben', 'nur_redaktion');
select t.throws($$select apply_trend_patch(t.tid(1), '{"fields": {"name": "x"}}')$$, 'Member: Hilfsfunktion schreibt nichts', 'trend_not_found');
select t.eq((select count(*)::int from team_members()), 0, 'Member: sieht kein Team');
reset role;

-- ───────────────────────── Bearbeiten, Versionen, Wiederherstellen ─────────────────────────
select t.login('editor');
select t.eq((select count(*)::int from signals), 4, 'Editor: sieht alle Meldungen');
select edit_trend(t.tid(1), '{"fields": {"name": "Hyper-Personalisierung 2.0", "audience": "public"}}');
select t.eq((select name from trends where number = 1), 'Hyper-Personalisierung 2.0', 'Editor: Name geändert');
select t.eq((select audience from trends where number = 1), 'public', 'Editor: Zielgruppe geändert');
select t.eq((select count(*)::int from trend_versions where trend_id = t.tid(1)), 1, 'Bearbeiten legt eine Version an');
select t.eq((select snapshot->'fields'->>'name' from trend_versions where trend_id = t.tid(1)), 'Hyper-Personalisierung', 'Version enthält alten Stand');
select t.eq((select changed_by from trend_versions where trend_id = t.tid(1)), t.uid('editor'), 'Version kennt Bearbeiter');
select restore_trend_version((select id from trend_versions where trend_id = t.tid(1)));
select t.eq((select name from trends where number = 1), 'Hyper-Personalisierung', 'Wiederherstellen setzt alten Namen');
select t.eq((select audience from trends where number = 1), 'both', 'Wiederherstellen setzt alte Zielgruppe');
select t.eq((select count(*)::int from trend_versions where trend_id = t.tid(1)), 2, 'Wiederherstellen sichert vorher den aktuellen Stand');
select t.throws($$select edit_trend(t.tid(1), '{"scores": {"GLOBAL": [{"criterion": 1, "score": 9}]}}')$$, 'Score außerhalb 1–5 abgelehnt');
select t.eq((select count(*)::int from trend_scores where trend_id = t.tid(1) and perspective = 'GLOBAL'), 6, 'Fehlgeschlagene Bearbeitung ändert nichts');

-- ───────────────────────── Review-Queue ─────────────────────────
select approve_proposal('52000000-0000-0000-0000-000000000001', null, 'passt');
select t.eq((select score from trend_scores where trend_id = t.tid(10) and perspective = 'EU' and criterion = 4), 3::smallint, 'score_change: EU-Score übernommen');
select t.eq((select horizon::text from trend_perspectives where trend_id = t.tid(10) and perspective = 'EU'), '3–5', 'score_change: EU-Horizont übernommen');
select t.eq((select zone::text from trend_positions where trend_id = t.tid(10) and perspective = 'EU'), 'WARMUP', 'score_change: #10 wandert in Europa vom Scouting ins Aufwärmen');
select t.eq((select status::text from proposals where id = '52000000-0000-0000-0000-000000000001'), 'approved', 'score_change: Vorschlag freigegeben');
select t.eq((select reviewed_by from proposals where id = '52000000-0000-0000-0000-000000000001'), t.uid('editor'), 'Freigabe kennt Prüfer');
select t.eq((select count(*)::int from trend_versions where proposal_id = '52000000-0000-0000-0000-000000000001'), 1, 'Freigabe legt Version mit Bezug zum Vorschlag an');
select t.throws($$select approve_proposal('52000000-0000-0000-0000-000000000001')$$, 'Doppelte Freigabe abgelehnt', 'proposal_already_reviewed');

select approve_proposal('52000000-0000-0000-0000-000000000002');
select t.ok((select published_at is not null and trend_id = t.tid(24) from signals where id = '51000000-0000-0000-0000-000000000004'), 'attach_signal: zugeordnet und freigegeben');

select approve_proposal('52000000-0000-0000-0000-000000000003');
select t.eq((select status::text from trends where name = 'Smart Parking & E-Laden'), 'published', 'new_trend: angelegt und veröffentlicht');
select t.eq((select number from trends where name = 'Smart Parking & E-Laden'), 999, 'new_trend: nächste freie Nummer');
select t.eq((select journey_stage from trends where name = 'Smart Parking & E-Laden'), 'anreise', 'new_trend: Ort übernommen');
select t.eq((select zone::text from trend_positions where trend_id = (select id from trends where number = 999) and perspective = 'GLOBAL'), 'WARMUP', 'new_trend: Position berechnet (Score 3,35 < 3,5 → Aufwärmen)');

select approve_proposal('52000000-0000-0000-0000-000000000004');
select t.eq((select count(*)::int from trend_sources ts join sources s on s.id = ts.source_id
  where ts.trend_id = t.tid(32) and s.url = 'https://example.org/studie'), 1, 'new_source: Quelle angelegt und verknüpft');

-- Bearbeiten und freigeben: eigener Payload ersetzt den Vorschlag
select approve_proposal('52000000-0000-0000-0000-000000000005', '{"fields": {"risks": "Abhängigkeit von wenigen Zahlungsanbietern"}}');
select t.eq((select risks from trends where number = 26), 'Abhängigkeit von wenigen Zahlungsanbietern', 'Bearbeiten und freigeben: bearbeiteter Text');
select t.eq((select payload->'fields'->>'risks' from proposals where id = '52000000-0000-0000-0000-000000000005'),
  'Abhängigkeit von wenigen Zahlungsanbietern', 'Bearbeiten und freigeben: Vorschlag speichert die Fassung, die live ging');

insert into proposals (id, kind, target_trend_id, payload, rationale)
values ('52000000-0000-0000-0000-000000000006', 'update_trend', t.tid(2), '{"fields": {"name": "Unsinn"}}', 'x');
select t.throws($$select reject_proposal('52000000-0000-0000-0000-000000000006', '  ')$$, 'Ablehnen nur mit Begründung', 'begruendung_fehlt');
select reject_proposal('52000000-0000-0000-0000-000000000006', 'Keine Quelle');
select t.eq((select status::text from proposals where id = '52000000-0000-0000-0000-000000000006'), 'rejected', 'Ablehnen setzt Status');
select t.eq((select name from trends where number = 2), 'Loyalty-Ökosysteme', 'Ablehnen ändert den Trend nicht');

select t.eq((select count(*)::int from team_members()), 0, 'Editor: sieht kein Team (nur Admin)');
select t.throws($$select set_platform_role('nobody@test.local', 'editor')$$, 'Editor: kann keine Rollen vergeben', 'nur_admin');
reset role;

select t.login('member');
select t.eq((select count(*)::int from signals), 2, 'Member: sieht neu freigegebene Meldung');
select t.eq((select count(*)::int from trends), 45, 'Member: sieht freigegebenen neuen Trend');
reset role;

-- ───────────────────────── Team ─────────────────────────
select t.login('admin');
select t.eq((select count(*)::int from team_members() where email like '%@test.local'), 2, 'Admin: sieht Redaktion (Admin und Editor)');
select t.eq((select count(*)::int from team_members() where email = 'member@test.local'), 0, 'Admin: Kunden stehen nicht in der Teamliste');
select t.eq((select email from team_members() where platform_role = 'editor'), 'editor@test.local', 'Admin: sieht E-Mail-Adressen');
select set_platform_role('NOBODY@test.local ', 'editor');
select t.eq((select platform_role::text from profiles where id = t.uid('nobody')), 'editor', 'Admin: vergibt Rolle per E-Mail');
select t.throws($$select set_platform_role('gibt-es-nicht@test.local', 'editor')$$, 'Admin: unbekanntes Konto', 'konto_unbekannt');
select t.throws($$select set_platform_role('admin@test.local', 'none')$$, 'Admin: kann sich nicht selbst entziehen', 'eigene_rolle');
reset role;

-- ───────────────────────── Ergebnis ─────────────────────────
do $$
declare total int; bad int; names text;
begin
  select count(*), count(*) filter (where not ok), string_agg(name, E'\n  ' order by n) filter (where not ok)
    into total, bad, names from t.results;
  if bad > 0 then
    raise exception E'% von % Redaktions-Tests fehlgeschlagen:\n  %', bad, total, names;
  end if;
  raise notice '% Redaktions-Tests bestanden', total;
end $$;

rollback;
