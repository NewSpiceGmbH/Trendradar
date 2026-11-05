-- Projekte mit Kunden: Anfrage im Kundenportal, kuratierte Shortlist aus der Startup-Datenbank, Fortschritt
-- (Phasen und Meilensteine), Nachrichten, Dokumente. Ein erfolgreicher Abschluss vergibt „New Spice approved“.
--
-- Zugriff: Die Redaktion sieht alles. Kunden sehen nur Projekte ihrer eigenen Organisation, solange deren Zugang
-- gültig ist; von der Shortlist nur freigegebene Einträge, Vertrauliches (Kosten, Pitchdeck) nur bei ausdrücklicher
-- Freigabe. Interne Nachrichten und Dokumente der Redaktion sehen Kunden nie.

-- ───────────────────────── Hilfsfunktionen ─────────────────────────
-- Mitglied dieser Organisation mit gültigem Zugang?
create function org_member_active(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join organizations o on o.id = m.org_id
    where m.org_id = target and m.user_id = auth.uid() and org_active(o));
$$;

-- ───────────────────────── Projekte ─────────────────────────
create table projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  request      text not null default '',                  -- Anliegen in den Worten des Kunden
  goal         text not null default '',
  venue        text,                                      -- Ort / Venue
  timeframe    text,
  budget       text,
  status       text not null default 'requested'
               check (status in ('requested', 'scoping', 'shortlist', 'pilot', 'evaluation', 'completed', 'cancelled')),
  outcome      text check (outcome in ('success', 'no_success')),
  outcome_note text,
  challenge_id uuid references challenges(id) on delete set null,
  lead_id      uuid references auth.users(id),            -- Ansprechperson bei New Spice
  requested_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint projects_outcome_on_completion check ((status = 'completed') = (outcome is not null))
);
create trigger projects_touch before update on projects for each row execute function touch_updated_at();
create index projects_org on projects (org_id, updated_at desc);

-- Darf der eingeloggte Nutzer dieses Projekt sehen?
create function project_accessible(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_editor() or exists (select 1 from projects pr where pr.id = p and org_member_active(pr.org_id));
$$;

create table project_milestones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title      text not null check (length(trim(title)) > 0),
  due_date   date,
  done_at    timestamptz,
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);

create table project_updates (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null,
  body       text not null check (length(trim(body)) > 0),
  internal   boolean not null default false,             -- nur für die Redaktion
  created_at timestamptz not null default now()
);

-- Kuratierte Shortlist: Startups aus der Datenbank mit Begründung, für den Kunden einzeln freigegeben
create table project_startups (
  project_id      uuid not null references projects(id) on delete cascade,
  startup_id      uuid not null references startups(id) on delete cascade,
  position        smallint not null default 0,
  rationale       text,                                   -- warum dieses Startup für dieses Projekt
  shared          boolean not null default false,         -- für den Kunden sichtbar
  share_private   boolean not null default false,         -- Kosten und Pitchdeck mit freigeben
  customer_status text not null default 'open' check (customer_status in ('open', 'interested', 'not_interested', 'selected')),
  customer_note   text,
  created_at      timestamptz not null default now(),
  primary key (project_id, startup_id),
  constraint project_startups_private_needs_share check (not share_private or shared)
);

create table project_documents (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  path        text not null unique,                       -- Pfad im Bucket project-files: <projekt-id>/<datei>
  size_bytes  bigint check (size_bytes between 0 and 52428800),
  mime        text,
  internal    boolean not null default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint project_documents_path_in_project check (path like project_id::text || '/%')
);

-- ───────────────────────── Zugriff ─────────────────────────
alter table projects           enable row level security;
alter table project_milestones enable row level security;
alter table project_updates    enable row level security;
alter table project_startups   enable row level security;
alter table project_documents  enable row level security;

create policy projects_editor on projects for all using (is_editor()) with check (is_editor());
create policy projects_read   on projects for select using (org_member_active(org_id));
-- Kunden stellen eine Anfrage: nur für die eigene Organisation, nur als Anfrage, ohne interne Felder
create policy projects_request on projects for insert with check (
  org_member_active(org_id) and status = 'requested' and requested_by = auth.uid()
  and outcome is null and challenge_id is null and lead_id is null and completed_at is null);

create policy milestones_editor on project_milestones for all using (is_editor()) with check (is_editor());
create policy milestones_read   on project_milestones for select using (project_accessible(project_id));

create policy updates_editor on project_updates for all using (is_editor()) with check (is_editor());
create policy updates_read   on project_updates for select using (not internal and project_accessible(project_id));
create policy updates_write  on project_updates for insert with check (not internal and author_id = auth.uid() and project_accessible(project_id));

create policy shortlist_editor on project_startups for all using (is_editor()) with check (is_editor());
create policy shortlist_read   on project_startups for select using (shared and project_accessible(project_id));

create policy documents_editor on project_documents for all using (is_editor()) with check (is_editor());
create policy documents_read   on project_documents for select using (not internal and project_accessible(project_id));
create policy documents_upload on project_documents for insert with check (
  not internal and uploaded_by = auth.uid() and project_accessible(project_id));
create policy documents_delete_own on project_documents for delete using (uploaded_by = auth.uid() and project_accessible(project_id));

-- Startups aus der freigegebenen Shortlist des eigenen Projekts sehen, auch wenn sie nicht im Radar veröffentlicht sind
create function startup_shared_with_me(s uuid, with_private boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_startups ps join projects p on p.id = ps.project_id
    where ps.startup_id = s and ps.shared and (not with_private or ps.share_private) and org_member_active(p.org_id));
$$;
create policy startups_read_shortlist on startups        for select using (startup_shared_with_me(id, false));
create policy private_read_shortlist  on startup_private for select using (startup_shared_with_me(startup_id, true));

-- ───────────────────────── Dokumente im Speicher ─────────────────────────
-- Privater Bucket. Eine Datei darf nur hochladen, wer vorher den Eintrag in project_documents anlegen durfte;
-- lesen darf, wer den Eintrag sehen darf. So gelten für Dateien dieselben Regeln wie für die Metadaten.
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 52428800)
on conflict (id) do nothing;

create function project_file_readable(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_editor() or exists (
    select 1 from project_documents d where d.path = object_name and not d.internal and project_accessible(d.project_id));
$$;

create function project_file_writable(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_editor() or exists (
    select 1 from project_documents d
    where d.path = object_name and not d.internal and d.uploaded_by = auth.uid() and project_accessible(d.project_id));
$$;

create policy project_files_read   on storage.objects for select using (bucket_id = 'project-files' and project_file_readable(name));
create policy project_files_upload on storage.objects for insert with check (bucket_id = 'project-files' and project_file_writable(name));
create policy project_files_delete on storage.objects for delete using (bucket_id = 'project-files' and project_file_writable(name));

-- ───────────────────────── Aktionen ─────────────────────────
-- Kunde reagiert auf einen Eintrag der Shortlist (nur Status und Notiz, nichts sonst)
create function respond_shortlist(p_project uuid, p_startup uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('open', 'interested', 'not_interested') then
    raise exception 'Unbekannte Rückmeldung: %', p_status using errcode = '22023';
  end if;
  if not exists (
    select 1 from project_startups ps join projects p on p.id = ps.project_id
    where ps.project_id = p_project and ps.startup_id = p_startup and ps.shared
      and (org_member_active(p.org_id) or is_editor())) then
    raise exception 'Kein Zugriff auf diesen Eintrag.' using errcode = '42501';
  end if;
  update project_startups set customer_status = p_status, customer_note = nullif(trim(p_note), '')
  where project_id = p_project and startup_id = p_startup;
end $$;

-- Projekt abschließen. Bei Erfolg erhalten die umgesetzten Startups („selected“) das Siegel „New Spice approved“.
create function complete_project(p_id uuid, p_outcome text, p_note text default null) returns int
language plpgsql security invoker set search_path = public as $$
declare n int := 0;
begin
  perform require_editor();
  if p_outcome not in ('success', 'no_success') then
    raise exception 'Unbekanntes Ergebnis: %', p_outcome using errcode = '22023';
  end if;
  if p_outcome = 'success' and not exists (select 1 from project_startups where project_id = p_id and customer_status = 'selected') then
    raise exception 'Bitte zuerst das umgesetzte Startup in der Shortlist als ausgewählt markieren.' using errcode = '22023';
  end if;
  update projects set status = 'completed', outcome = p_outcome, outcome_note = nullif(trim(p_note), ''), completed_at = now()
  where id = p_id;
  if not found then raise exception 'Projekt nicht gefunden.' using errcode = 'P0002'; end if;
  if p_outcome = 'success' then
    update startups set approved = true
    where id in (select startup_id from project_startups where project_id = p_id and customer_status = 'selected');
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

-- ───────────────────────── Kundenverwaltung ─────────────────────────
-- Mitglieder einer Organisation mit E-Mail-Adresse: für die Redaktion und für Mitglieder derselben Organisation
create function org_members(p_org uuid) returns table (user_id uuid, email text, display_name text, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, p.display_name, m.role
  from memberships m join auth.users u on u.id = m.user_id left join profiles p on p.id = m.user_id
  where m.org_id = p_org and (is_editor() or is_org_member(p_org))
  order by m.role, u.email;
$$;
revoke execute on function org_members(uuid) from public, anon;
grant execute on function org_members(uuid) to authenticated;
