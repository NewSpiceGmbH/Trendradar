-- Externer Betrieb: Kunden-Organisationen verwalten ihre Nutzer selbst,
-- Zugänge sind befristet und auf Sitzplätze begrenzt.
-- Annahme: Vertrieb durch New Spice, Kunden werden eingeladen (keine offene Selbstregistrierung).

-- ───────────────────────── Organisationen erweitern ─────────────────────────
alter table organizations
  add column slug         text unique,
  add column seats        int not null default 5 check (seats > 0),
  add column access_from  date not null default current_date,
  add column access_until date,                       -- null = unbefristet
  add column is_internal  boolean not null default false;  -- New Spice selbst

-- Hat die Organisation gerade einen gültigen Zugang?
create function org_active(o organizations) returns boolean
language sql stable as $$
  select current_date >= o.access_from and (o.access_until is null or current_date <= o.access_until);
$$;

create function is_org_member(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = target and user_id = auth.uid());
$$;

create function is_org_owner(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = target and user_id = auth.uid() and role = 'owner');
$$;

-- Bestehende Zugriffsfunktionen: abgelaufene Zugänge sehen nichts mehr
create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select is_editor() or exists (
    select 1 from memberships m join organizations o on o.id = m.org_id
    where m.user_id = auth.uid() and org_active(o));
$$;

create or replace function has_premium() returns boolean
language sql stable security definer set search_path = public as $$
  select is_editor() or exists (
    select 1 from memberships m join organizations o on o.id = m.org_id
    where m.user_id = auth.uid() and o.tier = 'premium' and org_active(o));
$$;

-- ───────────────────────── Mitglieder ─────────────────────────
-- Mitglieder sehen ihre Kolleg:innen, Owner verwalten sie
drop policy members_read on memberships;
create policy members_read on memberships for select
  using (user_id = auth.uid() or is_org_member(org_id) or is_editor());
create policy members_owner_delete on memberships for delete
  using (is_org_owner(org_id) and user_id <> auth.uid());

-- Namen der Kolleg:innen anzeigen dürfen
create policy profiles_same_org on profiles for select using (
  exists (select 1 from memberships a join memberships b on a.org_id = b.org_id
          where a.user_id = auth.uid() and b.user_id = profiles.id));

-- ───────────────────────── Einladungen ─────────────────────────
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  role        text not null default 'member' check (role in ('owner', 'member')),
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by  uuid references auth.users(id),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index invitations_open_once on invitations (org_id, lower(email)) where accepted_at is null;
alter table invitations enable row level security;

create policy invitations_read on invitations for select using (is_org_owner(org_id) or is_editor());
create policy invitations_delete on invitations for delete using (is_org_owner(org_id) or is_editor());
-- Einladen nur, solange Sitzplätze frei sind (Mitglieder + offene Einladungen)
create policy invitations_insert on invitations for insert with check (
  (is_org_owner(org_id) or is_editor())
  and (select count(*) from memberships m where m.org_id = invitations.org_id)
    + (select count(*) from invitations i where i.org_id = invitations.org_id
         and i.accepted_at is null and i.expires_at > now())
    < (select seats from organizations o where o.id = invitations.org_id)
);

-- Einladung annehmen: nur mit passender E-Mail-Adresse, nur einmal, nur gültig
create function accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invitations; user_email text;
begin
  select email into user_email from auth.users where id = auth.uid();
  if user_email is null then raise exception 'not_authenticated'; end if;

  select * into inv from invitations where token = p_token for update;
  if inv.id is null or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'invitation_invalid';
  end if;
  if lower(inv.email) <> lower(user_email) then raise exception 'invitation_email_mismatch'; end if;

  insert into memberships (org_id, user_id, role) values (inv.org_id, auth.uid(), inv.role)
    on conflict (org_id, user_id) do nothing;
  update invitations set accepted_at = now() where id = inv.id;
  return inv.org_id;
end; $$;

-- ───────────────────────── Kundenfunktionen ─────────────────────────
-- Persönliche Merkliste
create table bookmarks (
  user_id    uuid references auth.users(id) on delete cascade,
  trend_id   int references trends(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, trend_id)
);
alter table bookmarks enable row level security;
create policy bookmarks_own on bookmarks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member());

-- Notizen und eigene Priorisierung je Trend – nur innerhalb der eigenen Organisation sichtbar,
-- auch nicht für die New-Spice-Redaktion (Vertraulichkeit gegenüber Kunden)
create table org_trend_notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  trend_id   int not null references trends(id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null,
  body       text,
  priority   smallint check (priority between 1 and 3),   -- eigene Einschätzung des Kunden
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger org_trend_notes_touch before update on org_trend_notes
  for each row execute function touch_updated_at();
alter table org_trend_notes enable row level security;
create policy notes_read on org_trend_notes for select using (is_org_member(org_id) and is_member());
create policy notes_insert on org_trend_notes for insert
  with check (is_org_member(org_id) and is_member() and author_id = auth.uid());
create policy notes_modify on org_trend_notes for update
  using (author_id = auth.uid() or is_org_owner(org_id));
create policy notes_delete on org_trend_notes for delete
  using (author_id = auth.uid() or is_org_owner(org_id));

-- ───────────────────────── Nutzungsprotokoll ─────────────────────────
-- Für Kundenerfolg und Abrechnung: wer nutzt was (keine Inhalte, nur Ereignisse)
create table usage_events (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  org_id     uuid references organizations(id) on delete cascade,
  event      text not null check (event in ('login', 'view_radar', 'view_trend', 'export_csv', 'compare')),
  trend_id   int references trends(id) on delete set null,
  created_at timestamptz not null default now()
);
create index usage_events_org_time on usage_events (org_id, created_at desc);
alter table usage_events enable row level security;
create policy usage_insert on usage_events for insert
  with check (user_id = auth.uid() and (org_id is null or is_org_member(org_id)));
create policy usage_read on usage_events for select using (is_editor());
