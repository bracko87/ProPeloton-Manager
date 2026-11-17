-- Final Season 1 prelaunch test: fail-closed registration gate.
-- This is separate from the season migration status, which can be 'off'
-- even when the game is not publicly launched.
-- Existing accounts can sign in. Never automatically reopen this gate
-- after a clock restart, a deployment, or the end of a test.
create table if not exists private.ppm_public_registration_gate_v1 (
  id boolean primary key default true check(id),
  registration_open boolean not null default false,
  reason text not null default 'Final prelaunch Season 1 test: registrations temporarily closed',
  launch_approved_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);
revoke all on private.ppm_public_registration_gate_v1 from public, anon, authenticated;
insert into private.ppm_public_registration_gate_v1
 (id, registration_open, reason, launch_approved_at, updated_at)
values (true, false,
 'Final prelaunch Season 1 test: registrations temporarily closed', null, clock_timestamp())
on conflict (id) do update
set registration_open=false,
    reason='Final prelaunch Season 1 test: registrations temporarily closed',
    launch_approved_at=null,
    updated_at=clock_timestamp();

create or replace function public.ppm_block_new_auth_accounts_until_launch_v1()
returns trigger language plpgsql security definer
set search_path to ''
as $registration$
begin
 if not exists (
   select 1 from private.ppm_public_registration_gate_v1 g
   where g.id=true and g.registration_open=true and g.launch_approved_at is not null
 ) then
   raise exception using
     errcode='P0001',
     message='Registration is temporarily closed during the final prelaunch Season 1 test. Existing players can sign in.';
 end if;
 return new;
end;
$registration$;
revoke all on function public.ppm_block_new_auth_accounts_until_launch_v1()
 from public, anon, authenticated;
drop trigger if exists ppm_block_new_auth_accounts_until_launch_v1 on auth.users;
create trigger ppm_block_new_auth_accounts_until_launch_v1
 before insert on auth.users for each row
 execute function public.ppm_block_new_auth_accounts_until_launch_v1();
