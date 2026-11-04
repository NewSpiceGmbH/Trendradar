-- Zugriffsregeln je Rolle: Redaktion (Admin/Editor), Owner, Member, Premium, abgelaufene Org,
-- künftige Org, fremde Org, ohne Mitgliedschaft, anonym. Läuft in einer Transaktion und wird
-- zurückgerollt. Ausführen: npm run test:db (siehe scripts/test-db.mjs).
begin;

-- ───────────────────────── Test-Helfer ─────────────────────────
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

-- führt SQL als aktuelle Rolle aus und prüft die Zahl betroffener Zeilen
create function t.rows(sql text, expected int, name text) returns void
language plpgsql as $$
declare n int;
begin
  execute sql; get diagnostics n = row_count;
  perform t.eq(n, expected, name);
exception when others then
  perform t.ok(false, name || ' – Fehler: ' || sqlerrm);
end $$;

-- erwartet, dass SQL mit einem Fehler abbricht (RLS-Verstoß, Trigger, Funktionsfehler)
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
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function t.anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

create function t.uid(who text) returns uuid language sql stable as $$ select id from t.users where name = who $$;

-- ───────────────────────── Testdaten ─────────────────────────
insert into t.users (name, id)
select n, gen_random_uuid() from unnest(array[
  'admin', 'editor', 'owner_a', 'member_a', 'owner_b', 'member_p', 'owner_x', 'member_x',
  'member_f', 'dual', 'nobody', 'newbie']) n;
insert into auth.users (id, email) select id, name || '@test.local' from t.users;

update profiles set platform_role = 'admin'  where id = t.uid('admin');
update profiles set platform_role = 'editor' where id = t.uid('editor');

insert into organizations (id, name, tier, seats, access_from, access_until) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Kunde A (Basic)',      'basic',   3, current_date - 30, current_date + 30),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Kunde B (Basic)',      'basic',   5, current_date - 30, null),
  ('cccccccc-0000-0000-0000-000000000000', 'Kunde P (Premium)',    'premium', 5, current_date - 30, null),
  ('dddddddd-0000-0000-0000-000000000000', 'Kunde X (abgelaufen)', 'premium', 5, current_date - 100, current_date - 1),
  ('eeeeeeee-0000-0000-0000-000000000000', 'Kunde F (künftig)',    'basic',   5, current_date + 10, null);

insert into memberships (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', t.uid('owner_a'),  'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000000', t.uid('member_a'), 'member'),
  ('bbbbbbbb-0000-0000-0000-000000000000', t.uid('owner_b'),  'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000000', t.uid('dual'),     'member'),
  ('cccccccc-0000-0000-0000-000000000000', t.uid('member_p'), 'member'),
  ('dddddddd-0000-0000-0000-000000000000', t.uid('owner_x'),  'owner'),
  ('dddddddd-0000-0000-0000-000000000000', t.uid('member_x'), 'member'),
  ('dddddddd-0000-0000-0000-000000000000', t.uid('dual'),     'member'),
  ('eeeeeeee-0000-0000-0000-000000000000', t.uid('member_f'), 'member');

insert into trends (number, name, cluster_code, focus_code, origin, description, evidence, status)
values (999, 'Entwurf', 'A', 'FAN', 'EU', 'Noch nicht veröffentlicht', 'C', 'draft');
insert into trend_premium (trend_id, recommendation) select id, 'Jetzt pilotieren' from trends where number = 1;
insert into cases (client, title, status) values ('Testkunde', 'Testprojekt', 'published');
insert into proposals (kind, payload, rationale) values ('new_trend', '{}', 'Test');
insert into usage_events (user_id, org_id, event) values (t.uid('member_a'), 'aaaaaaaa-0000-0000-0000-000000000000', 'login');
insert into org_trend_notes (org_id, trend_id, author_id, body) values
  ('aaaaaaaa-0000-0000-0000-000000000000', (select id from trends where number = 1), t.uid('member_a'), 'vertraulich A'),
  ('dddddddd-0000-0000-0000-000000000000', (select id from trends where number = 1), t.uid('member_x'), 'vertraulich X');

-- ───────────────────────── Anonym & ohne Mitgliedschaft ─────────────────────────
select t.anon();
select t.eq((select count(*)::int from trends), 0, 'anon: keine Trends');
select t.eq((select count(*)::int from trend_positions), 0, 'anon: keine Positionen');
select t.eq((select count(*)::int from sources), 0, 'anon: keine Quellen');
select t.eq((select count(*)::int from organizations), 0, 'anon: keine Organisationen');
reset role;

select t.login('nobody');
select t.eq((select count(*)::int from trends), 0, 'ohne Org: keine Trends');
select t.eq((select count(*)::int from insights), 0, 'ohne Org: keine Erkenntnisse');
select t.eq((select count(*)::int from organizations), 0, 'ohne Org: keine Organisationen');
select t.throws($$insert into bookmarks (user_id, trend_id) values (auth.uid(), (select 1))$$, 'ohne Org: keine Merkliste');
reset role;

-- ───────────────────────── Member (Basic, aktiv) ─────────────────────────
select t.login('member_a');
select t.eq((select count(*)::int from trends), 44, 'Member: sieht 44 veröffentlichte Trends, keinen Entwurf');
select t.eq((select count(*)::int from trend_positions), 88, 'Member: 88 Positionen (GLOBAL + EU)');
select t.eq((select count(*)::int from trend_scores where perspective = 'GLOBAL'), 264, 'Member: alle GLOBAL-Scores');
select t.ok((select count(*) from sources) = 85, 'Member: alle 85 Quellen');
select t.ok((select count(*) from insights) > 0, 'Member: Erkenntnisse sichtbar');
select t.eq((select count(*)::int from trend_premium), 0, 'Member Basic: keine Premium-Inhalte');
select t.eq((select count(*)::int from cases), 0, 'Member Basic: keine Cases');
select t.eq((select count(*)::int from proposals), 0, 'Member: keine Proposals');
select t.eq((select count(*)::int from signals), 0, 'Member: keine Signale');
select t.eq((select count(*)::int from agent_runs), 0, 'Member: keine Agenten-Läufe');
select t.eq((select count(*)::int from trend_versions), 0, 'Member: keine Versionshistorie');
select t.eq((select count(*)::int from usage_events), 0, 'Member: Nutzungsprotokoll nicht lesbar');
select t.eq((select count(*)::int from organizations), 1, 'Member: sieht nur die eigene Org');
select t.eq((select count(*)::int from memberships), 2, 'Member: sieht die Kolleg:innen der eigenen Org');
select t.eq((select count(*)::int from profiles), 2, 'Member: sieht Profile der eigenen Org');
select t.eq((select count(*)::int from invitations), 0, 'Member: sieht keine Einladungen');
select t.eq((select count(*)::int from org_trend_notes), 1, 'Member: sieht Notizen der eigenen Org');

select t.rows($$update trends set name = 'gehackt' where number = 1$$, 0, 'Member: kann Trends nicht ändern');
select t.rows($$delete from sources$$, 0, 'Member: kann Quellen nicht löschen');
select t.throws($$insert into trend_premium (trend_id, recommendation) values ((select id from trends where number = 2), 'x')$$, 'Member: kann keine Premium-Inhalte anlegen');
select t.throws($$insert into proposals (kind, payload, rationale) values ('new_trend', '{}', 'x')$$, 'Member: kann keine Proposals anlegen');
select t.rows($$update organizations set tier = 'premium', seats = 99$$, 0, 'Member: kann Tier und Sitzplätze nicht ändern');

select t.rows($$insert into bookmarks (user_id, trend_id) values (auth.uid(), (select id from trends where number = 1))$$, 1, 'Member: eigene Merkliste');
select t.throws($$insert into bookmarks (user_id, trend_id) values ('$$ || t.uid('owner_a') || $$', (select id from trends where number = 1))$$, 'Member: keine Merkliste für andere');

select t.rows($$insert into org_trend_notes (org_id, trend_id, author_id, body) values ('aaaaaaaa-0000-0000-0000-000000000000', (select id from trends where number = 2), auth.uid(), 'meine Notiz')$$, 1, 'Member: Notiz in eigener Org');
select t.throws($$insert into org_trend_notes (org_id, trend_id, author_id, body) values ('bbbbbbbb-0000-0000-0000-000000000000', (select id from trends where number = 2), auth.uid(), 'Spam')$$, 'Member: keine Notiz in fremder Org');
select t.throws($$insert into org_trend_notes (org_id, trend_id, author_id, body) values ('aaaaaaaa-0000-0000-0000-000000000000', (select id from trends where number = 2), '$$ || t.uid('owner_a') || $$', 'untergeschoben')$$, 'Member: keine Notiz im Namen anderer');
select t.rows($$update org_trend_notes set body = 'geändert' where body = 'vertraulich A'$$, 1, 'Member: eigene Notiz ändern');
-- Lücke aus 0002: Notiz per UPDATE in fremde Org verschieben
-- ohne WHERE: so umgeht man die SELECT-Prüfung der neuen Zeile, die bei WHERE greift
select t.throws($$update org_trend_notes set org_id = 'bbbbbbbb-0000-0000-0000-000000000000'$$, 'Member: Notiz nicht in fremde Org verschiebbar');
select t.throws($$update org_trend_notes set trend_id = (select id from trends where number = 3)$$, 'Member: Notiz nicht auf anderen Trend umhängbar');

select t.throws($$insert into invitations (org_id, email) values ('aaaaaaaa-0000-0000-0000-000000000000', 'kollege@test.local')$$, 'Member: darf nicht einladen');
select t.rows($$delete from memberships where user_id = '$$ || t.uid('owner_a') || $$'$$, 0, 'Member: darf niemanden entfernen');

select t.rows($$update profiles set display_name = 'Anna A.' where id = auth.uid()$$, 1, 'Member: eigenen Anzeigenamen ändern');
select t.throws($$update profiles set platform_role = 'admin' where id = auth.uid()$$, 'Member: kann sich nicht zum Admin machen', 'Plattformrolle');
select t.rows($$update profiles set display_name = 'x' where id = '$$ || t.uid('owner_a') || $$'$$, 0, 'Member: fremdes Profil nicht änderbar');

select t.rows($$insert into usage_events (user_id, org_id, event) values (auth.uid(), 'aaaaaaaa-0000-0000-0000-000000000000', 'view_radar')$$, 1, 'Member: Nutzung der eigenen Org protokollieren');
select t.throws($$insert into usage_events (user_id, org_id, event) values (auth.uid(), 'bbbbbbbb-0000-0000-0000-000000000000', 'view_radar')$$, 'Member: keine Nutzung für fremde Org');
select t.throws($$insert into usage_events (user_id, org_id, event) values ('$$ || t.uid('owner_a') || $$', 'aaaaaaaa-0000-0000-0000-000000000000', 'login')$$, 'Member: keine Nutzung im Namen anderer');
reset role;

-- ───────────────────────── Premium ─────────────────────────
select t.login('member_p');
select t.eq((select count(*)::int from trend_premium), 1, 'Premium: sieht Handlungsempfehlungen');
select t.eq((select count(*)::int from cases), 1, 'Premium: sieht veröffentlichte Cases');
select t.eq((select count(*)::int from org_trend_notes), 0, 'Premium: sieht keine Notizen anderer Orgs');
reset role;

-- ───────────────────────── Fremde Org ─────────────────────────
select t.login('owner_b');
select t.eq((select count(*)::int from org_trend_notes), 0, 'Fremde Org: sieht Notizen von A nicht');
select t.eq((select count(*)::int from organizations), 1, 'Fremde Org: sieht nur sich selbst');
select t.ok(not exists (select 1 from memberships where org_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 'Fremde Org: sieht Mitglieder von A nicht');
select t.ok(not exists (select 1 from profiles where id = t.uid('member_a')), 'Fremde Org: sieht Profile von A nicht');
select t.eq((select count(*)::int from bookmarks), 0, 'Fremde Org: sieht Merklisten anderer nicht');
select t.rows($$update org_trend_notes set body = 'x'$$, 0, 'Fremde Org: kann Notizen von A nicht ändern');
select t.rows($$delete from org_trend_notes$$, 0, 'Fremde Org: kann Notizen von A nicht löschen');
select t.throws($$insert into invitations (org_id, email) values ('aaaaaaaa-0000-0000-0000-000000000000', 'x@test.local')$$, 'Fremde Org: kann nicht in A einladen');
select t.rows($$delete from memberships where org_id = 'aaaaaaaa-0000-0000-0000-000000000000'$$, 0, 'Fremde Org: kann niemanden aus A entfernen');
reset role;

-- ───────────────────────── Owner ─────────────────────────
select t.login('owner_a');
select t.eq((select count(*)::int from org_trend_notes), 2, 'Owner: sieht alle Notizen der eigenen Org');
select t.rows($$update org_trend_notes set priority = 1 where body = 'meine Notiz'$$, 1, 'Owner: kann Notizen der eigenen Org pflegen');
select t.rows($$insert into invitations (org_id, email, expires_at) values ('aaaaaaaa-0000-0000-0000-000000000000', 'neu@test.local', now() + interval '1 year')$$, 1, 'Owner: kann einladen (Sitz 3 von 3)');
select t.ok((select expires_at <= now() + interval '30 days' from invitations where email = 'neu@test.local'), 'Owner: Einladungslaufzeit auf 30 Tage begrenzt');
select t.ok((select invited_by = auth.uid() from invitations where email = 'neu@test.local'), 'Owner: invited_by wird gesetzt');
select t.throws($$insert into invitations (org_id, email) values ('aaaaaaaa-0000-0000-0000-000000000000', 'zuviel@test.local')$$, 'Owner: keine Einladung über die Sitzplätze hinaus');
select t.throws($$insert into invitations (org_id, email) values ('bbbbbbbb-0000-0000-0000-000000000000', 'x@test.local')$$, 'Owner: keine Einladung in fremde Org');
select t.eq((select count(*)::int from invitations), 1, 'Owner: sieht Einladungen der eigenen Org');
select t.rows($$delete from invitations where email = 'neu@test.local'$$, 1, 'Owner: kann Einladung zurückziehen');
select t.rows($$delete from memberships where user_id = auth.uid()$$, 0, 'Owner: kann sich nicht selbst entfernen');
select t.rows($$delete from memberships where user_id = '$$ || t.uid('member_a') || $$'$$, 1, 'Owner: kann Member entfernen');
select t.rows($$update organizations set seats = 99, access_until = null$$, 0, 'Owner: kann Laufzeit und Sitzplätze nicht ändern');
select t.rows($$update memberships set role = 'owner'$$, 0, 'Owner: kann Rollen nicht direkt ändern');
reset role;

select t.login('member_a');
select t.eq((select count(*)::int from trends), 0, 'Entferntes Mitglied: sieht nichts mehr');
reset role;

-- ───────────────────────── Abgelaufene & künftige Org ─────────────────────────
select t.login('member_x');
select t.eq((select count(*)::int from trends), 0, 'Abgelaufen: keine Trends');
select t.eq((select count(*)::int from trend_premium), 0, 'Abgelaufen: keine Premium-Inhalte');
select t.eq((select count(*)::int from org_trend_notes), 0, 'Abgelaufen: keine Notizen');
select t.eq((select count(*)::int from organizations), 1, 'Abgelaufen: sieht die eigene Org (für den Hinweis in der UI)');
select t.throws($$insert into bookmarks (user_id, trend_id) values (auth.uid(), (select 1))$$, 'Abgelaufen: keine Merkliste');
select t.rows($$update org_trend_notes set body = 'x'$$, 0, 'Abgelaufen: Notizen nicht änderbar');
reset role;

select t.login('owner_x');
select t.throws($$insert into invitations (org_id, email) values ('dddddddd-0000-0000-0000-000000000000', 'x@test.local')$$, 'Abgelaufen: Owner kann nicht mehr einladen');
select t.rows($$delete from memberships where user_id = '$$ || t.uid('member_x') || $$'$$, 0, 'Abgelaufen: Owner kann niemanden mehr entfernen');
reset role;

select t.login('dual');
select t.eq((select count(*)::int from trends), 44, 'Aktiv + abgelaufen: Radar über die aktive Org');
select t.eq((select count(*)::int from trend_premium), 0, 'Aktiv (Basic) + abgelaufen (Premium): kein Premium');
select t.eq((select count(*)::int from org_trend_notes), 0, 'Aktiv + abgelaufen: keine Notizen der abgelaufenen Org');
select t.throws($$insert into org_trend_notes (org_id, trend_id, author_id, body) values ('dddddddd-0000-0000-0000-000000000000', (select id from trends where number = 2), auth.uid(), 'x')$$, 'Aktiv + abgelaufen: keine Notiz in der abgelaufenen Org');
reset role;

select t.login('member_f');
select t.eq((select count(*)::int from trends), 0, 'Künftige Org: noch keine Trends');
reset role;

-- ───────────────────────── Redaktion ─────────────────────────
select t.login('editor');
select t.eq((select count(*)::int from trends), 45, 'Editor: sieht auch Entwürfe');
select t.eq((select count(*)::int from trend_premium), 1, 'Editor: sieht Premium-Inhalte');
select t.eq((select count(*)::int from proposals), 1, 'Editor: sieht Proposals');
select t.ok((select count(*) from usage_events) >= 1, 'Editor: sieht Nutzungsprotokoll');
select t.eq((select count(*)::int from organizations), 5, 'Editor: sieht alle Organisationen');
select t.eq((select count(*)::int from org_trend_notes), 0, 'Editor: sieht KEINE Kundennotizen (Vertraulichkeit)');
select t.rows($$update trends set name = name where number = 1$$, 1, 'Editor: kann Trends bearbeiten');
select t.rows($$insert into organizations (name) values ('Neukunde')$$, 1, 'Editor: kann Organisationen anlegen');
select t.rows($$insert into invitations (org_id, email, role) values ('bbbbbbbb-0000-0000-0000-000000000000', 'chef@test.local', 'owner')$$, 1, 'Editor: kann Owner einladen');
-- Lücke aus 0001: Editor macht sich selbst zum Admin bzw. ändert fremde Rollen
select t.throws($$update profiles set platform_role = 'admin' where id = auth.uid()$$, 'Editor: kann sich nicht zum Admin machen', 'Plattformrolle');
select t.rows($$update profiles set platform_role = 'editor' where id = '$$ || t.uid('nobody') || $$'$$, 0, 'Editor: kann keine Rollen vergeben');
reset role;

select t.login('admin');
select t.rows($$update profiles set platform_role = 'editor' where id = '$$ || t.uid('nobody') || $$'$$, 1, 'Admin: kann Rollen vergeben');
select t.eq((select count(*)::int from org_trend_notes), 0, 'Admin: sieht KEINE Kundennotizen (Vertraulichkeit)');
select t.throws($$update profiles set created_at = now() - interval '1 year' where id = auth.uid()$$, 'Admin: created_at unveränderlich');
reset role;

-- ───────────────────────── Einladung annehmen ─────────────────────────
insert into invitations (org_id, email, token) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'newbie@test.local', 'token-richtig'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'jemand-anders@test.local', 'token-fremd');
insert into invitations (org_id, email, token, expires_at) values
  ('bbbbbbbb-0000-0000-0000-000000000000', 'newbie@test.local', 'token-abgelaufen', now() - interval '1 day');

select t.login('newbie');
select t.eq((select count(*)::int from trends), 0, 'Eingeladen, noch nicht angenommen: sieht nichts');
select t.throws($$select accept_invitation('gibt-es-nicht')$$, 'Annehmen: unbekannter Token', 'invitation_invalid');
select t.throws($$select accept_invitation('token-fremd')$$, 'Annehmen: Einladung für andere E-Mail', 'invitation_email_mismatch');
select t.throws($$select accept_invitation('token-abgelaufen')$$, 'Annehmen: abgelaufene Einladung', 'invitation_invalid');
select t.eq(accept_invitation('token-richtig'), 'aaaaaaaa-0000-0000-0000-000000000000'::uuid, 'Annehmen: richtige Einladung');
select t.eq((select count(*)::int from trends), 44, 'Angenommen: sieht den Radar');
select t.throws($$select accept_invitation('token-richtig')$$, 'Annehmen: Einladung nur einmal nutzbar', 'invitation_invalid');
reset role;

-- ───────────────────────── Ergebnis ─────────────────────────
do $$
declare total int; bad int; names text;
begin
  select count(*), count(*) filter (where not ok), string_agg(name, E'\n  ' order by n) filter (where not ok)
    into total, bad, names from t.results;
  if bad > 0 then
    raise exception E'% von % RLS-Tests fehlgeschlagen:\n  %', bad, total, names;
  end if;
  raise notice '% RLS-Tests bestanden', total;
end $$;

rollback;
