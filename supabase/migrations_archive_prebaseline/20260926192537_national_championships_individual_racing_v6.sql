alter table public.national_championship_rider_plans
  alter column phase_1_command set default 'ride_naturally',
  alter column phase_2_command set default 'ride_naturally',
  alter column phase_3_command set default 'ride_naturally',
  alter column phase_4_command set default 'ride_naturally';

update public.national_championship_rider_plans
set
  phase_1_command = case when phase_1_command in ('follow_team_plan','protect_leader','control_tempo','lead_out') then 'ride_naturally' else phase_1_command end,
  phase_2_command = case when phase_2_command in ('follow_team_plan','protect_leader','control_tempo','lead_out') then 'ride_naturally' else phase_2_command end,
  phase_3_command = case when phase_3_command in ('follow_team_plan','protect_leader','control_tempo','lead_out') then 'ride_naturally' else phase_3_command end,
  phase_4_command = case when phase_4_command in ('follow_team_plan','protect_leader','control_tempo','lead_out') then 'ride_naturally' else phase_4_command end,
  updated_at = now()
where phase_1_command in ('follow_team_plan','protect_leader','control_tempo','lead_out')
   or phase_2_command in ('follow_team_plan','protect_leader','control_tempo','lead_out')
   or phase_3_command in ('follow_team_plan','protect_leader','control_tempo','lead_out')
   or phase_4_command in ('follow_team_plan','protect_leader','control_tempo','lead_out');

create or replace function public.national_championship_sanitize_individual_command_v1(p_command text)
returns text language sql immutable set search_path = ''
as $$
  select case lower(trim(coalesce(p_command,'')))
    when 'ride_naturally' then 'ride_naturally'
    when 'conserve_energy' then 'conserve_energy'
    when 'stay_near_front' then 'stay_near_front'
    when 'join_breakaway' then 'join_breakaway'
    when 'attack' then 'attack'
    when 'chase_breakaway' then 'chase_breakaway'
    when 'climb_hard' then 'climb_hard'
    when 'sprint' then 'sprint'
    when 'avoid_risks' then 'avoid_risks'
    else 'ride_naturally'
  end;
$$;

create or replace function public.national_championship_sanitize_tactics_json_v1(p_tactics jsonb,p_rider_ids uuid[])
returns jsonb language plpgsql immutable set search_path = ''
as $$
declare v_result jsonb := '{}'::jsonb; v_rider uuid; v_key text;
begin
  foreach v_rider in array coalesce(p_rider_ids,'{}'::uuid[]) loop
    v_key := v_rider::text;
    v_result := v_result || jsonb_build_object(v_key,jsonb_build_object(
      'phase_1',jsonb_build_object('command',public.national_championship_sanitize_individual_command_v1(p_tactics #>> array[v_key,'phase_1','command'])),
      'phase_2',jsonb_build_object('command',public.national_championship_sanitize_individual_command_v1(p_tactics #>> array[v_key,'phase_2','command'])),
      'phase_3',jsonb_build_object('command',public.national_championship_sanitize_individual_command_v1(p_tactics #>> array[v_key,'phase_3','command'])),
      'phase_4',jsonb_build_object('command',public.national_championship_sanitize_individual_command_v1(p_tactics #>> array[v_key,'phase_4','command']))
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function public.enforce_national_championship_individual_stage_plan_v1()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare v_is_nc boolean := false; v_rider_ids uuid[] := '{}'::uuid[];
begin
  select coalesce((r.metadata->>'national_championship')::boolean,false)
  into v_is_nc from public.races r where r.id=new.race_id;
  if not coalesce(v_is_nc,false) then return new; end if;

  select coalesce(array_agg(distinct x.rider_id order by x.rider_id),'{}'::uuid[])
  into v_rider_ids
  from (
    select spr.rider_id from public.race_stage_plan_riders spr where spr.race_stage_plan_id=new.id
    union
    select key::uuid from jsonb_object_keys(coalesce(new.rider_individual_tactics_json,'{}'::jsonb)) key
      where key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    union
    select key::uuid from jsonb_object_keys(coalesce(new.rider_roles_json,'{}'::jsonb)) key
      where key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) x;

  new.team_strategy := 'balanced';
  new.team_tactic_json := jsonb_build_object(
    'plan','balanced','internal_neutral_placeholder',true,'team_commands_enabled',false,
    'notes','National Championship: every rider competes independently'
  );
  select coalesce(jsonb_object_agg(rider_id::text,to_jsonb('free_role'::text)),'{}'::jsonb)
  into new.rider_roles_json from unnest(v_rider_ids) rider_id;
  new.rider_individual_tactics_json :=
    public.national_championship_sanitize_tactics_json_v1(
      coalesce(new.rider_individual_tactics_json,'{}'::jsonb),v_rider_ids
    );
  select coalesce(jsonb_object_agg(rider_id::text,jsonb_build_object('source','organizer','standardized',true)),'{}'::jsonb)
  into new.rider_supplies_json from unnest(v_rider_ids) rider_id;
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
    'national_championship',true,'individual_only',true,'team_commands_enabled',false,
    'staff_assets_supplies_locked',true
  );
  return new;
end;
$$;

drop trigger if exists trg_enforce_national_championship_individual_stage_plan_v1 on public.race_stage_plans;
create trigger trg_enforce_national_championship_individual_stage_plan_v1
before insert or update on public.race_stage_plans
for each row execute function public.enforce_national_championship_individual_stage_plan_v1();

create or replace function public.block_national_championship_preparation_resource_v1()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare v_is_nc boolean := false;
begin
  select coalesce((rp.metadata->>'national_championship')::boolean,false)
  into v_is_nc from public.race_preparations rp where rp.id=new.race_preparation_id;
  if coalesce(v_is_nc,false) then
    raise exception 'National Championships use organizer-managed staff, assets and supplies.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_nc_staff_v1 on public.race_preparation_staff;
create trigger trg_block_nc_staff_v1 before insert or update on public.race_preparation_staff
for each row execute function public.block_national_championship_preparation_resource_v1();
drop trigger if exists trg_block_nc_assets_v1 on public.race_preparation_assets;
create trigger trg_block_nc_assets_v1 before insert or update on public.race_preparation_assets
for each row execute function public.block_national_championship_preparation_resource_v1();
drop trigger if exists trg_block_nc_supplies_v1 on public.race_preparation_supplies;
create trigger trg_block_nc_supplies_v1 before insert or update on public.race_preparation_supplies
for each row execute function public.block_national_championship_preparation_resource_v1();

create or replace function public.race_engine_command_effort_multiplier_v1(p_command text)
returns numeric language sql immutable security definer set search_path = 'public'
as $$
  select case lower(coalesce(p_command,'follow_team_plan'))
    when 'attack' then 1.45 when 'climb_hard' then 1.35 when 'chase_breakaway' then 1.30
    when 'lead_out' then 1.28 when 'sprint' then 1.40 when 'join_breakaway' then 1.25
    when 'control_tempo' then 1.18 when 'stay_near_front' then 1.12 when 'protect_leader' then 1.12
    when 'avoid_risks' then 0.92 when 'conserve_energy' then 0.82 when 'ride_naturally' then 1.00
    when 'climber_support' then 1.12 when 'sprint_control' then 1.12 when 'gc_protection' then 1.08
    when 'breakaway_support' then 1.12 when 'balanced' then 1.00 when 'follow_team_plan' then 1.00
    else 1.00 end;
$$;

create or replace function public.race_engine_command_performance_modifier_v1(p_command text)
returns numeric language sql immutable security definer set search_path = 'public'
as $$
  select case lower(coalesce(p_command,'follow_team_plan'))
    when 'attack' then 3.00 when 'climb_hard' then 2.00 when 'chase_breakaway' then 1.75
    when 'lead_out' then 1.50 when 'sprint' then 2.25 when 'join_breakaway' then 1.25
    when 'control_tempo' then 0.75 when 'stay_near_front' then 0.50 when 'protect_leader' then 0.50
    when 'avoid_risks' then -0.25 when 'conserve_energy' then -1.50 when 'ride_naturally' then 0.00
    when 'climber_support' then 0.75 when 'sprint_control' then 0.75 when 'gc_protection' then 0.50
    when 'breakaway_support' then 0.75 when 'balanced' then 0.00 when 'follow_team_plan' then 0.00
    else 0.00 end;
$$;

revoke execute on function public.national_championship_sanitize_individual_command_v1(text) from public,anon,authenticated;
revoke execute on function public.national_championship_sanitize_tactics_json_v1(jsonb,uuid[]) from public,anon,authenticated;
revoke execute on function public.enforce_national_championship_individual_stage_plan_v1() from public,anon,authenticated;
revoke execute on function public.block_national_championship_preparation_resource_v1() from public,anon,authenticated;


CREATE OR REPLACE FUNCTION public.race_engine_get_stage_rider_inputs_v1(p_stage_id uuid)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, stage_role text, stage_tactic text, sprint smallint, climbing smallint, time_trial smallint, flat smallint, endurance smallint, recovery smallint, resistance smallint, race_iq smallint, teamwork smallint, overall smallint, morale smallint, fatigue smallint, availability_status text, unavailable_until date, unavailable_reason text, start_stamina numeric, fatigue_before_stage numeric, preparation_id uuid, stage_plan_id uuid, race_preparation_rider_id uuid, race_stage_plan_rider_id uuid, rider_snapshot_json jsonb, availability_snapshot_json jsonb, bonus_snapshot_json jsonb, rider_stage_snapshot_json jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

with stage_base as (
  select
    stage.id as stage_id,
    stage.race_id,
    stage.stage_number,
    coalesce((race.metadata ->> 'national_championship')::boolean, false)
      as is_national_championship,
    case
      when coalesce((race.metadata ->> 'national_championship')::boolean, false)
       and nullif(race.metadata ->> 'edition_id', '') is not null
      then (race.metadata ->> 'edition_id')::uuid
      else null::uuid
    end as national_championship_edition_id
  from public.race_stages stage
  join public.races race
    on race.id = stage.race_id
  where stage.id = p_stage_id
),

participants as (
  select
    participant.race_id,
    stage.stage_id,
    participant.rider_id,
    participant.team_id,
    case
      when stage.is_national_championship
        then entry.club_id_snapshot
      else participant.team_id
    end as source_club_id,
    participant.rider_name_snapshot,
    case
      when stage.is_national_championship
        then coalesce(participant.rider_name_snapshot, 'Individual rider')
      else participant.team_name_snapshot
    end as team_name_snapshot,
    participant.role_snapshot
  from stage_base stage
  join public.race_participant_riders participant
    on participant.race_id = stage.race_id
  left join public.national_championship_entries entry
    on stage.is_national_championship
   and entry.edition_id = stage.national_championship_edition_id
   and entry.rider_id = participant.rider_id
),

preparation_candidates as (
  select
    preparation.id as preparation_id,
    preparation.race_id,
    preparation.club_id as owner_club_id,

    case
      when nullif(trim(preparation.engine_payload_json ->> 'participating_club_id'), '') ~*
        (
          '^[0-9a-f]{8}-'
          || '[0-9a-f]{4}-'
          || '[0-9a-f]{4}-'
          || '[0-9a-f]{4}-'
          || '[0-9a-f]{12}$'
        )
      then (preparation.engine_payload_json ->> 'participating_club_id')::uuid
      else preparation.club_id
    end as participating_club_id,

    preparation.status,
    preparation.updated_at
  from stage_base stage
  join public.race_preparations preparation
    on preparation.race_id = stage.race_id
),

preparations as (
  select distinct on (
    candidate.race_id,
    candidate.participating_club_id
  )
    candidate.preparation_id,
    candidate.race_id,
    candidate.owner_club_id,
    candidate.participating_club_id
  from preparation_candidates candidate
  order by
    candidate.race_id,
    candidate.participating_club_id,
    case
      when candidate.status = 'submitted' then 0
      else 1
    end,
    candidate.updated_at desc,
    candidate.preparation_id desc
),

stage_plan_candidates as (
  select
    stage_plan.id as stage_plan_id,
    stage_plan.race_preparation_id,
    stage_plan.stage_id,
    stage_plan.stage_number,

    case
      when stage_plan.stage_id = stage.stage_id then 0
      else 1
    end as stage_match_priority

  from public.race_stage_plans stage_plan
  join stage_base stage
    on (
      stage_plan.stage_id = stage.stage_id
      or (
        stage_plan.stage_id is null
        and stage_plan.stage_number = stage.stage_number
      )
    )
),

stage_plans as (
  select distinct on (
    candidate.race_preparation_id
  )
    candidate.stage_plan_id,
    candidate.race_preparation_id,
    candidate.stage_id,
    candidate.stage_number
  from stage_plan_candidates candidate
  order by
    candidate.race_preparation_id,
    candidate.stage_match_priority,
    candidate.stage_plan_id desc
),

input_rows as (
  select
    participant.race_id,
    participant.stage_id,
    participant.rider_id,
    participant.team_id,

    coalesce(
      participant.rider_name_snapshot,
      rider.display_name,
      concat_ws(' ', rider.first_name, rider.last_name)
    ) as rider_name,

    coalesce(
      participant.team_name_snapshot,
      club.name
    ) as team_name,

    coalesce(
      nullif(nullif(stage_plan_rider.stage_role, ''), 'selected'),
      nullif(nullif(preparation_rider.race_role, ''), 'selected'),
      nullif(nullif(participant.role_snapshot, ''), 'selected'),
      nullif(rider.role::text, ''),
      'free_role'
    ) as role_code,

    coalesce(
      nullif(nullif(stage_plan_rider.stage_role, ''), 'selected'),
      'free_role'
    ) as stage_role,

    coalesce(
      nullif(stage_plan_rider.tactic, ''),
      'balanced'
    ) as stage_tactic,

    rider.sprint,
    rider.climbing,
    rider.time_trial,
    rider.flat,
    rider.endurance,
    rider.recovery,
    rider.resistance,
    rider.race_iq,
    rider.teamwork,
    rider.overall,
    rider.morale,
    rider.fatigue,
    rider.availability_status,
    rider.unavailable_until,
    rider.unavailable_reason,

    coalesce(race_condition.race_sharpness, 50)::numeric as race_sharpness,

    greatest(
      -5,
      least(
        5,
        (coalesce(race_condition.race_sharpness, 50)::numeric - 50) * 0.12
      )
    )::numeric as race_sharpness_start_stamina_modifier,

    preparation.preparation_id,
    stage_plan.stage_plan_id,
    preparation_rider.id as race_preparation_rider_id,
    stage_plan_rider.id as race_stage_plan_rider_id,

    coalesce(preparation_rider.rider_snapshot_json, '{}'::jsonb) as rider_snapshot_json,
    coalesce(preparation_rider.availability_snapshot_json, '{}'::jsonb) as availability_snapshot_json,
    coalesce(preparation_rider.bonus_snapshot_json, '{}'::jsonb) as bonus_snapshot_json,
    coalesce(stage_plan_rider.rider_stage_snapshot_json, '{}'::jsonb) as rider_stage_snapshot_json

  from participants participant

  join public.riders rider
    on rider.id = participant.rider_id

  left join public.clubs club
    on club.id = participant.source_club_id

  left join public.rider_race_condition race_condition
    on race_condition.rider_id = participant.rider_id

  left join preparations preparation
    on preparation.race_id = participant.race_id
   and preparation.participating_club_id = participant.source_club_id

  left join public.race_preparation_riders preparation_rider
    on preparation_rider.race_preparation_id = preparation.preparation_id
   and preparation_rider.rider_id = participant.rider_id

  left join stage_plans stage_plan
    on stage_plan.race_preparation_id = preparation.preparation_id

  left join public.race_stage_plan_riders stage_plan_rider
    on stage_plan_rider.race_stage_plan_id = stage_plan.stage_plan_id
   and stage_plan_rider.rider_id = participant.rider_id
)

select
  input_rows.race_id,
  input_rows.stage_id,
  input_rows.rider_id,
  input_rows.team_id,
  input_rows.rider_name,
  input_rows.team_name,
  input_rows.role_code,
  input_rows.stage_role,
  input_rows.stage_tactic,
  input_rows.sprint,
  input_rows.climbing,
  input_rows.time_trial,
  input_rows.flat,
  input_rows.endurance,
  input_rows.recovery,
  input_rows.resistance,
  input_rows.race_iq,
  input_rows.teamwork,
  input_rows.overall,
  input_rows.morale,
  input_rows.fatigue,
  input_rows.availability_status,
  input_rows.unavailable_until,
  input_rows.unavailable_reason,

  greatest(
    1,
    least(
      100,

      100
      - (coalesce(input_rows.fatigue, 0)::numeric * 0.45)

      + (
        greatest(
          coalesce(input_rows.recovery, 50) - 50,
          0
        )::numeric * 0.08
      )

      + case
          when input_rows.availability_status = 'fit' then 0
          when input_rows.availability_status = 'not_fully_fit' then -8
          when input_rows.availability_status = 'sick' then -18
          when input_rows.availability_status = 'injured' then -25
          else -5
        end

      + input_rows.race_sharpness_start_stamina_modifier
    )
  ) as start_stamina,

  coalesce(input_rows.fatigue, 0)::numeric as fatigue_before_stage,

  input_rows.preparation_id,
  input_rows.stage_plan_id,
  input_rows.race_preparation_rider_id,
  input_rows.race_stage_plan_rider_id,

  input_rows.rider_snapshot_json,
  input_rows.availability_snapshot_json,

  input_rows.bonus_snapshot_json
    || jsonb_build_object(
      'race_sharpness_engine_applied', true,
      'race_sharpness_engine_version', '2026-06-19-phase-3a',
      'race_sharpness', input_rows.race_sharpness,
      'race_sharpness_start_stamina_modifier',
        input_rows.race_sharpness_start_stamina_modifier
    ) as bonus_snapshot_json,

  input_rows.rider_stage_snapshot_json
    || jsonb_build_object(
      'race_sharpness_engine_applied', true,
      'race_sharpness_engine_version', '2026-06-19-phase-3a',
      'race_sharpness', input_rows.race_sharpness,
      'race_sharpness_start_stamina_modifier',
        input_rows.race_sharpness_start_stamina_modifier
    ) as rider_stage_snapshot_json

from input_rows

order by
  input_rows.team_id,
  input_rows.rider_name;

$function$;

CREATE OR REPLACE FUNCTION public.race_engine_resolve_locked_stage_tactical_plan_v1(p_race_stage_plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payload jsonb;
  v_payload_without_hash jsonb;
  v_snapshot_hash text;
  v_calculated_snapshot_hash text;

  v_team_tactic_json jsonb;
  v_rider_roles_json jsonb;
  v_individual_tactics_json jsonb;
  v_source_hashes jsonb;

  v_team_plan text;
  v_rider record;
  v_rider_key text;
  v_rider_id uuid;
  v_role_raw text;
  v_role_code text;

  v_phase_number integer;
  v_phase_key text;
  v_explicit_raw text;
  v_explicit_command text;
  v_role_default text;
  v_team_base text;
  v_resolved_command text;
  v_resolved_source text;
  v_precedence_rank integer;

  v_rider_phases jsonb;
  v_rider_plan jsonb;
  v_rider_plans jsonb := '{}'::jsonb;
  v_action_counts jsonb := '{}'::jsonb;

  v_invalid_roles jsonb := '[]'::jsonb;
  v_invalid_commands jsonb := '[]'::jsonb;
  v_source_hash_mismatches jsonb := '[]'::jsonb;

  v_rider_count integer := 0;
  v_phase_count integer := 0;
  v_explicit_count integer := 0;
  v_role_default_count integer := 0;
  v_team_base_count integer := 0;
  v_command_count integer;

  v_plan_base jsonb;
  v_resolver_hash text;
begin
  if p_race_stage_plan_id is null then
    return jsonb_build_object(
      'status', 'invalid_request',
      'reason', 'race_stage_plan_id_required'
    );
  end if;

  select
    coalesce(
      rsp.engine_stage_payload_json,
      '{}'::jsonb
    )
  into v_payload
  from public.race_stage_plans rsp
  where rsp.id = p_race_stage_plan_id;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'race_stage_plan_id', p_race_stage_plan_id
    );
  end if;

  if v_payload = '{}'::jsonb then
    return jsonb_build_object(
      'status', 'missing_locked_snapshot',
      'race_stage_plan_id', p_race_stage_plan_id,
      'mutable_stage_plan_fallback_allowed', false,
      'human_command_invention_allowed', false
    );
  end if;

  if coalesce(
       v_payload ->> 'snapshot_schema_version',
       ''
     ) <> 'race_engine_stage_plan_input_snapshot_v1'
  then
    return jsonb_build_object(
      'status', 'invalid_locked_snapshot',
      'reason', 'unsupported_snapshot_schema_version',
      'race_stage_plan_id', p_race_stage_plan_id,
      'actual_snapshot_schema_version',
        v_payload ->> 'snapshot_schema_version'
    );
  end if;

  if coalesce(
       (v_payload ->> 'immutable')::boolean,
       false
     ) is not true
  then
    return jsonb_build_object(
      'status', 'invalid_locked_snapshot',
      'reason', 'snapshot_not_marked_immutable',
      'race_stage_plan_id', p_race_stage_plan_id
    );
  end if;

  v_snapshot_hash :=
    nullif(v_payload ->> 'snapshot_hash', '');

  v_payload_without_hash :=
    v_payload - 'snapshot_hash';

  v_calculated_snapshot_hash :=
    md5(v_payload_without_hash::text);

  if v_snapshot_hash is null
     or v_snapshot_hash <>
        v_calculated_snapshot_hash
  then
    return jsonb_build_object(
      'status', 'invalid_locked_snapshot',
      'reason', 'snapshot_hash_mismatch',
      'race_stage_plan_id', p_race_stage_plan_id,
      'stored_snapshot_hash', v_snapshot_hash,
      'calculated_snapshot_hash',
        v_calculated_snapshot_hash
    );
  end if;

  v_team_tactic_json :=
    coalesce(
      v_payload -> 'team_tactic_json',
      '{}'::jsonb
    );

  v_rider_roles_json :=
    coalesce(
      v_payload -> 'rider_roles_json',
      '{}'::jsonb
    );

  v_individual_tactics_json :=
    coalesce(
      v_payload -> 'rider_individual_tactics_json',
      '{}'::jsonb
    );

  v_source_hashes :=
    coalesce(
      v_payload -> 'source_hashes',
      '{}'::jsonb
    );

  if jsonb_typeof(v_team_tactic_json)
       is distinct from 'object'
     or jsonb_typeof(v_rider_roles_json)
       is distinct from 'object'
     or jsonb_typeof(v_individual_tactics_json)
       is distinct from 'object'
  then
    return jsonb_build_object(
      'status', 'invalid_locked_snapshot',
      'reason', 'tactical_input_sections_must_be_objects',
      'race_stage_plan_id', p_race_stage_plan_id
    );
  end if;

  if nullif(
       v_source_hashes ->> 'team_tactic_json',
       ''
     ) is not null
     and v_source_hashes ->> 'team_tactic_json'
       <> md5(v_team_tactic_json::text)
  then
    v_source_hash_mismatches :=
      v_source_hash_mismatches
      || jsonb_build_array('team_tactic_json');
  end if;

  if nullif(
       v_source_hashes ->> 'rider_roles_json',
       ''
     ) is not null
     and v_source_hashes ->> 'rider_roles_json'
       <> md5(v_rider_roles_json::text)
  then
    v_source_hash_mismatches :=
      v_source_hash_mismatches
      || jsonb_build_array('rider_roles_json');
  end if;

  if nullif(
       v_source_hashes
         ->> 'rider_individual_tactics_json',
       ''
     ) is not null
     and v_source_hashes
           ->> 'rider_individual_tactics_json'
       <> md5(v_individual_tactics_json::text)
  then
    v_source_hash_mismatches :=
      v_source_hash_mismatches
      || jsonb_build_array(
           'rider_individual_tactics_json'
         );
  end if;

  if jsonb_array_length(
       v_source_hash_mismatches
     ) > 0
  then
    return jsonb_build_object(
      'status', 'invalid_locked_snapshot',
      'reason', 'snapshot_source_hash_mismatch',
      'race_stage_plan_id', p_race_stage_plan_id,
      'mismatched_sections',
        v_source_hash_mismatches
    );
  end if;

  v_team_plan :=
    lower(
      coalesce(
        nullif(v_team_tactic_json ->> 'plan', ''),
        nullif(
          v_team_tactic_json ->> 'team_tactic',
          ''
        ),
        nullif(v_team_tactic_json ->> 'tactic', ''),
        'balanced'
      )
    );

  if v_team_plan not in (
    'balanced',
    'aggressive',
    'sprint_control',
    'breakaway',
    'gc_protection',
    'climber_support'
  ) then
    return jsonb_build_object(
      'status', 'not_road_tactical_plan',
      'reason', 'unsupported_road_team_tactic',
      'race_stage_plan_id', p_race_stage_plan_id,
      'team_plan', v_team_plan,
      'supported_team_plans',
        jsonb_build_array(
          'balanced',
          'aggressive',
          'sprint_control',
          'breakaway',
          'gc_protection',
          'climber_support'
        )
    );
  end if;

  if not exists (
    select 1
    from jsonb_object_keys(v_rider_roles_json)
  ) then
    return jsonb_build_object(
      'status', 'invalid_locked_snapshot',
      'reason', 'no_saved_rider_roles',
      'race_stage_plan_id', p_race_stage_plan_id
    );
  end if;

  for v_rider in
    select
      role_entry.key,
      role_entry.value
    from jsonb_each(v_rider_roles_json)
      role_entry
    order by role_entry.key
  loop
    v_rider_key := v_rider.key;
    v_rider_count := v_rider_count + 1;

    begin
      v_rider_id := v_rider_key::uuid;
    exception
      when invalid_text_representation then
        v_invalid_roles :=
          v_invalid_roles
          || jsonb_build_array(
               jsonb_build_object(
                 'rider_key', v_rider_key,
                 'reason', 'rider_key_not_uuid'
               )
             );
        continue;
    end;

    if jsonb_typeof(v_rider.value)
         is distinct from 'string'
    then
      v_invalid_roles :=
        v_invalid_roles
        || jsonb_build_array(
             jsonb_build_object(
               'rider_id', v_rider_id,
               'reason', 'role_value_not_string',
               'value_type',
                 jsonb_typeof(v_rider.value)
             )
           );
      continue;
    end if;

    v_role_raw :=
      lower(
        coalesce(
          nullif(v_rider.value #>> '{}', ''),
          'free_role'
        )
      );

    v_role_code :=
      case v_role_raw
        when 'leader' then 'team_leader_gc'
        when 'gc_leader' then 'team_leader_gc'
        when 'team_leader' then 'team_leader_gc'
        when 'lead_out' then 'lead_out_rider'
        when 'sprint_train' then 'sprint_train_rider'
        when 'breakaway' then 'breakaway_rider'
        when 'protected' then 'protected_rider'
        when 'helper' then 'helper_domestique'
        when 'domestique' then 'helper_domestique'
        when 'mountain_helper'
          then 'mountain_domestique'
        else v_role_raw
      end;

    if v_role_code not in (
      'team_leader_gc',
      'sprinter',
      'lead_out_rider',
      'sprint_train_rider',
      'climber',
      'mountain_domestique',
      'helper_domestique',
      'breakaway_rider',
      'breakaway_chaser',
      'rouleur',
      'protected_rider',
      'free_role'
    ) then
      v_invalid_roles :=
        v_invalid_roles
        || jsonb_build_array(
             jsonb_build_object(
               'rider_id', v_rider_id,
               'saved_role', v_role_raw,
               'reason', 'unsupported_saved_role'
             )
           );
      continue;
    end if;

    v_rider_phases := '{}'::jsonb;

    for v_phase_number in 1..4
    loop
      v_phase_key :=
        'phase_' || v_phase_number::text;

      v_explicit_raw :=
        lower(
          nullif(
            coalesce(
              v_individual_tactics_json
                #>> array[
                      v_rider_key,
                      v_phase_key,
                      'command'
                    ],
              v_team_tactic_json
                #>> array[
                      'individual_tactics_by_rider',
                      v_rider_key,
                      v_phase_key,
                      'command'
                    ]
            ),
            ''
          )
        );

      if v_explicit_raw is not null
         and v_explicit_raw not in (
           'follow_team_plan',
           'ride_naturally',
           'protect_leader',
           'conserve_energy',
           'stay_near_front',
           'control_tempo',
           'chase_breakaway',
           'attack',
           'join_breakaway',
           'lead_out',
           'sprint',
           'climb_hard',
           'avoid_risks'
         )
      then
        v_invalid_commands :=
          v_invalid_commands
          || jsonb_build_array(
               jsonb_build_object(
                 'rider_id', v_rider_id,
                 'phase', v_phase_key,
                 'saved_command', v_explicit_raw,
                 'reason',
                   'unsupported_saved_individual_command'
               )
             );
      end if;

      v_explicit_command :=
        case
          when v_explicit_raw is null
            then null
          when v_explicit_raw =
               'follow_team_plan'
            then null
          when v_explicit_raw in (
            'ride_naturally',
            'protect_leader',
            'conserve_energy',
            'stay_near_front',
            'control_tempo',
            'chase_breakaway',
            'attack',
            'join_breakaway',
            'lead_out',
            'sprint',
            'climb_hard',
            'avoid_risks'
          )
            then v_explicit_raw
          else null
        end;

      v_role_default :=
        case v_role_code
          when 'team_leader_gc' then
            case v_phase_number
              when 1 then 'avoid_risks'
              when 2 then 'conserve_energy'
              when 3 then 'stay_near_front'
              when 4 then 'stay_near_front'
            end

          when 'sprinter' then
            case v_phase_number
              when 1 then 'conserve_energy'
              when 2 then 'conserve_energy'
              when 3 then 'stay_near_front'
              when 4 then 'sprint'
            end

          when 'lead_out_rider' then
            case v_phase_number
              when 1 then 'conserve_energy'
              when 2 then 'control_tempo'
              when 3 then 'stay_near_front'
              when 4 then 'lead_out'
            end

          when 'sprint_train_rider' then
            case v_phase_number
              when 1 then 'control_tempo'
              when 2 then 'control_tempo'
              when 3 then 'chase_breakaway'
              when 4 then 'lead_out'
            end

          when 'climber' then
            case v_phase_number
              when 1 then 'conserve_energy'
              when 2 then 'stay_near_front'
              when 3 then 'climb_hard'
              when 4 then 'climb_hard'
            end

          when 'mountain_domestique' then
            case v_phase_number
              when 1 then 'protect_leader'
              when 2 then 'control_tempo'
              when 3 then 'climb_hard'
              when 4 then 'protect_leader'
            end

          when 'helper_domestique' then
            case v_phase_number
              when 1 then 'protect_leader'
              when 2 then 'control_tempo'
              when 3 then 'chase_breakaway'
              when 4 then 'protect_leader'
            end

          when 'breakaway_rider' then
            case v_phase_number
              when 1 then 'attack'
              when 2 then 'join_breakaway'
              when 3 then 'control_tempo'
              when 4 then 'stay_near_front'
            end

          when 'breakaway_chaser' then
            case v_phase_number
              when 1 then 'chase_breakaway'
              when 2 then 'chase_breakaway'
              when 3 then 'chase_breakaway'
              when 4 then 'stay_near_front'
            end

          when 'rouleur' then
            case v_phase_number
              when 1 then 'control_tempo'
              when 2 then 'chase_breakaway'
              when 3 then 'control_tempo'
              when 4 then 'stay_near_front'
            end

          when 'protected_rider' then
            case v_phase_number
              when 1 then 'avoid_risks'
              when 2 then 'conserve_energy'
              when 3 then 'stay_near_front'
              when 4 then 'stay_near_front'
            end

          when 'free_role' then null
        end;

      v_team_base :=
        case v_team_plan
          when 'balanced' then
            case v_phase_number
              when 1 then 'control_tempo'
              when 2 then 'control_tempo'
              when 3 then 'stay_near_front'
              when 4 then 'stay_near_front'
            end

          when 'aggressive' then
            case v_phase_number
              when 1 then 'stay_near_front'
              when 2 then 'control_tempo'
              when 3 then 'stay_near_front'
              when 4 then 'stay_near_front'
            end

          when 'sprint_control' then
            case v_phase_number
              when 1 then 'control_tempo'
              when 2 then 'control_tempo'
              when 3 then 'chase_breakaway'
              when 4 then 'stay_near_front'
            end

          when 'breakaway' then
            case v_phase_number
              when 1 then 'stay_near_front'
              when 2 then 'stay_near_front'
              when 3 then 'control_tempo'
              when 4 then 'stay_near_front'
            end

          when 'gc_protection' then
            case v_phase_number
              when 1 then 'protect_leader'
              when 2 then 'protect_leader'
              when 3 then 'stay_near_front'
              when 4 then 'protect_leader'
            end

          when 'climber_support' then
            case v_phase_number
              when 1 then 'protect_leader'
              when 2 then 'control_tempo'
              when 3 then 'climb_hard'
              when 4 then 'protect_leader'
            end
        end;

      if v_explicit_command is not null then
        v_resolved_command :=
          v_explicit_command;
        v_resolved_source :=
          'explicit_individual_command';
        v_precedence_rank := 1;
        v_explicit_count :=
          v_explicit_count + 1;

      elsif v_role_default is not null then
        v_resolved_command :=
          v_role_default;
        v_resolved_source :=
          'saved_role_default';
        v_precedence_rank := 2;
        v_role_default_count :=
          v_role_default_count + 1;

      else
        v_resolved_command :=
          v_team_base;
        v_resolved_source :=
          'saved_team_tactic_base';
        v_precedence_rank := 3;
        v_team_base_count :=
          v_team_base_count + 1;
      end if;

      v_phase_count :=
        v_phase_count + 1;

      v_command_count :=
        coalesce(
          (
            v_action_counts
              ->> v_resolved_command
          )::integer,
          0
        ) + 1;

      v_action_counts :=
        jsonb_set(
          v_action_counts,
          array[v_resolved_command],
          to_jsonb(v_command_count),
          true
        );

      v_rider_phases :=
        v_rider_phases
        || jsonb_build_object(
             v_phase_key,
             jsonb_build_object(
               'phase_number', v_phase_number,
               'saved_explicit_command',
                 v_explicit_raw,
               'follow_team_plan_requested',
                 v_explicit_raw =
                   'follow_team_plan',
               'saved_role_default',
                 v_role_default,
               'saved_team_tactic_base',
                 v_team_base,
               'resolved_command',
                 v_resolved_command,
               'resolved_source',
                 v_resolved_source,
               'precedence_rank',
                 v_precedence_rank,
               'road_action_class_valid',
                 v_resolved_command in (
                   'ride_naturally',
                   'protect_leader',
                   'conserve_energy',
                   'stay_near_front',
                   'control_tempo',
                   'chase_breakaway',
                   'attack',
                   'join_breakaway',
                   'lead_out',
                   'sprint',
                   'climb_hard',
                   'avoid_risks'
                 ),
               'attack_wave_candidate',
                 v_resolved_command =
                   'attack',
               'bridge_candidate',
                 v_resolved_command =
                   'join_breakaway',
               'chase_candidate',
                 v_resolved_command =
                   'chase_breakaway',
               'physical_execution_status',
                 'deferred_to_issue_01c_01d'
             )
           );
    end loop;

    v_rider_plan :=
      jsonb_build_object(
        'rider_id', v_rider_id,
        'saved_role', v_role_raw,
        'canonical_role', v_role_code,
        'team_plan', v_team_plan,
        'phases', v_rider_phases
      );

    v_rider_plans :=
      v_rider_plans
      || jsonb_build_object(
           v_rider_key,
           v_rider_plan
         );
  end loop;

  if jsonb_array_length(v_invalid_roles) > 0 then
    return jsonb_build_object(
      'status', 'invalid_snapshot_roles',
      'race_stage_plan_id', p_race_stage_plan_id,
      'snapshot_hash', v_snapshot_hash,
      'invalid_roles', v_invalid_roles,
      'human_command_invention_allowed', false
    );
  end if;

  if jsonb_array_length(v_invalid_commands) > 0 then
    return jsonb_build_object(
      'status', 'invalid_snapshot_commands',
      'race_stage_plan_id', p_race_stage_plan_id,
      'snapshot_hash', v_snapshot_hash,
      'invalid_commands', v_invalid_commands,
      'human_command_invention_allowed', false
    );
  end if;

  v_plan_base :=
    jsonb_build_object(
      'resolver_schema_version',
        'race_engine_pre_stage_tactical_plan_v1',
      'resolver_source',
        'issue01b_locked_snapshot_only',
      'immutable_snapshot_hash',
        v_snapshot_hash,
      'race_stage_plan_id',
        p_race_stage_plan_id,
      'race_preparation_id',
        nullif(
          v_payload ->> 'race_preparation_id',
          ''
        )::uuid,
      'race_id',
        nullif(v_payload ->> 'race_id', '')::uuid,
      'stage_id',
        nullif(v_payload ->> 'stage_id', '')::uuid,
      'stage_number',
        nullif(
          v_payload ->> 'stage_number',
          ''
        )::integer,
      'participant_club_id',
        nullif(v_payload ->> 'club_id', '')::uuid,
      'team_plan', v_team_plan,
      'precedence_contract',
        jsonb_build_array(
          'explicit_individual_command',
          'saved_role_default',
          'saved_team_tactic_base',
          'physical_race_constraints_issue_01c_01d'
        ),
      'human_team_contract',
        jsonb_build_object(
          'locked_snapshot_only', true,
          'mutable_stage_plan_fallback', false,
          'unsaved_frontend_state_used', false,
          'unaccepted_suggestion_used', false,
          'invented_human_command', false
        ),
      'ai_contract',
        jsonb_build_object(
          'own_saved_or_generated_snapshot_plan_only',
            true,
          'ai_follower_addition_deferred_to_issue_01c',
            true
        ),
      'mass_escape_guard',
        jsonb_build_object(
          'team_tactic_direct_mass_attack',
            false,
          'attack_intent_requires_explicit_or_breakaway_role',
            true,
          'wave_limit_deferred_to_issue_01c',
            true
        ),
      'counts',
        jsonb_build_object(
          'riders', v_rider_count,
          'phase_actions', v_phase_count,
          'explicit_individual_actions',
            v_explicit_count,
          'saved_role_default_actions',
            v_role_default_count,
          'saved_team_tactic_base_actions',
            v_team_base_count
        ),
      'resolved_action_counts',
        v_action_counts,
      'rider_plans', v_rider_plans
    );

  v_resolver_hash :=
    md5(v_plan_base::text);

  return jsonb_build_object(
    'status', 'resolved',
    'race_stage_plan_id',
      p_race_stage_plan_id,
    'snapshot_hash', v_snapshot_hash,
    'resolver_hash', v_resolver_hash,
    'resolved_plan', v_plan_base
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_sync_race_participants_v1(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_rider_count integer := 0;
  v_team_count integer := 0;
begin
  select * into e
  from public.national_championship_editions
  where id = p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found: %', p_edition_id;
  end if;

  if p_event_type = 'qualification' then
    select * into h
    from public.national_championship_heats
    where id = p_heat_id and edition_id = e.id;

    if h.id is null or h.race_id is null then
      raise exception 'Qualification heat/race not found for edition %', p_edition_id;
    end if;

    v_race_id := h.race_id;
  elsif p_event_type = 'final' then
    v_race_id := e.final_race_id;
    if v_race_id is null then
      raise exception 'Final race is not created for edition %', p_edition_id;
    end if;
  else
    raise exception 'Invalid national championship event type: %', p_event_type;
  end if;

  select s.id into v_stage_id
  from public.race_stages s
  where s.race_id = v_race_id
  order by s.stage_number
  limit 1;

  if v_stage_id is null then
    raise exception 'National championship race % has no stage', v_race_id;
  end if;

  if exists (
    select 1
    from public.race_stage_simulation_runs sr
    where sr.stage_id = v_stage_id
      and sr.status in ('running','completed')
  ) then
    return jsonb_build_object(
      'status','participants_locked',
      'race_id',v_race_id,
      'stage_id',v_stage_id
    );
  end if;

  /*
   * Create a zero-cost, organizer-managed preparation shell for each real club
   * represented in the event. No staff, assets or club supplies are attached.
   * The shell exists only so the universal race engine can read rider equipment
   * and rider-specific tactics through its normal stage-plan adapters.
   */
  insert into public.race_preparations (
    race_id,
    club_id,
    status,
    startlist_status,
    setup_window_opens_on,
    rider_submission_deadline_on,
    submitted_at,
    rider_count,
    staff_count,
    participation_cost_cash,
    travel_cost_cash,
    staff_travel_cost_cash,
    asset_transport_cost_cash,
    supplies_cost_cash,
    operations_cost_cash,
    total_cost_cash,
    cost_breakdown_json,
    team_policies_snapshot_json,
    validation_snapshot_json,
    engine_payload_json,
    metadata,
    participating_club_id
  )
  select
    v_race_id,
    x.club_id,
    'submitted',
    'submitted',
    e.ranking_snapshot_date,
    case when p_event_type='qualification' then e.qualification_date else e.final_date end,
    now(),
    x.rider_count,
    0,
    0,0,0,0,0,0,0,
    jsonb_build_object('national_championship',true,'organizer_paid',true),
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'standardized_bonus_totals',jsonb_build_object(
        'race_support',0,
        'fatigue_control',0,
        'recovery_support',0,
        'health_protection',0,
        'mechanical_reliability',0
      )
    ),
    jsonb_build_object(
      'national_championship',true,
      'participating_club_id',x.club_id
    ),
    jsonb_build_object(
      'national_championship',true,
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true)
    ),
    x.club_id
  from (
    select
      en.club_id_snapshot as club_id,
      count(*)::int as rider_count
    from public.national_championship_entries en
    where en.edition_id = e.id
      and en.club_id_snapshot is not null
      and (
        (p_event_type='qualification'
          and en.heat_id = p_heat_id
          and en.entry_status='qualification_assigned')
        or
        (p_event_type='final'
          and en.entry_status in ('direct_qualified','qualified','finalist'))
      )
    group by en.club_id_snapshot
  ) x
  on conflict (race_id,club_id) do update
    set rider_count=excluded.rider_count,
        participating_club_id=excluded.participating_club_id,
        metadata=public.race_preparations.metadata || excluded.metadata,
        engine_payload_json=public.race_preparations.engine_payload_json || excluded.engine_payload_json,
        validation_snapshot_json=excluded.validation_snapshot_json,
        updated_at=now();

  /*
   * The universal race engine expects canonical selected riders on each
   * preparation. National Championships use the club only as a technical
   * preparation owner; sporting identity stays rider-only.
   */
  delete from public.race_preparation_riders selected
  using public.race_preparations rp
  where selected.race_preparation_id = rp.id
    and rp.race_id = v_race_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false)
    and not exists (
      select 1
      from public.national_championship_entries en
      where en.edition_id=e.id
        and en.rider_id=selected.rider_id
        and en.club_id_snapshot=rp.club_id
        and (
          (p_event_type='qualification'
            and en.heat_id=p_heat_id
            and en.entry_status='qualification_assigned')
          or
          (p_event_type='final'
            and en.entry_status in ('direct_qualified','qualified','finalist'))
        )
    );

  insert into public.race_preparation_riders (
    race_preparation_id,
    rider_id,
    start_number,
    race_role,
    default_equipment_setup_id,
    availability_snapshot_json,
    rider_snapshot_json,
    bonus_snapshot_json,
    metadata
  )
  select
    rp.id,
    en.rider_id,
    en.national_rank,
    'free_role',
    plan.equipment_setup_id,
    jsonb_build_object(
      'availability_status',r.availability_status,
      'unavailable_until',r.unavailable_until,
      'unavailable_reason',r.unavailable_reason
    ),
    jsonb_build_object(
      'national_championship',true,
      'individual_only',true,
      'national_rank',en.national_rank,
      'overall',r.overall,
      'role',r.role
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'individual_only',true,
      'event_type',p_event_type
    )
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  left join public.national_championship_rider_plans plan
    on plan.edition_id=e.id
   and plan.rider_id=en.rider_id
   and plan.event_type=p_event_type
  where en.edition_id=e.id
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist'))
    )
  on conflict (race_preparation_id,rider_id) do update
    set start_number=excluded.start_number,
        race_role='free_role',
        default_equipment_setup_id=excluded.default_equipment_setup_id,
        availability_snapshot_json=excluded.availability_snapshot_json,
        rider_snapshot_json=excluded.rider_snapshot_json,
        bonus_snapshot_json=excluded.bonus_snapshot_json,
        metadata=public.race_preparation_riders.metadata || excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plans (
    race_preparation_id,
    race_id,
    stage_id,
    stage_number,
    stage_date,
    status,
    opens_on_game_date,
    locks_on_game_date,
    submitted_at,
    stage_objective,
    team_strategy,
    risk_level,
    stage_profile_snapshot_json,
    bonus_snapshot_json,
    engine_stage_payload_json,
    metadata,
    rider_equipment_json,
    rider_roles_json,
    team_tactic_json,
    rider_supplies_json,
    rider_individual_tactics_json,
    last_saved_at,
    last_saved_game_ts
  )
  select
    rp.id,
    v_race_id,
    v_stage_id,
    1,
    s.stage_date,
    'submitted',
    e.ranking_snapshot_date,
    s.stage_date,
    now(),
    'balanced',
    'balanced',
    'normal',
    to_jsonb(s),
    '{}'::jsonb,
    jsonb_build_object('national_championship',true),
    jsonb_build_object(
      'national_championship',true,
      'team_strategy_locked','balanced',
      'staff_assets_supplies_locked',true
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('plan','balanced','notes','National Championship: individual tactics only'),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    public.get_current_game_ts_local()
  from public.race_preparations rp
  join public.race_stages s on s.id=v_stage_id
  where rp.race_id=v_race_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false)
  on conflict (race_preparation_id,stage_number) do update
    set stage_id=excluded.stage_id,
        stage_date=excluded.stage_date,
        status='submitted',
        team_strategy='balanced',
        team_tactic_json=excluded.team_tactic_json,
        metadata=public.race_stage_plans.metadata || excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plan_riders (
    race_stage_plan_id,
    rider_id,
    stage_role,
    tactic,
    risk_level,
    effort_level,
    equipment_setup_id,
    rider_stage_snapshot_json,
    equipment_bonus_snapshot_json,
    final_bonus_snapshot_json,
    metadata
  )
  select
    sp.id,
    en.rider_id,
    'free_role',
    'ride_naturally',
    'normal',
    'normal',
    plan.equipment_setup_id,
    jsonb_build_object(
      'national_championship',true,
      'national_rank',en.national_rank,
      'event_type',p_event_type
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('national_championship',true)
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  join public.race_stage_plans sp
    on sp.race_preparation_id=rp.id
   and sp.stage_id=v_stage_id
  left join public.national_championship_rider_plans plan
    on plan.edition_id=e.id
   and plan.rider_id=en.rider_id
   and plan.event_type=p_event_type
  where en.edition_id=e.id
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist'))
    )
  on conflict (race_stage_plan_id,rider_id) do update
    set stage_role='free_role',
        tactic='ride_naturally',
        equipment_setup_id=excluded.equipment_setup_id,
        rider_stage_snapshot_json=public.race_stage_plan_riders.rider_stage_snapshot_json || excluded.rider_stage_snapshot_json,
        metadata=public.race_stage_plan_riders.metadata || excluded.metadata,
        updated_at=now();

  /*
   * Apply saved per-rider commands to the universal stage-plan JSON.
   */
  update public.race_stage_plans sp
  set rider_individual_tactics_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          jsonb_build_object(
            'phase_1',jsonb_build_object('command',coalesce(plan.phase_1_command,'ride_naturally')),
            'phase_2',jsonb_build_object('command',coalesce(plan.phase_2_command,'ride_naturally')),
            'phase_3',jsonb_build_object('command',coalesce(plan.phase_3_command,'ride_naturally')),
            'phase_4',jsonb_build_object('command',coalesce(plan.phase_4_command,'ride_naturally'))
          )
        )
        from public.national_championship_entries en
        left join public.national_championship_rider_plans plan
          on plan.edition_id=e.id
         and plan.rider_id=en.rider_id
         and plan.event_type=p_event_type
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist'))
          )
      ),'{}'::jsonb),
      rider_roles_json = coalesce((
        select jsonb_object_agg(en.rider_id::text,to_jsonb('free_role'::text))
        from public.national_championship_entries en
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist'))
          )
      ),'{}'::jsonb),
      rider_equipment_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          case when plan.equipment_setup_id is null then 'null'::jsonb
               else to_jsonb(plan.equipment_setup_id::text) end
        )
        from public.national_championship_entries en
        left join public.national_championship_rider_plans plan
          on plan.edition_id=e.id
         and plan.rider_id=en.rider_id
         and plan.event_type=p_event_type
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist'))
          )
      ),'{}'::jsonb),
      team_strategy='balanced',
      team_tactic_json=jsonb_build_object(
        'plan','balanced',
        'internal_neutral_placeholder',true,
        'team_commands_enabled',false,
        'notes','National Championship: every rider competes independently'
      ),
      rider_supplies_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          jsonb_build_object('source','organizer','standardized',true)
        )
        from public.national_championship_entries en
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist'))
          )
      ),'{}'::jsonb),
      metadata=coalesce(sp.metadata,'{}'::jsonb) || jsonb_build_object(
        'national_championship',true,
        'individual_only',true,
        'team_commands_enabled',false
      ),
      updated_at=now()
  from public.race_preparations rp
  where sp.race_preparation_id=rp.id
    and rp.race_id=v_race_id
    and sp.stage_id=v_stage_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false);

  /*
   * Rebuild the canonical participant snapshot after preparation triggers.
   */
  delete from public.race_participant_riders where race_id=v_race_id;
  delete from public.race_participant_teams where race_id=v_race_id;

  insert into public.race_participant_teams (
    race_id,
    team_id,
    status,
    team_name_snapshot,
    logo_url_snapshot,
    country_code_snapshot,
    ranking_snapshot,
    submitted_at,
    accepted_at
  )
  select
    v_race_id,
    en.rider_id,
    'accepted',
    en.rider_name_snapshot,
    null,
    en.country_code_snapshot,
    en.national_rank,
    now(),
    now()
  from public.national_championship_entries en
  where en.edition_id=e.id
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist'))
    )
  order by en.national_rank;

  insert into public.race_participant_riders (
    race_id,
    team_id,
    rider_id,
    rider_name_snapshot,
    team_name_snapshot,
    country_code_snapshot,
    age_snapshot,
    is_young_rider,
    start_number,
    role_snapshot,
    overall_snapshot,
    can_view_exact_overall,
    overall_range_label
  )
  select
    v_race_id,
    en.rider_id,
    en.rider_id,
    en.rider_name_snapshot,
    en.rider_name_snapshot,
    en.country_code_snapshot,
    greatest(
      0,
      extract(year from age(
        case when p_event_type='qualification' then e.qualification_date else e.final_date end,
        r.birth_date
      ))::int
    ),
    extract(year from age(
      case when p_event_type='qualification' then e.qualification_date else e.final_date end,
      r.birth_date
    ))::int <= 21,
    en.national_rank,
    r.role::text,
    r.overall,
    true,
    null
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  left join public.clubs c on c.id=en.club_id_snapshot
  where en.edition_id=e.id
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist'))
    )
  order by en.national_rank;

  select count(*)::int,count(distinct team_id)::int
  into v_rider_count,v_team_count
  from public.race_participant_riders
  where race_id=v_race_id;

  return jsonb_build_object(
    'status','participants_synced',
    'edition_id',e.id,
    'event_type',p_event_type,
    'heat_id',p_heat_id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'rider_count',v_rider_count,
    'team_count',v_team_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_my_national_championship_rider_plan_v1(p_edition_id uuid, p_event_type text, p_rider_id uuid, p_equipment_setup_id uuid DEFAULT NULL::uuid, p_phase_1_command text DEFAULT 'ride_naturally'::text, p_phase_2_command text DEFAULT 'ride_naturally'::text, p_phase_3_command text DEFAULT 'ride_naturally'::text, p_phase_4_command text DEFAULT 'ride_naturally'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  e public.national_championship_editions%rowtype;
  en public.national_championship_entries%rowtype;
  v_owner_club_id uuid;
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_plan_id uuid;
  v_stage_plan_rider_id uuid;
  v_start_game_ts timestamp without time zone;
  v_bonus jsonb := '{}'::jsonb;
  v_plan_id uuid;
  v_allowed text[] := array[
    'ride_naturally',
    'conserve_energy',
    'stay_near_front',
    'join_breakaway',
    'attack',
    'chase_breakaway',
    'climb_hard',
    'sprint',
    'avoid_risks'
  ];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_event_type not in ('qualification','final') then
    raise exception 'Invalid event type';
  end if;

  if not (
    p_phase_1_command=any(v_allowed)
    and p_phase_2_command=any(v_allowed)
    and p_phase_3_command=any(v_allowed)
    and p_phase_4_command=any(v_allowed)
  ) then
    raise exception 'One or more tactic commands are not supported';
  end if;

  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  select * into en
  from public.national_championship_entries
  where edition_id=p_edition_id
    and rider_id=p_rider_id;

  if e.id is null or en.id is null then
    raise exception 'National championship rider entry not found';
  end if;

  if en.club_id_snapshot is null then
    raise exception 'This rider is not managed by a club';
  end if;

  v_owner_club_id := public.universal_race_resource_owner_club_v1(en.club_id_snapshot);

  if not exists (
    select 1
    from public.clubs c
    where c.id=v_owner_club_id
      and c.owner_user_id=v_user_id
  ) then
    raise exception 'You do not manage this rider';
  end if;

  if p_event_type='qualification' then
    if en.entry_path<>'qualification'
       or en.heat_id is null
       or en.entry_status not in ('qualification_assigned','qualified','finalist') then
      raise exception 'Rider is not assigned to national qualification';
    end if;

    select h.race_id into v_race_id
    from public.national_championship_heats h
    where h.id=en.heat_id;
  else
    if en.entry_status not in ('direct_qualified','qualified','finalist') then
      raise exception 'Rider is not qualified for the national final';
    end if;
    v_race_id := e.final_race_id;
  end if;

  if v_race_id is null then
    raise exception 'National championship race is not ready yet';
  end if;

  select
    s.id,
    s.stage_date::timestamp
      + make_interval(
          hours=>coalesce(s.planned_start_hour_number,12),
          mins=>coalesce(s.planned_start_minute,0)
        )
  into v_stage_id,v_start_game_ts
  from public.race_stages s
  where s.race_id=v_race_id
  order by s.stage_number
  limit 1;

  if v_stage_id is null then
    raise exception 'National championship stage not found';
  end if;

  if public.get_current_game_ts_local() >= v_start_game_ts then
    raise exception 'National Championship preparation is locked because the race has started';
  end if;

  if p_equipment_setup_id is not null then
    if not exists (
      select 1
      from public.club_equipment_setup_presets preset
      where preset.id=p_equipment_setup_id
        and preset.club_id in (en.club_id_snapshot,v_owner_club_id)
    ) then
      raise exception 'Equipment preset does not belong to this rider''s club';
    end if;

    select public.equipment_calculate_catalog_setup_bonus_preview(
      preset.frame_catalog_item_id,
      preset.wheelset_catalog_item_id,
      preset.tires_catalog_item_id,
      preset.groupset_catalog_item_id,
      preset.helmet_catalog_item_id,
      preset.shoes_catalog_item_id
    )
    into v_bonus
    from public.club_equipment_setup_presets preset
    where preset.id=p_equipment_setup_id;
  end if;

  insert into public.national_championship_rider_plans (
    edition_id,
    rider_id,
    event_type,
    heat_id,
    equipment_setup_id,
    phase_1_command,
    phase_2_command,
    phase_3_command,
    phase_4_command,
    updated_by_user_id
  )
  values (
    e.id,
    en.rider_id,
    p_event_type,
    case when p_event_type='qualification' then en.heat_id else null end,
    p_equipment_setup_id,
    p_phase_1_command,
    p_phase_2_command,
    p_phase_3_command,
    p_phase_4_command,
    v_user_id
  )
  on conflict (edition_id,rider_id,event_type) do update
    set heat_id=excluded.heat_id,
        equipment_setup_id=excluded.equipment_setup_id,
        phase_1_command=excluded.phase_1_command,
        phase_2_command=excluded.phase_2_command,
        phase_3_command=excluded.phase_3_command,
        phase_4_command=excluded.phase_4_command,
        updated_by_user_id=excluded.updated_by_user_id,
        updated_at=now()
  returning id into v_plan_id;

  select sp.id into v_stage_plan_id
  from public.race_preparations rp
  join public.race_stage_plans sp
    on sp.race_preparation_id=rp.id
   and sp.stage_id=v_stage_id
  where rp.race_id=v_race_id
    and rp.club_id=en.club_id_snapshot
  limit 1;

  if v_stage_plan_id is null then
    perform public.national_championship_sync_race_participants_v1(
      e.id,
      p_event_type,
      case when p_event_type='qualification' then en.heat_id else null end
    );

    select sp.id into v_stage_plan_id
    from public.race_preparations rp
    join public.race_stage_plans sp
      on sp.race_preparation_id=rp.id
     and sp.stage_id=v_stage_id
    where rp.race_id=v_race_id
      and rp.club_id=en.club_id_snapshot
    limit 1;
  end if;

  if v_stage_plan_id is null then
    raise exception 'National Championship rider plan shell is unavailable';
  end if;

  insert into public.race_stage_plan_riders (
    race_stage_plan_id,
    rider_id,
    stage_role,
    tactic,
    risk_level,
    effort_level,
    equipment_setup_id,
    rider_stage_snapshot_json,
    equipment_bonus_snapshot_json,
    final_bonus_snapshot_json,
    metadata
  )
  values (
    v_stage_plan_id,
    en.rider_id,
    'free_role',
    'balanced',
    'normal',
    'normal',
    p_equipment_setup_id,
    jsonb_build_object(
      'national_championship',true,
      'event_type',p_event_type,
      'national_rank',en.national_rank
    ),
    coalesce(v_bonus,'{}'::jsonb),
    coalesce(v_bonus,'{}'::jsonb),
    jsonb_build_object(
      'national_championship',true,
      'saved_by_user',true
    )
  )
  on conflict (race_stage_plan_id,rider_id) do update
    set stage_role='free_role',
        tactic='ride_naturally',
        equipment_setup_id=excluded.equipment_setup_id,
        equipment_bonus_snapshot_json=excluded.equipment_bonus_snapshot_json,
        final_bonus_snapshot_json=excluded.final_bonus_snapshot_json,
        metadata=public.race_stage_plan_riders.metadata||excluded.metadata,
        updated_at=now()
  returning id into v_stage_plan_rider_id;

  update public.race_stage_plans
  set rider_individual_tactics_json =
        jsonb_set(
          coalesce(rider_individual_tactics_json,'{}'::jsonb),
          array[en.rider_id::text],
          jsonb_build_object(
            'phase_1',jsonb_build_object('command',p_phase_1_command),
            'phase_2',jsonb_build_object('command',p_phase_2_command),
            'phase_3',jsonb_build_object('command',p_phase_3_command),
            'phase_4',jsonb_build_object('command',p_phase_4_command)
          ),
          true
        ),
      rider_equipment_json =
        case
          when p_equipment_setup_id is null then
            coalesce(rider_equipment_json,'{}'::jsonb) - en.rider_id::text
          else
            jsonb_set(
              coalesce(rider_equipment_json,'{}'::jsonb),
              array[en.rider_id::text],
              to_jsonb(p_equipment_setup_id::text),
              true
            )
        end,
      team_strategy='balanced',
      team_tactic_json=jsonb_build_object(
        'plan','balanced',
        'internal_neutral_placeholder',true,
        'team_commands_enabled',false,
        'notes','National Championship: every rider competes independently'
      ),
      rider_supplies_json=coalesce(rider_supplies_json,'{}'::jsonb),
      last_saved_at=now(),
      last_saved_game_ts=public.get_current_game_ts_local(),
      updated_at=now()
  where id=v_stage_plan_id;

  return jsonb_build_object(
    'success',true,
    'plan_id',v_plan_id,
    'edition_id',e.id,
    'event_type',p_event_type,
    'rider_id',en.rider_id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'equipment_setup_id',p_equipment_setup_id,
    'phase_1_command',p_phase_1_command,
    'phase_2_command',p_phase_2_command,
    'phase_3_command',p_phase_3_command,
    'phase_4_command',p_phase_4_command,
    'team_strategy','individual_only',
    'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_ensure_event_race_v1(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_date date;
  v_country_name text;
  v_profile_kind text;
  v_distance numeric;
  v_elevation integer;
  v_hour integer;
  v_minute integer := 0;
  v_name text;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %', p_edition_id;
  end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where c.code=e.country_code;

  v_country_name := coalesce(v_country_name,e.country_code);
  v_profile_kind := public.national_championship_profile_kind_v1(e.country_code);

  if p_event_type='qualification' then
    select * into h
    from public.national_championship_heats
    where id=p_heat_id and edition_id=e.id
    for update;

    if h.id is null then
      raise exception 'Qualification heat not found: %',p_heat_id;
    end if;

    if h.race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'qualification',h.id);
      return h.race_id;
    end if;

    v_date := e.qualification_date;
    v_distance := case v_profile_kind
      when 'flat' then 125
      when 'mountain' then 135
      else 130
    end;
    v_elevation := case v_profile_kind
      when 'flat' then 650
      when 'mountain' then 2800
      else 1600
    end;
    v_hour := 8
      + ((((pg_catalog.hashtextextended(e.country_code,29) % 4)+4)%4)::int)
      + ((h.heat_number-1)/2);
    v_minute := case when mod(h.heat_number-1,2)=0 then 0 else 30 end;
    v_name := v_country_name||' National Championship Qualification — Heat '||h.heat_number;
  elsif p_event_type='final' then
    if e.final_race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'final',null);
      return e.final_race_id;
    end if;

    v_date := e.final_date;
    v_distance := case v_profile_kind
      when 'flat' then 190
      when 'mountain' then 200
      else 195
    end;
    v_elevation := case v_profile_kind
      when 'flat' then 900
      when 'mountain' then 3900
      else 2400
    end;
    v_hour := 11
      + ((((pg_catalog.hashtextextended(e.country_code,31) % 4)+4)%4)::int);
    v_minute := 0;
    v_name := v_country_name||' National Road Championship';
  else
    raise exception 'Invalid national championship event type: %',p_event_type;
  end if;

  insert into public.races (
    name,
    short_name,
    start_date,
    end_date,
    country_code,
    host_city,
    category,
    race_type,
    is_stage_race,
    stage_count,
    status,
    description,
    metadata,
    planned_start_hour_number,
    planned_start_minute,
    planned_start_time_label,
    planned_start_assigned_at
  )
  values (
    v_name,
    case when p_event_type='final'
      then e.country_code||' NC'
      else e.country_code||' NCQ H'||h.heat_number
    end,
    v_date,
    v_date,
    e.country_code,
    v_country_name,
    case when p_event_type='final' then 'NC' else 'NCQ' end,
    'one_day',
    false,
    1,
    'scheduled',
    case when p_event_type='final'
      then 'National road championship. Entry is earned through the National Ranking and qualification system.'
      else 'National championship qualification heat. Top finishers advance to the national final.'
    end,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'heat_id',case when p_event_type='qualification' then h.id else null end,
      'country_code',e.country_code,
      'profile_kind',v_profile_kind,
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true),
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'individual_only',true,
      'team_commands_enabled',false,
      'staff_assets_supplies_locked',true
    ),
    v_hour,
    v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now()
  )
  returning id into v_race_id;

  insert into public.race_stages (
    race_id,
    stage_number,
    stage_date,
    name,
    start_city,
    finish_city,
    host_city,
    host_country_code,
    distance_km,
    terrain_type,
    finish_type,
    is_summit_finish,
    flat_pct,
    hilly_pct,
    mountain_pct,
    cobbled_pct,
    elevation_gain_m,
    metadata,
    start_city_name,
    finish_city_name,
    profile_type,
    notes,
    planned_start_hour_number,
    planned_start_minute,
    planned_start_time_label,
    planned_start_assigned_at,
    stage_format
  )
  values (
    v_race_id,
    1,
    v_date,
    case when p_event_type='final' then 'National Championship' else 'Qualification Heat '||h.heat_number end,
    v_country_name||' Championship Circuit',
    v_country_name||' Championship Circuit',
    v_country_name,
    case when exists(select 1 from public.countries c where c.code=e.country_code) then e.country_code else null end,
    v_distance,
    v_profile_kind,
    'flat_finish',
    false,
    case v_profile_kind when 'flat' then 75 when 'mountain' then 15 else 30 end,
    case v_profile_kind when 'flat' then 25 when 'mountain' then 35 else 60 end,
    case v_profile_kind when 'flat' then 0 when 'mountain' then 50 else 10 end,
    0,
    v_elevation,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'profile_kind',v_profile_kind
    ),
    v_country_name||' Championship Circuit',
    v_country_name||' Championship Circuit',
    case v_profile_kind when 'flat' then 'sprinter' when 'mountain' then 'mountain' else 'hilly' end,
    'Deterministic national championship course generated for this country and season.',
    v_hour,
    v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now(),
    'road_race'
  )
  returning id into v_stage_id;

  insert into public.race_stage_profile_details (
    stage_id,
    race_id,
    stage_title,
    route_label,
    stage_summary,
    distance_km,
    elevation_gain_m,
    terrain_type,
    profile_type,
    terrain_split,
    profile_points,
    route_markers,
    intermediate_sprints,
    mountain_climbs,
    metadata
  )
  values (
    v_stage_id,
    v_race_id,
    v_name,
    v_country_name||' Championship Circuit',
    case v_profile_kind
      when 'flat' then 'Fast national championship circuit with repeated rolling rises.'
      when 'mountain' then 'Demanding national championship route with several major climbing sectors.'
      else 'Selective national championship course with repeated hills and technical transitions.'
    end,
    v_distance,
    v_elevation,
    v_profile_kind,
    case v_profile_kind when 'flat' then 'sprinter' when 'mountain' then 'mountain' else 'hilly' end,
    jsonb_build_object(
      'flat',case v_profile_kind when 'flat' then 75 when 'mountain' then 15 else 30 end,
      'hilly',case v_profile_kind when 'flat' then 25 when 'mountain' then 35 else 60 end,
      'mountain',case v_profile_kind when 'flat' then 0 when 'mountain' then 50 else 10 end,
      'cobbled',0
    ),
    public.national_championship_profile_points_v1(v_distance,v_profile_kind),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'generated_profile_version','national_championship_profile_v1'
    )
  )
  on conflict (stage_id) do update
    set distance_km=excluded.distance_km,
        elevation_gain_m=excluded.elevation_gain_m,
        terrain_type=excluded.terrain_type,
        profile_type=excluded.profile_type,
        terrain_split=excluded.terrain_split,
        profile_points=excluded.profile_points,
        metadata=public.race_stage_profile_details.metadata||excluded.metadata,
        updated_at=now();

  insert into public.race_entry_rules (
    race_id,
    race_class_code,
    target_teams,
    min_teams,
    max_teams,
    min_riders_per_team,
    max_riders_per_team,
    applications_open_game_date,
    applications_close_game_date,
    applications_status,
    auto_close_when_full,
    allow_waitlist,
    prize_fund_cash,
    prize_fund_source,
    metadata,
    race_season_number,
    race_start_month_number,
    race_start_day_number,
    application_window_policy,
    rider_submission_deadline
  )
  values (
    v_race_id,
    '1.1',
    20,
    2,
    200,
    1,
    120,
    v_date-1,
    v_date-1,
    'closed',
    true,
    false,
    0,
    'manual_override',
    jsonb_build_object(
      'national_championship',true,
      'applications_disabled',true,
      'automatic_entry',true
    ),
    e.season_number,
    extract(month from v_date)::int,
    extract(day from v_date)::int,
    'standard_90_3',
    v_date
  );

  if p_event_type='qualification' then
    update public.national_championship_heats
    set race_id=v_race_id,status='ready',updated_at=now()
    where id=h.id;
  else
    update public.national_championship_editions
    set final_race_id=v_race_id,updated_at=now()
    where id=e.id;
  end if;

  perform public.national_championship_sync_race_participants_v1(
    e.id,
    p_event_type,
    case when p_event_type='qualification' then h.id else null end
  );

  return v_race_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_national_ranking_page_v1(p_country_code text DEFAULT NULL::text, p_season_number integer DEFAULT NULL::integer, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_season integer;
  v_game_date date;
  v_country text;
  e public.national_championship_editions%rowtype;
  v_has_snapshot boolean := false;
begin
  v_user_id:=auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  v_season:=coalesce(p_season_number,v_season);

  v_country:=upper(nullif(trim(p_country_code),''));

  if v_country is null then
    select upper(c.country_code)
    into v_country
    from public.clubs c
    where c.owner_user_id=v_user_id
      and c.parent_club_id is null
    order by c.created_at
    limit 1;
  end if;

  if v_country is null then
    select country_code into v_country
    from public.national_championship_editions
    where season_number=v_season
    order by country_code
    limit 1;
  end if;

  select * into e
  from public.national_championship_editions
  where season_number=v_season
    and country_code=v_country
    and discipline='road'
  limit 1;

  if e.id is not null then
    select exists(
      select 1
      from public.national_championship_ranking_snapshots s
      where s.edition_id=e.id
    ) into v_has_snapshot;
  end if;

  return jsonb_build_object(
    'season_number',v_season,
    'current_game_date',v_game_date,
    'country_code',v_country,
    'countries',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code',x.country_code,
          'name',coalesce(c.name,x.country_code),
          'status',x.status,
          'final_date',x.final_date
        )
        order by coalesce(c.name,x.country_code)
      )
      from public.national_championship_editions x
      left join public.countries c on c.code=x.country_code
      where x.season_number=v_season
        and x.discipline='road'
    ),'[]'::jsonb),
    'edition',case when e.id is null then null else to_jsonb(e) end,
    'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true),
    'preparation_mode',jsonb_build_object(
      'automatic_entry',true,
      'staff_locked',true,
      'assets_locked',true,
      'club_supplies_locked',true,
      'individual_only',true,
      'team_commands_enabled',false,
      'rider_equipment_editable',true,
      'individual_tactics_editable',true
    ),
    'ranking_is_frozen',v_has_snapshot,
    'ranking',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.national_rank)
      from (
        select
          s.national_rank,
          s.rider_id,
          s.club_id,
          s.rider_name_snapshot as rider_name,
          s.country_code_snapshot as country_code,
          s.raw_points,
          s.weighted_points,
          s.best_weighted_result,
          s.latest_result_date,
          s.overall_snapshot as overall
        from public.national_championship_ranking_snapshots s
        where v_has_snapshot
          and s.edition_id=e.id
        order by s.national_rank
        limit greatest(1,least(coalesce(p_limit,200),500))
      ) r
    ),case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(r) order by r.national_rank)
      from (
        select *
        from public.preview_national_ranking_v1(
          v_country,
          least(v_game_date,e.ranking_snapshot_date)
        )
        order by national_rank
        limit greatest(1,least(coalesce(p_limit,200),500))
      ) r
    ),'[]'::jsonb) end),
    'heats',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',h.id,
          'heat_number',h.heat_number,
          'qualification_date',h.qualification_date,
          'qualifying_places',h.qualifying_places,
          'assigned_count',h.assigned_count,
          'race_id',h.race_id,
          'status',h.status
        )
        order by h.heat_number
      )
      from public.national_championship_heats h
      where h.edition_id=e.id
    ),'[]'::jsonb) end,
    'my_entries',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entry_id',en.id,
          'rider_id',en.rider_id,
          'rider_name',en.rider_name_snapshot,
          'national_rank',en.national_rank,
          'entry_path',en.entry_path,
          'entry_status',en.entry_status,
          'heat_id',en.heat_id,
          'heat_number',en.heat_number,
          'qualification_race_id',h.race_id,
          'final_race_id',e.final_race_id,
          'qualification_plan',to_jsonb(qp),
          'final_plan',to_jsonb(fp),
          'club_id',en.club_id_snapshot,
          'club_name',rider_club.name
        )
        order by en.national_rank
      )
      from public.national_championship_entries en
      join public.clubs rider_club on rider_club.id=en.club_id_snapshot
      join public.clubs owner_club
        on owner_club.id=case
          when rider_club.club_type='developing'
               and rider_club.parent_club_id is not null
            then rider_club.parent_club_id
          else rider_club.id
        end
      left join public.national_championship_heats h on h.id=en.heat_id
      left join public.national_championship_rider_plans qp
        on qp.edition_id=en.edition_id
       and qp.rider_id=en.rider_id
       and qp.event_type='qualification'
      left join public.national_championship_rider_plans fp
        on fp.edition_id=en.edition_id
       and fp.rider_id=en.rider_id
       and fp.event_type='final'
      where en.edition_id=e.id
        and owner_club.owner_user_id=v_user_id
    ),'[]'::jsonb) end,
    'equipment_presets',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',p.id,
          'club_id',p.club_id,
          'setup_name',p.setup_name,
          'setup_slot',p.setup_slot
        )
        order by p.club_id,p.setup_slot
      )
      from public.club_equipment_setup_presets p
      join public.clubs c on c.id=p.club_id
      left join public.clubs parent on parent.id=c.parent_club_id
      where c.owner_user_id=v_user_id
         or parent.owner_user_id=v_user_id
    ),'[]'::jsonb),
    'results',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event_type',rh.event_type,
          'heat_id',rh.heat_id,
          'rider_id',rh.rider_id,
          'rider_name',rh.rider_name_snapshot,
          'club_id',rh.club_id_snapshot,
          'club_name',rh.club_name_snapshot,
          'rank',rh.rank,
          'status',rh.status,
          'race_id',rh.race_id
        )
        order by
          case when rh.event_type='final' then 0 else 1 end,
          coalesce(h.heat_number,0),
          rh.rank
      )
      from public.national_championship_result_history rh
      left join public.national_championship_heats h on h.id=rh.heat_id
      where rh.edition_id=e.id
    ),'[]'::jsonb) end,
    'past_champions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.season_number desc)
      from (
        select
          pe.season_number,
          pe.country_code,
          pe.champion_rider_id,
          pe.champion_name_snapshot,
          pe.champion_club_id,
          pe.champion_club_name_snapshot,
          pe.final_race_id
        from public.national_championship_editions pe
        where pe.country_code=v_country
          and pe.discipline='road'
          and pe.status='completed'
          and pe.champion_rider_id is not null
        order by pe.season_number desc
        limit 10
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;
