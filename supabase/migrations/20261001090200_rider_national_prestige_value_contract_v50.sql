-- National-team/championship prestige affects rider market value and salary demand.
-- Recognition remains active through at least the following season, and for
-- younger riders through two following seasons.

create table if not exists public.rider_national_prestige_awards (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  award_type text not null check (award_type in ('national_team','national_champion','world_podium','world_champion')),
  award_season integer not null check (award_season>=1),
  valid_through_season integer not null check (valid_through_season>=award_season),
  value_multiplier numeric(5,3) not null check (value_multiplier>=1),
  salary_multiplier numeric(5,3) not null check (salary_multiplier>=1),
  source_kind text not null,
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  awarded_at timestamptz not null default now(),
  unique(rider_id,award_type,award_season)
);

create index if not exists rider_national_prestige_active_idx
  on public.rider_national_prestige_awards(rider_id,valid_through_season desc);

alter table public.rider_national_prestige_awards enable row level security;
revoke all on public.rider_national_prestige_awards from anon,authenticated;

CREATE OR REPLACE FUNCTION private.rider_national_prestige_duration_v1(p_rider_id uuid, p_award_type text, p_award_season integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_birth date; v_on date; v_age integer;
begin
  select birth_date into v_birth from public.riders where id=p_rider_id;
  v_on:=public.game_date_from_parts(p_award_season,12,31);
  v_age:=case when v_birth is null then 28 else extract(year from age(v_on,v_birth))::integer end;
  return case
    when p_award_type='national_team' and v_age<=25 then 2
    when p_award_type='national_team' then 1
    when p_award_type='national_champion' and v_age<=30 then 2
    when p_award_type='national_champion' then 1
    when p_award_type='world_podium' and v_age<=30 then 2
    when p_award_type='world_podium' then 1
    when p_award_type='world_champion' and v_age<=32 then 2
    else 1
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.rider_national_prestige_value_multiplier_v1(p_rider_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select greatest(1::numeric,coalesce(max(a.value_multiplier),1::numeric))
  from public.rider_national_prestige_awards a
  where a.rider_id=p_rider_id
    and a.valid_through_season >= (select gs.season_number from public.game_state gs where gs.id=true);
$function$
;

CREATE OR REPLACE FUNCTION private.rider_national_prestige_salary_multiplier_v1(p_rider_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select greatest(1::numeric,coalesce(max(a.salary_multiplier),1::numeric))
  from public.rider_national_prestige_awards a
  where a.rider_id=p_rider_id
    and a.valid_through_season >= (select gs.season_number from public.game_state gs where gs.id=true);
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_national_prestige_v1(p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'rider_id',p_rider_id,
    'current_season',(select gs.season_number from public.game_state gs where gs.id=true),
    'value_multiplier',private.rider_national_prestige_value_multiplier_v1(p_rider_id),
    'salary_multiplier',private.rider_national_prestige_salary_multiplier_v1(p_rider_id),
    'active_awards',coalesce((
      select jsonb_agg(jsonb_build_object(
        'award_type',a.award_type,'award_season',a.award_season,
        'valid_through_season',a.valid_through_season,
        'value_multiplier',a.value_multiplier,'salary_multiplier',a.salary_multiplier
      ) order by a.award_season desc,a.value_multiplier desc)
      from public.rider_national_prestige_awards a
      where a.rider_id=p_rider_id
        and a.valid_through_season >= (select gs.season_number from public.game_state gs where gs.id=true)
    ),'[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION private.award_rider_national_prestige_v1(p_rider_id uuid, p_award_type text, p_award_season integer, p_source_kind text, p_source_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_value numeric; v_salary numeric; v_duration integer; v_id uuid;
begin
  if p_rider_id is null or p_award_season is null then return null; end if;
  v_value:=case p_award_type when 'national_team' then 1.08 when 'national_champion' then 1.30
    when 'world_podium' then 1.22 when 'world_champion' then 1.55 else 1 end;
  v_salary:=case p_award_type when 'national_team' then 1.06 when 'national_champion' then 1.22
    when 'world_podium' then 1.16 when 'world_champion' then 1.38 else 1 end;
  if v_value<=1 then raise exception 'Unsupported national prestige award type: %',p_award_type; end if;
  v_duration:=private.rider_national_prestige_duration_v1(p_rider_id,p_award_type,p_award_season);
  insert into public.rider_national_prestige_awards(
    rider_id,award_type,award_season,valid_through_season,value_multiplier,salary_multiplier,
    source_kind,source_id,metadata
  ) values(
    p_rider_id,p_award_type,p_award_season,p_award_season+v_duration,v_value,v_salary,
    p_source_kind,p_source_id,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(rider_id,award_type,award_season) do update
  set valid_through_season=greatest(public.rider_national_prestige_awards.valid_through_season,excluded.valid_through_season),
      value_multiplier=greatest(public.rider_national_prestige_awards.value_multiplier,excluded.value_multiplier),
      salary_multiplier=greatest(public.rider_national_prestige_awards.salary_multiplier,excluded.salary_multiplier),
      source_kind=excluded.source_kind,source_id=coalesce(excluded.source_id,public.rider_national_prestige_awards.source_id),
      metadata=public.rider_national_prestige_awards.metadata||excluded.metadata
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_award_national_team_prestige_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_season integer;
begin
  select s.season_number into v_season
  from public.national_team_squads s join public.national_team_lineups l on l.squad_id=s.id
  where l.id=new.lineup_id;
  if v_season is not null then
    perform private.award_rider_national_prestige_v1(new.rider_id,'national_team',v_season,
      'national_team_lineup',new.lineup_id,jsonb_build_object('lineup_id',new.lineup_id));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_award_national_champion_prestige_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.champion_rider_id is not null and old.champion_rider_id is distinct from new.champion_rider_id then
    perform private.award_rider_national_prestige_v1(new.champion_rider_id,'national_champion',new.season_number,
      'national_championship',new.id,jsonb_build_object('country_code',new.country_code,'champion_name',new.champion_name_snapshot));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_award_world_champion_prestige_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.champion_rider_id is not null and old.champion_rider_id is distinct from new.champion_rider_id then
    perform private.award_rider_national_prestige_v1(new.champion_rider_id,'world_champion',new.season_number,
      'world_road_championship',new.id,jsonb_build_object('place',1));
    if new.second_rider_id is not null then
      perform private.award_rider_national_prestige_v1(new.second_rider_id,'world_podium',new.season_number,
        'world_road_championship',new.id,jsonb_build_object('place',2));
    end if;
    if new.third_rider_id is not null then
      perform private.award_rider_national_prestige_v1(new.third_rider_id,'world_podium',new.season_number,
        'world_road_championship',new.id,jsonb_build_object('place',3));
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_rider_market_value(p_rider_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
declare
  v_game_date date;
  v_birth_date date;
  v_salary integer;
  v_contract_expires_at date;
  v_morale smallint;
  v_potential smallint;
  v_overall smallint;
  v_role public.rider_role;

  v_sprint smallint;
  v_climbing smallint;
  v_time_trial smallint;
  v_endurance smallint;
  v_flat smallint;
  v_recovery smallint;
  v_resistance smallint;
  v_race_iq smallint;
  v_teamwork smallint;

  v_age integer;
  v_days_left integer;

  v_base_value numeric;
  v_age_multiplier numeric := 1.0;
  v_potential_multiplier numeric := 1.0;
  v_contract_multiplier numeric := 1.0;
  v_morale_multiplier numeric := 1.0;
  v_role_fit_multiplier numeric := 1.0;
  v_recent_form_score numeric := 0;
  v_recent_form_multiplier numeric := 1.0;
  v_role_score numeric := 0;
  v_result numeric;
begin
  v_game_date := public.get_current_game_date_date();

  select
    r.birth_date,
    coalesce(r.salary, 0),
    r.contract_expires_at,
    coalesce(r.morale, 50),
    coalesce(r.potential, 0),
    coalesce(r.overall, 0),
    r.role,
    coalesce(r.sprint, 0),
    coalesce(r.climbing, 0),
    coalesce(r.time_trial, 0),
    coalesce(r.endurance, 0),
    coalesce(r.flat, 0),
    coalesce(r.recovery, 0),
    coalesce(r.resistance, 0),
    coalesce(r.race_iq, 0),
    coalesce(r.teamwork, 0)
  into
    v_birth_date,
    v_salary,
    v_contract_expires_at,
    v_morale,
    v_potential,
    v_overall,
    v_role,
    v_sprint,
    v_climbing,
    v_time_trial,
    v_endurance,
    v_flat,
    v_recovery,
    v_resistance,
    v_race_iq,
    v_teamwork
  from public.riders r
  where r.id = p_rider_id;

  if not found then
    raise exception 'Rider not found for id %', p_rider_id;
  end if;

  begin
    v_recent_form_score := coalesce(public.calculate_rider_recent_form_score_v1(p_rider_id), 0);
  exception when others then
    v_recent_form_score := 0;
  end;

  if v_birth_date is null or v_game_date is null then
    v_age := 25;
  else
    v_age := extract(year from age(v_game_date, v_birth_date))::integer;
  end if;

  if v_contract_expires_at is null or v_game_date is null then
    v_days_left := 180;
  else
    v_days_left := greatest(v_contract_expires_at - v_game_date, 0);
  end if;

  v_base_value :=
    greatest(
      coalesce(v_salary, 0),
      (coalesce(v_overall, 50) * 20) + greatest(coalesce(v_potential, 50) - coalesce(v_overall, 50), 0) * 12,
      150
    ) * 52 * 2.0;

  v_age_multiplier :=
    case
      when v_age <= 21 then 1.40
      when v_age between 22 and 24 then 1.25
      when v_age between 25 and 28 then 1.15
      when v_age between 29 and 31 then 1.00
      when v_age between 32 and 34 then 0.80
      else 0.60
    end;

  v_potential_multiplier :=
    1.0 + least(greatest((coalesce(v_potential, 0) - coalesce(v_overall, 0)) * 0.015, 0), 0.30);

  v_contract_multiplier :=
    case
      when v_days_left < 30 then 0.65
      when v_days_left < 90 then 0.80
      when v_days_left < 180 then 0.95
      when v_days_left < 365 then 1.05
      when v_days_left < 730 then 1.15
      else 1.25
    end;

  v_morale_multiplier :=
    case
      when v_morale >= 85 then 1.05
      when v_morale >= 70 then 1.02
      when v_morale >= 50 then 1.00
      when v_morale >= 35 then 0.97
      else 0.93
    end;

  v_role_score :=
    case v_role
      when 'Sprinter' then
        (v_sprint * 0.42 + v_flat * 0.18 + v_endurance * 0.12 + v_recovery * 0.10 + v_race_iq * 0.10 + v_resistance * 0.08)
      when 'Climber' then
        (v_climbing * 0.40 + v_recovery * 0.18 + v_endurance * 0.14 + v_resistance * 0.12 + v_race_iq * 0.10 + v_teamwork * 0.06)
      when 'TT' then
        (v_time_trial * 0.42 + v_endurance * 0.18 + v_flat * 0.14 + v_recovery * 0.10 + v_race_iq * 0.10 + v_resistance * 0.06)
      when 'Domestique' then
        (v_teamwork * 0.26 + v_endurance * 0.18 + v_recovery * 0.14 + v_resistance * 0.14 + v_race_iq * 0.14 + v_flat * 0.14)
      when 'Breakaway' then
        (v_resistance * 0.24 + v_endurance * 0.20 + v_race_iq * 0.16 + v_recovery * 0.12 + v_flat * 0.12 + v_climbing * 0.08 + v_time_trial * 0.08)
      when 'All-rounder' then
        ((v_sprint + v_climbing + v_time_trial + v_endurance + v_flat + v_recovery + v_resistance + v_race_iq + v_teamwork) / 9.0)
      when 'Leader' then
        (v_climbing * 0.22 + v_time_trial * 0.18 + v_recovery * 0.15 + v_endurance * 0.15 + v_race_iq * 0.12 + v_resistance * 0.10 + v_teamwork * 0.08)
      else
        coalesce(v_overall, 0)
    end;

  v_role_fit_multiplier :=
    case
      when v_role_score >= 85 then 1.12
      when v_role_score >= 80 then 1.08
      when v_role_score >= 75 then 1.04
      when v_role_score >= 70 then 1.00
      when v_role_score >= 65 then 0.96
      else 0.92
    end;

  /*
    Recent form effect:
    - v_recent_form_score is capped in helper between -15 and +30.
    - Market value multiplier is capped between -6% and +8%.
    - This keeps form meaningful but not dominant.
  */
  v_recent_form_multiplier :=
    1.0 + greatest(
      -0.06,
      least(
        0.08,
        coalesce(v_recent_form_score, 0) * 0.003
      )
    );

  v_result :=
    v_base_value
    * v_age_multiplier
    * v_potential_multiplier
    * v_contract_multiplier
    * v_morale_multiplier
    * v_role_fit_multiplier
    * v_recent_form_multiplier;

  return round(greatest(v_result, 10000) * private.rider_national_prestige_value_multiplier_v1(p_rider_id))::bigint;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_rider_market_value_v1(p_rider_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_overall smallint;
  v_potential smallint;
  v_morale smallint;
  v_birth_date date;
  v_age_years integer;
  v_club_tier public.club_tier;
  v_salary integer;
  v_multiplier numeric := 1.25;
  v_recent_form_score numeric := 0;
  v_recent_form_multiplier numeric := 1.0;
  v_value bigint;
begin
  select
    r.overall,
    r.potential,
    r.morale,
    r.birth_date,
    c.club_tier,
    coalesce(r.salary, 0)
  into
    v_overall,
    v_potential,
    v_morale,
    v_birth_date,
    v_club_tier,
    v_salary
  from public.riders r
  join public.club_riders cr
    on cr.rider_id = r.id
  join public.clubs c
    on c.id = cr.club_id
  where r.id = p_rider_id
  order by cr.created_at asc
  limit 1;

  if v_club_tier is null then
    raise exception 'Rider % is not assigned to a club', p_rider_id;
  end if;

  begin
    v_recent_form_score := coalesce(public.calculate_rider_recent_form_score_v1(p_rider_id), 0);
  exception when others then
    v_recent_form_score := 0;
  end;

  v_age_years := public.get_age_years_on_game_date(v_birth_date);

  if v_salary <= 0 then
    v_salary := public.calculate_initial_rider_weekly_salary(
      v_club_tier,
      v_overall,
      v_age_years,
      v_potential
    );
  end if;

  if v_age_years <= 21 then
    v_multiplier := v_multiplier + 0.35;
  elsif v_age_years between 22 and 24 then
    v_multiplier := v_multiplier + 0.45;
  elsif v_age_years between 25 and 29 then
    v_multiplier := v_multiplier + 0.55;
  elsif v_age_years between 30 and 33 then
    v_multiplier := v_multiplier + 0.20;
  elsif v_age_years between 34 and 36 then
    v_multiplier := v_multiplier - 0.05;
  else
    v_multiplier := v_multiplier - 0.25;
  end if;

  if v_potential >= v_overall + 10 then
    v_multiplier := v_multiplier + 0.40;
  elsif v_potential >= v_overall + 6 then
    v_multiplier := v_multiplier + 0.22;
  elsif v_potential >= v_overall + 3 then
    v_multiplier := v_multiplier + 0.10;
  end if;

  if v_morale >= 80 then
    v_multiplier := v_multiplier + 0.08;
  elsif v_morale <= 30 then
    v_multiplier := v_multiplier - 0.12;
  end if;

  v_recent_form_multiplier :=
    1.0 + greatest(
      -0.06,
      least(
        0.08,
        coalesce(v_recent_form_score, 0) * 0.003
      )
    );

  v_value :=
    round(
      (v_salary * 52)
      * greatest(0.60, v_multiplier)
      * v_recent_form_multiplier
    )::bigint;

  return greatest(1000, round(v_value * private.rider_national_prestige_value_multiplier_v1(p_rider_id))::bigint);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.open_contract_renewal_negotiation(p_rider_id uuid)
 RETURNS TABLE(negotiation_id uuid, rider_id uuid, club_id uuid, current_salary_weekly integer, expected_salary_weekly integer, min_acceptable_salary_weekly integer, current_contract_end_season integer, current_contract_expires_at date, requested_extension_seasons smallint, proposed_new_end_season integer, attempt_count integer, max_attempts integer, cooldown_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_current_season integer;
  v_current_game_date date;
  v_rider public.riders%rowtype;
  v_contract public.rider_contracts%rowtype;
  v_existing public.rider_contract_negotiations%rowtype;
  v_latest public.rider_contract_negotiations%rowtype;
  v_recent_form_score numeric := 0;
  v_expected integer;
  v_minimum integer;
  v_requested_extension smallint := 1;
  v_proposed_new_end_season integer;
begin
  v_club_id := public.get_current_main_club_id();

  if v_club_id is null then
    raise exception 'No main club found for current user.';
  end if;

  v_current_season := public.get_current_season_number();
  v_current_game_date := public.get_current_game_date_date();

  select *
  into v_rider
  from public.riders r
  where r.id = p_rider_id;

  if not found then
    raise exception 'Rider not found.';
  end if;

  if not public.rider_belongs_to_current_club_family(p_rider_id) then
    raise exception 'Rider does not belong to your club structure.';
  end if;

  select *
  into v_contract
  from public.rider_contracts rc
  where rc.rider_id = p_rider_id
    and rc.club_id = v_club_id
    and rc.status = 'active'
  order by rc.created_at desc
  limit 1;

  if not found then
    raise exception 'Active contract not found for this rider.';
  end if;

  select *
  into v_existing
  from public.rider_contract_negotiations n
  where n.rider_id = p_rider_id
    and n.club_id = v_club_id
    and n.status = 'open'
  order by n.opened_at desc, n.created_at desc
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.rider_id,
      v_existing.club_id,
      v_existing.current_salary_weekly,
      v_existing.expected_salary_weekly,
      v_existing.min_acceptable_salary_weekly,
      v_existing.current_contract_end_season,
      public.get_game_date_for_season_end(v_existing.current_contract_end_season),
      v_existing.requested_extension_seasons,
      v_existing.proposed_new_end_season,
      coalesce(v_existing.attempt_count, 0)::integer,
      coalesce(v_existing.max_attempts, 5)::integer,
      v_existing.locked_until::timestamptz;
    return;
  end if;

  select *
  into v_latest
  from public.rider_contract_negotiations n
  where n.rider_id = p_rider_id
    and n.club_id = v_club_id
  order by n.opened_at desc, n.created_at desc
  limit 1;

  if found and v_latest.locked_until is not null and v_latest.locked_until > v_current_game_date then
    raise exception 'Negotiation cooldown active until %', v_latest.locked_until;
  end if;

  /*
    Real recent form:
    Reads last 183 game days through calculate_rider_recent_form_score_v1().
    Effect is intentionally small and capped by the helper.
  */
  begin
    v_recent_form_score := coalesce(public.calculate_rider_recent_form_score_v1(p_rider_id), 0);
  exception when others then
    v_recent_form_score := 0;
  end;

  v_expected :=
    greatest(
      v_contract.salary_weekly,
      round(
        v_contract.salary_weekly
        * (
          1.05
          + ((100 - coalesce(v_rider.morale, 50)) * 0.0015)
          + (coalesce(v_rider.overall, 60) * 0.0008)
          + least(coalesce(v_recent_form_score, 0), 30) * 0.003
        )
      )::integer
    );

  v_expected := round(
    v_expected::numeric * private.rider_national_prestige_salary_multiplier_v1(p_rider_id)
  )::integer;

  v_minimum :=
    greatest(
      v_contract.salary_weekly,
      round(
        v_expected
        * (
          0.90
          + ((100 - coalesce(v_rider.morale, 50)) * 0.0008)
          + least(coalesce(v_recent_form_score, 0), 30) * 0.0015
        )
      )::integer
    );

  v_proposed_new_end_season :=
    coalesce(v_contract.end_season_number, public.season_from_game_date(v_contract.expires_on))
    + v_requested_extension;

  insert into public.rider_contract_negotiations (
    rider_id,
    club_id,
    status,
    morale_at_open,
    current_salary_weekly,
    expected_salary_weekly,
    min_acceptable_salary_weekly,
    preferred_duration_seasons,
    market_value_at_open,
    notes_json,
    opened_in_season,
    current_contract_end_season,
    requested_extension_seasons,
    proposed_new_end_season,
    attempt_count,
    max_attempts,
    locked_until
  )
  values (
    p_rider_id,
    v_club_id,
    'open',
    coalesce(v_rider.morale, 50),
    v_contract.salary_weekly,
    v_expected,
    v_minimum,
    1,
    coalesce(v_rider.market_value, 0),
    jsonb_build_object(
      'source', 'renewal_modal_v4_recent_form',
      'recent_form_score', v_recent_form_score,
      'recent_form_window_days', 183,
      'recent_form_salary_effect', 'expected_and_minimum_salary'
    ),
    v_current_season,
    coalesce(v_contract.end_season_number, public.season_from_game_date(v_contract.expires_on)),
    v_requested_extension,
    v_proposed_new_end_season,
    0,
    5,
    null
  )
  returning * into v_existing;

  return query
  select
    v_existing.id,
    v_existing.rider_id,
    v_existing.club_id,
    v_existing.current_salary_weekly,
    v_existing.expected_salary_weekly,
    v_existing.min_acceptable_salary_weekly,
    v_existing.current_contract_end_season,
    public.get_game_date_for_season_end(v_existing.current_contract_end_season),
    v_existing.requested_extension_seasons,
    v_existing.proposed_new_end_season,
    coalesce(v_existing.attempt_count, 0)::integer,
    coalesce(v_existing.max_attempts, 5)::integer,
    v_existing.locked_until::timestamptz;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._start_rider_transfer_negotiation_internal(p_offer_id uuid, p_accepted_by uuid DEFAULT NULL::uuid, p_auto_accepted boolean DEFAULT false)
 RETURNS TABLE(negotiation_id uuid, negotiation_status text, closed_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare
  v_offer public.rider_transfer_offers%rowtype;
  v_listing public.rider_transfer_listings%rowtype;
  v_existing public.rider_transfer_negotiations%rowtype;

  v_now_game_date date;

  v_current_salary integer := 0;
  v_overall smallint := 0;
  v_potential smallint := 0;
  v_morale smallint := 50;
  v_age integer := 25;

  v_seller_tier text;
  v_buyer_tier text;
  v_seller_tier_score integer := 1;
  v_buyer_tier_score integer := 1;
  v_tier_gap integer := 0;

  v_expected_salary integer;
  v_min_salary integer;
  v_preferred_duration smallint;

  v_auto_decline boolean := false;
  v_auto_decline_reason text := null;
  v_negotiation_id uuid;

  v_seller_owner_user_id public.clubs.owner_user_id%type;
  v_buyer_owner_user_id public.clubs.owner_user_id%type;
  v_seller_club_name text;
  v_buyer_club_name text;
  v_rider_name text;
  v_rider_id uuid;
  v_seller_club_id uuid;
  v_buyer_club_id uuid;
begin
  select *
  into v_existing
  from public.rider_transfer_negotiations n
  where n.offer_id = p_offer_id
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.status,
      v_existing.closed_reason;
    return;
  end if;

  select *
  into v_offer
  from public.rider_transfer_offers o
  where o.id = p_offer_id
  for update;

  if not found then
    raise exception 'Transfer offer not found';
  end if;

  if v_offer.status <> 'open' then
    raise exception 'Only open offers can move to rider negotiation';
  end if;

  select *
  into v_listing
  from public.rider_transfer_listings l
  where l.id = v_offer.listing_id
  for update;

  if not found then
    raise exception 'Transfer listing not found';
  end if;

  if v_listing.status <> 'listed' then
    raise exception 'Listing is not active';
  end if;

  v_rider_id := v_offer.rider_id;
  v_seller_club_id := v_offer.seller_club_id;
  v_buyer_club_id := v_offer.buyer_club_id;

  v_now_game_date := public.get_current_game_date_date();

  if v_offer.expires_on_game_date is not null
     and v_offer.expires_on_game_date < v_now_game_date then
    update public.rider_transfer_offers o
    set
      status = 'expired',
      auto_block_reason = 'offer_expired',
      metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
        'expired_at', now(),
        'expired_on_game_date', v_now_game_date
      )
    where o.id = v_offer.id
      and o.status = 'open';

    perform public.log_rider_transfer_event(
      p_event_type      => 'offer_expired',
      p_rider_id        => v_offer.rider_id,
      p_listing_id      => v_offer.listing_id,
      p_offer_id        => v_offer.id,
      p_seller_club_id  => v_offer.seller_club_id,
      p_buyer_club_id   => v_offer.buyer_club_id,
      p_event_game_date => v_now_game_date,
      p_payload         => jsonb_build_object('reason', 'offer_expired')
    );

    raise exception 'Offer has expired';
  end if;

  if v_listing.expires_on_game_date is not null
     and v_listing.expires_on_game_date < v_now_game_date then
    update public.rider_transfer_listings l
    set status = 'expired'
    where l.id = v_listing.id
      and l.status = 'listed';

    update public.riders r
    set release_requested = false
    where r.id = v_listing.rider_id;

    perform public.log_rider_transfer_event(
      p_event_type      => 'listing_expired',
      p_rider_id        => v_listing.rider_id,
      p_listing_id      => v_listing.id,
      p_seller_club_id  => v_listing.seller_club_id,
      p_event_game_date => v_now_game_date,
      p_payload         => jsonb_build_object('reason', 'listing_expired_before_negotiation')
    );

    raise exception 'Listing has expired';
  end if;

  select
    coalesce(rc.salary_weekly, r.salary, 0),
    coalesce(r.overall, 0),
    coalesce(r.potential, 0),
    coalesce(r.morale, 50),
    public.get_age_years_on_game_date(r.birth_date),
    seller.club_tier::text,
    buyer.club_tier::text,
    seller.owner_user_id,
    buyer.owner_user_id,
    coalesce(
      to_jsonb(seller)->>'name',
      to_jsonb(seller)->>'club_name',
      to_jsonb(seller)->>'display_name',
      seller.id::text
    ),
    coalesce(
      to_jsonb(buyer)->>'name',
      to_jsonb(buyer)->>'club_name',
      to_jsonb(buyer)->>'display_name',
      buyer.id::text
    ),
    coalesce(
      nullif(
        trim(
          concat_ws(
            ' ',
            to_jsonb(r)->>'first_name',
            to_jsonb(r)->>'last_name'
          )
        ),
        ''
      ),
      to_jsonb(r)->>'name',
      to_jsonb(r)->>'rider_name',
      to_jsonb(r)->>'display_name',
      to_jsonb(r)->>'full_name',
      r.id::text
    )
  into
    v_current_salary,
    v_overall,
    v_potential,
    v_morale,
    v_age,
    v_seller_tier,
    v_buyer_tier,
    v_seller_owner_user_id,
    v_buyer_owner_user_id,
    v_seller_club_name,
    v_buyer_club_name,
    v_rider_name
  from public.riders r
  join public.clubs seller
    on seller.id = v_offer.seller_club_id
  join public.clubs buyer
    on buyer.id = v_offer.buyer_club_id
  left join lateral (
    select rc_inner.salary_weekly
    from public.rider_contracts rc_inner
    where rc_inner.rider_id = r.id
      and rc_inner.club_id = v_offer.seller_club_id
      and rc_inner.status = 'active'
    order by rc_inner.created_at desc
    limit 1
  ) rc on true
  where r.id = v_offer.rider_id;

  v_seller_tier_score :=
    case v_seller_tier
      when 'worldteam' then 4
      when 'proteam' then 3
      when 'continental' then 2
      when 'amateur' then 1
      else 1
    end;

  v_buyer_tier_score :=
    case v_buyer_tier
      when 'worldteam' then 4
      when 'proteam' then 3
      when 'continental' then 2
      when 'amateur' then 1
      else 1
    end;

  v_tier_gap := greatest(v_seller_tier_score - v_buyer_tier_score, 0);

  v_preferred_duration := greatest(
    1,
    least(
      coalesce(public.suggest_initial_contract_seasons(v_age, v_overall, v_potential), 1),
      5
    )
  );

  v_expected_salary :=
    greatest(
      coalesce(v_current_salary, 0),
      round(
        greatest(coalesce(v_current_salary, 0), 100)::numeric
        * (
          1.00
          + case
              when v_overall >= 82 then 0.12
              when v_overall >= 78 then 0.08
              when v_overall >= 74 then 0.05
              else 0.00
            end
          + case
              when v_potential - v_overall >= 8 then 0.08
              when v_potential - v_overall >= 5 then 0.05
              when v_potential - v_overall >= 3 then 0.03
              else 0.00
            end
          + (v_tier_gap * 0.08)
        )
      )::integer
    );

  v_expected_salary := round(
    v_expected_salary::numeric * private.rider_national_prestige_salary_multiplier_v1(v_rider_id)
  )::integer;

  v_min_salary :=
    greatest(
      coalesce(v_current_salary, 0),
      round(v_expected_salary * 0.90)::integer
    );

  v_auto_decline :=
    (
      v_seller_tier_score = 4
      and v_buyer_tier_score <= 2
      and v_overall >= 74
    )
    or (
      v_seller_tier_score >= 3
      and v_buyer_tier_score = 1
      and v_overall >= 70
    )
    or (
      v_tier_gap >= 2
      and v_potential >= 82
    );

  if v_auto_decline then
    v_auto_decline_reason := 'competitive_level_too_low';

    insert into public.rider_transfer_negotiations (
      offer_id,
      listing_id,
      rider_id,
      seller_club_id,
      buyer_club_id,
      status,
      current_salary_weekly,
      expected_salary_weekly,
      min_acceptable_salary_weekly,
      preferred_duration_seasons,
      attempt_count,
      max_attempts,
      opened_on_game_date,
      expires_on_game_date,
      closed_reason,
      notes_json
    )
    values (
      v_offer.id,
      v_offer.listing_id,
      v_offer.rider_id,
      v_offer.seller_club_id,
      v_offer.buyer_club_id,
      'declined',
      v_current_salary,
      v_expected_salary,
      v_min_salary,
      v_preferred_duration,
      0,
      5,
      v_now_game_date,
      v_now_game_date,
      v_auto_decline_reason,
      jsonb_build_object(
        'seller_tier', v_seller_tier,
        'buyer_tier', v_buyer_tier,
        'auto_accepted', p_auto_accepted,
        'accepted_by', p_accepted_by
      )
    )
    returning id into v_negotiation_id;

    update public.rider_transfer_offers o
    set
      status = 'rider_declined',
      auto_block_reason = v_auto_decline_reason,
      metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
        'club_accepted_at', now(),
        'club_accepted_by', p_accepted_by,
        'club_auto_accepted', p_auto_accepted,
        'rider_declined_at', now(),
        'rider_decline_reason', v_auto_decline_reason
      )
    where o.id = v_offer.id;

    perform public.log_rider_transfer_event(
      p_event_type      => 'rider_auto_declined_destination',
      p_rider_id        => v_offer.rider_id,
      p_listing_id      => v_offer.listing_id,
      p_offer_id        => v_offer.id,
      p_negotiation_id  => v_negotiation_id,
      p_seller_club_id  => v_offer.seller_club_id,
      p_buyer_club_id   => v_offer.buyer_club_id,
      p_actor_user_id   => p_accepted_by,
      p_event_game_date => v_now_game_date,
      p_payload         => jsonb_build_object(
        'reason', v_auto_decline_reason,
        'seller_tier', v_seller_tier,
        'buyer_tier', v_buyer_tier,
        'expected_salary_weekly', v_expected_salary,
        'min_acceptable_salary_weekly', v_min_salary
      )
    );

    if v_seller_owner_user_id is not null then
      perform public.create_transfer_notification(
        p_user_id => v_seller_owner_user_id,
        p_type_code => 'RIDER_NEGOTIATION_DECLINED',
        p_title => format('Negotiation ended: %s', v_rider_name),
        p_message => format(
          '%s declined contract terms from %s.',
          v_rider_name,
          v_buyer_club_name
        ),
        p_offer_id => v_offer.id,
        p_listing_id => v_listing.id,
        p_negotiation_id => v_negotiation_id,
        p_rider_id => v_rider_id,
        p_action_url => format(
          '/dashboard/transfers?activity=outgoing&offerId=%s',
          v_offer.id
        ),
        p_payload_json => jsonb_build_object(
          'status', 'declined',
          'reason', v_auto_decline_reason,
          'offer_id', v_offer.id,
          'listing_id', v_listing.id,
          'negotiation_id', v_negotiation_id,
          'rider_id', v_rider_id,
          'rider_name', v_rider_name,
          'buyer_club_id', v_buyer_club_id,
          'buyer_club_name', v_buyer_club_name,
          'seller_club_id', v_seller_club_id,
          'seller_club_name', v_seller_club_name,
          'offer_salary_weekly', null,
          'offer_duration_seasons', null,
          'offer_path', format('/dashboard/transfers?activity=outgoing&offerId=%s', v_offer.id),
          'rider_profile_path', format('/dashboard/my-riders/%s', v_rider_id)
        )
      );
    end if;

    return query
    select
      v_negotiation_id,
      'declined'::text,
      v_auto_decline_reason;
    return;
  end if;

  update public.rider_transfer_offers o
  set
    status = 'club_accepted',
    metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
      'club_accepted_at', now(),
      'club_accepted_by', p_accepted_by,
      'club_auto_accepted', p_auto_accepted
    )
  where o.id = v_offer.id;

  update public.rider_transfer_offers o
  set
    status = 'auto_blocked',
    auto_block_reason = 'another_offer_club_accepted',
    metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
      'auto_blocked_at', now()
    )
  where o.listing_id = v_offer.listing_id
    and o.id <> v_offer.id
    and o.status = 'open';

  update public.rider_transfer_listings l
  set status = 'club_accepted'
  where l.id = v_offer.listing_id;

  insert into public.rider_transfer_negotiations (
    offer_id,
    listing_id,
    rider_id,
    seller_club_id,
    buyer_club_id,
    status,
    current_salary_weekly,
    expected_salary_weekly,
    min_acceptable_salary_weekly,
    preferred_duration_seasons,
    attempt_count,
    max_attempts,
    opened_on_game_date,
    expires_on_game_date,
    notes_json
  )
  values (
    v_offer.id,
    v_offer.listing_id,
    v_offer.rider_id,
    v_offer.seller_club_id,
    v_offer.buyer_club_id,
    'open',
    v_current_salary,
    v_expected_salary,
    v_min_salary,
    v_preferred_duration,
    0,
    5,
    v_now_game_date,
    case
      when v_listing.expires_on_game_date is null then v_now_game_date + 3
      else least(v_now_game_date + 3, v_listing.expires_on_game_date)
    end,
    jsonb_build_object(
      'seller_tier', v_seller_tier,
      'buyer_tier', v_buyer_tier,
      'auto_accepted', p_auto_accepted,
      'accepted_by', p_accepted_by
    )
  )
  returning id into v_negotiation_id;

  perform public.log_rider_transfer_event(
    p_event_type      => 'negotiation_opened',
    p_rider_id        => v_offer.rider_id,
    p_listing_id      => v_offer.listing_id,
    p_offer_id        => v_offer.id,
    p_negotiation_id  => v_negotiation_id,
    p_seller_club_id  => v_offer.seller_club_id,
    p_buyer_club_id   => v_offer.buyer_club_id,
    p_actor_user_id   => p_accepted_by,
    p_event_game_date => v_now_game_date,
    p_payload         => jsonb_build_object(
      'expected_salary_weekly', v_expected_salary,
      'min_acceptable_salary_weekly', v_min_salary,
      'preferred_duration_seasons', v_preferred_duration,
      'seller_tier', v_seller_tier,
      'buyer_tier', v_buyer_tier,
      'auto_accepted', p_auto_accepted
    )
  );

  if v_buyer_owner_user_id is not null then
    perform public.create_transfer_notification(
      p_user_id => v_buyer_owner_user_id,
      p_type_code => 'RIDER_NEGOTIATION_OPENED',
      p_title => format('Negotiation active: %s', v_rider_name),
      p_message => format(
        '%s has started contract negotiations with your club.',
        v_rider_name
      ),
      p_offer_id => v_offer.id,
      p_listing_id => v_listing.id,
      p_negotiation_id => v_negotiation_id,
      p_rider_id => v_rider_id,
      p_action_url => format(
        '/dashboard/transfers/negotiations/%s',
        v_negotiation_id
      ),
      p_payload_json => jsonb_build_object(
        'status', 'open',
        'offer_id', v_offer.id,
        'listing_id', v_listing.id,
        'negotiation_id', v_negotiation_id,
        'rider_id', v_rider_id,
        'rider_name', v_rider_name,
        'buyer_club_id', v_buyer_club_id,
        'buyer_club_name', v_buyer_club_name,
        'seller_club_id', v_seller_club_id,
        'seller_club_name', v_seller_club_name,
        'negotiation_path', format('/dashboard/transfers/negotiations/%s', v_negotiation_id),
        'offer_path', format('/dashboard/transfers?activity=incoming&offerId=%s', v_offer.id),
        'rider_profile_path', format('/dashboard/transfers/negotiations/%s', v_negotiation_id)
      )
    );
  end if;

  if v_seller_owner_user_id is not null then
    perform public.create_transfer_notification(
      p_user_id => v_seller_owner_user_id,
      p_type_code => 'RIDER_NEGOTIATION_OPENED',
      p_title => format('Negotiation opened for %s', v_rider_name),
      p_message => format(
        '%s will now negotiate contract terms with %s.',
        v_rider_name,
        v_buyer_club_name
      ),
      p_offer_id => v_offer.id,
      p_listing_id => v_listing.id,
      p_negotiation_id => v_negotiation_id,
      p_rider_id => v_rider_id,
      p_action_url => format(
        '/dashboard/transfers?activity=outgoing&offerId=%s',
        v_offer.id
      ),
      p_payload_json => jsonb_build_object(
        'status', 'open',
        'offer_id', v_offer.id,
        'listing_id', v_listing.id,
        'negotiation_id', v_negotiation_id,
        'rider_id', v_rider_id,
        'rider_name', v_rider_name,
        'buyer_club_id', v_buyer_club_id,
        'buyer_club_name', v_buyer_club_name,
        'seller_club_id', v_seller_club_id,
        'seller_club_name', v_seller_club_name,
        'expected_salary_weekly', v_expected_salary,
        'min_acceptable_salary_weekly', v_min_salary,
        'preferred_duration_seasons', v_preferred_duration,
        'offer_path', format(
          '/dashboard/transfers?activity=outgoing&offerId=%s',
          v_offer.id
        ),
        'rider_profile_path', format(
          '/dashboard/my-riders/%s',
          v_rider_id
        )
      )
    );
  end if;

  return query
  select
    v_negotiation_id,
    'open'::text,
    null::text;
end;$function$
;

CREATE OR REPLACE FUNCTION public.start_rider_free_agent_negotiation_v2(p_free_agent_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_effective_club_id uuid;
  v_rider_id uuid;
  v_free_agent_status text;
  v_expected_salary integer;
  v_expires_on_game_date date;
  v_opened_in_season integer;
  v_opened_on_game_date date;
  v_existing_negotiation_id uuid;
  v_new_negotiation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_free_agent_id is null then
    raise exception 'Free agent id is required';
  end if;

  v_effective_club_id := coalesce(
    p_club_id,
    (
      select c.id
      from public.clubs c
      where c.owner_user_id = auth.uid()
        and c.deleted_at is null
      order by
        case
          when c.club_type = 'main' then 0
          when c.parent_club_id is null and coalesce(c.club_type, '') <> 'developing' then 1
          else 2
        end,
        c.created_at asc
      limit 1
    )
  );

  if v_effective_club_id is null then
    raise exception 'No main club found for current user';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = v_effective_club_id
      and c.owner_user_id = auth.uid()
      and c.deleted_at is null
      and coalesce(c.club_type, '') <> 'developing'
  ) then
    raise exception 'Selected club is not allowed for this action';
  end if;

  select n.id
  into v_existing_negotiation_id
  from public.rider_free_agent_negotiations n
  where n.free_agent_id = p_free_agent_id
    and n.club_id = v_effective_club_id
    and n.status = 'open'
  order by n.created_at desc
  limit 1;

  if v_existing_negotiation_id is not null then
    return jsonb_build_object(
      'negotiation_id', v_existing_negotiation_id,
      'status', 'open',
      'reused', true
    );
  end if;

  select
    fa.rider_id,
    fa.status,
    famv.expected_salary_weekly,
    famv.expires_on_game_date
  into
    v_rider_id,
    v_free_agent_status,
    v_expected_salary,
    v_expires_on_game_date
  from public.rider_free_agents fa
  left join public.free_agent_market_view famv
    on famv.free_agent_id = fa.id
  where fa.id = p_free_agent_id
  for update of fa;

  if v_rider_id is null then
    raise exception 'Free agent not found';
  end if;

  if coalesce(v_free_agent_status, '') not in ('open', 'available') then
    raise exception 'Free agent is not available';
  end if;

  if v_expected_salary is null or v_expected_salary <= 0 then
    raise exception 'Expected salary missing for free agent %', p_free_agent_id;
  end if;

  v_expected_salary := round(
    v_expected_salary::numeric * private.rider_national_prestige_salary_multiplier_v1(v_rider_id)
  )::integer;

  select gs.season_number
  into v_opened_in_season
  from public.game_state gs
  limit 1;

  if v_opened_in_season is null then
    raise exception 'game_state.season_number is null';
  end if;

  v_opened_on_game_date := public.get_current_game_date_date();

  if v_opened_on_game_date is null then
    raise exception 'Current game date is null';
  end if;

  insert into public.rider_free_agent_negotiations (
    free_agent_id,
    rider_id,
    club_id,
    status,
    current_salary_weekly,
    expected_salary_weekly,
    min_acceptable_salary_weekly,
    preferred_duration_seasons,
    offer_salary_weekly,
    offer_duration_seasons,
    attempt_count,
    max_attempts,
    locked_until,
    opened_in_season,
    opened_on_game_date,
    closed_reason,
    notes_json,
    expires_on_game_date
  )
  values (
    p_free_agent_id,
    v_rider_id,
    v_effective_club_id,
    'open',
    null,
    v_expected_salary,
    v_expected_salary,
    1,
    v_expected_salary,
    1,
    0,
    5,
    null,
    v_opened_in_season,
    v_opened_on_game_date,
    null,
    '{}'::jsonb,
    coalesce(v_expires_on_game_date, v_opened_on_game_date + 3)
  )
  returning id
  into v_new_negotiation_id;

  return jsonb_build_object(
    'negotiation_id', v_new_negotiation_id,
    'status', 'open',
    'reused', false,
    'club_id', v_effective_club_id
  );

exception
  when not_null_violation then
    raise exception
      'NOT NULL failure. free_agent_id=%, club_id=%, rider_id=%, expected_salary=%, opened_in_season=%, opened_on_game_date=%, expires_on_game_date=%',
      p_free_agent_id,
      v_effective_club_id,
      v_rider_id,
      v_expected_salary,
      v_opened_in_season,
      v_opened_on_game_date,
      v_expires_on_game_date;
end;
$function$
;

drop trigger if exists trg_award_national_team_prestige_v1 on public.national_team_lineup_members;
create trigger trg_award_national_team_prestige_v1
after insert on public.national_team_lineup_members
for each row execute function private.trg_award_national_team_prestige_v1();

drop trigger if exists trg_award_national_champion_prestige_v1 on public.national_championship_editions;
create trigger trg_award_national_champion_prestige_v1
after update of champion_rider_id on public.national_championship_editions
for each row execute function private.trg_award_national_champion_prestige_v1();

drop trigger if exists trg_award_world_champion_prestige_v1 on public.world_road_championship_editions;
create trigger trg_award_world_champion_prestige_v1
after update of champion_rider_id on public.world_road_championship_editions
for each row execute function private.trg_award_world_champion_prestige_v1();

grant execute on function public.get_rider_national_prestige_v1(uuid) to authenticated;

do $$
declare r record;
begin
  for r in
    select distinct lm.rider_id,s.season_number,l.id lineup_id
    from public.national_team_lineup_members lm
    join public.national_team_lineups l on l.id=lm.lineup_id
    join public.national_team_squads s on s.id=l.squad_id
  loop
    perform private.award_rider_national_prestige_v1(
      r.rider_id,'national_team',r.season_number,'national_team_lineup',r.lineup_id,'{}'::jsonb
    );
  end loop;

  for r in
    select champion_rider_id rider_id,season_number,id,country_code
    from public.national_championship_editions
    where champion_rider_id is not null
  loop
    perform private.award_rider_national_prestige_v1(
      r.rider_id,'national_champion',r.season_number,'national_championship',r.id,
      jsonb_build_object('country_code',r.country_code)
    );
  end loop;

  for r in
    select id,season_number,champion_rider_id,second_rider_id,third_rider_id
    from public.world_road_championship_editions
    where champion_rider_id is not null
  loop
    perform private.award_rider_national_prestige_v1(
      r.champion_rider_id,'world_champion',r.season_number,'world_road_championship',r.id,
      jsonb_build_object('place',1)
    );
    if r.second_rider_id is not null then
      perform private.award_rider_national_prestige_v1(
        r.second_rider_id,'world_podium',r.season_number,'world_road_championship',r.id,
        jsonb_build_object('place',2)
      );
    end if;
    if r.third_rider_id is not null then
      perform private.award_rider_national_prestige_v1(
        r.third_rider_id,'world_podium',r.season_number,'world_road_championship',r.id,
        jsonb_build_object('place',3)
      );
    end if;
  end loop;

  for r in select distinct rider_id from public.rider_national_prestige_awards
  loop
    begin
      perform public.refresh_rider_market_value(r.rider_id);
    exception when others then null;
    end;
  end loop;
end $$;
