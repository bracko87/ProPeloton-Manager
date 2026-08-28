alter function public._generate_domestic_roster_for_club(uuid)
  rename to _generate_domestic_roster_for_club_core_v1;

create or replace function public.generate_ai_roster_depth_rider_v1(
  p_club_id uuid,
  p_desired_role public.rider_role
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_game_date date := coalesce(public.get_current_game_date_date(), date '2000-01-01');
  v_country text;
  v_profile public.team_tier_balance_profiles%rowtype;
  v_first text;
  v_last text;
  v_role public.rider_role := coalesce(p_desired_role,'Domestique'::public.rider_role);
  v_age integer;
  v_birth date;
  v_target integer;
  v_min integer;
  v_max integer;
  v_sprint integer;
  v_climbing integer;
  v_tt integer;
  v_endurance integer;
  v_flat integer;
  v_recovery integer;
  v_resistance integer;
  v_iq integer;
  v_teamwork integer;
  v_potential integer;
  v_salary integer;
  v_market bigint;
  v_rider_id uuid;
begin
  select c.country_code
  into v_country
  from public.clubs c
  where c.id=p_club_id
    and c.deleted_at is null
    and c.is_active=true
    and c.is_ai=true
    and c.club_type='main';

  if v_country is null then
    raise exception 'AI main club not found or country missing for club %', p_club_id;
  end if;

  select * into v_profile
  from public.team_tier_balance_profiles
  where tier_key=public._get_club_balance_tier_key(p_club_id);

  if not found then
    select * into v_profile
    from public.team_tier_balance_profiles
    where tier_key='amateur';
  end if;

  v_first:=public.pick_generated_rider_first_name(v_country);
  v_last:=public.pick_generated_rider_last_name(v_country);

  v_age:=case
    when v_role='Leader'::public.rider_role then public.rand_int(25,32)
    when v_role='Sprinter'::public.rider_role then public.rand_int(22,30)
    when v_role='Climber'::public.rider_role then public.rand_int(22,30)
    when v_role='Breakaway'::public.rider_role then public.rand_int(23,31)
    else public.rand_int(21,32)
  end;
  v_birth:=(v_game_date-(v_age||' years')::interval-(public.rand_int(0,364)||' days')::interval)::date;

  v_target:=public._clamp_int(
    v_profile.avg_overall_target + case when v_role='Leader'::public.rider_role then public.rand_int(3,6) else public.rand_int(-3,3) end,
    v_profile.rider_min_overall,
    case when v_role='Leader'::public.rider_role then v_profile.rare_cap_overall else v_profile.rider_max_overall end
  );
  v_min:=v_profile.rider_min_overall;
  v_max:=case when v_role='Leader'::public.rider_role then v_profile.rare_cap_overall else v_profile.rider_max_overall end;

  v_sprint:=v_target+public.rand_int(-4,4);
  v_climbing:=v_target+public.rand_int(-4,4);
  v_tt:=v_target+public.rand_int(-4,4);
  v_endurance:=v_target+public.rand_int(-3,4);
  v_flat:=v_target+public.rand_int(-3,4);
  v_recovery:=v_target+public.rand_int(-3,4);
  v_resistance:=v_target+public.rand_int(-3,4);
  v_iq:=v_target+public.rand_int(-3,4);
  v_teamwork:=v_target+public.rand_int(-3,4);

  if v_role='Leader'::public.rider_role then
    v_endurance:=v_endurance+5; v_recovery:=v_recovery+4; v_resistance:=v_resistance+4; v_iq:=v_iq+6;
  elsif v_role='Sprinter'::public.rider_role then
    v_sprint:=v_sprint+8; v_flat:=v_flat+5; v_climbing:=v_climbing-5; v_tt:=v_tt-3;
  elsif v_role='Climber'::public.rider_role then
    v_climbing:=v_climbing+8; v_recovery:=v_recovery+4; v_flat:=v_flat-3; v_sprint:=v_sprint-4;
  elsif v_role='Domestique'::public.rider_role then
    v_teamwork:=v_teamwork+8; v_endurance:=v_endurance+4; v_resistance:=v_resistance+4; v_iq:=v_iq+3;
  elsif v_role='Breakaway'::public.rider_role then
    v_endurance:=v_endurance+7; v_resistance:=v_resistance+6; v_flat:=v_flat+3; v_iq:=v_iq+3;
  else
    v_flat:=v_flat+4; v_endurance:=v_endurance+3; v_teamwork:=v_teamwork+3;
  end if;

  v_sprint:=public._clamp_int(v_sprint,v_min,v_max);
  v_climbing:=public._clamp_int(v_climbing,v_min,v_max);
  v_tt:=public._clamp_int(v_tt,v_min,v_max);
  v_endurance:=public._clamp_int(v_endurance,v_min,v_max);
  v_flat:=public._clamp_int(v_flat,v_min,v_max);
  v_recovery:=public._clamp_int(v_recovery,v_min,v_max);
  v_resistance:=public._clamp_int(v_resistance,v_min,v_max);
  v_iq:=public._clamp_int(v_iq,v_min,v_max);
  v_teamwork:=public._clamp_int(v_teamwork,v_min,v_max);

  v_potential:=public.rand_int(v_profile.potential_min,v_profile.potential_max);
  v_salary:=case when v_role='Leader'::public.rider_role
    then public.rand_int(v_profile.leader_salary_min,v_profile.leader_salary_max)
    else public.rand_int(v_profile.normal_salary_min,v_profile.normal_salary_max)
  end;
  v_market:=public.rand_int(
    greatest(1,floor(v_profile.squad_market_value_min::numeric/10*0.7)::int),
    greatest(1,floor(v_profile.squad_market_value_max::numeric/10*1.2)::int)
  )::bigint;

  insert into public.riders(
    country_code,first_name,last_name,role,sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
    morale,potential,birth_date,salary,contract_expires_at,release_requested,market_value,
    asking_price,asking_price_manual,asking_price_updated_at,fatigue,fatigue_updated_on,consecutive_heavy_days,availability_status
  ) values(
    v_country,v_first,v_last,v_role,v_sprint::smallint,v_climbing::smallint,v_tt::smallint,v_endurance::smallint,v_flat::smallint,
    v_recovery::smallint,v_resistance::smallint,v_iq::smallint,v_teamwork::smallint,
    public.rand_int(50,70)::smallint,v_potential::smallint,v_birth,v_salary,
    (v_game_date+interval '12 months')::date,false,v_market,
    null,false,now(),0,v_game_date,0,'fit'
  ) returning id into v_rider_id;

  insert into public.club_riders(club_id,rider_id,assigned_role)
  values(p_club_id,v_rider_id,v_role);

  if to_regprocedure('public.refresh_rider_value_snapshot(uuid)') is not null then
    execute 'select public.refresh_rider_value_snapshot($1)' using v_rider_id;
  elsif to_regprocedure('public.recompute_rider_market_value_snapshot(uuid)') is not null then
    perform public.recompute_rider_market_value_snapshot(v_rider_id);
  end if;

  return v_rider_id;
end;
$function$;

create or replace function public.ensure_ai_main_roster_minimum_v1(
  p_club_id uuid,
  p_minimum integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_before integer;
  v_count integer;
  v_generated integer:=0;
  v_role public.rider_role;
begin
  if p_minimum<1 or p_minimum>18 then
    raise exception 'AI roster minimum must be between 1 and 18.';
  end if;

  if not exists(
    select 1 from public.clubs c
    where c.id=p_club_id and c.deleted_at is null and c.is_active=true
      and c.is_ai=true and c.club_type='main'
  ) then
    raise exception 'Club % is not an active AI main club.',p_club_id;
  end if;

  select count(*)::integer into v_before
  from public.club_riders where club_id=p_club_id;
  v_count:=v_before;

  while v_count<p_minimum loop
    if v_count<10 then
      select sr.rider_role into v_role
      from public.starting_roster_role_profiles sr
      where sr.slot_no=v_count+1;
    else
      v_role:=case ((v_count-10)%5)
        when 0 then 'Domestique'::public.rider_role
        when 1 then 'Domestique'::public.rider_role
        when 2 then 'All-rounder'::public.rider_role
        when 3 then 'Breakaway'::public.rider_role
        else 'Climber'::public.rider_role
      end;
    end if;

    v_role:=coalesce(v_role,'Domestique'::public.rider_role);
    perform public.generate_ai_roster_depth_rider_v1(p_club_id,v_role);
    v_generated:=v_generated+1;
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'ok',true,'club_id',p_club_id,'minimum',p_minimum,
    'before',v_before,'after',v_count,'generated',v_generated
  );
end;
$function$;

create or replace function public._generate_domestic_roster_for_club(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  perform public._generate_domestic_roster_for_club_core_v1(p_club_id);

  if exists(
    select 1 from public.clubs c
    where c.id=p_club_id and c.deleted_at is null and c.is_active=true
      and c.is_ai=true and c.club_type='main'
  ) then
    perform public.ensure_ai_main_roster_minimum_v1(p_club_id,15);
  end if;
end;
$function$;

alter function public.process_ai_rosters_for_season_transition_v2(uuid,integer,integer)
  rename to process_ai_rosters_for_season_transition_core_v2;

create or replace function public.process_ai_rosters_for_season_transition_v2(
  p_transition_run_id uuid,
  p_source_season integer,
  p_target_season integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
set statement_timeout to '600s'
as $function$
declare
  v_core jsonb;
  r record;
  v_count integer;
  v_generated integer:=0;
  v_clubs_topped_up integer:=0;
  v_role public.rider_role;
begin
  v_core:=public.process_ai_rosters_for_season_transition_core_v2(
    p_transition_run_id,p_source_season,p_target_season
  );

  for r in
    select c.id as club_id
    from public.clubs c
    where c.deleted_at is null and c.is_active=true
      and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
    order by c.id
  loop
    select count(*)::integer into v_count
    from public.club_riders where club_id=r.club_id;

    if v_count<15 then v_clubs_topped_up:=v_clubs_topped_up+1; end if;

    while v_count<15 loop
      if v_count<10 then
        select sr.rider_role into v_role
        from public.starting_roster_role_profiles sr
        where sr.slot_no=v_count+1;
      else
        v_role:=case ((v_count-10)%5)
          when 0 then 'Domestique'::public.rider_role
          when 1 then 'Domestique'::public.rider_role
          when 2 then 'All-rounder'::public.rider_role
          when 3 then 'Breakaway'::public.rider_role
          else 'Climber'::public.rider_role
        end;
      end if;

      perform public.ai_transition_generate_rider_v1(
        p_transition_run_id,p_source_season,p_target_season,r.club_id,
        coalesce(v_role,'Domestique'::public.rider_role)
      );
      v_generated:=v_generated+1;
      v_count:=v_count+1;
    end loop;

    perform public.recompute_club_wage_total(r.club_id);
  end loop;

  return v_core || jsonb_build_object(
    'ai_minimum_roster_size',15,
    'minimum_topup_generated',v_generated,
    'clubs_topped_up_to_minimum',v_clubs_topped_up
  );
end;
$function$;

alter function public.process_ai_rosters_for_season_transition_v1(uuid,integer,integer)
  rename to process_ai_rosters_for_season_transition_core_v1;

create or replace function public.process_ai_rosters_for_season_transition_v1(
  p_transition_run_id uuid,
  p_source_season integer,
  p_target_season integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_core jsonb;
  r record;
  v_count integer;
  v_generated integer:=0;
  v_role public.rider_role;
begin
  v_core:=public.process_ai_rosters_for_season_transition_core_v1(
    p_transition_run_id,p_source_season,p_target_season
  );

  for r in
    select c.id as club_id
    from public.clubs c
    where c.deleted_at is null and c.is_active=true
      and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
    order by c.id
  loop
    select count(*)::integer into v_count
    from public.club_riders where club_id=r.club_id;

    while v_count<15 loop
      if v_count<10 then
        select sr.rider_role into v_role
        from public.starting_roster_role_profiles sr
        where sr.slot_no=v_count+1;
      else
        v_role:=case ((v_count-10)%5)
          when 0 then 'Domestique'::public.rider_role
          when 1 then 'Domestique'::public.rider_role
          when 2 then 'All-rounder'::public.rider_role
          when 3 then 'Breakaway'::public.rider_role
          else 'Climber'::public.rider_role
        end;
      end if;

      perform public.ai_transition_generate_rider_v1(
        p_transition_run_id,p_source_season,p_target_season,r.club_id,
        coalesce(v_role,'Domestique'::public.rider_role)
      );
      v_generated:=v_generated+1;
      v_count:=v_count+1;
    end loop;

    perform public.recompute_club_wage_total(r.club_id);
  end loop;

  return v_core || jsonb_build_object(
    'ai_minimum_roster_size',15,
    'minimum_topup_generated',v_generated
  );
end;
$function$;

alter function public.game_world_reset_validate_v1()
  rename to game_world_reset_validate_core_v1;

create or replace function public.game_world_reset_validate_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_base jsonb;
  v_main_roster_bad bigint;
  v_ok boolean;
begin
  v_base:=public.game_world_reset_validate_core_v1();

  select count(*) into v_main_roster_bad
  from (
    select b.club_id,c.is_ai,count(cr.rider_id) riders
    from public.game_world_reset_s1_competition_baseline_v1 b
    join public.clubs c on c.id=b.club_id and coalesce(c.club_type,'main')='main'
    left join public.club_riders cr on cr.club_id=b.club_id
    group by b.club_id,c.is_ai
    having count(cr.rider_id)<>case when c.is_ai then 15 else 10 end
  ) x;

  v_ok:=
    coalesce((v_base->>'clock_bad')::bigint,1)=0
    and coalesce((v_base->>'competition_bad')::bigint,1)=0
    and coalesce((v_base->>'points_bad')::bigint,1)=0
    and v_main_roster_bad=0
    and coalesce((v_base->>'domestic_rider_mismatches')::bigint,1)=0
    and coalesce((v_base->>'duplicate_rider_assignments')::bigint,1)=0
    and coalesce((v_base->>'national_team_violations')::bigint,1)=0
    and coalesce((v_base->>'assigned_staff')::bigint,1)=0
    and coalesce((v_base->>'equipment_bad_clubs')::bigint,1)=0
    and coalesce((v_base->>'s1_stage_results')::bigint,1)=0
    and coalesce((v_base->>'s1_classifications')::bigint,1)=0
    and coalesce((v_base->>'s1_ranking_awards')::bigint,1)=0
    and coalesce((v_base->>'s1_international_points_ledger')::bigint,1)=0
    and coalesce((v_base->>'future_races')::bigint,1)=0
    and coalesce((v_base->>'s1_races_not_scheduled')::bigint,1)=0
    and coalesce((v_base->>'ranking_snapshot_rows')::bigint,1)=0
    and coalesce((v_base->>'available_generated_free_agents')::bigint,-1)=56
    and coalesce((v_base->>'transition_armed_rows')::bigint,1)=0
    and coalesce((v_base->>'transition_function_hash_mismatches')::bigint,1)=0
    and coalesce((v_base->>'user_clubs_without_sponsor_offers')::bigint,1)=0;

  return jsonb_set(
    jsonb_set(v_base,'{main_roster_bad}',to_jsonb(v_main_roster_bad),true),
    '{ok}',to_jsonb(v_ok),true
  ) || jsonb_build_object(
    'ai_main_roster_minimum',15,
    'player_main_roster_target',10
  );
end;
$function$;
