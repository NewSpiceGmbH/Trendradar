-- Redaktions-Backend: Felder für Journey und Zielgruppe, Liveticker, Bearbeiten/Freigeben in Transaktionen,
-- Versionshistorie mit Wiederherstellen, Teamverwaltung. Rein additiv – bestehende Abfragen laufen unverändert.
-- Tests: tests/db/redaktion.test.sql

-- ───────────────────────── 1. Journey und Zielgruppe ─────────────────────────
alter table trends
  add column journey_stage text not null default 'stadion'
    check (journey_stage in ('zuhause', 'anreise', 'region', 'einlass', 'stadion', 'kulissen')),
  add column audience text not null default 'both'
    check (audience in ('vip', 'public', 'both'));

-- Startwerte wie bisher im Code (lib/stadium/journey.ts, lib/stadium/audience.ts)
update trends set journey_stage = 'zuhause'  where number in (1, 2, 4, 5, 7, 12, 14, 15, 17, 30, 44);
update trends set journey_stage = 'anreise'  where number in (32, 37);
update trends set journey_stage = 'region'   where number in (6, 16, 21, 22, 28, 29, 33);
update trends set journey_stage = 'einlass'  where number in (18, 27, 38, 39);
update trends set journey_stage = 'kulissen' where number in (8, 20, 31, 34, 35, 36, 40, 41);
update trends set audience = 'vip'    where number in (6, 9, 13, 16, 22, 33);
update trends set audience = 'public' where number in (3, 17, 19, 24, 25, 26, 28, 29, 30, 32, 44);

-- ───────────────────────── 2. Liveticker ─────────────────────────
-- Meldungen (signals) erscheinen im Ticker erst nach einzelner Freigabe durch die Redaktion.
alter table signals
  add column published_at timestamptz,
  add column published_by uuid references auth.users(id),
  add constraint signals_published_needs_trend check (published_at is null or trend_id is not null);
create index signals_published on signals (published_at desc) where published_at is not null;

-- Kunden lesen nur freigegebene Meldungen zu veröffentlichten Trends
create policy signals_read_published on signals for select using (
  published_at is not null and is_member()
  and exists (select 1 from trends t where t.id = signals.trend_id and t.status = 'published'));

-- ───────────────────────── 3. Bearbeiten in einer Transaktion ─────────────────────────
-- Snapshot und Patch haben dasselbe Format, damit sich jede Version wiederherstellen lässt:
-- { "fields": {…Spalten von trends…},
--   "scores": { "GLOBAL": [{criterion, score, rationale}], "EU": [...] },     -- Liste ersetzt die Perspektive
--   "perspectives": { "GLOBAL": {horizon, note}, "EU": {horizon, note} | null },  -- null löscht die EU-Abweichung
--   "relevance": { "SPORT": 3, "HOSPITALITY": 2, "LIVE": 1 } }

create function trend_snapshot(p_trend int) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'fields', (select jsonb_build_object(
        'number', number, 'name', name, 'cluster_code', cluster_code, 'focus_code', focus_code,
        'subtopic_id', subtopic_id, 'origin', origin, 'description', description, 'use_cases', use_cases,
        'best_practice', best_practice, 'signals_summary', signals_summary, 'opportunities', opportunities,
        'risks', risks, 'evidence', evidence, 'uncertain', uncertain, 'mandatory', mandatory, 'status', status,
        'journey_stage', journey_stage, 'audience', audience)
      from trends where id = p_trend),
    'scores', jsonb_build_object(
      'GLOBAL', coalesce((select jsonb_agg(jsonb_build_object('criterion', criterion, 'score', score, 'rationale', rationale) order by criterion)
                          from trend_scores where trend_id = p_trend and perspective = 'GLOBAL'), '[]'),
      'EU', coalesce((select jsonb_agg(jsonb_build_object('criterion', criterion, 'score', score, 'rationale', rationale) order by criterion)
                      from trend_scores where trend_id = p_trend and perspective = 'EU'), '[]')),
    'perspectives', jsonb_build_object(
      'GLOBAL', (select jsonb_build_object('horizon', horizon, 'note', note) from trend_perspectives where trend_id = p_trend and perspective = 'GLOBAL'),
      'EU', (select jsonb_build_object('horizon', horizon, 'note', note) from trend_perspectives where trend_id = p_trend and perspective = 'EU')),
    'relevance', coalesce((select jsonb_object_agg(industry_code, relevance) from trend_relevance where trend_id = p_trend), '{}'));
$$;

-- wendet einen Patch an (nur intern; Aufrufer prüfen Rechte und schreiben den Snapshot)
create function apply_trend_patch(p_trend int, p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare f jsonb := coalesce(p->'fields', '{}'); persp text; item jsonb;
begin
  update trends set
    name            = case when f ? 'name' then f->>'name' else name end,
    cluster_code    = case when f ? 'cluster_code' then f->>'cluster_code' else cluster_code end,
    focus_code      = case when f ? 'focus_code' then f->>'focus_code' else focus_code end,
    subtopic_id     = case when f ? 'subtopic_id' then (f->>'subtopic_id')::int else subtopic_id end,
    origin          = case when f ? 'origin' then (f->>'origin')::origin_region else origin end,
    description     = case when f ? 'description' then f->>'description' else description end,
    use_cases       = case when f ? 'use_cases' then f->>'use_cases' else use_cases end,
    best_practice   = case when f ? 'best_practice' then f->>'best_practice' else best_practice end,
    signals_summary = case when f ? 'signals_summary' then f->>'signals_summary' else signals_summary end,
    opportunities   = case when f ? 'opportunities' then f->>'opportunities' else opportunities end,
    risks           = case when f ? 'risks' then f->>'risks' else risks end,
    evidence        = case when f ? 'evidence' then (f->>'evidence')::evidence else evidence end,
    uncertain       = case when f ? 'uncertain' then (f->>'uncertain')::boolean else uncertain end,
    mandatory       = case when f ? 'mandatory' then (f->>'mandatory')::boolean else mandatory end,
    status          = case when f ? 'status' then (f->>'status')::content_status else status end,
    journey_stage   = case when f ? 'journey_stage' then f->>'journey_stage' else journey_stage end,
    audience        = case when f ? 'audience' then f->>'audience' else audience end
  where id = p_trend;
  if not found then raise exception 'trend_not_found' using errcode = 'P0002'; end if;

  for persp in select jsonb_object_keys(coalesce(p->'scores', '{}')) loop
    delete from trend_scores where trend_id = p_trend and perspective = persp::perspective;
    for item in select jsonb_array_elements(p->'scores'->persp) loop
      insert into trend_scores (trend_id, perspective, criterion, score, rationale)
      values (p_trend, persp::perspective, (item->>'criterion')::smallint, (item->>'score')::smallint, item->>'rationale');
    end loop;
  end loop;

  for persp in select jsonb_object_keys(coalesce(p->'perspectives', '{}')) loop
    if jsonb_typeof(p->'perspectives'->persp) = 'null' then
      delete from trend_perspectives where trend_id = p_trend and perspective = persp::perspective;
    else
      insert into trend_perspectives (trend_id, perspective, horizon, note)
      values (p_trend, persp::perspective, (p->'perspectives'->persp->>'horizon')::horizon, p->'perspectives'->persp->>'note')
      on conflict (trend_id, perspective) do update set horizon = excluded.horizon, note = excluded.note;
    end if;
  end loop;

  if p ? 'relevance' then
    delete from trend_relevance where trend_id = p_trend;
    insert into trend_relevance (trend_id, industry_code, relevance)
    select p_trend, key, value::smallint from jsonb_each_text(p->'relevance');
  end if;
end $$;

create function require_editor() returns void
language plpgsql stable set search_path = public as $$
begin
  if not is_editor() then raise exception 'nur_redaktion' using errcode = '42501'; end if;
end $$;

-- Redaktionelle Bearbeitung: Snapshot vorher, dann Patch – alles oder nichts
create function edit_trend(p_trend int, p_patch jsonb, p_proposal uuid default null) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform require_editor();
  insert into trend_versions (trend_id, snapshot, changed_by, proposal_id)
  values (p_trend, trend_snapshot(p_trend), auth.uid(), p_proposal);
  perform apply_trend_patch(p_trend, p_patch);
end $$;

-- Neuer Trend: nächste freie Nummer, Patch anwenden; Rückgabe = trends.id
create function create_trend(p_patch jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare f jsonb := coalesce(p_patch->'fields', '{}'); new_id int;
begin
  perform require_editor();
  insert into trends (number, name, cluster_code, focus_code, origin, description, evidence, status)
  values (coalesce((f->>'number')::int, (select coalesce(max(number), 0) + 1 from trends)),
          f->>'name', f->>'cluster_code', f->>'focus_code', coalesce((f->>'origin')::origin_region, 'GLOBAL'),
          coalesce(f->>'description', ''), coalesce((f->>'evidence')::evidence, 'C'), 'draft')
  returning id into new_id;
  perform apply_trend_patch(new_id, p_patch);
  return new_id;
end $$;

-- Wiederherstellen: aktuellen Stand sichern, dann alten Snapshot anwenden (Nummer bleibt)
create function restore_trend_version(p_version bigint) returns void
language plpgsql security invoker set search_path = public as $$
declare v trend_versions;
begin
  perform require_editor();
  select * into v from trend_versions where id = p_version;
  if v.id is null then raise exception 'version_not_found' using errcode = 'P0002'; end if;
  if not (v.snapshot ? 'fields') then raise exception 'version_leer'; end if;  -- Eintrag „neu angelegt“
  perform edit_trend(v.trend_id, jsonb_set(v.snapshot, '{fields}', (v.snapshot->'fields') - 'number'));
end $$;

-- ───────────────────────── 4. Review-Queue ─────────────────────────
-- Freigabe eines Agenten-Vorschlags. p_payload ersetzt den Vorschlag („Bearbeiten und freigeben“).
-- Formate je kind:
--   update_trend:  Patch (siehe oben)
--   score_change:  { perspective, horizon?, scores: [{criterion, score, rationale}], eu_note? }
--   new_trend:     Patch mit fields (inkl. name, cluster_code, focus_code …); wird direkt veröffentlicht
--   attach_signal: { signal_id, publish?: bool, fields?: {best_practice | signals_summary} }
--   new_source:    { id?, title, publisher?, url, published_label?, perspective? }  → an target_trend_id
create function approve_proposal(p_id uuid, p_payload jsonb default null, p_note text default null) returns int
language plpgsql security invoker set search_path = public as $$
declare pr proposals; pl jsonb; tid int; sc jsonb; src_id text;
begin
  perform require_editor();
  select * into pr from proposals where id = p_id for update;
  if pr.id is null then raise exception 'proposal_not_found' using errcode = 'P0002'; end if;
  if pr.status <> 'pending' then raise exception 'proposal_already_reviewed'; end if;
  pl := coalesce(p_payload, pr.payload);
  tid := coalesce(pr.target_trend_id, (select id from trends where number = (pl->>'trend_number')::int));
  if pr.kind <> 'new_trend' and tid is null then raise exception 'trend_fehlt'; end if;

  case pr.kind
    when 'update_trend' then
      perform edit_trend(tid, pl, p_id);
    when 'score_change' then
      sc := jsonb_build_object('scores', jsonb_build_object(pl->>'perspective', pl->'scores'));
      if pl ? 'horizon' or pl ? 'eu_note' then
        sc := sc || jsonb_build_object('perspectives', jsonb_build_object(pl->>'perspective',
          jsonb_build_object('horizon', pl->>'horizon', 'note', pl->>'eu_note')));
      end if;
      perform edit_trend(tid, sc, p_id);
    when 'new_trend' then
      tid := create_trend(pl);
      perform apply_trend_patch(tid, jsonb_build_object('fields', jsonb_build_object('status', 'published')));
      insert into trend_versions (trend_id, snapshot, changed_by, proposal_id) values (tid, '{}', auth.uid(), p_id);
    when 'attach_signal' then
      update signals set trend_id = tid, status = 'assigned',
        published_at = case when coalesce((pl->>'publish')::boolean, false) then now() else published_at end,
        published_by = case when coalesce((pl->>'publish')::boolean, false) then auth.uid() else published_by end
      where id = (pl->>'signal_id')::uuid;
      if pl ? 'fields' then perform edit_trend(tid, jsonb_build_object('fields', pl->'fields'), p_id); end if;
    when 'new_source' then
      src_id := coalesce(pl->>'id', 's-' || left(replace(gen_random_uuid()::text, '-', ''), 8));
      insert into sources (id, title, publisher, url, published_label)
      values (src_id, pl->>'title', pl->>'publisher', pl->>'url', pl->>'published_label')
      on conflict (url) do update set title = excluded.title returning id into src_id;
      insert into trend_sources (trend_id, source_id, perspective)
      values (tid, src_id, coalesce((pl->>'perspective')::perspective, 'GLOBAL')) on conflict do nothing;
  end case;

  update proposals set status = 'approved', payload = pl, target_trend_id = tid,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  where id = p_id;
  return tid;
end $$;

create function reject_proposal(p_id uuid, p_note text) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform require_editor();
  if coalesce(trim(p_note), '') = '' then raise exception 'begruendung_fehlt'; end if;
  update proposals set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  where id = p_id and status = 'pending';
  if not found then raise exception 'proposal_not_pending'; end if;
end $$;

-- ───────────────────────── 5. Team ─────────────────────────
-- E-Mail-Adressen liegen in auth.users; nur Admins sehen die Redaktion mit Adresse.
create function team_members() returns table (id uuid, email text, display_name text, platform_role platform_role)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.display_name, p.platform_role
  from profiles p join auth.users u on u.id = p.id
  where is_admin() and p.platform_role in ('admin', 'editor')
  order by u.email;
$$;

-- Rolle per E-Mail vergeben (Konto muss existieren); nur Admins
create function set_platform_role(p_email text, p_role platform_role) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_admin() then raise exception 'nur_admin' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'konto_unbekannt'; end if;
  if uid = auth.uid() and p_role <> 'admin' then raise exception 'eigene_rolle'; end if;
  update profiles set platform_role = p_role where id = uid;
end $$;

-- apply_trend_patch läuft mit den Rechten des Aufrufers: schreiben dürfen laut RLS nur Redaktion; anonym gar nicht
revoke execute on function apply_trend_patch(int, jsonb) from public, anon;
revoke execute on function team_members() from public, anon;
revoke execute on function set_platform_role(text, platform_role) from public, anon;
