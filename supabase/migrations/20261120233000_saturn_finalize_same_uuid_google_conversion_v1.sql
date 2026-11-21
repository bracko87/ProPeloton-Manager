-- SAT-02 Google conversion only. Requires existing SAT-02 email finalizer
-- migration, original 14-day lifecycle and securely linked Supabase Auth
-- Google identity. Never calls signInWithOAuth or creates another Auth user.
-- Production Guest Mode stays OFF until end-to-end OAuth staging tests pass.

create or replace function public.saturn_finalize_test_account_google_conversion_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_trial record;
begin
  if v_uid is null then
    raise exception 'Authentication required for conversion'
      using errcode='28000';
  end if;

  select t.user_id,t.club_id,t.converted_at
  into v_trial
  from public.saturn_test_accounts_v1 t
  where t.user_id=v_uid
  for update;
  if not found then
    raise exception 'Original test-account lifecycle not found'
      using errcode='42501';
  end if;

  -- The existing anonymous user MUST now be a permanent Auth identity.
  -- An identity returned in the user's own metadata is not sufficient:
  -- check the canonical auth.identities relationship and provider.
  if not exists(
    select 1 from auth.users u
    where u.id=v_uid and u.is_anonymous is false
  ) or not exists (
    select 1 from auth.identities i
    where i.user_id=v_uid
      and i.provider='google'
  ) then
    raise exception 'Google identity was not linked to the original account'
      using errcode='42501';
  end if;

  if not exists(
    select 1 from public.clubs c
    where c.id=v_trial.club_id
      and c.owner_user_id=v_uid
      and c.club_type='main'
      and c.is_ai is false
  ) or not exists(
    select 1 from public.club_memberships m
    where m.club_id=v_trial.club_id
      and m.user_id=v_uid
      and m.role='owner'
  ) then
    raise exception 'Original team ownership could not be verified'
      using errcode='42501';
  end if;

  if v_trial.converted_at is null then
    update public.saturn_test_accounts_v1
    set converted_at=now()
    where user_id=v_uid and converted_at is null;
  end if;

  return jsonb_build_object(
    'success',true,
    'user_id',v_uid,
    'club_id',v_trial.club_id,
    'converted',true,
    'provider','google',
    'premium_restarted',false
  );
end;
$$;

revoke all on function public.saturn_finalize_test_account_google_conversion_v1()
from public, anon, authenticated;
grant execute on function public.saturn_finalize_test_account_google_conversion_v1()
to authenticated;
