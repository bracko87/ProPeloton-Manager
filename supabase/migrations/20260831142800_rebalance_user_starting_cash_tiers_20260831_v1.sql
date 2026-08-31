update public.team_tier_balance_profiles
set
  starting_cash_user = case tier_key
    when 'worldteam' then 2500000
    when 'proteam' then 1600000
    when 'continental' then 1000000
    when 'amateur' then 500000
    else starting_cash_user
  end,
  updated_at = now()
where tier_key in ('worldteam','proteam','continental','amateur');

do $$
declare
  r record;
  v_delta bigint;
  v_new_starting_cash bigint;
begin
  perform set_config('finance.internal', '1', true);

  for r in
    select c.id, c.name, c.club_tier::text as tier
    from public.clubs c
    where c.deleted_at is null
      and coalesce(c.is_active, true) = true
      and coalesce(c.is_ai, false) = false
      and c.owner_user_id is not null
      and coalesce(c.club_type, 'main') = 'main'
      and c.club_tier::text in ('worldteam','proteam','continental','amateur')
    order by c.id
  loop
    v_delta := case r.tier
      when 'worldteam' then 750000
      when 'proteam' then 600000
      when 'continental' then 400000
      when 'amateur' then 200000
      else 0
    end;

    v_new_starting_cash := case r.tier
      when 'worldteam' then 2500000
      when 'proteam' then 1600000
      when 'continental' then 1000000
      when 'amateur' then 500000
      else 0
    end;

    if v_delta > 0 then
      perform public.finance_credit_to_club(
        r.id,
        v_delta,
        'new_club_bonus',
        'TREASURY',
        'starter_cash_rebalance_20260831_v1:' || r.id::text,
        jsonb_build_object(
          'reason', 'starter_cash_rebalance_20260831_v1',
          'club_id', r.id,
          'club_name', r.name,
          'tier_key', r.tier,
          'old_starting_cash', v_new_starting_cash - v_delta,
          'new_starting_cash', v_new_starting_cash,
          'one_time_equalization_amount', v_delta,
          'applies_to_existing_user_team', true
        )
      );
    end if;
  end loop;
end $$;
