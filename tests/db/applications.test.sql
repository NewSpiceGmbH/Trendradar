-- Bewerbungen und Zugangsarten (Migration 0015): Bewerbungen nur für die Redaktion, Empfehlungen von Partnern,
-- Solution Provider sehen nur ihr eigenes Profil und fragen Änderungen an, Partner/Investoren ohne Projekte.
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
insert into t.users (name, id) select n, gen_random_uuid()
from unnest(array['editor', 'kunde', 'partner', 'investor', 'provider', 'provider_alt', 'nobody']) n;
insert into auth.users (id, email) select id, name || '@test.local' from t.users;
update profiles set platform_role = 'editor' where id = t.uid('editor');
insert into organizations (id, name, tier, seats, access_from, access_until, kind) values
  ('a0000000-0000-0000-0000-000000000015', 'Kunde A', 'basic', 5, current_date - 30, null, 'customer'),
  ('b0000000-0000-0000-0000-000000000015', 'Verband', 'basic', 3, current_date - 30, null, 'partner'),
  ('c0000000-0000-0000-0000-000000000015', 'Ventures', 'basic', 3, current_date - 30, null, 'investor');
insert into memberships (org_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000015', t.uid('kunde'), 'owner'),
  ('b0000000-0000-0000-0000-000000000015', t.uid('partner'), 'owner'),
  ('c0000000-0000-0000-0000-000000000015', t.uid('investor'), 'owner');
insert into offer_categories (id, name, trend_numbers) values ('0c000000-0000-0000-0000-000000000015', 'Zapfsysteme', '{25}');
insert into startups (id, name, published, status, domain, website) values
  ('5a000000-0000-0000-0000-000000000015', 'Öffentlich AG', true, 'qualified', 'oeffentlich.example', 'https://oeffentlich.example'),
  ('5b000000-0000-0000-0000-000000000015', 'Intern GmbH', false, 'qualified', 'intern.example', 'https://intern.example');
insert into startup_private (startup_id, pricing) values ('5a000000-0000-0000-0000-000000000015', 'geheim');

insert into applications (id, partner_type, org_name, email, website, founded, offer, offer_category_ids, privacy_accepted_at, status, contact_name, pitch_deck_path) values
  ('a1000000-0000-0000-0000-000000000001', 'solution_provider', 'TapFlow', 'gruender@tapflow.example', 'https://www.tapflow.example/de', extract(year from current_date)::int - 2,
   'Selbstzapf-Wand mit Kartenzahlung', '{0c000000-0000-0000-0000-000000000015}', now(), 'new', 'Gründerin', 'a1/deck.pdf'),
  ('a1000000-0000-0000-0000-000000000002', 'club', 'FC Beispiel', 'gs@fcb.example', 'https://fcb.example', 1912, null, '{}', now(), 'new', null, null),
  ('a1000000-0000-0000-0000-000000000003', 'multiplier', 'Verband Nord', 'info@verband.example', null, null, null, '{}', now(), 'new', null, null),
  ('a1000000-0000-0000-0000-000000000004', 'solution_provider', 'Öffentlich AG', 'neu@oeffentlich.example', 'https://oeffentlich.example', 2001, null, '{}', now(), 'new', null, null),
  ('a1000000-0000-0000-0000-000000000005', 'investor', 'Unbestätigt', 'x@unbestaetigt.example', null, null, null, '{}', now(), 'unconfirmed', null, null);
update applications set status = 'on_hold', hold_reason = 'later', hold_until = current_date + 14 where id = 'a1000000-0000-0000-0000-000000000003';
insert into storage.objects (bucket_id, name) values ('applications', 'a1/deck.pdf');

-- ───────────────────────── Regeln in der Datenbank ─────────────────────────
select t.throws($$insert into organizations (name, kind) values ('X', 'friend')$$, 'Nur bekannte Zugangsarten', 'check');
select t.throws($$update applications set status = 'on_hold', hold_reason = null where id = 'a1000000-0000-0000-0000-000000000002'$$,
  'On hold nur mit Grund und Wiedervorlage', 'applications_hold');
select t.throws($$insert into applications (partner_type, org_name, email, privacy_accepted_at, source) values ('club', 'X', 'x@y.de', now(), 'partner')$$,
  'Empfehlung nur mit Empfehlendem', 'applications_partner_source');
select t.throws($$insert into applications (partner_type, org_name, email, privacy_accepted_at) values ('club', 'X', 'keine-mail', now())$$, 'E-Mail-Adresse geprüft', 'check');
select t.throws($$insert into applications (partner_type, org_name, email) values ('club', 'X', 'x@y.de')$$, 'Datenschutz-Bestätigung Pflicht', 'null value');
select t.throws($$insert into applications (partner_type, org_name, email, privacy_accepted_at) values ('startup', 'X', 'x@y.de', now())$$, 'Nur feste Partner-Typen', 'check');
select t.ok((select count(*) from applications where confirm_token is not null) = 5, 'Jede Bewerbung hat ein Bestätigungs-Token');

-- ───────────────────────── Ohne Rechte ─────────────────────────
select t.anon();
select t.eq((select count(*)::int from applications), 0, 'anon: keine Bewerbungen');
select t.throws($$insert into applications (partner_type, org_name, email, privacy_accepted_at, status) values ('club', 'Spam', 'spam@x.de', now(), 'new')$$, 'anon: kann nicht direkt einreichen (nur über den Server)');
reset role;
select t.login('nobody');
select t.eq((select count(*)::int from applications), 0, 'Ohne Org: keine Bewerbungen');
select t.throws($$insert into applications (partner_type, org_name, email, privacy_accepted_at, source, recommended_by, status) values ('club', 'X', 'x@y.de', now(), 'partner', auth.uid(), 'new')$$, 'Ohne Org: keine Empfehlung');
reset role;
select t.login('kunde');
select t.eq((select count(*)::int from applications), 0, 'Kunde: keine Bewerbungen');
select t.throws($$insert into applications (partner_type, org_name, email, privacy_accepted_at, source, recommended_by, status) values ('club', 'X', 'x@y.de', now(), 'partner', auth.uid(), 'new')$$, 'Kunde: keine Empfehlung (nur Partner)');
select t.throws($$select accept_application('a1000000-0000-0000-0000-000000000002')$$, 'Kunde: kann nicht annehmen');
select t.ok((select count(*) from trends) > 0, 'Kunde: sieht weiterhin den Radar');
insert into projects (org_id, title, requested_by) values ('a0000000-0000-0000-0000-000000000015', 'Anfrage Kunde', auth.uid());
select t.eq((select count(*)::int from projects where title = 'Anfrage Kunde'), 1, 'Kunde: kann weiterhin Projekte anfragen');
reset role;

-- ───────────────────────── Partner (Multiplikator) ─────────────────────────
select t.login('partner');
select t.ok((select count(*) from trends) > 0, 'Partner: sieht den Radar');
select t.eq((select count(*)::int from startups), 1, 'Partner: sieht nur öffentliche Einträge');
select t.eq((select count(*)::int from startup_private), 0, 'Partner: kein Vertrauliches');
insert into applications (partner_type, org_name, email, privacy_accepted_at, source, recommended_by, status, message)
values ('club', 'SV Empfohlen', 'kontakt@sv.example', now(), 'partner', auth.uid(), 'new', 'Sucht Lösung für Einlass');
select t.eq((select count(*)::int from applications), 1, 'Partner: sieht nur die eigene Empfehlung');
select t.throws($$insert into applications (partner_type, org_name, email, privacy_accepted_at, source, recommended_by, status) values ('club', 'X', 'x@y.de', now(), 'partner', auth.uid(), 'accepted')$$, 'Partner: Empfehlung nicht als angenommen');
select t.throws($$insert into applications (partner_type, org_name, email, privacy_accepted_at, source, recommended_by, status) values ('club', 'X', 'x@y.de', now(), 'partner', t.uid('investor'), 'new')$$, 'Partner: nicht im Namen anderer');
select t.throws($$insert into applications (partner_type, org_name, email, privacy_accepted_at, status) values ('club', 'X', 'x@y.de', now(), 'new')$$, 'Partner: keine Bewerbung als Formular');
update applications set status = 'accepted';
select t.throws($$insert into projects (org_id, title, requested_by) values ('b0000000-0000-0000-0000-000000000015', 'Projekt Partner', auth.uid())$$, 'Partner: keine Projekte');
reset role;
select t.eq((select status from applications where org_name = 'SV Empfohlen'), 'new', 'Partner: kann den Status nicht ändern (ohne WHERE)');

-- ───────────────────────── Investor ─────────────────────────
select t.login('investor');
select t.ok((select count(*) from trends) > 0, 'Investor: sieht den Radar');
select t.eq((select array_agg(name) from startups), '{"Öffentlich AG"}'::text[], 'Investor: nur öffentliche Einträge');
select t.eq((select count(*)::int from startup_private), 0, 'Investor: nichts Vertrauliches');
select t.eq((select count(*)::int from applications), 0, 'Investor: keine Bewerbungen');
select t.throws($$insert into projects (org_id, title, requested_by) values ('c0000000-0000-0000-0000-000000000015', 'Projekt Investor', auth.uid())$$, 'Investor: keine Projekte');
select t.throws($$insert into applications (partner_type, org_name, email, privacy_accepted_at, source, recommended_by, status) values ('club', 'X', 'x@y.de', now(), 'partner', auth.uid(), 'new')$$, 'Investor: keine Empfehlungen');
reset role;

-- ───────────────────────── Annehmen ─────────────────────────
select t.login('editor');
select t.eq((select count(*)::int from applications), 6, 'Redaktion: sieht alle Bewerbungen');
select t.eq((select count(*)::int from storage.objects where bucket_id = 'applications'), 1, 'Redaktion: liest Pitchdecks');
select t.throws($$select accept_application('a1000000-0000-0000-0000-000000000005')$$, 'Unbestätigte Bewerbung lässt sich nicht annehmen', 'bereits entschieden');
create temp table r on commit drop as select
  accept_application('a1000000-0000-0000-0000-000000000001') as sp,
  accept_application('a1000000-0000-0000-0000-000000000002') as club,
  accept_application('a1000000-0000-0000-0000-000000000003', p_invite => false) as multi,
  accept_application('a1000000-0000-0000-0000-000000000004') as dup;
select t.throws($$select accept_application('a1000000-0000-0000-0000-000000000001')$$, 'Zweimal annehmen geht nicht', 'bereits entschieden');
reset role;

-- Solution Provider: Eintrag mit Angebot und Kategorie, Provider-Org mit Verknüpfung, Einladung als Owner
select t.eq((select s.partner_types from startups s, r where s.id = (r.sp->>'member_id')::uuid), '{solution_provider}'::text[], 'SP: Eintrag als Solution Provider');
select t.eq((select s.domain from startups s, r where s.id = (r.sp->>'member_id')::uuid), 'tapflow.example', 'SP: Domain normalisiert');
select t.eq((select s.is_startup from startups s, r where s.id = (r.sp->>'member_id')::uuid), true, 'SP: vor 2 Jahren gegründet → Startup');
select t.eq((select s.source from startups s, r where s.id = (r.sp->>'member_id')::uuid), 'application', 'SP: Quelle Bewerbung');
select t.eq((select count(*)::int from member_offers o join member_offer_categories c on c.offer_id = o.id, r where o.member_id = (r.sp->>'member_id')::uuid), 1, 'SP: Angebot mit Kategorie');
select t.eq((select p.contact_email from startup_private p, r where p.startup_id = (r.sp->>'member_id')::uuid), 'gruender@tapflow.example', 'SP: Kontakt vertraulich übernommen');
select t.eq((select p.pitch_deck_path from startup_private p, r where p.startup_id = (r.sp->>'member_id')::uuid), 'a1/deck.pdf', 'SP: Pitchdeck übernommen');
select t.eq((select o.kind from organizations o, r where o.id = (r.sp->>'org_id')::uuid), 'provider', 'SP: Organisation mit Zugangsart Solution Provider');
select t.eq((select o.network_member_id from organizations o, r where o.id = (r.sp->>'org_id')::uuid), (select (r.sp->>'member_id')::uuid from r), 'SP: Organisation mit dem Eintrag verknüpft');
select t.eq((select i.role from invitations i, r where i.token = r.sp->>'token'), 'owner', 'SP: Ansprechperson als Owner eingeladen');
select t.eq((select status from applications where id = 'a1000000-0000-0000-0000-000000000001'), 'accepted', 'SP: Bewerbung angenommen');
-- Verein: Kunde mit Basic, 5 Plätzen, 12 Monaten und Beziehung „Kunde“
select t.eq((select o.kind || '/' || o.tier || '/' || o.seats from organizations o, r where o.id = (r.club->>'org_id')::uuid), 'customer/basic/5', 'Verein: Kunde Basic mit 5 Plätzen');
select t.eq((select o.access_until from organizations o, r where o.id = (r.club->>'org_id')::uuid), (current_date + interval '12 months')::date, 'Verein: Laufzeit 12 Monate');
select t.eq((select m.org_id from member_internal m, r where m.member_id = (r.club->>'member_id')::uuid), (select (r.club->>'org_id')::uuid from r), 'Verein: Beziehung „Kunde“ gesetzt');
select t.eq((select s.partner_types from startups s, r where s.id = (r.club->>'member_id')::uuid), '{club}'::text[], 'Verein: Eintrag als Verein');
-- Multiplikator: Partner-Zugang, unbefristet, ohne Einladung
select t.eq((select o.kind || '/' || coalesce(o.access_until::text, 'unbefristet') from organizations o, r where o.id = (r.multi->>'org_id')::uuid), 'partner/unbefristet', 'Multiplikator: Partner-Zugang');
select t.eq((select r.multi->>'token' from r), null, 'Ohne Einladung kein Token');
select t.eq((select hold_until from applications where id = 'a1000000-0000-0000-0000-000000000003'), null, 'Wiedervorlage nach Annahme gelöscht');
-- Gleiche Domain: kein zweiter Eintrag
select t.eq((select (r.dup->>'member_id')::uuid from r), '5a000000-0000-0000-0000-000000000015'::uuid, 'Gleiche Domain: bestehender Eintrag verknüpft');
select t.eq((select count(*)::int from startups where domain = 'oeffentlich.example'), 1, 'Gleiche Domain: kein zweiter Eintrag');

-- ───────────────────────── Solution Provider eingeloggt ─────────────────────────
insert into t.users (name, id) select 'sp_member', (r.sp->>'member_id')::uuid from r;  -- ID des Eintrags für Tests ohne Sicht
insert into memberships (org_id, user_id, role) select (r.sp->>'org_id')::uuid, t.uid('provider'), 'owner' from r;
select t.login('provider');
select t.eq((select array_agg(name) from startups), '{TapFlow}'::text[], 'Provider: sieht nur das eigene Profil (nicht öffentlich, aber eigenes)');
select t.eq((select count(*)::int from startup_private), 1, 'Provider: sieht eigene vertrauliche Angaben');
select t.eq((select count(*)::int from member_offers), 1, 'Provider: sieht eigenes Angebot');
select t.eq((select count(*)::int from member_offer_categories), 1, 'Provider: sieht Kategorien des eigenen Angebots');
select t.eq((select count(*)::int from offer_categories), 1, 'Provider: Kategorien zur Anzeige');
select t.eq((select count(*)::int from trends), 0, 'Provider: kein Radar');
select t.eq((select count(*)::int from applications), 0, 'Provider: keine Bewerbungen');
insert into change_requests (member_id, requested_by, field, old_value, new_value, comment)
select id, auth.uid(), 'tagline', null, 'Selbstzapfen ohne Schlange.', 'Neuer Claim' from startups;
select t.eq((select count(*)::int from change_requests), 1, 'Provider: sieht eigene Änderungsanfrage');
select t.throws($$insert into change_requests (member_id, requested_by, field, new_value) values ('5b000000-0000-0000-0000-000000000015', auth.uid(), 'tagline', 'Fremd')$$, 'Provider: keine Anfrage für fremde Einträge');
select t.throws($$insert into change_requests (member_id, requested_by, field, new_value, status) select id, auth.uid(), 'name', 'X', 'accepted' from startups$$, 'Provider: Anfrage nicht als angenommen');
update change_requests set status = 'accepted';
update startups set tagline = 'Selbst geändert';
select t.throws($$insert into projects (org_id, title, requested_by) select org_id, 'Projekt Provider', auth.uid() from memberships where user_id = auth.uid()$$, 'Provider: keine Projekte');
reset role;
select t.eq((select status from change_requests), 'open', 'Provider: kann Anfrage nicht selbst entscheiden (ohne WHERE)');
select t.eq((select tagline from startups where name = 'TapFlow'), null, 'Provider: kann das Profil nicht selbst ändern (ohne WHERE)');

-- Anderer Provider ohne Verknüpfung, und abgelaufener Zugang
insert into organizations (id, name, kind, access_from) values ('d0000000-0000-0000-0000-000000000015', 'Anderer SP', 'provider', current_date - 10);
insert into memberships (org_id, user_id, role) values ('d0000000-0000-0000-0000-000000000015', t.uid('provider_alt'), 'owner');
select t.login('provider_alt');
select t.eq((select count(*)::int from startups), 0, 'Provider ohne Eintrag: sieht nichts');
select t.eq((select count(*)::int from change_requests), 0, 'Provider ohne Eintrag: keine fremden Anfragen');
reset role;
update organizations set access_until = current_date - 1 from r where id = (r.sp->>'org_id')::uuid;
select t.login('provider');
select t.eq((select count(*)::int from startups), 0, 'Provider abgelaufen: sieht nichts');
select t.throws($$insert into change_requests (member_id, requested_by, field, new_value) values (t.uid('sp_member'), auth.uid(), 'other', 'X')$$, 'Provider abgelaufen: keine Anfragen');
reset role;
select t.login('kunde');
select t.eq((select count(*)::int from change_requests), 0, 'Kunde: keine Änderungsanfragen');
select t.eq((select count(*)::int from storage.objects where bucket_id = 'applications'), 0, 'Kunde: keine Pitchdecks');
reset role;

-- ───────────────────────── Ergebnis ─────────────────────────
do $$
declare total int; bad int; names text;
begin
  select count(*), count(*) filter (where not ok), string_agg(name, E'\n  ' order by n) filter (where not ok)
    into total, bad, names from t.results;
  if bad > 0 then
    raise exception E'% von % Bewerbungs-Tests fehlgeschlagen:\n  %', bad, total, names;
  end if;
  raise notice '% Bewerbungs-Tests bestanden', total;
end $$;

rollback;
