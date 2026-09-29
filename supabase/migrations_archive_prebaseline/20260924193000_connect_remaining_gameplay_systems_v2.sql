begin;

create table if not exists public.team_policy_rider_effect_log_v1 (
  rider_id uuid not null references public.riders(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  effect_date date not null,
  effect_kind text not null,
  effect_value integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (rider_id,effect_date,effect_kind)
);

create or replace function public.get_club_team_policy_live_effects_v1(p_club_id uuid)
returns table(
  recovery_bonus integer,
  fatigue_reduction_bonus integer,
  morale_delta integer,
  contract_happiness_bonus integer,
  staff_efficiency_bonus integer,
  staff_morale_delta integer
)
language sql stable security definer set search_path=public
as $$
with p as (
  select * from public.club_team_policies where club_id=p_club_id limit 1
),
selected as (
  select c.effect_json
  from p
  cross join lateral (
    values
      ('rider_housing_support', p.rider_housing_support::text),
      ('nutrition_support_level', p.nutrition_support_level::text),
      ('recovery_support_level', p.recovery_support_level::text),
      ('staff_equipment_level', p.staff_equipment_level::text),
      ('rider_bonus_plan', p.rider_bonus_plan::text),
      ('staff_bonus_plan', p.staff_bonus_plan::text)
  ) s(policy_key,option_code)
  join public.team_policy_option_catalog c
    on c.policy_key=s.policy_key and c.option_code=s.option_code and c.is_active=true
)
select
  coalesce(sum(coalesce((effect_json->>'recovery_bonus')::integer,0)),0)::integer,
  coalesce(sum(coalesce((effect_json->>'fatigue_reduction_bonus')::integer,0)),0)::integer,
  coalesce(sum(coalesce((effect_json->>'morale_delta')::integer,0)),0)::integer,
  coalesce(sum(coalesce((effect_json->>'contract_happiness_bonus')::integer,0)),0)::integer,
  coalesce(sum(coalesce((effect_json->>'staff_efficiency_bonus')::integer,0)),0)::integer,
  coalesce(sum(coalesce((effect_json->>'staff_morale_delta')::integer,0)),0)::integer
from selected;
$$;

create or replace function public.team_policy_staff_quality_bonus_v1(p_club_id uuid)
returns numeric language sql stable security definer set search_path=public as $$
  select least(8::numeric,greatest(0::numeric,
    coalesce(e.staff_efficiency_bonus,0)::numeric+
    coalesce(e.staff_morale_delta,0)::numeric*0.5))
  from public.get_club_team_policy_live_effects_v1(p_club_id) e;
$$;

create or replace function public.team_policy_contract_happiness_bonus_v1(p_club_id uuid)
returns integer language sql stable security definer set search_path=public as $$
  select least(6,greatest(0,coalesce(e.contract_happiness_bonus,0)*3))
  from public.get_club_team_policy_live_effects_v1(p_club_id) e;
$$;

create or replace function public.apply_team_policy_rider_support_v1(p_game_date date default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_date date:=coalesce(p_game_date,public.get_current_game_date_date());
  v_recovery_rows integer:=0;
  v_morale_rows integer:=0;
begin
  if v_date is null then return jsonb_build_object('success',false,'reason','game_date_unavailable'); end if;

  with candidates as (
    select cr.rider_id,cr.club_id,
      coalesce(e.recovery_bonus,0)+coalesce(e.fatigue_reduction_bonus,0) recovery_points
    from public.club_riders cr
    cross join lateral public.get_club_team_policy_live_effects_v1(cr.club_id) e
    where coalesce(e.recovery_bonus,0)+coalesce(e.fatigue_reduction_bonus,0)>0
  ), ins as (
    insert into public.team_policy_rider_effect_log_v1(rider_id,club_id,effect_date,effect_kind,effect_value)
    select rider_id,club_id,v_date,'recovery_fatigue',recovery_points from candidates
    on conflict do nothing returning rider_id,effect_value
  )
  update public.riders r
  set fatigue=greatest(0,coalesce(r.fatigue,0)-ins.effect_value)
  from ins where r.id=ins.rider_id;
  get diagnostics v_recovery_rows=row_count;

  if mod(extract(doy from v_date)::integer-1,7)=0 then
    with candidates as (
      select cr.rider_id,cr.club_id,least(4,greatest(0,coalesce(e.morale_delta,0))) morale_points
      from public.club_riders cr
      cross join lateral public.get_club_team_policy_live_effects_v1(cr.club_id) e
      where coalesce(e.morale_delta,0)>0
    ), ins as (
      insert into public.team_policy_rider_effect_log_v1(rider_id,club_id,effect_date,effect_kind,effect_value)
      select rider_id,club_id,v_date,'morale',morale_points from candidates
      on conflict do nothing returning rider_id,effect_value
    )
    update public.riders r
    set morale=least(100,coalesce(r.morale,50)+ins.effect_value)
    from ins where r.id=ins.rider_id;
    get diagnostics v_morale_rows=row_count;
  end if;

  return jsonb_build_object('success',true,'game_date',v_date,'recovery_riders',v_recovery_rows,'morale_riders',v_morale_rows);
end;
$$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.process_daily_tick()'::regprocedure) into d;
  if position('apply_team_policy_rider_support_v1' in d)=0 then
    d:=replace(
      d,
      'begin perform public.process_daily_coach_training_plans_v1(v_date); exception when others then raise warning ''process_daily_coach_training_plans_v1 failed: %'',sqlerrm; end;',
      'begin perform public.process_daily_coach_training_plans_v1(v_date); exception when others then raise warning ''process_daily_coach_training_plans_v1 failed: %'',sqlerrm; end;'||E'\n  '||
      'begin perform public.apply_team_policy_rider_support_v1(v_date); exception when others then raise warning ''apply_team_policy_rider_support_v1 failed: %'',sqlerrm; end;'
    );
    execute d;
  end if;
end $patch$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('_evaluate_rider_transfer_offer_package(uuid,integer,integer,integer,integer)'::regprocedure) into d;
  if position('team_policy_contract_happiness_bonus_v1' in d)=0 then
    d:=regexp_replace(d,'v_profile_modifier[[:space:]]*\\+[[:space:]]*v_veteran_relief',
      'v_profile_modifier + v_veteran_relief + public.team_policy_contract_happiness_bonus_v1(v_buyer_club_id)','g');
    execute d;
  end if;
end $patch$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('_evaluate_free_agent_offer_package(uuid,uuid,integer,integer,integer,integer)'::regprocedure) into d;
  if position('team_policy_contract_happiness_bonus_v1' in d)=0 then
    d:=regexp_replace(d,'v_profile_modifier[[:space:]]*\\+[[:space:]]*v_veteran_relief',
      'v_profile_modifier + v_veteran_relief + public.team_policy_contract_happiness_bonus_v1(p_club_id)','g');
    execute d;
  end if;
end $patch$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.get_head_coach_effects(uuid,date)'::regprocedure) into d;
  if position('team_policy_staff_quality_bonus_v1' in d)=0 then
    d:=replace(d,'coalesce(v_staff.efficiency, 0)::numeric / 20.0',
      '(coalesce(v_staff.efficiency, 0)::numeric + public.team_policy_staff_quality_bonus_v1(v_staff_club_id)) / 20.0');
    execute d;
  end if;
end $patch$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.get_team_doctor_effects(uuid,date)'::regprocedure) into d;
  if position('team_policy_staff_quality_bonus_v1' in d)=0 then
    d:=replace(d,'coalesce(v_staff.efficiency, 0)::numeric',
      '(coalesce(v_staff.efficiency, 0)::numeric + public.team_policy_staff_quality_bonus_v1(p_club_id))');
    execute d;
  end if;
end $patch$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.equipment_get_mechanic_effects_v1(uuid,uuid[])'::regprocedure) into d;
  if position('team_policy_staff_quality_bonus_v1' in d)=0 then
    d:=replace(d,'cs.efficiency::numeric as efficiency',
      'least(100::numeric, cs.efficiency::numeric + public.team_policy_staff_quality_bonus_v1(p_club_id)) as efficiency');
    execute d;
  end if;
end $patch$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.generate_stage_plan_sport_director_suggestion_v1(uuid,uuid,uuid)'::regprocedure) into d;
  if position('derived_hilly_v1' in d)=0 then
    d:=replace(d,
      'public.jsonb_number_any_v1(rs.rider_snapshot, array[''hills'', ''hill'', ''hilly''], 50) as hill_score',
      'round((public.jsonb_number_any_v1(rs.rider_snapshot, array[''climbing'', ''mountain'', ''climb'', ''climbing_skill''], 50) * 0.35 + public.jsonb_number_any_v1(rs.rider_snapshot, array[''flat'', ''flat_skill''], 50) * 0.15 + public.jsonb_number_any_v1(rs.rider_snapshot, array[''endurance'', ''stamina''], 50) * 0.20 + public.jsonb_number_any_v1(rs.rider_snapshot, array[''race_iq'', ''race_intelligence'', ''intelligence''], 50) * 0.15 + public.jsonb_number_any_v1(rs.rider_snapshot, array[''resistance''], 50) * 0.15),2) as hill_score /* derived_hilly_v1 */');
    execute d;
  end if;
end $patch$;

select cron.schedule(
  'sponsor-objectives-due-by-game-clock-v1',
  '*/10 * * * *',
  'select public.sponsor_process_due_objectives_v1(false);'
)
where not exists(select 1 from cron.job where jobname='sponsor-objectives-due-by-game-clock-v1');

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.submit_unsolicited_ai_transfer_bid_v1(uuid,uuid,bigint)'::regprocedure) into d;
  d:=replace(d,
    'The AI club is willing to consider this premium bid. Final transfer completion is not implemented in Phase 1.',
    'The AI club accepted the transfer fee. Confirm the bid to open rider personal-terms negotiation.');
  execute d;
end $patch$;

delete from public.premium_manager_automation_rules_v1 where rule_type='equipment_prefill';

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.premium_save_automation_rule_v1(uuid,uuid,text,text,uuid,jsonb,boolean)'::regprocedure) into d;
  d:=replace(d,
    'p_rule_type not in (''strategy_prefill'',''training_prefill'',''equipment_prefill'')',
    'p_rule_type not in (''strategy_prefill'',''training_prefill'')');
  d:=replace(d,
    'or (p_rule_type=''equipment_prefill'' and v_template_type<>''equipment'')',
    '');
  execute d;
end $patch$;

commit;
