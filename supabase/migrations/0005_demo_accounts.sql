-- Demo-Zugänge für den klickbaren Prototyp (Option B: eine Supabase-Datenbank für Vorschau und Produktion).
-- Passwort für alle: trendradar-demo. Login in der App über /login → „Demo-Zugänge“, nur in Vercel-Vorschauen
-- mit DEMO_LOGIN=1 (in Vercel-Produktion bleibt der Demo-Login immer aus).
--
-- VOR DEM ERSTEN ECHTEN KUNDEN ENTFERNEN – per neuer Migration, z. B.:
--   delete from organizations where id::text like 'da000000-%';
--   delete from auth.users    where id::text like 'd0000000-%';
-- oder ein frisches Produktionsprojekt (Frankfurt) ohne diese Migration aufsetzen.

-- crypt()/gen_salt() kommen aus pgcrypto, das bei Supabase im Schema „extensions“ liegt
set search_path = "$user", public, extensions;  -- wie Supabase-Standard

-- Konten
with demo(id, email, name) as (values
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'redaktion@demo.newspice.de', 'Redaktion (Demo)'),
  ('d0000000-0000-0000-0000-000000000002'::uuid, 'owner@kunde-a.demo',         'Olivia Owner (Kunde A)'),
  ('d0000000-0000-0000-0000-000000000003'::uuid, 'member@kunde-a.demo',        'Max Member (Kunde A)'),
  ('d0000000-0000-0000-0000-000000000004'::uuid, 'premium@kunde-p.demo',       'Paula Premium (Kunde P)'),
  ('d0000000-0000-0000-0000-000000000005'::uuid, 'ablauf@kunde-x.demo',        'Xaver Ablauf (Kunde X)')
)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
       crypt('trendradar-demo', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('name', name), now(), now(),
       '', '', '', ''
from demo
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.id::text like 'd0000000-0000-0000-0000-00000000000%'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- Profile legt der Trigger handle_new_user an
update profiles set platform_role = 'admin' where id = 'd0000000-0000-0000-0000-000000000001';

-- Organisationen
insert into organizations (id, name, slug, tier, seats, access_from, access_until) values
  ('da000000-0000-0000-0000-00000000000a', 'Kunde A (Demo)', 'kunde-a', 'basic',   5, current_date - 300, current_date + 21),
  ('da000000-0000-0000-0000-00000000000b', 'Kunde P (Demo)', 'kunde-p', 'premium', 5, current_date - 30,  null),
  ('da000000-0000-0000-0000-00000000000c', 'Kunde X (Demo)', 'kunde-x', 'premium', 5, current_date - 400, current_date - 1)
on conflict (id) do nothing;

insert into memberships (org_id, user_id, role) values
  ('da000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000002', 'owner'),
  ('da000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000003', 'member'),
  ('da000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000004', 'member'),
  ('da000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-000000000005', 'member')
on conflict do nothing;
