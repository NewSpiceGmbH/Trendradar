-- New Spice Trendradar – initiales Schema
-- Abgeleitet aus dem HTML-Prototyp (reference/prototype.html).
-- Grundsatz: Trends sind redaktioneller Inhalt von New Spice (global, nicht pro Kunde).
-- Organisationen steuern nur den Zugriff (Basis vs. Premium).

create extension if not exists pgcrypto;

-- ───────────────────────── Enums ─────────────────────────
create type perspective   as enum ('GLOBAL', 'EU');
create type origin_region as enum ('EU', 'US', 'GLOBAL');
create type horizon       as enum ('0–2', '3–5', '6–10');      -- Time-to-Adoption in Jahren
create type evidence      as enum ('A', 'B', 'C');
create type zone          as enum ('KICKOFF', 'WARMUP', 'SCOUTING');
create type content_status as enum ('draft', 'published', 'archived');
create type platform_role as enum ('admin', 'editor', 'none');
create type org_tier      as enum ('basic', 'premium');
create type proposal_status as enum ('pending', 'approved', 'rejected');
create type proposal_kind as enum ('new_trend', 'update_trend', 'score_change', 'new_source', 'attach_signal');
create type signal_status as enum ('new', 'assigned', 'dismissed');
create type run_status    as enum ('running', 'succeeded', 'failed');

-- ───────────────────────── Nutzer & Zugriff ─────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  platform_role platform_role not null default 'none',   -- New-Spice-Redaktion: admin/editor
  created_at    timestamptz not null default now()
);

create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  tier       org_tier not null default 'basic',
  created_at timestamptz not null default now()
);

create table memberships (
  org_id  uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role    text not null default 'member' check (role in ('owner', 'member')),
  primary key (org_id, user_id)
);

-- ───────────────────────── Stammdaten ─────────────────────────
create table clusters (
  code        text primary key,          -- A … G
  name        text not null,
  description text,
  position    int not null default 0
);

create table focus_fields (
  code        text primary key,          -- HOS, INF, FAN
  name        text not null,
  description text
);

create table subtopics (
  id         serial primary key,
  focus_code text not null references focus_fields(code),
  name       text not null,
  position   int not null default 0,
  unique (focus_code, name)
);

create table industries (
  code     text primary key,             -- SPORT, HOSPITALITY, LIVE
  name     text not null,
  position int not null default 0
);

create table criteria (
  idx    smallint primary key check (idx between 1 and 6),
  name   text not null,
  weight numeric(4,3) not null check (weight > 0)
);

create table zones (
  code    zone primary key,
  name    text not null,                 -- Anstoß / Aufwärmen / Scouting
  tagline text not null
);

-- ───────────────────────── Trends ─────────────────────────
create table trends (
  id             serial primary key,
  number         int not null unique,    -- öffentliche Trendnummer (#1 …)
  name           text not null,
  cluster_code   text not null references clusters(code),
  focus_code     text not null references focus_fields(code),
  subtopic_id    int references subtopics(id),
  origin         origin_region not null,
  description    text not null,
  use_cases      text,
  best_practice  text,
  signals_summary text,
  opportunities  text,
  risks          text,
  evidence       evidence not null,
  uncertain      boolean not null default false,  -- „unc“: hohe Unsicherheit
  mandatory      boolean not null default false,  -- „comp“: regulatorisch/pflichtgetrieben → Anstoß trotz Score < 3,5
  status         content_status not null default 'draft',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Horizont und Europa-Einordnung je Perspektive. GLOBAL ist Pflicht, EU nur bei Abweichung.
create table trend_perspectives (
  trend_id    int references trends(id) on delete cascade,
  perspective perspective not null,
  horizon     horizon,                   -- null bei EU = übernimmt GLOBAL
  note        text,                      -- Begründung der Europa-Abweichung
  primary key (trend_id, perspective)
);

-- Scores 1–5 je Kriterium. GLOBAL vollständig; EU-Zeilen nur, wenn abweichend bewertet.
create table trend_scores (
  trend_id     int references trends(id) on delete cascade,
  perspective  perspective not null,
  criterion    smallint references criteria(idx),
  score        smallint not null check (score between 1 and 5),
  rationale    text,                     -- Begründung (Pflicht für Agenten-Vorschläge)
  primary key (trend_id, perspective, criterion)
);

create table trend_relevance (
  trend_id      int references trends(id) on delete cascade,
  industry_code text references industries(code),
  relevance     smallint not null check (relevance between 1 and 3),
  primary key (trend_id, industry_code)
);

-- Premium-Inhalte getrennt, damit RLS sie sauber schützen kann
create table trend_premium (
  trend_id       int primary key references trends(id) on delete cascade,
  recommendation text,                   -- Handlungsempfehlung
  why_prioritized text
);

-- Versionshistorie für „Radar-Bewegung“
create table trend_versions (
  id         bigserial primary key,
  trend_id   int not null references trends(id) on delete cascade,
  snapshot   jsonb not null,
  changed_by uuid references auth.users(id),
  proposal_id uuid,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Quellen & Partner ─────────────────────────
create table sources (
  id              text primary key,      -- s13 … (neue Quellen: s-<uuid-kurz>)
  title           text not null,
  publisher       text,
  published_label text,                  -- wie im Prototyp: „o. D.“, „2025“, „22.01.2025“
  published_on    date,
  url             text not null unique,
  last_checked_at timestamptz,
  last_http_status int,
  created_at      timestamptz not null default now()
);

create table trend_sources (
  trend_id    int references trends(id) on delete cascade,
  source_id   text references sources(id),
  perspective perspective not null default 'GLOBAL',  -- EU = Beleg für die Europa-Einordnung
  primary key (trend_id, source_id, perspective)
);

create table partners (
  key            text primary key,
  name           text not null,
  role           text,
  knowledge_base boolean not null default false  -- „Wissensbasis, zu validieren“
);

create table partner_sources (
  partner_key text references partners(key) on delete cascade,
  source_id   text references sources(id),
  primary key (partner_key, source_id)
);

create table trend_partners (
  trend_id    int references trends(id) on delete cascade,
  partner_key text references partners(key) on delete cascade,
  position    int not null default 0,
  primary key (trend_id, partner_key)
);

-- „Zehn Erkenntnisse für Entscheider“
create table insights (
  id       serial primary key,
  title    text not null,
  body     text not null,
  position int not null default 0,
  status   content_status not null default 'published'
);

-- Umgesetzte New-Spice-Projekte (Premium)
create table cases (
  id        uuid primary key default gen_random_uuid(),
  client    text not null,
  year      text,
  title     text not null,
  solution  text,
  result    text,
  status    content_status not null default 'draft'
);
create table case_trends (
  case_id  uuid references cases(id) on delete cascade,
  trend_id int references trends(id) on delete cascade,
  primary key (case_id, trend_id)
);

-- ───────────────────────── Agenten ─────────────────────────
create table agent_runs (
  id          uuid primary key default gen_random_uuid(),
  agent       text not null check (agent in ('scout', 'analyst', 'scorer', 'editor')),
  status      run_status not null default 'running',
  input       jsonb,
  output      jsonb,
  model       text,
  input_tokens  int,
  output_tokens int,
  error       text,
  triggered_by uuid references auth.users(id),     -- null = Zeitplan
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table signals (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  summary     text,
  url         text not null,
  publisher   text,
  published_on date,
  status      signal_status not null default 'new',
  trend_id    int references trends(id),
  run_id      uuid references agent_runs(id),
  found_at    timestamptz not null default now(),
  unique (url)
);

-- Review-Queue: Agenten schreiben NIE direkt in trends, sondern nur hierhin
create table proposals (
  id              uuid primary key default gen_random_uuid(),
  kind            proposal_kind not null,
  target_trend_id int references trends(id),
  payload         jsonb not null,        -- vorgeschlagene Änderung (Schema je kind, siehe CLAUDE.md)
  rationale       text not null,
  source_ids      text[] not null default '{}',
  status          proposal_status not null default 'pending',
  run_id          uuid references agent_runs(id),
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now()
);

-- ───────────────────────── Bewertungslogik ─────────────────────────
-- Exakt wie im Prototyp (scoreOf / view):
--   total = Σ score_i × weight_i, auf 2 Nachkommastellen gerundet
--   SCOUTING, wenn Horizont 6–10 oder Market Readiness (Kriterium 4) ≤ 2
--   KICKOFF,  wenn Horizont 0–2 und (total ≥ 3,5 oder mandatory)
--   sonst WARMUP
-- EU übernimmt Werte aus GLOBAL, wo keine EU-Abweichung hinterlegt ist.
create view trend_positions with (security_invoker = true) as
with persp as (
  select t.id as trend_id, p.perspective, t.mandatory
  from trends t cross join (values ('GLOBAL'::perspective), ('EU'::perspective)) p(perspective)
),
sc as (
  select pp.trend_id, pp.perspective, c.idx, c.weight,
         coalesce(eu.score, g.score) as score
  from persp pp
  cross join criteria c
  join trend_scores g
    on g.trend_id = pp.trend_id and g.perspective = 'GLOBAL' and g.criterion = c.idx
  left join trend_scores eu
    on pp.perspective = 'EU' and eu.trend_id = pp.trend_id and eu.perspective = 'EU' and eu.criterion = c.idx
),
agg as (
  select trend_id, perspective,
         round(sum(score * weight), 2) as total,
         max(score) filter (where idx = 4) as market_readiness,
         array_agg(score order by idx) as scores
  from sc group by trend_id, perspective
),
hz as (
  select pp.trend_id, pp.perspective, pp.mandatory,
         coalesce(case when pp.perspective = 'EU' then e.horizon end, g.horizon) as horizon
  from persp pp
  join trend_perspectives g on g.trend_id = pp.trend_id and g.perspective = 'GLOBAL'
  left join trend_perspectives e on e.trend_id = pp.trend_id and e.perspective = 'EU'
)
select a.trend_id, a.perspective, a.scores, a.total, h.horizon,
       case
         when h.horizon = '6–10' or a.market_readiness <= 2 then 'SCOUTING'::zone
         when h.horizon = '0–2' and (a.total >= 3.5 or h.mandatory) then 'KICKOFF'::zone
         else 'WARMUP'::zone
       end as zone
from agg a join hz h using (trend_id, perspective);

-- ───────────────────────── Hilfsfunktionen für RLS ─────────────────────────
create function is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and platform_role in ('admin', 'editor'));
$$;

create function has_premium() returns boolean
language sql stable security definer set search_path = public as $$
  select is_editor() or exists (
    select 1 from memberships m join organizations o on o.id = m.org_id
    where m.user_id = auth.uid() and o.tier = 'premium');
$$;

create function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select is_editor() or exists (select 1 from memberships where user_id = auth.uid());
$$;

-- updated_at pflegen
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger trends_touch before update on trends for each row execute function touch_updated_at();

-- Neues Profil bei Registrierung
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ───────────────────────── Row-Level-Security ─────────────────────────
alter table profiles          enable row level security;
alter table organizations     enable row level security;
alter table memberships       enable row level security;
alter table clusters          enable row level security;
alter table focus_fields      enable row level security;
alter table subtopics         enable row level security;
alter table industries        enable row level security;
alter table criteria          enable row level security;
alter table zones             enable row level security;
alter table trends            enable row level security;
alter table trend_perspectives enable row level security;
alter table trend_scores      enable row level security;
alter table trend_relevance   enable row level security;
alter table trend_premium     enable row level security;
alter table trend_versions    enable row level security;
alter table sources           enable row level security;
alter table trend_sources     enable row level security;
alter table partners          enable row level security;
alter table partner_sources   enable row level security;
alter table trend_partners    enable row level security;
alter table insights          enable row level security;
alter table cases             enable row level security;
alter table case_trends       enable row level security;
alter table agent_runs        enable row level security;
alter table signals           enable row level security;
alter table proposals         enable row level security;

-- Eigenes Profil lesen; Redaktion sieht alle
create policy profiles_read on profiles for select using (id = auth.uid() or is_editor());
create policy profiles_admin on profiles for update using (is_editor());

create policy orgs_read on organizations for select
  using (is_editor() or exists (select 1 from memberships m where m.org_id = id and m.user_id = auth.uid()));
create policy orgs_admin on organizations for all using (is_editor()) with check (is_editor());
create policy members_read on memberships for select using (user_id = auth.uid() or is_editor());
create policy members_admin on memberships for all using (is_editor()) with check (is_editor());

-- Stammdaten & Quellen: alle Mitglieder lesen, Redaktion schreibt
do $$
declare t text;
begin
  foreach t in array array['clusters','focus_fields','subtopics','industries','criteria','zones',
                           'sources','partners','partner_sources'] loop
    execute format('create policy %1$s_read on %1$s for select using (is_member())', t);
    execute format('create policy %1$s_write on %1$s for all using (is_editor()) with check (is_editor())', t);
  end loop;
end $$;

-- Trends: Mitglieder sehen veröffentlichte, Redaktion alles
create policy trends_read on trends for select using ((status = 'published' and is_member()) or is_editor());
create policy trends_write on trends for all using (is_editor()) with check (is_editor());

do $$
declare t text;
begin
  foreach t in array array['trend_perspectives','trend_scores','trend_relevance','trend_sources','trend_partners'] loop
    execute format($f$create policy %1$s_read on %1$s for select using (
      is_editor() or (is_member() and exists (select 1 from trends x where x.id = trend_id and x.status = 'published')))$f$, t);
    execute format('create policy %1$s_write on %1$s for all using (is_editor()) with check (is_editor())', t);
  end loop;
end $$;

-- Premium
create policy premium_read on trend_premium for select using (has_premium());
create policy premium_write on trend_premium for all using (is_editor()) with check (is_editor());
create policy cases_read on cases for select using ((status = 'published' and has_premium()) or is_editor());
create policy cases_write on cases for all using (is_editor()) with check (is_editor());
create policy case_trends_read on case_trends for select using (has_premium());
create policy case_trends_write on case_trends for all using (is_editor()) with check (is_editor());

create policy insights_read on insights for select using ((status = 'published' and is_member()) or is_editor());
create policy insights_write on insights for all using (is_editor()) with check (is_editor());

-- Redaktions-Interna: nur Redaktion (Agenten schreiben serverseitig mit Service-Role-Key)
create policy versions_editor on trend_versions for all using (is_editor()) with check (is_editor());
create policy runs_editor on agent_runs for all using (is_editor()) with check (is_editor());
create policy signals_editor on signals for all using (is_editor()) with check (is_editor());
create policy proposals_editor on proposals for all using (is_editor()) with check (is_editor());
