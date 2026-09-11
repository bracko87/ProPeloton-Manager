-- Phase 3: immutable race-roster continuity for Race Detail history.
--
-- This is a read-only presentation RPC. It does not recalculate or mutate
-- sporting results/classifications. The original race participant roster is
-- the base and current classification/status data is LEFT JOINed onto it so
-- eliminated riders remain visible in historical Full Race Standings.

create or replace function public.get_full_race_standings_v1(
  p_race_id uuid,
  p_after_stage_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = 'public'
as $function$
with selected_stage as (
  select
    rs.id as stage_id,
    rs.stage_number
  from public.race_stages rs
  where rs.race_id = p_race_id
    and rs.id = coalesce(
      p_after_stage_id,
      (
        select standings.after_stage_id
        from public.race_classification_standings standings
        join public.race_stages classified_stage
          on classified_stage.id = standings.after_stage_id
         and classified_stage.race_id = standings.race_id
        where standings.race_id = p_race_id
          and standings.classification_type = 'general'
          and standings.entity_type = 'rider'
        group by standings.after_stage_id, classified_stage.stage_number
        order by classified_stage.stage_number desc
        limit 1
      )
    )
  limit 1
),
roster as (
  select
    participant.id,
    participant.race_id,
    participant.team_id,
    participant.club_id,
    participant.rider_id,
    participant.rider_name_snapshot,
    participant.team_name_snapshot,
    participant.country_code_snapshot,
    participant.start_number
  from public.race_participant_riders_v1 participant
  where participant.race_id = p_race_id
),
current_general as (
  select standing.*
  from public.race_classification_standings standing
  join selected_stage selected
    on selected.stage_id = standing.after_stage_id
  where standing.race_id = p_race_id
    and standing.classification_type = 'general'
    and standing.entity_type = 'rider'
),
effective_team_disqualifications as (
  select distinct on (disqualification.team_id)
    disqualification.team_id,
    disqualification.from_stage_id,
    disqualification.from_stage_number,
    disqualification.reason_code,
    disqualification.required_jersey_units,
    disqualification.available_jersey_units,
    disqualification.missing_jersey_units
  from public.race_team_stage_disqualifications disqualification
  cross join selected_stage selected
  where disqualification.race_id = p_race_id
    and disqualification.from_stage_number <= selected.stage_number
  order by
    disqualification.team_id,
    disqualification.from_stage_number asc,
    disqualification.created_at asc
),
last_stage_results as (
  select distinct on (result.rider_id)
    result.rider_id,
    result.stage_id,
    stage.stage_number,
    result.rank,
    result.status,
    result.elapsed_seconds,
    result.gap_seconds
  from public.race_stage_results result
  join public.race_stages stage
    on stage.id = result.stage_id
   and stage.race_id = result.race_id
  cross join selected_stage selected
  where result.race_id = p_race_id
    and stage.stage_number <= selected.stage_number
  order by
    result.rider_id,
    stage.stage_number desc,
    result.created_at desc
),
standing_rows as (
  select
    roster.rider_id,
    roster.team_id,
    roster.rider_name_snapshot,
    roster.team_name_snapshot,
    roster.country_code_snapshot,
    roster.start_number,
    current_general.rank,
    current_general.previous_rank,
    current_general.total_time_seconds,
    current_general.gap_seconds,
    case
      when disqualification.team_id is not null then 'dsq'
      when last_result.status in ('dnf', 'dns', 'otl', 'dsq') then last_result.status
      when current_general.rider_id is not null then 'active'
      else 'not_classified'
    end as status,
    case
      when disqualification.team_id is not null then disqualification.from_stage_number
      when last_result.status in ('dnf', 'dns', 'otl', 'dsq') then last_result.stage_number
      else null
    end as status_from_stage_number,
    disqualification.reason_code as status_reason_code,
    disqualification.required_jersey_units,
    disqualification.available_jersey_units,
    disqualification.missing_jersey_units,
    last_result.stage_number as last_result_stage_number,
    last_result.rank as last_result_rank,
    last_result.status as last_result_status,
    last_result.elapsed_seconds as last_result_elapsed_seconds,
    last_result.gap_seconds as last_result_gap_seconds
  from roster
  cross join selected_stage selected
  left join current_general
    on current_general.rider_id = roster.rider_id
  left join effective_team_disqualifications disqualification
    on disqualification.team_id = roster.team_id
  left join last_stage_results last_result
    on last_result.rider_id = roster.rider_id
),
rows_payload as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rider_id', row_data.rider_id,
        'team_id', row_data.team_id,
        'rider_name_snapshot', row_data.rider_name_snapshot,
        'team_name_snapshot', row_data.team_name_snapshot,
        'country_code_snapshot', row_data.country_code_snapshot,
        'start_number', row_data.start_number,
        'rank', row_data.rank,
        'previous_rank', row_data.previous_rank,
        'total_time_seconds', row_data.total_time_seconds,
        'gap_seconds', row_data.gap_seconds,
        'status', row_data.status,
        'status_from_stage_number', row_data.status_from_stage_number,
        'status_reason_code', row_data.status_reason_code,
        'required_jersey_units', row_data.required_jersey_units,
        'available_jersey_units', row_data.available_jersey_units,
        'missing_jersey_units', row_data.missing_jersey_units,
        'last_result_stage_number', row_data.last_result_stage_number,
        'last_result_rank', row_data.last_result_rank,
        'last_result_status', row_data.last_result_status,
        'last_result_elapsed_seconds', row_data.last_result_elapsed_seconds,
        'last_result_gap_seconds', row_data.last_result_gap_seconds
      )
      order by
        case when row_data.status = 'active' then 0 else 1 end,
        case when row_data.status = 'active' then row_data.rank end nulls last,
        row_data.status_from_stage_number nulls last,
        row_data.start_number nulls last,
        row_data.rider_name_snapshot nulls last,
        row_data.rider_id
    ),
    '[]'::jsonb
  ) as rows
  from standing_rows row_data
),
summary_payload as (
  select jsonb_build_object(
    'started', count(*),
    'active', count(*) filter (where status = 'active'),
    'dsq', count(*) filter (where status = 'dsq'),
    'dnf', count(*) filter (where status = 'dnf'),
    'dns', count(*) filter (where status = 'dns'),
    'otl', count(*) filter (where status = 'otl'),
    'not_classified', count(*) filter (where status = 'not_classified')
  ) as summary
  from standing_rows
)
select jsonb_build_object(
  'race_id', p_race_id,
  'stage_id', selected.stage_id,
  'stage_number', selected.stage_number,
  'rows', rows_payload.rows,
  'summary', summary_payload.summary
)
from selected_stage selected
cross join rows_payload
cross join summary_payload;
$function$;

comment on function public.get_full_race_standings_v1(uuid, uuid) is
  'Read-only roster-based Full Race Standings. Preserves original race participants and overlays current GC, terminal status/disqualification, and last stage result without mutating sporting output.';
