drop trigger if exists auth_users_invite_only_gate_v1 on auth.users;
drop trigger if exists zz_auth_users_consume_registration_invite_v1 on auth.users;
drop function if exists public.enforce_invite_only_auth_signup_v1();
drop function if exists public.consume_registration_invite_v1();
drop table if exists public.registration_email_allowlist_v1;
