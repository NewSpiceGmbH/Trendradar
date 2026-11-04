-- Demo-Zugänge (Migration 0005) sehen genau das, was die Demo-Buttons versprechen.
-- Fehlen die Konten (z. B. nach ihrer Entfernung vor dem Livegang), wird der Test übersprungen.
begin;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create temp table r (ok boolean, name text);
grant insert on r to authenticated;

do $$ begin
  if not exists (select 1 from auth.users where email = 'member@kunde-a.demo') then
    raise notice 'Demo-Zugänge nicht eingespielt – übersprungen';
  end if;
end $$;

select pg_temp.as_user('d0000000-0000-0000-0000-000000000001');
insert into r select (select count(*) from trends) >= 44 and (select count(*) from organizations) >= 3, 'Redaktion: alle Trends und Orgs';
reset role;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000003');
insert into r select (select count(*) from trends) = 44 and (select count(*) from trend_premium) = 0 and has_premium() = false, 'Kunde A Member: Radar ohne Premium';
reset role;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000002');
insert into r select is_org_owner('da000000-0000-0000-0000-00000000000a'), 'Kunde A Owner: ist Owner';
reset role;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000004');
insert into r select (select count(*) from trends) = 44 and has_premium(), 'Kunde P: Premium';
reset role;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000005');
insert into r select (select count(*) from trends) = 0 and (select count(*) from organizations) = 1, 'Kunde X: abgelaufen, sieht nur die eigene Org';
reset role;

do $$
declare bad text;
begin
  if not exists (select 1 from auth.users where email = 'member@kunde-a.demo') then return; end if;
  select string_agg(name, ', ') into bad from r where not ok;
  if bad is not null then raise exception 'Demo-Zugänge fehlerhaft: %', bad; end if;
  raise notice '% Demo-Prüfungen bestanden', (select count(*) from r);
end $$;
rollback;
