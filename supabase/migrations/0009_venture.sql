-- Venture Clienting: Challenges (konkrete Problemstellungen), ein Agent sucht und bewertet passende Startups vor,
-- die Redaktion entscheidet, was in die qualifizierte Startup-Datenbank kommt. Profile lassen sich im Radar veröffentlichen.
--
-- Regeln wie bei den Trends: Der Agent schreibt nur Kandidaten (startup_candidates) und agent_runs, nie direkt
-- in startups. Aufgenommen wird ausschließlich über decide_candidate(). Vertrauliches (Kontakt, Preise, Pitchdeck)
-- liegt getrennt in startup_private und ist nur für die Redaktion lesbar.

-- ───────────────────────── Challenges ─────────────────────────
create table challenges (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (length(trim(title)) > 0),
  problem        text not null default '',                 -- Ist-Situation in eigenen Worten
  goal           text not null default '',                 -- Ziel und Erfolgskriterien
  context        text not null default '',                 -- Venue-Typ, Abläufe, Besonderheiten
  audience       text not null default 'both' check (audience in ('vip', 'public', 'both')),
  journey_stages text[] not null default '{}',
  trend_numbers  int[] not null default '{}',
  regions        text[] not null default '{DACH,EU}' check (regions <@ array['DACH', 'EU', 'US', 'GLOBAL']),
  min_maturity   text not null default 'pilot' check (min_maturity in ('idea', 'prototype', 'pilot', 'market')),
  must_haves     text[] not null default '{}',             -- z. B. „DSGVO-konform“, „Anbindung an Kassensystem X“
  exclusions     text[] not null default '{}',             -- Firmen oder Ansätze, die nicht in Frage kommen
  leads          text[] not null default '{}',             -- Hinweise aus dem Team: Startups oder Links, die geprüft werden sollen
  timeframe      text,
  budget         text,
  status         text not null default 'draft' check (status in ('draft', 'scouting', 'review', 'shortlist', 'closed')),
  max_candidates smallint not null default 8 check (max_candidates between 1 and 20),
  max_searches   smallint not null default 15 check (max_searches between 1 and 50),
  max_cost_usd   numeric(6, 2) not null default 3.00 check (max_cost_usd > 0),
  model          text not null default 'claude-opus-5-5',
  effort         text not null default 'high' check (effort in ('low', 'medium', 'high')),
  created_by     uuid references auth.users(id),
  last_run_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger challenges_touch before update on challenges for each row execute function touch_updated_at();

-- ───────────────────────── Qualifizierte Startup-Datenbank ─────────────────────────
-- Nur Angaben zum Unternehmen aus öffentlichen Quellen; keine personenbezogenen Daten (die stehen, falls nötig,
-- als geschäftlicher Kontakt in startup_private).
create table startups (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(trim(name)) > 0),
  website             text check (website ~ '^https?://'),
  domain              text unique,                         -- normalisiert (ohne www.), gegen Dubletten
  country             text,
  city                text,
  founded             smallint check (founded between 1990 and 2100),
  stage               text check (stage in ('idea', 'prototype', 'pilot', 'market', 'scale')),
  funding             text,                                -- z. B. „Seed, 6 Mio. €“
  team_size           text,
  tagline             text,                                -- ein Satz
  solution            text,                                -- was die Lösung tut
  use_cases           text,
  reference_customers text,                                -- öffentlich bekannte Referenzen
  trend_numbers       int[] not null default '{}',
  tags                text[] not null default '{}',
  status              text not null default 'qualified' check (status in ('qualified', 'archived')),
  approved            boolean not null default false,      -- „New Spice approved“ (nach erfolgreichem Projekt)
  published           boolean not null default false,      -- im Radar für Kunden sichtbar
  logo_url            text check (logo_url ~ '^https://'),
  sources             jsonb not null default '[]',         -- [{ "url": …, "title": … }]
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint startups_publish_qualified check (not published or status = 'qualified')
);
create trigger startups_touch before update on startups for each row execute function touch_updated_at();

create table startup_private (
  startup_id     uuid primary key references startups(id) on delete cascade,
  contact_name   text,
  contact_role   text,
  contact_email  text,
  pricing        text,                                     -- Kosten, Lizenzmodell
  pitch_deck_url text check (pitch_deck_url ~ '^https://'),
  notes          text,
  updated_at     timestamptz not null default now()
);
create trigger startup_private_touch before update on startup_private for each row execute function touch_updated_at();

-- ───────────────────────── Läufe und Kandidaten ─────────────────────────
alter table agent_runs drop constraint agent_runs_agent_check;
alter table agent_runs add constraint agent_runs_agent_check check (agent in ('scout', 'analyst', 'scorer', 'editor', 'venture'));
alter table agent_runs add column challenge_id uuid references challenges(id) on delete set null;

create table startup_candidates (
  id             uuid primary key default gen_random_uuid(),
  challenge_id   uuid not null references challenges(id) on delete cascade,
  run_id         uuid references agent_runs(id) on delete set null,
  startup_id     uuid references startups(id) on delete set null,   -- gesetzt bei Aufnahme
  name           text not null,
  website        text check (website ~ '^https?://'),
  domain         text,
  country        text,
  founded        smallint check (founded between 1990 and 2100),
  stage          text check (stage in ('idea', 'prototype', 'pilot', 'market', 'scale')),
  funding        text,
  summary        text not null,                            -- Lösung in eigenen Worten
  approach       text,                                     -- Lösungsansatz, ggf. Analogie aus anderer Branche
  scores         jsonb not null,                           -- [{ criterion, score 1–5, rationale, source_url }]
  total          numeric(3, 2) not null check (total between 1 and 5),
  recommendation text not null check (recommendation in ('shortlist', 'watch', 'no_fit')),
  must_have_gaps text[] not null default '{}',
  open_questions text[] not null default '{}',
  sources        jsonb not null default '[]',
  uncertain      boolean not null default false,
  status         text not null default 'pending' check (status in ('pending', 'qualified', 'watch', 'rejected')),
  decided_by     uuid references auth.users(id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now(),
  unique (challenge_id, domain)
);
create index startup_candidates_challenge on startup_candidates (challenge_id, status, total desc);

-- ───────────────────────── Zugriff ─────────────────────────
alter table challenges         enable row level security;
alter table startups           enable row level security;
alter table startup_private    enable row level security;
alter table startup_candidates enable row level security;

create policy challenges_editor on challenges         for all using (is_editor()) with check (is_editor());
create policy candidates_editor on startup_candidates for all using (is_editor()) with check (is_editor());
create policy private_editor    on startup_private    for all using (is_editor()) with check (is_editor());
create policy startups_editor   on startups           for all using (is_editor()) with check (is_editor());
-- Kunden mit gültigem Zugang: nur veröffentlichte Profile der qualifizierten Datenbank
create policy startups_read_published on startups for select using (published and status = 'qualified' and is_member());

-- ───────────────────────── Entscheidung der Redaktion ─────────────────────────
-- qualified: in die Datenbank (neues Profil oder bestehendes mit gleicher Domain, Trends der Challenge ergänzen)
-- watch:     beobachten, später erneut entscheiden
-- rejected:  ablehnen, nur mit Begründung
create function decide_candidate(p_id uuid, p_decision text, p_note text default null) returns uuid
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
      insert into startups (name, website, domain, country, founded, stage, funding, solution, trend_numbers, sources, created_by)
      values (c.name, c.website, c.domain, c.country, c.founded, c.stage, c.funding, c.summary, coalesce(ch_trends, '{}'), c.sources, auth.uid())
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
