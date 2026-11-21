-- SAT-02: finalize anonymous -> email/password conversion under the ORIGINAL
-- Supabase Auth UUID. The Auth identity upgrade itself is done with
-- supabase.auth.updateUser(), not by inserting another auth.users row.
-- No changed team ownership, finances, Premium clocks, race history or Coins.
-- Never enable this feature until complete staging Auth/JWT tests pass.

create or replace function public.saturn_finalize_test_account_email_conversion_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_auth record;
  v_trial record;
begin
  if v_uid is null then
    raise exception 'Authentication required for conversion' using errcode='28000';
  end if;

  -- Lock only the current user's lifecycle row. We never accept arbitrary
  -- user_id, club_id, team owner, premium expiration or conversion timestamps
  -- from the browser.
  select t.user_id,t.club_id,t.converted_at,t.started_at,t.expires_at
    into v_trial
    from public.saturn_test_accounts_v1 t
    where t.user_id=v_uid for update;
  if not found then
    raise exception 'Original test-account lifecycle not found' using errcode='42501';
  end if;

  -- Email + credential must have been linked in Supabase Auth by the SAME ID.
  -- Check canonical auth.users rather than self-editable client metadata.
  select u.id,u.email,u.email_confirmed_at,u.encrypted_password,u.is_anonymous
    into v_auth from auth.users u where u.id=v_uid;
  if not found or v_auth.is_anonymous is distinct from false
      or nullif(btrim(coalesce(v_auth.email,'')),'') is null
      or v_auth.email_confirmed_at is null
      or nullif(btrim(coalesce(v_auth.encrypted_password,'')),'') is null then
    raise exception 'Complete email verification and password setup on the original account first'
      using errcode='42501';
  end if;

  if not exists(
    select 1 from public.clubs c
    where c.id=v_trial.club_id and c.owner_user_id=v_uid
      and c.is_ai is false and c.club_type='main'
  ) or not exists (
    select 1 from public.club_memberships m
    where m.club_id=v_trial.club_id and m.user_id=v_uid and m.role='owner'
  ) then
    raise exception 'Original test team identity cannot be verified'
      using errcode='42501';
  end if;

  -- Idempotent, safe to retry after an interrupted post-email browser flow.
  -- Never move or reset the original trial period.
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
    'premium_restarted',false
  );
end;
$$;

-- Unlike the creation RPC, the finalizer must be called by an already
-- authenticated verified email/password account. It never alters auth.users
-- or lets an arbitrary user mutate a different trial.
revoke all on function public.saturn_finalize_test_account_email_conversion_v1()
  from public, anon, authenticated;
grant execute on function public.saturn_finalize_test_account_email_conversion_v1()
  to authenticated;
