begin;

create table if not exists public.team_policy_nonrecurring_charge_state_v1 (
  club_id uuid not null references public.clubs(id) on delete cascade,
  policy_key text not null,
  season_number integer not null,
  charged_amount bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (club_id,policy_key,season_number)
);

create or replace function public.finance_sync_team_policy_nonrecurring_costs_v1(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,finance,pg_temp
as $$
declare
  v_policy public.club_team_policies%rowtype;
  v_season integer;
  v_item record;
  v_scope_season integer;
  v_target bigint;
  v_paid bigint;
  v_delta bigint;
  v_tx uuid;
  v_results jsonb:='[]'::jsonb;
begin
  select season_number into v_season from public.game_state where id=true;
  select * into v_policy from public.club_team_policies where club_id=p_club_id;
  if not found then
    return jsonb_build_object('success',true,'club_id',p_club_id,'skipped',true,'reason','no_policy_row');
  end if;

  for v_item in
    select * from (
      values
        ('staff_equipment_level'::text, v_policy.staff_equipment_level::text, 'one_time'::text),
        ('rider_bonus_plan'::text, v_policy.rider_bonus_plan::text, 'seasonal'::text),
        ('staff_bonus_plan'::text, v_policy.staff_bonus_plan::text, 'seasonal'::text)
    ) x(policy_key,option_code,expected_cost_type)
  loop
    select coalesce(c.base_cost,0)::bigint
    into v_target
    from public.team_policy_option_catalog c
    where c.policy_key=v_item.policy_key
      and c.option_code=v_item.option_code
      and c.is_active=true
      and c.cost_type=v_item.expected_cost_type
    limit 1;

    v_target:=coalesce(v_target,0);
    v_scope_season:=case when v_item.expected_cost_type='one_time' then 0 else coalesce(v_season,1) end;

    select charged_amount into v_paid
    from public.team_policy_nonrecurring_charge_state_v1 s
    where s.club_id=p_club_id
      and s.policy_key=v_item.policy_key
      and s.season_number=v_scope_season
    for update;

    v_paid:=coalesce(v_paid,0);
    v_delta:=greatest(0,v_target-v_paid);

    if v_delta>0 then
      v_tx:=public.finance_spend_from_club(
        p_club_id,
        v_delta,
        case when v_item.expected_cost_type='one_time'
          then 'team_policy_one_time_cost'
          else 'team_policy_seasonal_cost'
        end,
        'SINK',
        format('team_policy_nonrecurring:%s:%s:%s:%s',p_club_id,v_item.policy_key,v_scope_season,v_target),
        jsonb_build_object(
          'source','team_policies',
          'policy_key',v_item.policy_key,
          'option_code',v_item.option_code,
          'cost_type',v_item.expected_cost_type,
          'season_number',v_scope_season,
          'charged_before',v_paid,
          'target_cost',v_target,
          'delta_charged',v_delta
        )
      );
    else
      v_tx:=null;
    end if;

    insert into public.team_policy_nonrecurring_charge_state_v1(
      club_id,policy_key,season_number,charged_amount,updated_at
    )
    values(p_club_id,v_item.policy_key,v_scope_season,greatest(v_paid,v_target),now())
    on conflict(club_id,policy_key,season_number) do update
    set charged_amount=greatest(public.team_policy_nonrecurring_charge_state_v1.charged_amount,excluded.charged_amount),
        updated_at=now();

    v_results:=v_results||jsonb_build_array(jsonb_build_object(
      'policy_key',v_item.policy_key,
      'option_code',v_item.option_code,
      'cost_type',v_item.expected_cost_type,
      'season_number',v_scope_season,
      'target_cost',v_target,
      'previously_charged',v_paid,
      'delta_charged',v_delta,
      'transaction_id',v_tx
    ));
  end loop;

  return jsonb_build_object('success',true,'club_id',p_club_id,'season_number',v_season,'charges',v_results);
end;
$$;

create or replace function public.finance_process_team_policy_nonrecurring_costs_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,finance,pg_temp
as $$
declare
  c record;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_ok integer:=0;
  v_failed integer:=0;
begin
  for c in
    select p.club_id
    from public.club_team_policies p
    join public.clubs cl on cl.id=p.club_id
    where cl.deleted_at is null
  loop
    begin
      v_result:=public.finance_sync_team_policy_nonrecurring_costs_v1(c.club_id);
      v_ok:=v_ok+1;
      v_results:=v_results||jsonb_build_array(v_result);
    exception when others then
      v_failed:=v_failed+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'success',false,'club_id',c.club_id,'error',sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object('success',v_failed=0,'processed',v_ok,'failed',v_failed,'results',v_results);
end;
$$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.update_club_team_policies(uuid,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure) into d;
  if position('finance_sync_team_policy_nonrecurring_costs_v1' in d)=0 then
    d:=replace(
      d,
      '  select *' || E'\n' || '  into v_row' || E'\n' || '  from public.club_team_policies',
      '  perform public.finance_sync_team_policy_nonrecurring_costs_v1(p_club_id);' || E'\n\n' ||
      '  select *' || E'\n' || '  into v_row' || E'\n' || '  from public.club_team_policies'
    );
    execute d;
  end if;
end
$patch$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.process_daily_tick()'::regprocedure) into d;
  if position('finance_process_team_policy_nonrecurring_costs_v1' in d)=0 then
    d:=replace(
      d,
      'begin perform public.finance_process_weekly_team_policy_costs(); exception when others then raise warning ''finance_process_weekly_team_policy_costs failed: %'',sqlerrm; end;',
      'begin perform public.finance_process_weekly_team_policy_costs(); exception when others then raise warning ''finance_process_weekly_team_policy_costs failed: %'',sqlerrm; end;'||E'\n  '||
      'begin perform public.finance_process_team_policy_nonrecurring_costs_v1(); exception when others then raise warning ''finance_process_team_policy_nonrecurring_costs_v1 failed: %'',sqlerrm; end;'
    );
    execute d;
  end if;
end
$patch$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.get_club_team_policy_recurring_costs(uuid)'::regprocedure) into d;
  if position('staff_equipment_one_time_v1' in d)=0 then
    d:=regexp_replace(
      d,
      '-- staff equipment monthly per staff[[:space:]]+v_staff_support_rate :=[[:space:]]+case v_policy.staff_equipment_level[[:space:]]+when ''none'' then 0[[:space:]]+when ''basic'' then 2000[[:space:]]+when ''standard'' then 3500[[:space:]]+when ''advanced'' then 5000[[:space:]]+else 0[[:space:]]+end;',
      '-- staff equipment is a one-time catalog cost; charged by finance_sync_team_policy_nonrecurring_costs_v1 /* staff_equipment_one_time_v1 */' || E'\n  v_staff_support_rate := 0;',
      'g'
    );
    execute d;
  end if;
end
$patch$;

commit;
