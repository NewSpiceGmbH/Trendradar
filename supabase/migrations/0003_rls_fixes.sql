-- Korrekturen an den Zugriffsregeln aus 0001/0002. Jede Lücke ist in tests/db/rls.sql nachgestellt.

-- ───────────── 1. Organisationsbezogene Rechte nur bei gültigem Zugang ─────────────
-- Vorher: Owner einer abgelaufenen Org konnten weiter einladen und Mitglieder entfernen; wer in einer
-- aktiven und einer abgelaufenen Org war, las über is_member() weiter die Notizen der abgelaufenen.
create or replace function is_org_member(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m join organizations o on o.id = m.org_id
                 where m.org_id = target and m.user_id = auth.uid() and org_active(o));
$$;

create or replace function is_org_owner(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m join organizations o on o.id = m.org_id
                 where m.org_id = target and m.user_id = auth.uid() and m.role = 'owner' and org_active(o));
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and platform_role = 'admin');
$$;

-- ───────────── 2. Notizen bleiben in ihrer Organisation ─────────────
-- Vorher: notes_modify hatte kein WITH CHECK – eine Notiz ließ sich per UPDATE in eine fremde Org
-- verschieben und war dort sichtbar.
drop policy notes_modify on org_trend_notes;
drop policy notes_delete on org_trend_notes;

create policy notes_modify on org_trend_notes for update
  using (is_org_member(org_id) and (author_id = auth.uid() or is_org_owner(org_id)))
  with check (is_org_member(org_id));
create policy notes_delete on org_trend_notes for delete
  using (is_org_member(org_id) and (author_id = auth.uid() or is_org_owner(org_id)));

-- Organisation, Trend und Autor einer Notiz sind unveränderlich
create function org_trend_notes_freeze() returns trigger language plpgsql as $$
begin
  if new.org_id is distinct from old.org_id or new.trend_id is distinct from old.trend_id
     or new.author_id is distinct from old.author_id then
    raise exception 'org_trend_notes: org_id, trend_id und author_id sind unveränderlich' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger org_trend_notes_freeze before update on org_trend_notes
  for each row execute function org_trend_notes_freeze();

-- ───────────── 3. Profile: eigener Name ja, Rollen nur durch Admins ─────────────
-- Vorher: Editoren konnten jede Plattformrolle setzen, auch sich selbst zum Admin machen;
-- Nutzer konnten ihren eigenen Anzeigenamen nicht ändern.
drop policy profiles_admin on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on profiles for update
  using (is_admin()) with check (is_admin());

-- bewusst NICHT security definer: current_user muss die Rolle des Aufrufers sein
create function profiles_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'profiles: id und created_at sind unveränderlich' using errcode = '42501';
  end if;
  -- Nutzer-Rollen (anon/authenticated) dürfen Plattformrollen nur als Admin ändern.
  -- Serverseitige Wartung (postgres, service_role) ist nicht betroffen.
  if new.platform_role is distinct from old.platform_role
     and current_user in ('anon', 'authenticated') and not is_admin() then
    raise exception 'profiles: Plattformrolle darf nur ein Admin ändern' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger profiles_guard before update on profiles
  for each row execute function profiles_guard();

-- ───────────── 4. Einladungen: Systemfelder nicht frei wählbar ─────────────
-- Vorher: Owner konnten beim Anlegen z. B. accepted_at oder eine Laufzeit von Jahren setzen.
create function invitations_defaults() returns trigger language plpgsql as $$
begin
  new.created_at  := now();
  new.accepted_at := null;
  new.invited_by  := coalesce(auth.uid(), new.invited_by);
  new.expires_at  := least(coalesce(new.expires_at, now() + interval '14 days'), now() + interval '30 days');
  return new;
end; $$;
create trigger invitations_defaults before insert on invitations
  for each row execute function invitations_defaults();
