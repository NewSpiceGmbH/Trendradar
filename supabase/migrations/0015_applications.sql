-- Bewerbungen und Eingang: öffentliches Bewerbungsformular (ohne Konto), Empfehlungen von Partnern, Änderungsanfragen
-- von Solution Providern; neue Zugangsarten für Organisationen (Partner, Investor, Solution Provider).
--
-- Zugangsart (organizations.kind):
--   customer  Kunde (bisher alle): Radar, Projekte, Merkliste, Notizen
--   partner   Multiplikator: Radar lesen, Kontakte empfehlen, keine Projekte
--   investor  Investor: Radar und öffentlich markierte Einträge der Netzwerk-Datenbank, keine Projekte
--   provider  Solution Provider: nur das eigene Profil lesen, Änderungen anfragen; kein Radar
--
-- Bewerbungen kommen ohne Login herein. Die Tabelle hat dafür keine öffentliche Regel: Das Formular schreibt
-- serverseitig (Secret-Key, mit Rate-Limit und Bestätigung der E-Mail-Adresse). Lesen und entscheiden darf nur die
-- Redaktion. Angenommen wird ausschließlich über accept_application().

-- ───────────────────────── Zugangsarten ─────────────────────────
alter table organizations
  add column kind              text not null default 'customer' check (kind in ('customer', 'partner', 'investor', 'provider')),
  add column network_member_id uuid unique references startups(id) on delete set null;   -- Eintrag in der Netzwerk-Datenbank

-- Radar und Netzwerk lesen: Redaktion oder aktive Organisation, die kein reiner Solution Provider ist
create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select is_editor() or exists (
    select 1 from memberships m join organizations o on o.id = m.org_id
    where m.user_id = auth.uid() and org_active(o) and o.kind <> 'provider');
$$;

create or replace function has_premium() returns boolean
language sql stable security definer set search_path = public as $$
  select is_editor() or exists (
    select 1 from memberships m join organizations o on o.id = m.org_id
    where m.user_id = auth.uid() and o.tier = 'premium' and org_active(o) and o.kind <> 'provider');
$$;

-- Aktive Mitgliedschaft in einer Organisation einer bestimmten Zugangsart
create function has_org_kind(p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join organizations o on o.id = m.org_id
    where m.user_id = auth.uid() and org_active(o) and o.kind = p_kind);
$$;

-- Eigener Eintrag eines Solution Providers (aktive Provider-Organisation mit diesem Eintrag)
create function is_own_member(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join organizations o on o.id = m.org_id
    where m.user_id = auth.uid() and org_active(o) and o.kind = 'provider' and o.network_member_id = p_member);
$$;

-- Projekte anfragen dürfen nur Kunden (nicht Partner, Investoren, Solution Provider)
drop policy projects_request on projects;
create policy projects_request on projects for insert with check (
  org_member_active(org_id) and status = 'requested' and requested_by = auth.uid()
  and outcome is null and challenge_id is null and lead_id is null and completed_at is null
  and exists (select 1 from organizations o where o.id = org_id and o.kind = 'customer'));

-- Solution Provider: eigenes Profil vollständig lesen (auch nicht freigegebene Referenzen und Vertrauliches,
-- das sie selbst geliefert haben), Angebotskategorien zur Anzeige
create policy startups_read_own          on startups                for select using (is_own_member(id));
create policy private_read_own           on startup_private         for select using (is_own_member(startup_id));
create policy member_offers_read_own     on member_offers           for select using (is_own_member(member_id));
create policy member_offer_cats_read_own on member_offer_categories for select using (
  exists (select 1 from member_offers o where o.id = offer_id and is_own_member(o.member_id)));
create policy member_references_read_own on member_references       for select using (is_own_member(member_id));
create policy offer_categories_read_provider on offer_categories    for select using (has_org_kind('provider'));

-- Vereine und etablierte Anbieter sind oft älter als 1990
alter table startups drop constraint startups_founded_check;
alter table startups add constraint startups_founded_check check (founded between 1800 and 2100);

-- Pitchdeck aus der Bewerbung (Pfad im privaten Bucket applications)
alter table startup_private add column pitch_deck_path text;

-- ───────────────────────── Bewerbungen ─────────────────────────
create table applications (
  id                  uuid primary key default gen_random_uuid(),
  partner_type        text not null check (partner_type in ('club', 'caterer', 'operator', 'multiplier', 'investor', 'solution_provider')),
  org_name            text not null check (length(trim(org_name)) between 1 and 200),
  contact_name        text check (length(contact_name) <= 200),
  contact_role        text check (length(contact_role) <= 200),
  email               text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 320),
  website             text check (website ~ '^https?://' and length(website) <= 500),
  founded             smallint check (founded between 1800 and 2100),
  details             jsonb not null default '{}',                -- Felder je Partner-Typ
  offer               text check (length(offer) <= 4000),         -- Angebot (Produkt/Leistung)
  offer_category_ids  uuid[] not null default '{}',
  maturity            text check (maturity in ('idea', 'prototype', 'pilot', 'market', 'scale')),
  references_text     text check (length(references_text) <= 4000),
  pitch_deck_path     text,
  message             text check (length(message) <= 4000),
  privacy_accepted_at timestamptz not null,
  source              text not null default 'form' check (source in ('form', 'partner')),
  recommended_by      uuid references auth.users(id) on delete set null,
  confirm_token       text unique default encode(gen_random_bytes(24), 'hex'),
  email_confirmed_at  timestamptz,
  status              text not null default 'unconfirmed' check (status in ('unconfirmed', 'new', 'on_hold', 'accepted', 'rejected')),
  hold_reason         text check (hold_reason in ('documents', 'internal', 'later')),
  hold_until          date,
  decision_note       text,                                       -- Begründung bzw. Text an den Bewerber
  decided_by          uuid references auth.users(id),
  decided_at          timestamptz,
  member_id           uuid references startups(id) on delete set null,
  org_id              uuid references organizations(id) on delete set null,
  precheck            jsonb,                                      -- Vorprüfung (markiert, entscheidet nicht)
  ip_hash             text,                                       -- für das Rate-Limit, ohne Klartext-IP
  created_at          timestamptz not null default now(),
  constraint applications_hold check (status <> 'on_hold' or (hold_reason is not null and hold_until is not null)),
  constraint applications_partner_source check ((source = 'partner') = (recommended_by is not null))
);
create index applications_inbox on applications (status, created_at desc);
create index applications_rate on applications (ip_hash, created_at desc);

alter table applications enable row level security;
create policy applications_editor on applications for all using (is_editor()) with check (is_editor());
-- Partner (Multiplikatoren) empfehlen Kontakte: landen direkt im Eingang, sie sehen ihre eigenen Empfehlungen
create policy applications_recommend on applications for insert with check (
  has_org_kind('partner') and source = 'partner' and recommended_by = auth.uid() and status = 'new'
  and decided_by is null and member_id is null and org_id is null and precheck is null);
create policy applications_read_own on applications for select using (recommended_by = auth.uid());

-- ───────────────────────── Änderungsanfragen ─────────────────────────
create table change_requests (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references startups(id) on delete cascade,
  requested_by  uuid not null references auth.users(id) on delete cascade,
  field         text not null check (field in ('name', 'website', 'tagline', 'solution', 'offer', 'reference', 'contact', 'other')),
  old_value     text check (length(old_value) <= 4000),
  new_value     text not null check (length(trim(new_value)) between 1 and 4000),
  comment       text check (length(comment) <= 2000),
  status        text not null default 'open' check (status in ('open', 'accepted', 'adjusted', 'rejected')),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now()
);
create index change_requests_open on change_requests (status, created_at desc);

alter table change_requests enable row level security;
create policy change_requests_editor on change_requests for all using (is_editor()) with check (is_editor());
create policy change_requests_insert_own on change_requests for insert with check (
  is_own_member(member_id) and requested_by = auth.uid() and status = 'open' and decided_by is null and decided_at is null);
create policy change_requests_read_own on change_requests for select using (is_own_member(member_id));

-- ───────────────────────── Pitchdecks ─────────────────────────
-- Privater Bucket, nur die Redaktion liest. Hochgeladen wird serverseitig aus dem Formular.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applications', 'applications', false, 15728640, array['application/pdf'])
on conflict (id) do nothing;
create policy application_files_editor on storage.objects for select using (bucket_id = 'applications' and is_editor());

-- ───────────────────────── Annehmen ─────────────────────────
-- Legt je nach Partner-Typ an (Werte änderbar über die Parameter):
--   Verein, Betreiber, Caterer → Organisation „Kunde“ (Basic, 5 Plätze, 12 Monate) + Eintrag
--   Multiplikator              → Organisation „Partner“ + Eintrag
--   Investor                   → Organisation „Investor“ + Eintrag
--   Solution Provider          → Organisation „Solution Provider“ (eigenes Profil lesen) + Eintrag
-- Gibt es schon einen Eintrag mit derselben Domain, wird er verknüpft statt doppelt angelegt.
-- Die Ansprechperson wird als Owner eingeladen (p_invite). Rückgabe: Eintrag, Organisation, Einladungs-Token.
create function accept_application(
  p_id uuid,
  p_org_name text default null,
  p_tier text default 'basic',
  p_seats int default null,
  p_months int default null,
  p_invite boolean default true
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  a applications;
  v_kind text;
  v_domain text;
  v_member uuid;
  v_org uuid;
  v_offer uuid;
  v_token text;
  v_months int;
begin
  perform require_editor();
  select * into a from applications where id = p_id for update;
  if not found then raise exception 'Bewerbung nicht gefunden.' using errcode = 'P0002'; end if;
  if a.status not in ('new', 'on_hold') then
    raise exception 'Über diese Bewerbung ist bereits entschieden.' using errcode = '22023';
  end if;

  v_kind := case a.partner_type when 'multiplier' then 'partner' when 'investor' then 'investor'
                                when 'solution_provider' then 'provider' else 'customer' end;
  v_months := coalesce(p_months, case when v_kind = 'customer' then 12 else null end);
  v_domain := nullif(lower(regexp_replace(coalesce(a.website, ''), '^https?://(www\.)?([^/:?#]+).*$', '\2')), '');

  if v_domain is not null then select id into v_member from startups where domain = v_domain; end if;
  if v_member is null then
    insert into startups (name, website, domain, founded, stage, solution, reference_customers, status, source, partner_types,
                          is_startup, details, created_by)
    values (trim(a.org_name), a.website, v_domain, a.founded, a.maturity, a.offer, a.references_text, 'qualified', 'application',
            array[a.partner_type], a.partner_type = 'solution_provider' and a.founded > extract(year from current_date)::int - 5,
            a.details, auth.uid())
    returning id into v_member;
    insert into startup_private (startup_id, contact_name, contact_role, contact_email, pitch_deck_path)
    values (v_member, a.contact_name, a.contact_role, a.email, a.pitch_deck_path);
    if coalesce(trim(a.offer), '') <> '' then
      insert into member_offers (member_id, title, description) values (v_member, left(trim(a.offer), 120), trim(a.offer))
      returning id into v_offer;
      insert into member_offer_categories (offer_id, category_id)
      select v_offer, c.id from offer_categories c where c.id = any (a.offer_category_ids);
    end if;
  else
    update startups set status = 'qualified',
      partner_types = array(select distinct x from unnest(partner_types || array[a.partner_type]) x)
    where id = v_member;
  end if;

  select id into v_org from organizations where network_member_id = v_member;
  if v_org is null then
    insert into organizations (name, tier, seats, access_from, access_until, kind, network_member_id)
    values (coalesce(nullif(trim(p_org_name), ''), trim(a.org_name)), coalesce(p_tier, 'basic')::org_tier,
            coalesce(p_seats, case when v_kind = 'customer' then 5 else 3 end), current_date,
            case when v_months is null then null else (current_date + make_interval(months => v_months))::date end, v_kind, v_member)
    returning id into v_org;
  end if;
  if v_kind = 'customer' then
    insert into member_internal (member_id, org_id) values (v_member, v_org)
    on conflict (member_id) do update set org_id = excluded.org_id;
  end if;

  if p_invite and not exists (
    select 1 from invitations where org_id = v_org and lower(email) = lower(a.email) and accepted_at is null) then
    insert into invitations (org_id, email, role, invited_by) values (v_org, lower(a.email), 'owner', auth.uid())
    returning token into v_token;
  end if;

  update applications set status = 'accepted', member_id = v_member, org_id = v_org, decided_by = auth.uid(), decided_at = now(),
    hold_reason = null, hold_until = null
  where id = p_id;
  return jsonb_build_object('member_id', v_member, 'org_id', v_org, 'token', v_token, 'kind', v_kind);
end $$;
