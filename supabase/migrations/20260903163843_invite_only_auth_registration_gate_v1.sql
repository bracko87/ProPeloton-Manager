create table if not exists public.registration_email_allowlist_v1 (
  email_norm text primary key,
  status text not null default 'allowed' check (status in ('allowed','consumed','revoked')),
  note text,
  allowed_at timestamptz not null default now(),
  consumed_at timestamptz,
  auth_user_id uuid unique
);

alter table public.registration_email_allowlist_v1 enable row level security;
revoke all on public.registration_email_allowlist_v1 from anon, authenticated;

create or replace function public.enforce_invite_only_auth_signup_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_status text;
begin
  v_email := lower(trim(coalesce(new.email, '')));

  if v_email = '' then
    raise exception using errcode = 'P0001', message = 'Registration is currently invitation only.';
  end if;

  select a.status
  into v_status
  from public.registration_email_allowlist_v1 a
  where a.email_norm = v_email;

  if coalesce(v_status, '') <> 'allowed' then
    raise exception using errcode = 'P0001', message = 'Registration is currently invitation only.';
  end if;

  return new;
end;
$$;

create or replace function public.consume_registration_invite_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.registration_email_allowlist_v1
  set status = 'consumed',
      consumed_at = now(),
      auth_user_id = new.id
  where email_norm = lower(trim(coalesce(new.email, '')))
    and status = 'allowed';

  return new;
end;
$$;

drop trigger if exists auth_users_invite_only_gate_v1 on auth.users;
create trigger auth_users_invite_only_gate_v1
before insert on auth.users
for each row execute function public.enforce_invite_only_auth_signup_v1();

drop trigger if exists zz_auth_users_consume_registration_invite_v1 on auth.users;
create trigger zz_auth_users_consume_registration_invite_v1
after insert on auth.users
for each row execute function public.consume_registration_invite_v1();
