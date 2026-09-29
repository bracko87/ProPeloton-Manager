do $$
begin
  if to_regprocedure('public.finance_charge_race_cost_non_ai_core_v1(uuid,uuid,bigint,jsonb)') is null then
    alter function public.finance_charge_race_cost(uuid,uuid,bigint,jsonb)
      rename to finance_charge_race_cost_non_ai_core_v1;
  end if;
end
$$;

create or replace function public.finance_charge_race_cost(
  p_club_id uuid,
  p_race_id uuid,
  p_amount bigint,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_is_ai boolean := false;
  v_club_acct uuid;
  v_existing uuid;
begin
  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=p_club_id;

  if not v_is_ai then
    return public.finance_charge_race_cost_non_ai_core_v1(
      p_club_id,p_race_id,p_amount,p_metadata
    );
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Race cost amount must be > 0';
  end if;

  select l.transaction_id
    into v_existing
  from finance.event_locks l
  where l.event_type='race_cost'
    and l.club_id=p_club_id
    and l.ref_id=p_race_id
  limit 1;

  if v_existing is not null then
    return public.finance_charge_race_cost_non_ai_core_v1(
      p_club_id,p_race_id,p_amount,p_metadata
    );
  end if;

  perform public.finance_get_or_create_club_account(p_club_id,'CASH','main');

  select a.id
    into v_club_acct
  from finance.accounts a
  where a.club_id=p_club_id
    and a.currency='CASH'
    and a.kind='main'
  limit 1;

  insert into finance.account_balances(account_id,balance)
  values (v_club_acct,0)
  on conflict (account_id) do nothing;

  update finance.account_balances
  set balance=greatest(balance,p_amount)
  where account_id=v_club_acct;

  return public.finance_charge_race_cost_non_ai_core_v1(
    p_club_id,p_race_id,p_amount,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object(
      'ai_unlimited_funds',true,
      'ai_finance_policy','unlimited_funds_no_insolvency'
    )
  );
end;
$$;