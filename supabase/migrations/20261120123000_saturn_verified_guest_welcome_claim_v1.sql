-- SAT-02 review-only migration: a verified former guest may claim the
-- normal 20-coin welcome reward exactly once on subsequent permanent login.
-- Requires saturn_guest_drafts_v1 and existing apply_coin_delta.
-- This does NOT enable Guest Mode, anonymous signup or trial claims.
create or replace function public.saturn_claim_converted_guest_welcome_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_eligible boolean := false;
  v_had_reward boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Serialize conversion claims from tabs/logins for one account.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 734315));

  -- Authoritative Auth data, not writable user metadata or JWT claims.
  select exists (
    select 1 from auth.users u
    join public.saturn_guest_drafts_v1 d on d.user_id = u.id
    where u.id = v_user
      and u.is_anonymous is false
      and u.email is not null
      and u.email_confirmed_at is not null
  ) into v_eligible;

  if not v_eligible then
    return jsonb_build_object('state', 'ineligible');
  end if;

  select exists (
    select 1 from public.user_coin_ledger l
    where l.user_id = v_user
      and l.payload_json ->> 'system_key' = 'welcome_coins_v1'
  ) into v_had_reward;

  if v_had_reward then
    return jsonb_build_object('state', 'already_granted');
  end if;

  -- apply_coin_delta also locks the wallet and de-duplicates system keys.
  perform public.apply_coin_delta(
    v_user,
    20,
    'welcome',
    jsonb_build_object(
      'system_key', 'welcome_coins_v1',
      'category', 'welcome',
      'welcome_amount', 20,
      'origin', 'saturn_verified_guest_conversion'
    )
  );

  return jsonb_build_object('state', 'granted');
end;
$$;

revoke all on function public.saturn_claim_converted_guest_welcome_v1()
  from public, anon, authenticated;
grant execute on function public.saturn_claim_converted_guest_welcome_v1()
  to authenticated;
