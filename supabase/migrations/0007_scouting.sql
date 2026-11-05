-- Scouting-Stab: konfigurierbare Scout-Agenten mit Revier, Auftrag, Takt und Budget; Quellenkanäle zum Andocken;
-- eingereichte Tipps (z. B. LinkedIn-Beiträge); Video-/Bildmaterial zu Meldungen mit Rechtestatus.
-- Rein additiv. Agenten schreiben weiterhin nur in signals/proposals/agent_runs (CLAUDE.md, Agenten-Regel 1).
-- Tests: tests/db/scouting.test.sql

-- ───────────────────────── Quellenkanäle ─────────────────────────
-- Nicht verwechseln mit `sources` (Quellenbelege eines Trends, [s13]).
create table source_channels (
  id          uuid primary key default gen_random_uuid(),
  key         text unique,                       -- stabiler Bezeichner für Startdaten, z. B. 'stadionwelt'
  name        text not null,
  kind        text not null check (kind in ('web_search', 'website', 'rss', 'youtube', 'linkedin', 'newsletter', 'upload', 'api', 'mcp')),
  url         text,                              -- Startseite, Feed, Kanal oder Endpunkt
  domains     text[] not null default '{}',      -- für die Websuche: nur diese Domains (leer = alle)
  verticals   text[] not null default '{}' check (verticals <@ array['SPORT', 'HOSPITALITY', 'LIVE']),
  region      text check (region in ('DACH', 'EU', 'US', 'GLOBAL')),
  language    text,
  access      text not null default 'open' check (access in ('open', 'subscription', 'licensed')),
  -- Zugangsdaten liegen nie in der Datenbank, nur der Name der Umgebungsvariable (z. B. YOUTUBE_API_KEY)
  secret_ref  text check (secret_ref ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  notes       text,
  active      boolean not null default true,
  verified    boolean not null default false,    -- Adresse von der Redaktion geprüft
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger source_channels_touch before update on source_channels for each row execute function touch_updated_at();

-- ───────────────────────── Scouts ─────────────────────────
create table scouts (
  id             uuid primary key default gen_random_uuid(),
  key            text unique,
  name           text not null,
  role           text,                            -- „Hospitality-Scout DACH“
  shirt_number   smallint check (shirt_number between 1 and 99),
  briefing       text not null default '',        -- Auftrag in eigenen Worten
  keywords       text[] not null default '{}',
  exclusions     text[] not null default '{}',
  verticals      text[] not null default '{}' check (verticals <@ array['SPORT', 'HOSPITALITY', 'LIVE']),
  clusters       text[] not null default '{}',
  journey_stages text[] not null default '{}',
  audience       text not null default 'both' check (audience in ('vip', 'public', 'both')),
  regions        text[] not null default '{DACH,EU}' check (regions <@ array['DACH', 'EU', 'US', 'GLOBAL']),
  languages      text[] not null default '{de,en}',
  watch_trends   int[] not null default '{}',     -- Trendnummern auf der Beobachtungsliste
  cadence        text not null default 'daily' check (cadence in ('daily', 'weekly', 'manual')),
  run_hour       smallint not null default 5 check (run_hour between 0 and 23),        -- Uhrzeit (Europe/Berlin)
  run_weekday    smallint check (run_weekday between 1 and 7),                         -- nur bei weekly; 1 = Montag
  max_searches   smallint not null default 12 check (max_searches between 1 and 50),
  max_cost_usd   numeric(6, 2) not null default 2.00 check (max_cost_usd > 0),
  max_signals    smallint not null default 8 check (max_signals between 1 and 30),
  deliver_media  boolean not null default true,
  min_evidence   text not null default 'B' check (min_evidence in ('A', 'B', 'C')),
  model          text not null default 'claude-opus-5-5',
  effort         text not null default 'medium' check (effort in ('low', 'medium', 'high')),
  active         boolean not null default false,  -- erst aktivieren, wenn der Claude-API-Schlüssel hinterlegt ist
  last_run_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger scouts_touch before update on scouts for each row execute function touch_updated_at();

create table scout_channels (
  scout_id   uuid references scouts(id) on delete cascade,
  channel_id uuid references source_channels(id) on delete cascade,
  primary key (scout_id, channel_id)
);

-- Monatsbudget und Not-Aus für alle Scouts (eine Zeile)
create table scouting_settings (
  id                 smallint primary key default 1 check (id = 1),
  monthly_budget_usd numeric(8, 2) not null default 200 check (monthly_budget_usd >= 0),
  paused             boolean not null default false,
  updated_at         timestamptz not null default now()
);
insert into scouting_settings default values;

-- ───────────────────────── Tipps ─────────────────────────
-- Von der Redaktion eingereichte Links (z. B. LinkedIn-Beiträge), die ein Scout beim nächsten Lauf auswertet
create table scout_tips (
  id           uuid primary key default gen_random_uuid(),
  url          text not null check (url ~ '^https?://'),
  note         text,
  scout_id     uuid references scouts(id) on delete set null,
  submitted_by uuid references auth.users(id),
  status       text not null default 'open' check (status in ('open', 'done', 'failed')),
  signal_id    uuid references signals(id) on delete set null,
  error        text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);

-- ───────────────────────── Meldungen: Herkunft und Medien ─────────────────────────
alter table signals
  add column scout_id   uuid references scouts(id) on delete set null,
  add column channel_id uuid references source_channels(id) on delete set null,
  add column kind       text check (kind in ('launch', 'pilot', 'study', 'regulation', 'deal', 'event', 'video', 'other')),
  add column evidence   evidence,
  add column relevance  smallint check (relevance between 1 and 3),
  add column press_release boolean not null default false,
  add column suggested_trends int[] not null default '{}';

alter table agent_runs
  add column scout_id uuid references scouts(id) on delete set null,
  add column searches int,
  add column cost_usd numeric(8, 4);
create index agent_runs_month on agent_runs (started_at);

-- Video- und Bildmaterial: Videos werden eingebettet, Bilder nur mit geklärtem Recht gezeigt
create table signal_media (
  id         uuid primary key default gen_random_uuid(),
  signal_id  uuid not null references signals(id) on delete cascade,
  kind       text not null check (kind in ('video', 'image')),
  url        text not null check (url ~ '^https://'),
  embed_url  text check (embed_url ~ '^https://(www\.youtube-nocookie\.com|player\.vimeo\.com)/'),
  title      text,
  credit     text,                                -- Bildnachweis
  license    text,                                -- z. B. „Pressebild“, „CC BY 4.0“
  rights     text not null default 'unclear' check (rights in ('embed', 'press', 'cc', 'own', 'unclear')),
  approved   boolean not null default false,      -- Redaktion hat Rechte und Inhalt geprüft
  created_at timestamptz not null default now(),
  constraint signal_media_rights_before_approval check (not approved or rights <> 'unclear'),
  constraint signal_media_video_embed check (kind <> 'video' or embed_url is not null)
);
create index signal_media_signal on signal_media (signal_id);

-- ───────────────────────── Zugriff ─────────────────────────
alter table source_channels  enable row level security;
alter table scouts           enable row level security;
alter table scout_channels   enable row level security;
alter table scouting_settings enable row level security;
alter table scout_tips       enable row level security;
alter table signal_media     enable row level security;

create policy channels_editor on source_channels  for all using (is_editor()) with check (is_editor());
create policy scouts_editor   on scouts           for all using (is_editor()) with check (is_editor());
create policy scout_channels_editor on scout_channels for all using (is_editor()) with check (is_editor());
create policy settings_editor on scouting_settings for all using (is_editor()) with check (is_editor());
create policy tips_editor     on scout_tips       for all using (is_editor()) with check (is_editor());
create policy media_editor    on signal_media     for all using (is_editor()) with check (is_editor());
-- Kunden sehen nur freigegebene Medien zu Meldungen, die sie selbst sehen dürfen
create policy media_read_published on signal_media for select using (
  approved and exists (select 1 from signals s where s.id = signal_media.signal_id));

-- ───────────────────────── Startquellen ─────────────────────────
-- Adressen sind Vorschläge und als „nicht geprüft“ markiert; die Redaktion bestätigt oder ändert sie im Backend.
-- Aktiv, damit die Scouts sie nutzen; Abo-Inhalte liest der Scout nicht (nur frei Zugängliches).
insert into source_channels (key, name, kind, url, domains, verticals, region, language, access, notes, active) values
  ('websuche', 'Websuche', 'web_search', null, '{}', '{SPORT,HOSPITALITY,LIVE}', 'GLOBAL', null, 'open',
   'Eingebaute Websuche. Pro Scout mit Revier, Stichwörtern und Domains eingegrenzt.', true),
  ('linkedin', 'LinkedIn', 'linkedin', 'https://www.linkedin.com', '{linkedin.com}', '{SPORT,HOSPITALITY,LIVE}', 'GLOBAL', null, 'open',
   'Die LinkedIn-Schnittstelle gibt keine fremden Beiträge heraus, automatisches Auslesen ist nicht erlaubt. Genutzt werden: öffentlich auffindbare Artikel über die Websuche und Beiträge, die die Redaktion als Tipp einreicht. Vollautomatisch nur über einen lizenzierten Social-Listening-Anbieter.', true),
  ('stadionwelt', 'Stadionwelt', 'website', 'https://www.stadionwelt.de', '{stadionwelt.de}', '{SPORT,LIVE}', 'DACH', 'de', 'open',
   'Fachmedium für Stadien und Arenen. Teile der Inhalte nur für Mitglieder – dafür eigenen Zugang hinterlegen.', true),
  ('sponsors', 'SPONSORs', 'website', 'https://www.sponsors.de', '{sponsors.de}', '{SPORT}', 'DACH', 'de', 'subscription',
   'Sportbusiness DACH. Viele Artikel nur im Abo.', true),
  ('sportbusiness', 'SportBusiness', 'website', 'https://www.sportbusiness.com', '{sportbusiness.com}', '{SPORT}', 'GLOBAL', 'en', 'subscription', null, true),
  ('sportspro', 'SportsPro', 'website', 'https://www.sportspromedia.com', '{sportspromedia.com}', '{SPORT}', 'GLOBAL', 'en', 'open', null, true),
  ('panstadia', 'Panstadia & Arena Management', 'website', 'https://www.panstadia.com', '{panstadia.com}', '{SPORT,LIVE}', 'GLOBAL', 'en', 'open', null, true),
  ('ahgz', 'AHGZ', 'website', 'https://www.ahgz.de', '{ahgz.de}', '{HOSPITALITY}', 'DACH', 'de', 'subscription', 'Hotel und Gastronomie DACH.', true),
  ('tophotel', 'Tophotel', 'website', 'https://www.tophotel.de', '{tophotel.de}', '{HOSPITALITY}', 'DACH', 'de', 'open', null, true),
  ('hospitalityinside', 'hospitalityInside', 'website', 'https://www.hospitalityinside.com', '{hospitalityinside.com}', '{HOSPITALITY}', 'EU', 'de', 'subscription', null, true),
  ('iq', 'IQ Magazine', 'website', 'https://www.iq-mag.net', '{iq-mag.net}', '{LIVE}', 'GLOBAL', 'en', 'open', 'Live-Musik-Business.', true),
  ('pollstar', 'Pollstar', 'website', 'https://www.pollstar.com', '{pollstar.com}', '{LIVE}', 'US', 'en', 'subscription', null, true),
  ('sbj', 'Sports Business Journal', 'website', 'https://www.sportsbusinessjournal.com', '{sportsbusinessjournal.com}', '{SPORT}', 'US', 'en', 'subscription', 'US-Vorreiter. Abo nötig.', true);

-- ───────────────────────── Startkader ─────────────────────────
-- Alle inaktiv, bis der Claude-API-Schlüssel in Vercel hinterlegt ist und die Redaktion sie einschaltet.
insert into scouts (key, name, role, shirt_number, briefing, keywords, verticals, clusters, journey_stages, audience, regions, languages) values
  ('matchday', 'Matchday & Fan Tech', 'Scout Sport · Fan Experience', 7,
   'Neue Lösungen und Piloten rund um Ticketing, Club-Apps, Personalisierung, Second Screen und Fan-Bindung. Schwerpunkt Bundesliga, Premier League und europäische Clubs.',
   '{Ticketing,Club-App,Fan Engagement,Loyalty,Second Screen,Personalisierung}', '{SPORT}', '{A,C}', '{zuhause,einlass}', 'public', '{DACH,EU}', '{de,en}'),
  ('hospitality', 'Hospitality & VIP', 'Scout Hospitality · Premium', 10,
   'Premium-Angebote, Logen, Business Seats, Event-Tourismus und Hotel-Kooperationen rund um Spiele und Events.',
   '{Hospitality,VIP,Loge,Business Seat,Event-Tourismus,Hotel}', '{SPORT,HOSPITALITY,LIVE}', '{C}', '{region,stadion}', 'vip', '{DACH,EU}', '{de,en}'),
  ('live', 'Live Entertainment', 'Scout Arenen · Konzerte · Festivals', 8,
   'Entwicklungen in Arenen, Konzert- und Festivalbetrieb: Besucherführung, Gastronomie, Multi-Use, Technik.',
   '{Arena,Konzert,Festival,Multi-Use,Venue}', '{LIVE}', '{A,D,E}', '{stadion,region}', 'both', '{DACH,EU,US}', '{de,en}'),
  ('fnb', 'Food & Beverage', 'Scout Kiosk · Zapftechnik · Pfand', 6,
   'Kassensysteme, Mobile Ordering, Zapftechnik, Self-Pour, Pfand- und Mehrwegsysteme, Küchenautomatisierung in Stadien und Arenen.',
   '{Kassensystem,Cashless,Mobile Order,Zapfanlage,Self-Pour,Pfand,Mehrweg,Catering}', '{SPORT,LIVE,HOSPITALITY}', '{B,D,F}', '{stadion}', 'public', '{DACH,EU,US}', '{de,en}'),
  ('venue', 'Venue & Infrastruktur', 'Scout Bau · Energie · Mobilität', 4,
   'Stadionbau und -modernisierung, Energie und Speicher, Mobilität, Parken und Laden, Konnektivität.',
   '{Stadionbau,Energie,Batteriespeicher,Photovoltaik,Mobilität,Parken,E-Laden,5G}', '{SPORT,LIVE}', '{D,F}', '{anreise,kulissen}', 'both', '{DACH,EU}', '{de,en}'),
  ('safety', 'Regulierung & Sicherheit', 'Scout Recht · Safety · Inklusion', 5,
   'EU AI Act, DSGVO, Sicherheits- und Crowd-Management, Barrierefreiheit und Inklusion bei Veranstaltungen.',
   '{EU AI Act,DSGVO,Crowd-Management,Sicherheit,Barrierefreiheit,Inklusion}', '{SPORT,LIVE}', '{G}', '{einlass,stadion}', 'both', '{DACH,EU}', '{de,en}'),
  ('us', 'US-Vorreiter', 'Scout USA · frühe Signale', 11,
   'Frühe Signale aus US-Ligen, Arenen und Hospitality, mit Einschätzung, was davon nach Europa kommen kann.',
   '{NFL,NBA,MLS,Arena,Fan Experience,Innovation}', '{SPORT,LIVE,HOSPITALITY}', '{}', '{}', 'both', '{US}', '{en}');


-- Websuche und LinkedIn für alle, Fachmedien passend zum Revier
insert into scout_channels (scout_id, channel_id)
select s.id, c.id from scouts s cross join source_channels c where c.key in ('websuche', 'linkedin');
insert into scout_channels (scout_id, channel_id)
select s.id, c.id from scouts s join source_channels c on c.key = any (case s.key
  when 'matchday'    then array['stadionwelt', 'sponsors', 'sportspro']
  when 'hospitality' then array['ahgz', 'tophotel', 'hospitalityinside', 'sponsors']
  when 'live'        then array['stadionwelt', 'iq', 'pollstar', 'panstadia']
  when 'fnb'         then array['stadionwelt', 'ahgz', 'panstadia']
  when 'venue'       then array['stadionwelt', 'panstadia']
  when 'safety'      then array['stadionwelt']
  when 'us'          then array['sbj', 'pollstar', 'sportspro']
end);
