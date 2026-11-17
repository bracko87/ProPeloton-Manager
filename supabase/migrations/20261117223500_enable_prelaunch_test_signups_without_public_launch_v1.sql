-- Pre-release user registration is intentionally NOT the same as public launch.
-- Applied to live Supabase on 2026-11-17 after explicit owner authorization.
-- User accounts/team identities stay; test-season gameplay will be reset again.
-- Do not set launch_approved_at until explicit launch approval.
alter table private.ppm_public_registration_gate_v1
  add column if not exists registration_phase text not null default 'closed';

do $gatecheck$
begin
 if not exists (
   select 1 from pg_constraint
    where conrelid='private.ppm_public_registration_gate_v1'::regclass
      and conname='ppm_public_registration_gate_phase_chk_v1'
 ) then
   alter table private.ppm_public_registration_gate_v1
     add constraint ppm_public_registration_gate_phase_chk_v1
       check (registration_phase in ('closed','prelaunch_test','public_launch'));
 end if;
end $gatecheck$;

create or replace function public.ppm_block_new_auth_accounts_until_launch_v1()
returns trigger language plpgsql security definer
set search_path to ''
as $registration$
begin
  if not exists (
    select 1 from private.ppm_public_registration_gate_v1 g
    where g.id=true and g.registration_open=true
      and (
        g.registration_phase='prelaunch_test'
        or (
          g.registration_phase='public_launch'
          and g.launch_approved_at is not null
        )
      )
  ) then
    raise exception using
      errcode='P0001',
      message='Registration is temporarily closed. Please check the ProPeloton Manager website for updates.';
  end if;
  return new;
end;
$registration$;
revoke all on function public.ppm_block_new_auth_accounts_until_launch_v1() from public,anon,authenticated;

update private.ppm_public_registration_gate_v1
set registration_phase='prelaunch_test',
    registration_open=true,
    launch_approved_at=null,
    reason='Pre-release test registration open. One final progress reset is required before public launch.',
    updated_at=clock_timestamp()
where id=true;
