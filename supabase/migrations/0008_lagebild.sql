-- Lagebild im Cockpit: Meldungen nach Bereich („Lane“) – Sport & Hospitality, Startups & Technologie,
-- Cross-Industry (Orte mit hoher Frequenz: Flughäfen, Bahnhöfe, Handel, Freizeitparks, Messen).
-- Zwei neue Scouts und passende Startquellen. Zugriffsregeln bleiben unverändert: Scouts und Quellen
-- sieht nur die Redaktion (0007), Kunden nur freigegebene Meldungen zu veröffentlichten Trends (0006).

-- ───────────────────────── Lanes ─────────────────────────
alter table scouts
  add column lane text not null default 'sport_hospitality'
    check (lane in ('sport_hospitality', 'startup_tech', 'cross_industry'));

alter table signals
  add column lane text check (lane in ('sport_hospitality', 'startup_tech', 'cross_industry'));

-- Bestehende Meldungen übernehmen den Bereich ihres Scouts; ohne Scout gelten sie als Sport & Hospitality
update signals s set lane = coalesce((select sc.lane from scouts sc where sc.id = s.scout_id), 'sport_hospitality')
where s.lane is null;

create index signals_lane_found on signals (lane, found_at desc);

-- ───────────────────────── Startquellen ─────────────────────────
-- Vorschläge, als „nicht geprüft“ markiert; die Redaktion bestätigt oder ändert sie im Backend.
insert into source_channels (key, name, kind, url, domains, verticals, region, language, access, notes, active) values
  ('sifted', 'Sifted', 'website', 'https://sifted.eu', '{sifted.eu}', '{}', 'EU', 'en', 'subscription',
   'Europäische Startup-Szene. Teile nur im Abo.', true),
  ('eu_startups', 'EU-Startups', 'website', 'https://www.eu-startups.com', '{eu-startups.com}', '{}', 'EU', 'en', 'open',
   'Finanzierungsrunden und Gründungen in Europa.', true),
  ('techcrunch', 'TechCrunch', 'website', 'https://techcrunch.com', '{techcrunch.com}', '{}', 'GLOBAL', 'en', 'open', null, true),
  ('gruenderszene', 'Gründerszene', 'website', 'https://www.businessinsider.de/gruenderszene/', '{businessinsider.de}', '{}', 'DACH', 'de', 'subscription',
   'Startups DACH. Viele Artikel nur im Abo.', true),
  ('fte', 'Future Travel Experience', 'website', 'https://www.futuretravelexperience.com', '{futuretravelexperience.com}', '{}', 'GLOBAL', 'en', 'open',
   'Passagiererlebnis an Flughäfen: Self-Service, Biometrie, Wartezeiten.', true),
  ('airport_tech', 'Airport Technology', 'website', 'https://www.airport-technology.com', '{airport-technology.com}', '{}', 'GLOBAL', 'en', 'open', null, true),
  ('railway_tech', 'Railway Technology', 'website', 'https://www.railway-technology.com', '{railway-technology.com}', '{}', 'GLOBAL', 'en', 'open',
   'Bahnhöfe und Bahnbetrieb: Passagierfluss, Ticketing, Stationen.', true),
  ('retaildive', 'Retail Dive', 'website', 'https://www.retaildive.com', '{retaildive.com}', '{}', 'US', 'en', 'open',
   'Handel: Self-Checkout, Frictionless Retail, Payments.', true);

-- ───────────────────────── Neue Scouts ─────────────────────────
-- Inaktiv, bis die Redaktion sie einsetzt.
insert into scouts (key, name, role, shirt_number, lane, briefing, keywords, verticals, clusters, journey_stages, audience, regions, languages) values
  ('startups', 'Startups & Tech', 'Scout Startups · Technologie', 9, 'startup_tech',
   'Neue Startups, Finanzierungsrunden, Produktstarts und Technologien mit Bezug zu Sport, Hospitality, Live Entertainment oder Orten mit vielen Menschen: KI, Computer Vision, Payments, IoT, Robotik, Energie, Ticketing. Schwerpunkt DACH und Europa. Pro Meldung: Firma, Lösung, Reifegrad (Idee, Pilot, Kunden im Einsatz) und warum sie für Venues oder Hotels interessant ist.',
   '{Startup,Seed,Series A,Finanzierungsrunde,SportTech,HospitalityTech,KI,Computer Vision,Payments,Robotik,IoT}',
   '{SPORT,HOSPITALITY,LIVE}', '{B,C,D}', '{}', 'both', '{DACH,EU,US}', '{de,en}'),
  ('crossindustry', 'Cross-Industry & Hochfrequenz', 'Scout Flughafen · Bahnhof · Handel', 14, 'cross_industry',
   'Lösungen von Orten mit vielen Menschen und vielen Transaktionen: Flughäfen, Bahnhöfe, Handel, Freizeitparks, Messen und Quartiere. Themen: Besucherströme, Wartezeiten, Self-Checkout, Frictionless Retail, Wegeleitung, Biometrie, Gepäck und Garderobe, Energie. Immer mit Einschätzung, was davon auf Stadien, Arenen und Hotels übertragbar ist.',
   '{Flughafen,Bahnhof,Self-Checkout,Frictionless Retail,Crowd Flow,Wartezeit,Wayfinding,Biometrie,Freizeitpark,Messe}',
   '{SPORT,HOSPITALITY,LIVE}', '{A,B,D,G}', '{anreise,einlass,stadion}', 'both', '{DACH,EU,US,GLOBAL}', '{de,en}');

insert into scout_channels (scout_id, channel_id)
select s.id, c.id from scouts s join source_channels c on c.key = any (case s.key
  when 'startups'      then array['websuche', 'linkedin', 'sifted', 'eu_startups', 'techcrunch', 'gruenderszene']
  when 'crossindustry' then array['websuche', 'linkedin', 'fte', 'airport_tech', 'railway_tech', 'retaildive']
end)
where s.key in ('startups', 'crossindustry');
