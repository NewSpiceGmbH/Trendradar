-- Minimaler Ersatz für das, was Supabase in jeder Datenbank bereitstellt (auth-Schema, Rollen,
-- Standardrechte). Nur für Tests gegen ein nacktes Postgres (CI). Gegen Supabase lokal nicht nötig.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema auth;
create table auth.users (
  instance_id            uuid,
  id                     uuid primary key default gen_random_uuid(),
  aud                    text,
  role                   text,
  email                  text unique,
  encrypted_password     text,
  email_confirmed_at     timestamptz,
  raw_app_meta_data      jsonb not null default '{}',
  raw_user_meta_data     jsonb not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,
  confirmation_token     text,
  email_change           text,
  email_change_token_new text,
  recovery_token         text
);
create table auth.identities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider_id     text not null,
  identity_data   jsonb not null,
  provider        text not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  unique (provider_id, provider)
);

-- wie in Supabase: Nutzer-ID aus den JWT-Claims der Anfrage
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
