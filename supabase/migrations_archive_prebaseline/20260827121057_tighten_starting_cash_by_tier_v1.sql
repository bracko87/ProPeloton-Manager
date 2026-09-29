-- ProPeloton Manager economy balance: canonical starting cash by tier.
--
-- New player-controlled main clubs:
--   WorldTeam    1,750,000
--   ProTeam      1,000,000
--   Continental    600,000
--   Amateur        300,000
-- Developing teams and AI-finance-disabled clubs remain at 0 real starting cash.
--
-- NOTE: The one-time S1 production balance rebase performed on 2026-08-27 is
-- intentionally NOT included here. That operation preserved already-earned
-- sponsor income / post-reset expenses and must not be replayed generically.

update public.team_tier_balance_profiles
set starting_cash_user = case tier_key
  when 'worldteam' then 1750000
  when 'proteam' then 1000000
  when 'continental' then 600000
  when 'amateur' then 300000
  when 'developing_u23' then 0
  else starting_cash_user
end,
updated_at = now()
where tier_key in ('worldteam','proteam','continental','amateur','developing_u23');

-- Retire the legacy flat bonus. Tier profiles are the authoritative source.
update public.economy_config
set value_bigint = 0,
    updated_at = now()
where key = 'new_club_bonus_cash';

create or replace function public.get_club_starting_cash_v1(p_club_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_amount bigint;
begin
  select case
    when coalesce(c.is_ai,false) = true
      or c.owner_user_id is null
      or coalesce(c.club_type,'main') = 'developing'
      then 0::bigint
    else coalesce(tbp.starting_cash_user,0)::bigint
  end
  into v_amount
  from public.clubs c
  left join public.team_tier_balance_profiles tbp
    on tbp.tier_key = public._get_club_balance_tier_key(c.id)
  where c.id = p_club_id;

  if not found then
    raise exception 'Club not found: %', p_club_id;
  end if;

  return coalesce(v_amount,0);
end;
$$;

create or replace function public.finance_grant_new_club_bonus(
  p_club_id uuid,
  p_amount bigint default null::bigint
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_amount bigint;
  v_tx uuid;
  v_club_acct uuid;
  v_treasury uuid;
  v_derived boolean := p_amount is null;
begin
  if p_club_id is null then
    raise exception 'p_club_id is required';
  end if;

  if v_derived then
    v_amount := public.get_club_starting_cash_v1(p_club_id);
    -- AI/developing clubs intentionally use no real starting finance.
    if coalesce(v_amount,0) <= 0 then
      return null;
    end if;
  else
    v_amount := p_amount;
    if v_amount <= 0 then
      raise exception 'Bonus amount must be > 0';
    end if;
  end if;

  insert into finance.accounts(club_id, currency, kind)
  values (p_club_id, 'CASH', 'main')
  on conflict (club_id, currency, kind) do nothing;

  select id into v_club_acct
  from finance.accounts
  where club_id=p_club_id and currency='CASH' and kind='main';

  select id into v_treasury
  from finance.accounts
  where system_code='TREASURY' and currency='CASH' and kind='main';

  if v_treasury is null then
    raise exception 'TREASURY cash account not found';
  end if;

  v_tx := extensions.gen_random_uuid();

  begin
    insert into finance.transactions(id, type, created_by, metadata)
    values (
      v_tx,
      'new_club_bonus',
      auth.uid(),
      jsonb_build_object(
        'club_id', p_club_id,
        'amount', v_amount,
        'source', case when v_derived then 'team_tier_balance_profiles' else 'explicit_amount' end
      )
    );

    insert into finance.event_locks(event_type, club_id, ref_id, transaction_id)
    values ('new_club_bonus', p_club_id, p_club_id, v_tx);
  exception when unique_violation then
    select transaction_id into v_tx
    from finance.event_locks
    where event_type='new_club_bonus' and club_id=p_club_id and ref_id=p_club_id;
    return v_tx;
  end;

  insert into finance.entries(transaction_id, account_id, amount, memo)
  values
    (v_tx, v_treasury, -v_amount, 'new club starting cash debit'),
    (v_tx, v_club_acct, v_amount, 'new club starting cash credit');

  return v_tx;
end;
$$;

-- Keep legacy restart helpers aligned with the canonical values.
-- These helpers predate team_tier_balance_profiles and still contain a small
-- tier CASE internally, so patch those literals during migration.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
  v_name text;
begin
  foreach v_name in array array[
    'restart_cleanup_final_visible_sources_v1',
    'restart_cleanup_finance_sponsor_visible_state_v1'
  ]
  loop
    select p.oid into v_oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=v_name
      and pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_club_id uuid'
    limit 1;

    if v_oid is null then
      raise exception 'Required restart helper not found: %', v_name;
    end if;

    v_def := pg_get_functiondef(v_oid);
    v_new := v_def;
    v_new := replace(v_new, 'when ''worldteam'' then 5000000', 'when ''worldteam'' then 1750000');
    v_new := replace(v_new, 'when ''world_team'' then 5000000', 'when ''world_team'' then 1750000');
    v_new := replace(v_new, 'when ''world tour'' then 5000000', 'when ''world tour'' then 1750000');
    v_new := replace(v_new, 'when ''proteam'' then 2000000', 'when ''proteam'' then 1000000');
    v_new := replace(v_new, 'when ''pro_team'' then 2000000', 'when ''pro_team'' then 1000000');
    v_new := replace(v_new, 'when ''continental'' then 1100000', 'when ''continental'' then 600000');
    v_new := replace(v_new, 'when ''amateur'' then 500000', 'when ''amateur'' then 300000');

    if v_new = v_def then
      raise exception 'No starting-cash literals replaced in %', v_name;
    end if;

    execute v_new;
  end loop;
end;
$$;
