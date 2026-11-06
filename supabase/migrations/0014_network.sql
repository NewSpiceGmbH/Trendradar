-- Netzwerk-Datenbank (ersetzt die Startup-Datenbank): alle Mitglieder des Netzwerks, klassifiziert über
-- Partner-Typen (feste Liste) und das Merkmal „Startup“; was ein Mitglied anbietet oder sucht, beschreiben eigene
-- Angebotskategorien. Die Trends hängen an den Kategorien, nicht am Mitglied.
--
-- Die Tabelle startups bleibt die Tabelle der Mitglieder (Name beibehalten, damit bestehender Code, Fremdschlüssel
-- und die Shortlist in Projekten unverändert weiterlaufen). Alle Änderungen sind additiv.
--
-- Sichtbarkeit für Kunden (unverändert, jetzt auch für Angebote und Referenzen): nur Einträge, die die Redaktion
-- öffentlich markiert hat (published), oder die einem Projekt des Kunden zugewiesen und dort freigegeben sind.
-- Vertrauliches (startup_private: Kontakt, Preise, Pitchdeck, Notizen) bleibt verborgen, bis es im Projekt
-- freigegeben ist. Interessen und Vorschläge des Netzwerk-Managers sieht nur die Redaktion.

-- ───────────────────────── Mitglieder ─────────────────────────
alter table startups
  add column partner_types text[] not null default '{solution_provider}',
  add column is_startup    boolean not null default false,  -- Merkmal „Startup“ (< 5 Jahre), von der Redaktion bestätigt
  add column region        text check (region in ('DACH', 'EU', 'US', 'GLOBAL')),
  add column source        text not null default 'editor' check (source in ('agent', 'editor', 'application')),
  add column details       jsonb not null default '{}',     -- Angaben je Partner-Typ, z. B. { "league": …, "capacity": … }
  add column is_partner    boolean not null default false,  -- Beziehung „Partner“ von New Spice
  add constraint startups_partner_types check (
    cardinality(partner_types) >= 1
    and partner_types <@ array['club', 'caterer', 'operator', 'multiplier', 'investor', 'solution_provider']);

-- Status: qualified = Aufgenommen; neu sind In Prüfung (review) und On hold
alter table startups drop constraint startups_status_check;
alter table startups add constraint startups_status_check check (status in ('qualified', 'review', 'on_hold', 'archived'));

-- Bestehende Startups überführen: Solution Provider; Merkmal Startup, wenn jünger als 5 Jahre oder ohne Gründungsjahr
-- (sie standen bisher in der Startup-Datenbank); Quelle Agent, wenn sie über einen Kandidaten aufgenommen wurden.
update startups s set
  is_startup = s.founded is null or s.founded > extract(year from current_date)::int - 5,
  source = case when exists (select 1 from startup_candidates c where c.startup_id = s.id) then 'agent' else 'editor' end;

create index startups_partner_types on startups using gin (partner_types);

-- Interne Angaben zur Beziehung, nur Redaktion (auch nicht über eine Projektfreigabe): Kunden sehen nie andere Kunden.
create table member_internal (
  member_id  uuid primary key references startups(id) on delete cascade,
  org_id     uuid references organizations(id) on delete set null,   -- Beziehung „Kunde“
  updated_at timestamptz not null default now()
);
create trigger member_internal_touch before update on member_internal for each row execute function touch_updated_at();

-- ───────────────────────── Angebotskategorien ─────────────────────────
create table offer_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  description   text,
  trend_numbers int[] not null default '{}',
  archived      boolean not null default false,             -- zusammengelegt oder nicht mehr verwendet
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index offer_categories_name on offer_categories (lower(trim(name)));
create trigger offer_categories_touch before update on offer_categories for each row execute function touch_updated_at();

-- ───────────────────────── Angebote (Produkte/Leistungen) ─────────────────────────
create table member_offers (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references startups(id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  description text,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index member_offers_member on member_offers (member_id, position);
create trigger member_offers_touch before update on member_offers for each row execute function touch_updated_at();

create table member_offer_categories (
  offer_id    uuid not null references member_offers(id) on delete cascade,
  category_id uuid not null references offer_categories(id) on delete cascade,
  primary key (offer_id, category_id)
);
create index member_offer_categories_category on member_offer_categories (category_id);

-- Interessen: Kategorien, die ein Mitglied sucht (Vereine, Betreiber, Investoren …) – nur Redaktion
create table member_interests (
  member_id   uuid not null references startups(id) on delete cascade,
  category_id uuid not null references offer_categories(id) on delete cascade,
  primary key (member_id, category_id)
);

-- ───────────────────────── Referenzen ─────────────────────────
create table member_references (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references startups(id) on delete cascade,
  client     text not null check (length(trim(client)) > 0),  -- wo / bei wem
  period     text,                                            -- z. B. „Pilot 2025“
  result     text,                                            -- z. B. „−40 % Wartezeit“
  url        text check (url ~ '^https?://'),
  published  boolean not null default false,                  -- für Kunden sichtbar (nach Freigabe)
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);
create index member_references_member on member_references (member_id, position);

-- ───────────────────────── Projekt-Zuweisung: Rolle im Projekt ─────────────────────────
alter table project_startups add column role text not null default 'shortlist' check (role in ('shortlist', 'partner'));

-- ───────────────────────── Vorschläge des Netzwerk-Managers ─────────────────────────
-- Der Agent schreibt nur hierher (und in agent_runs), nie direkt in die Datenbank. Die Redaktion übernimmt, passt an
-- oder verwirft. payload je Art, z. B. category: { name, description, trend_numbers, member_ids }.
alter table agent_runs drop constraint agent_runs_agent_check;
alter table agent_runs add constraint agent_runs_agent_check
  check (agent in ('scout', 'analyst', 'scorer', 'editor', 'venture', 'deepdive', 'network'));

create table network_suggestions (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references agent_runs(id) on delete set null,
  kind        text not null check (kind in ('category', 'merge_categories', 'classify', 'admit', 'stale', 'connection', 'startup_flag')),
  member_id   uuid references startups(id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  rationale   text not null check (length(trim(rationale)) > 0),   -- Begründung ist Pflicht
  payload     jsonb not null default '{}',
  sources     jsonb not null default '[]',
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'adjusted', 'dismissed')),
  decided_by  uuid references auth.users(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index network_suggestions_open on network_suggestions (status, created_at desc);

-- ───────────────────────── Zugriff ─────────────────────────
-- Darf der eingeloggte Nutzer dieses Mitglied sehen? (Redaktion; öffentlich markiert; im eigenen Projekt freigegeben)
create function network_member_visible(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_editor()
      or (is_member() and exists (select 1 from startups s where s.id = m and s.published and s.status = 'qualified'))
      or startup_shared_with_me(m, false);
$$;

alter table member_internal         enable row level security;
alter table offer_categories        enable row level security;
alter table member_offers           enable row level security;
alter table member_offer_categories enable row level security;
alter table member_interests        enable row level security;
alter table member_references       enable row level security;
alter table network_suggestions     enable row level security;

create policy member_internal_editor on member_internal for all using (is_editor()) with check (is_editor());

create policy offer_categories_editor on offer_categories for all using (is_editor()) with check (is_editor());
create policy offer_categories_read   on offer_categories for select using (is_member());

create policy member_offers_editor on member_offers for all using (is_editor()) with check (is_editor());
create policy member_offers_read   on member_offers for select using (network_member_visible(member_id));

create policy member_offer_categories_editor on member_offer_categories for all using (is_editor()) with check (is_editor());
create policy member_offer_categories_read   on member_offer_categories for select using (
  exists (select 1 from member_offers o where o.id = offer_id and network_member_visible(o.member_id)));

create policy member_interests_editor on member_interests for all using (is_editor()) with check (is_editor());

create policy member_references_editor on member_references for all using (is_editor()) with check (is_editor());
create policy member_references_read   on member_references for select using (published and network_member_visible(member_id));

create policy network_suggestions_editor on network_suggestions for all using (is_editor()) with check (is_editor());

-- ───────────────────────── Aufnahme aus Challenges ─────────────────────────
-- wie bisher (0009), zusätzlich: Quelle „Agent“ und Merkmal Startup aus dem Gründungsjahr
create or replace function decide_candidate(p_id uuid, p_decision text, p_note text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  c startup_candidates;
  ch_trends int[];
  sid uuid;
begin
  perform require_editor();
  if p_decision not in ('qualified', 'watch', 'rejected') then
    raise exception 'Unbekannte Entscheidung: %', p_decision using errcode = '22023';
  end if;
  if p_decision = 'rejected' and coalesce(trim(p_note), '') = '' then
    raise exception 'Bitte eine Begründung angeben.' using errcode = '22023';
  end if;

  select * into c from startup_candidates where id = p_id for update;
  if not found then raise exception 'Kandidat nicht gefunden.' using errcode = 'P0002'; end if;
  if c.status not in ('pending', 'watch') then
    raise exception 'Über diesen Kandidaten ist bereits entschieden.' using errcode = '22023';
  end if;

  sid := c.startup_id;
  if p_decision = 'qualified' then
    select trend_numbers into ch_trends from challenges where id = c.challenge_id;
    if sid is null and c.domain is not null then
      select id into sid from startups where domain = c.domain;
    end if;
    if sid is null then
      insert into startups (name, website, domain, country, founded, stage, funding, solution, trend_numbers, sources,
                            created_by, source, is_startup)
      values (c.name, c.website, c.domain, c.country, c.founded, c.stage, c.funding, c.summary, coalesce(ch_trends, '{}'),
              c.sources, auth.uid(), 'agent', c.founded is null or c.founded > extract(year from current_date)::int - 5)
      returning id into sid;
    else
      update startups
         set status = 'qualified',
             trend_numbers = array(select distinct x from unnest(trend_numbers || coalesce(ch_trends, '{}')) x order by x)
       where id = sid;
    end if;
  end if;

  update startup_candidates
     set status = p_decision, startup_id = sid, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = p_id;
  return sid;
end $$;
