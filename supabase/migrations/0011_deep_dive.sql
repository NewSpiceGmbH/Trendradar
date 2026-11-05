-- Problem Deep Dive: Gesprächstranskripte (z. B. aus Notion KI) werden von einem Agenten zu einem strukturierten
-- Problem-Briefing an der Challenge konsolidiert. Das Briefing ist die Grundlage für den Venture-Agenten.
--
-- Datensparsam: Transkripte werden nur ausgewertet, nie gespeichert. Gespeichert bleiben das Briefing (ohne Namen,
-- nur Rollen) und je Gespräch Titel, Datum und eine Kurzfassung. Alles nur für die Redaktion.

alter table challenges
  add column brief            jsonb,          -- konsolidiertes Problem-Briefing (Format: lib/venture/brief.ts)
  add column brief_updated_at timestamptz;

create table deep_dive_sessions (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),   -- z. B. „Gespräch mit der Betriebsleitung“
  held_on      date,
  source       text not null check (source in ('paste', 'upload')),
  file_name    text,
  char_count   int check (char_count >= 0),
  status       text not null default 'processing' check (status in ('processing', 'done', 'failed')),
  summary      text,                                             -- Kurzfassung des Gesprächs (ohne Namen)
  error        text,
  run_id       uuid references agent_runs(id) on delete set null,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index deep_dive_sessions_challenge on deep_dive_sessions (challenge_id, created_at);

alter table deep_dive_sessions enable row level security;
create policy deep_dive_editor on deep_dive_sessions for all using (is_editor()) with check (is_editor());

alter table agent_runs drop constraint agent_runs_agent_check;
alter table agent_runs add constraint agent_runs_agent_check
  check (agent in ('scout', 'analyst', 'scorer', 'editor', 'venture', 'deepdive'));
