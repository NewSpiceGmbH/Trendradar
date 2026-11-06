-- Cockpit: Ampel für Projekte. Gelb blinkt nur, bis jemand aus der Redaktion das Projekt angesehen hat
-- (projects.editor_seen_at). Die Schwelle für Rot/Gelb ist als Einstellung änderbar (Standard 3 Werktage).

alter table projects add column editor_seen_at timestamptz;

create table app_settings (
  id                smallint primary key default 1 check (id = 1),
  response_workdays smallint not null default 3 check (response_workdays between 1 and 20),
  updated_at        timestamptz not null default now()
);
create trigger app_settings_touch before update on app_settings for each row execute function touch_updated_at();
insert into app_settings (id) values (1);

alter table app_settings enable row level security;
create policy app_settings_editor on app_settings for all using (is_editor()) with check (is_editor());
