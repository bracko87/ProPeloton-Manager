CREATE OR REPLACE FUNCTION public.race_engine_get_stage_phase_commands_v1(p_stage_id uuid)
 RETURNS TABLE(race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, team_plan text, phase_1_command text, phase_2_command text, phase_3_command text, phase_4_command text, avg_effort_multiplier numeric, avg_performance_modifier numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with stage_context as (
  select
    stage.id as stage_id,
    stage.race_id,
    stage.stage_number,
    greatest(coalesce(stage.distance_km, 0), 0)::numeric as distance_km,
    lower(coalesce(stage.terrain_type, 'flat')) as terrain_type,
    coalesce((race.metadata->>'national_championship')::boolean,false)
      as is_national_championship
  from public.race_stages stage
  join public.races race
    on race.id=stage.race_id
  where stage.id = p_stage_id
),

rider_inputs as (
  select *
  from public.race_engine_get_stage_rider_inputs_v1(p_stage_id)
),

commands as (
  select
    ri.race_id,
    ri.stage_id,
    ri.rider_id,
    ri.team_id,
    ri.rider_name,
    ri.team_name,
    ri.sprint,
    ri.climbing,
    ri.flat,
    ri.endurance,
    ri.resistance,
    ri.race_iq,
    ri.teamwork,
    ri.availability_status,

    public.race_engine_normalize_stage_role_code_v1(
      coalesce(
        rsp.rider_roles_json ->> ri.rider_id::text,
        ri.role_code,
        'free_role'
      )
    ) as role_code,

    coalesce(rsp.team_tactic_json ->> 'plan', 'balanced') as team_plan,

    coalesce(club.is_ai, false)
      or coalesce(club.inactive_ai_controlled, false) as is_ai_controlled,

    coalesce(
      nullif(
        case
          when coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_1', 'command'],
            ''
          ) in ('', 'follow_team_plan')
          and coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_1', 'ui_command'],
            ''
          ) not in ('', 'follow_team_plan')
          then rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_1', 'ui_command']
          else rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_1', 'command']
        end,
        ''
      ),
      nullif(
        rsp.team_tactic_json
          #>> array['individual_tactics_by_rider', ri.rider_id::text, 'phase_1', 'command'],
        ''
      ),
      'follow_team_plan'
    ) as raw_phase_1,

    coalesce(
      nullif(
        case
          when coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_2', 'command'],
            ''
          ) in ('', 'follow_team_plan')
          and coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_2', 'ui_command'],
            ''
          ) not in ('', 'follow_team_plan')
          then rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_2', 'ui_command']
          else rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_2', 'command']
        end,
        ''
      ),
      nullif(
        rsp.team_tactic_json
          #>> array['individual_tactics_by_rider', ri.rider_id::text, 'phase_2', 'command'],
        ''
      ),
      'follow_team_plan'
    ) as raw_phase_2,

    coalesce(
      nullif(
        case
          when coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_3', 'command'],
            ''
          ) in ('', 'follow_team_plan')
          and coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_3', 'ui_command'],
            ''
          ) not in ('', 'follow_team_plan')
          then rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_3', 'ui_command']
          else rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_3', 'command']
        end,
        ''
      ),
      nullif(
        rsp.team_tactic_json
          #>> array['individual_tactics_by_rider', ri.rider_id::text, 'phase_3', 'command'],
        ''
      ),
      'follow_team_plan'
    ) as raw_phase_3,

    coalesce(
      nullif(
        case
          when coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_4', 'command'],
            ''
          ) in ('', 'follow_team_plan')
          and coalesce(
            rsp.rider_individual_tactics_json
              #>> array[ri.rider_id::text, 'phase_4', 'ui_command'],
            ''
          ) not in ('', 'follow_team_plan')
          then rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_4', 'ui_command']
          else rsp.rider_individual_tactics_json
            #>> array[ri.rider_id::text, 'phase_4', 'command']
        end,
        ''
      ),
      nullif(
        rsp.team_tactic_json
          #>> array['individual_tactics_by_rider', ri.rider_id::text, 'phase_4', 'command'],
        ''
      ),
      'follow_team_plan'
    ) as raw_phase_4

  from rider_inputs ri
  left join public.race_stage_plans rsp
    on rsp.id = ri.stage_plan_id
  left join public.clubs club
    on club.id = ri.team_id
),

normalized as (
  select
    c.*,

    case c.raw_phase_1
      when 'controlled' then 'control_tempo'
      when 'steady' then 'conserve_energy'
      else c.raw_phase_1
    end as normalized_phase_1,

    case c.raw_phase_2
      when 'controlled' then 'control_tempo'
      when 'steady' then 'conserve_energy'
      else c.raw_phase_2
    end as normalized_phase_2,

    case c.raw_phase_3
      when 'controlled' then 'control_tempo'
      when 'steady' then 'conserve_energy'
      else c.raw_phase_3
    end as normalized_phase_3,

    case c.raw_phase_4
      when 'controlled' then 'control_tempo'
      when 'steady' then 'conserve_energy'
      else c.raw_phase_4
    end as normalized_phase_4

  from commands c
),

pre_stage_standings as (
  select *
  from public.get_race_stage_pre_stage_standings_v1(p_stage_id)
),

classification_leaders as (
  select
    max(points) filter (where classification_type = 'points' and rank = 1) as points_leader_points,
    max(points) filter (where classification_type = 'mountain' and rank = 1) as mountain_leader_points
  from pre_stage_standings
),

team_classification_context as (
  select
    n.team_id,
    min(s.rank) filter (where s.classification_type = 'general') as best_gc_rank,
    min(s.gap_seconds) filter (where s.classification_type = 'general') as best_gc_gap_seconds,
    min(s.rank) filter (where s.classification_type = 'points') as best_points_rank,
    max(s.points) filter (where s.classification_type = 'points') as best_points,
    min(s.rank) filter (where s.classification_type = 'mountain') as best_mountain_rank,
    max(s.points) filter (where s.classification_type = 'mountain') as best_mountain_points
  from normalized n
  left join pre_stage_standings s
    on s.team_id = n.team_id
  group by n.team_id
),

point_phase_flags as (
  select
    bool_or(lower(point.point_type) = 'kom' and point.km_from_start <= stage.distance_km * 0.25) as kom_p1,
    bool_or(lower(point.point_type) = 'kom' and point.km_from_start > stage.distance_km * 0.25 and point.km_from_start <= stage.distance_km * 0.50) as kom_p2,
    bool_or(lower(point.point_type) = 'kom' and point.km_from_start > stage.distance_km * 0.50 and point.km_from_start <= stage.distance_km * 0.70) as kom_p3,
    bool_or(lower(point.point_type) = 'kom' and point.km_from_start > stage.distance_km * 0.70) as kom_p4,
    bool_or(lower(point.point_type) in ('intermediate_sprint', 'bonus_sprint') and point.km_from_start <= stage.distance_km * 0.25) as sprint_p1,
    bool_or(lower(point.point_type) in ('intermediate_sprint', 'bonus_sprint') and point.km_from_start > stage.distance_km * 0.25 and point.km_from_start <= stage.distance_km * 0.50) as sprint_p2,
    bool_or(lower(point.point_type) in ('intermediate_sprint', 'bonus_sprint') and point.km_from_start > stage.distance_km * 0.50 and point.km_from_start <= stage.distance_km * 0.70) as sprint_p3,
    bool_or(lower(point.point_type) in ('intermediate_sprint', 'bonus_sprint') and point.km_from_start > stage.distance_km * 0.70) as sprint_p4
  from stage_context stage
  left join public.race_stage_points point
    on point.stage_id = stage.stage_id
),

ai_attack_candidate_ranked as (
  select
    n.team_id,
    n.rider_id,
    row_number() over (
      partition by n.team_id
      order by
        case n.role_code
          when 'breakaway_rider' then 0
          when 'rouleur' then 1
          when 'free_role' then 2
          when 'climber' then 3
          when 'mountain_domestique' then 4
          when 'helper_domestique' then 5
          else 6
        end,
        case
          when stage.terrain_type in ('mountain', 'hilly', 'cobbled')
            then n.climbing * 0.35 + n.endurance * 0.25 + n.resistance * 0.20 + n.race_iq * 0.20
          else n.flat * 0.35 + n.endurance * 0.25 + n.resistance * 0.20 + n.race_iq * 0.20
        end desc,
        md5(p_stage_id::text || ':ai-attack-candidate:' || n.rider_id::text)
    ) as candidate_rank
  from normalized n
  cross join stage_context stage
  where n.is_ai_controlled
    and lower(coalesce(n.availability_status, 'fit')) not in ('injured', 'sick')
    and n.role_code not in ('team_leader_gc', 'sprinter', 'lead_out_rider', 'sprint_train_rider', 'protected_rider')
    and stage.terrain_type not in ('individual_time_trial', 'team_time_trial', 'prologue')
),

ai_attack_team_candidates as (
  select team_id, rider_id
  from ai_attack_candidate_ranked
  where candidate_rank = 1
),

ai_attack_phase_ranked as (
  select
    candidate.team_id,
    candidate.rider_id,
    row_number() over (order by md5(p_stage_id::text || ':phase1-attack-team:' || candidate.team_id::text)) as p1_rank,
    row_number() over (order by md5(p_stage_id::text || ':phase2-attack-team:' || candidate.team_id::text)) as p2_rank,
    row_number() over (order by md5(p_stage_id::text || ':phase3-attack-team:' || candidate.team_id::text)) as p3_rank,
    count(*) over () as team_count
  from ai_attack_team_candidates candidate
),

ai_attack_selected as (
  select
    ranked.team_id,
    ranked.rider_id,
    ranked.p1_rank <= least(6, greatest(1, ceil(ranked.team_count *
      case when stage.terrain_type in ('mountain', 'cobbled') then 0.50 when stage.terrain_type = 'hilly' then 0.45 else 0.35 end)::integer)) as p1,
    ranked.p2_rank <= least(5, greatest(1, ceil(ranked.team_count *
      case when stage.terrain_type in ('mountain', 'cobbled') then 0.40 when stage.terrain_type = 'hilly' then 0.35 else 0.28 end)::integer)) as p2,
    ranked.p3_rank <= least(4, greatest(1, ceil(ranked.team_count *
      case when stage.terrain_type in ('mountain', 'cobbled') then 0.36 when stage.terrain_type = 'hilly' then 0.32 else 0.24 end)::integer)) as p3
  from ai_attack_phase_ranked ranked
  cross join stage_context stage
),

ai_kom_candidate_ranked as (
  select
    n.team_id,
    n.rider_id,
    row_number() over (
      partition by n.team_id
      order by
        case n.role_code when 'climber' then 0 when 'mountain_domestique' then 1 when 'breakaway_rider' then 2 when 'free_role' then 3 else 4 end,
        (n.climbing * 0.55 + n.endurance * 0.20 + n.resistance * 0.15 + n.race_iq * 0.10) desc,
        md5(p_stage_id::text || ':ai-kom:' || n.rider_id::text)
    ) as candidate_rank
  from normalized n
  where n.is_ai_controlled
    and lower(coalesce(n.availability_status, 'fit')) not in ('injured', 'sick')
    and n.role_code not in ('team_leader_gc', 'sprinter', 'lead_out_rider', 'sprint_train_rider', 'protected_rider')
),

ai_sprint_candidate_ranked as (
  select
    n.team_id,
    n.rider_id,
    row_number() over (
      partition by n.team_id
      order by
        case n.role_code when 'sprinter' then 0 when 'lead_out_rider' then 1 when 'free_role' then 2 when 'rouleur' then 3 else 4 end,
        (n.sprint * 0.58 + n.flat * 0.16 + n.race_iq * 0.12 + n.endurance * 0.08 + n.resistance * 0.06) desc,
        md5(p_stage_id::text || ':ai-sprint:' || n.rider_id::text)
    ) as candidate_rank
  from normalized n
  where n.is_ai_controlled
    and lower(coalesce(n.availability_status, 'fit')) not in ('injured', 'sick')
    and n.role_code not in ('team_leader_gc', 'protected_rider')
),

ai_kom_eligible_teams as (
  select candidate.team_id, candidate.rider_id
  from ai_kom_candidate_ranked candidate
  join team_classification_context context on context.team_id = candidate.team_id
  cross join stage_context stage
  cross join classification_leaders leader
  where candidate.candidate_rank = 1
    and (
      stage.stage_number = 1
      or coalesce(context.best_mountain_rank, 999) <= 12
      or coalesce(context.best_mountain_points, 0) >= greatest(0, coalesce(leader.mountain_leader_points, 0) - 25)
    )
),

ai_sprint_eligible_teams as (
  select candidate.team_id, candidate.rider_id
  from ai_sprint_candidate_ranked candidate
  join team_classification_context context on context.team_id = candidate.team_id
  cross join stage_context stage
  cross join classification_leaders leader
  where candidate.candidate_rank = 1
    and (
      stage.stage_number = 1
      or coalesce(context.best_points_rank, 999) <= 12
      or coalesce(context.best_points, 0) >= greatest(0, coalesce(leader.points_leader_points, 0) - 40)
    )
),

ai_kom_team_ranked as (
  select
    candidate.*,
    row_number() over (order by md5(p_stage_id::text || ':ai-kom-team:' || candidate.team_id::text)) as team_rank,
    count(*) over () as team_count
  from ai_kom_eligible_teams candidate
),

ai_sprint_team_ranked as (
  select
    candidate.*,
    row_number() over (order by md5(p_stage_id::text || ':ai-sprint-team:' || candidate.team_id::text)) as team_rank,
    count(*) over () as team_count
  from ai_sprint_eligible_teams candidate
),

ai_kom_selected as (
  select team_id, rider_id
  from ai_kom_team_ranked
  where team_rank <= least(6, greatest(1, ceil(team_count * 0.45)::integer))
),

ai_sprint_selected as (
  select team_id, rider_id
  from ai_sprint_team_ranked
  where team_rank <= least(6, greatest(1, ceil(team_count * 0.45)::integer))
),

ai_chase_candidate_ranked as (
  select
    n.team_id,
    n.rider_id,
    row_number() over (
      partition by n.team_id
      order by
        case n.role_code when 'breakaway_chaser' then 0 when 'rouleur' then 1 when 'helper_domestique' then 2 when 'mountain_domestique' then 3 when 'lead_out_rider' then 4 else 5 end,
        (n.endurance * 0.30 + n.resistance * 0.25 + n.race_iq * 0.20 + n.flat * 0.15 + n.teamwork * 0.10) desc,
        md5(p_stage_id::text || ':ai-chase-worker:' || n.rider_id::text)
    ) as candidate_rank
  from normalized n
  where n.is_ai_controlled
    and lower(coalesce(n.availability_status, 'fit')) not in ('injured', 'sick')
    and n.role_code not in ('team_leader_gc', 'sprinter', 'protected_rider')
),

ai_chase_interested_teams as (
  select distinct n.team_id
  from normalized n
  join team_classification_context context on context.team_id = n.team_id
  left join ai_kom_selected kom on kom.team_id = n.team_id
  left join ai_sprint_selected sprint on sprint.team_id = n.team_id
  where n.is_ai_controlled
    and (
      kom.team_id is not null
      or sprint.team_id is not null
      or coalesce(context.best_gc_rank, 999) <= 10
      or coalesce(context.best_gc_gap_seconds, 999999) <= 90
    )
),

ai_chase_team_ranked as (
  select
    interested.team_id,
    worker.rider_id,
    row_number() over (order by md5(p_stage_id::text || ':phase2-chase-team:' || interested.team_id::text)) as p2_rank,
    row_number() over (order by md5(p_stage_id::text || ':phase3-chase-team:' || interested.team_id::text)) as p3_rank,
    count(*) over () as team_count
  from ai_chase_interested_teams interested
  join ai_chase_candidate_ranked worker
    on worker.team_id = interested.team_id
   and worker.candidate_rank = 1
),

ai_chase_selected as (
  select
    ranked.team_id,
    ranked.rider_id,
    ranked.p2_rank <= least(8, greatest(1, ceil(ranked.team_count * 0.65)::integer)) as p2,
    ranked.p3_rank <= least(8, greatest(1, ceil(ranked.team_count * 0.70)::integer)) as p3
  from ai_chase_team_ranked ranked
),

ai_enriched as (
  select
    n.*,
    coalesce(attack.p1, false) and attack.rider_id = n.rider_id as ai_attack_p1,
    coalesce(attack.p2, false) and attack.rider_id = n.rider_id as ai_attack_p2,
    coalesce(attack.p3, false) and attack.rider_id = n.rider_id as ai_attack_p3,
    kom.rider_id = n.rider_id as ai_kom_selected,
    sprint.rider_id = n.rider_id as ai_sprint_selected,
    coalesce(chase.p2, false) and chase.rider_id = n.rider_id as ai_chase_p2,
    coalesce(chase.p3, false) and chase.rider_id = n.rider_id as ai_chase_p3,
    coalesce(flags.kom_p1, false) as kom_p1,
    coalesce(flags.kom_p2, false) as kom_p2,
    coalesce(flags.kom_p3, false) as kom_p3,
    coalesce(flags.kom_p4, false) as kom_p4,
    coalesce(flags.sprint_p1, false) as sprint_p1,
    coalesce(flags.sprint_p2, false) as sprint_p2,
    coalesce(flags.sprint_p3, false) as sprint_p3,
    coalesce(flags.sprint_p4, false) as sprint_p4
  from normalized n
  left join ai_attack_selected attack on attack.team_id = n.team_id
  left join ai_kom_selected kom on kom.team_id = n.team_id
  left join ai_sprint_selected sprint on sprint.team_id = n.team_id
  left join ai_chase_selected chase on chase.team_id = n.team_id
  cross join point_phase_flags flags
),

resolved as (
  select
    n.*,
    case
      when n.normalized_phase_1 <> 'follow_team_plan' then n.normalized_phase_1
      when stage.is_national_championship then 'ride_naturally'
      when n.is_ai_controlled and n.ai_attack_p1 then 'attack'
      when n.is_ai_controlled and n.ai_kom_selected and n.kom_p1 then 'fight_kom_points'
      when n.is_ai_controlled and n.ai_sprint_selected and n.sprint_p1 then 'fight_sprint_points'
      else n.team_plan
    end as phase_1_command,
    case
      when n.normalized_phase_2 <> 'follow_team_plan' then n.normalized_phase_2
      when stage.is_national_championship then 'ride_naturally'
      when n.is_ai_controlled and n.ai_kom_selected and n.kom_p2 then 'fight_kom_points'
      when n.is_ai_controlled and n.ai_sprint_selected and n.sprint_p2 then 'fight_sprint_points'
      when n.is_ai_controlled and n.ai_attack_p2 then 'attack'
      when n.is_ai_controlled and n.ai_chase_p2 then 'chase_breakaway'
      else n.team_plan
    end as phase_2_command,
    case
      when n.normalized_phase_3 <> 'follow_team_plan' then n.normalized_phase_3
      when stage.is_national_championship then 'ride_naturally'
      when n.is_ai_controlled and n.ai_kom_selected and n.kom_p3 then 'fight_kom_points'
      when n.is_ai_controlled and n.ai_sprint_selected and n.sprint_p3 then 'fight_sprint_points'
      when n.is_ai_controlled and n.ai_attack_p3 then 'attack'
      when n.is_ai_controlled and n.ai_chase_p3 then 'chase_breakaway'
      else n.team_plan
    end as phase_3_command,
    case
      when n.normalized_phase_4 <> 'follow_team_plan' then n.normalized_phase_4
      when stage.is_national_championship then 'ride_naturally'
      when n.is_ai_controlled and n.ai_kom_selected and n.kom_p4 then 'fight_kom_points'
      when n.is_ai_controlled and n.ai_sprint_selected and n.sprint_p4 then 'fight_sprint_points'
      else n.team_plan
    end as phase_4_command
  from ai_enriched n
  cross join stage_context stage
)

select
  r.race_id,
  r.stage_id,
  r.rider_id,
  r.team_id,
  r.rider_name,
  r.team_name,
  r.role_code,
  r.team_plan,
  r.phase_1_command,
  r.phase_2_command,
  r.phase_3_command,
  r.phase_4_command,

  (
    public.race_engine_role_command_effort_multiplier_v1(r.phase_1_command, r.role_code)
    + public.race_engine_role_command_effort_multiplier_v1(r.phase_2_command, r.role_code)
    + public.race_engine_role_command_effort_multiplier_v1(r.phase_3_command, r.role_code)
    + public.race_engine_role_command_effort_multiplier_v1(r.phase_4_command, r.role_code)
  ) / 4.0 as avg_effort_multiplier,

  (
    public.race_engine_command_performance_modifier_v1(r.phase_1_command)
    + public.race_engine_command_performance_modifier_v1(r.phase_2_command)
    + public.race_engine_command_performance_modifier_v1(r.phase_3_command)
    + public.race_engine_command_performance_modifier_v1(r.phase_4_command)
  ) / 4.0 as avg_performance_modifier

from resolved r
order by r.team_name, r.rider_name;
$function$;
