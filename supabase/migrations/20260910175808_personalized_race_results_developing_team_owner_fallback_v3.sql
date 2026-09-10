create or replace function public.race_engine_create_results_summary_notifications_v1(p_simulation_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run record;
  v_type_id bigint;
  v_recipient record;
  v_notification_id bigint;
  v_recipient_count integer := 0;
  v_created_count integer := 0;
  v_existing_count integer := 0;
  v_your_riders jsonb;
  v_top_10 jsonb;
  v_your_teams jsonb;
  v_your_rider_count integer;
  v_best_result_position integer;
  v_team_names text;
begin
  select sr.race_id, sr.stage_id, r.name as race_name, s.name as stage_name
  into v_run
  from public.race_stage_simulation_runs sr
  join public.races r on r.id = sr.race_id
  join public.race_stages s on s.id = sr.stage_id
  where sr.id = p_simulation_run_id
    and sr.status = 'completed';

  if v_run.race_id is null then
    raise exception 'Completed simulation run % not found.', p_simulation_run_id;
  end if;

  select id into v_type_id
  from public.notification_types
  where code = 'RACE_RESULTS_SUMMARY'
    and is_active = true;

  if v_type_id is null then
    raise exception 'Notification type RACE_RESULTS_SUMMARY not found or inactive.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'position', x.rank,
        'rank', x.rank,
        'rider_id', x.rider_id,
        'rider_name_raw', x.rider_name_snapshot,
        'rider_name', x.rider_name_snapshot ||
          case
            when x.elapsed_seconds is null then ''
            else ' — ' || public.race_engine_result_duration_label_v1(x.elapsed_seconds) ||
              case
                when coalesce(x.gap_seconds, 0) > 0
                  then ' (+' || public.race_engine_result_duration_label_v1(x.gap_seconds) || ')'
                else ''
              end
          end,
        'team_id', x.team_id,
        'team_name', x.team_name_snapshot,
        'elapsed_seconds', x.elapsed_seconds,
        'gap_seconds', x.gap_seconds,
        'time_label', public.race_engine_result_duration_label_v1(x.elapsed_seconds),
        'gap_label', case when coalesce(x.gap_seconds, 0) > 0
          then '+' || public.race_engine_result_duration_label_v1(x.gap_seconds)
          else null end
      ) order by x.rank
    ),
    '[]'::jsonb
  )
  into v_top_10
  from (
    select rsr.rank, rsr.rider_id, rsr.rider_name_snapshot, rsr.team_id,
           rsr.team_name_snapshot, rsr.elapsed_seconds, rsr.gap_seconds
    from public.race_stage_results rsr
    where rsr.simulation_run_id = p_simulation_run_id
    order by rsr.rank nulls last, rsr.rider_id
    limit 10
  ) x;

  for v_recipient in
    select distinct coalesce(c.owner_user_id, parent.owner_user_id) as user_id
    from public.race_stage_results rsr
    join public.clubs c on c.id = rsr.team_id
    left join public.clubs parent on parent.id = c.parent_club_id
    where rsr.simulation_run_id = p_simulation_run_id
      and coalesce(c.owner_user_id, parent.owner_user_id) is not null
      and coalesce(c.is_ai, false) = false
  loop
    select n.id into v_notification_id
    from public.notifications n
    where n.type_id = v_type_id
      and n.payload_json->>'simulation_run_id' = p_simulation_run_id::text
      and n.payload_json->>'recipient_user_id' = v_recipient.user_id::text
    order by n.id desc
    limit 1;

    if v_notification_id is not null then
      insert into public.user_notifications (user_id, notification_id, status, source_event_id)
      select v_recipient.user_id, v_notification_id, 'unread', null::uuid
      where not exists (
        select 1 from public.user_notifications un
        where un.user_id = v_recipient.user_id
          and un.notification_id = v_notification_id
      );

      v_existing_count := v_existing_count + 1;
      v_recipient_count := v_recipient_count + 1;
      continue;
    end if;

    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'position', y.rank,
            'rank', y.rank,
            'rider_id', y.rider_id,
            'rider_name_raw', y.rider_name_snapshot,
            'rider_name', y.rider_name_snapshot ||
              case
                when y.elapsed_seconds is null then ''
                else ' — ' || public.race_engine_result_duration_label_v1(y.elapsed_seconds) ||
                  case
                    when coalesce(y.gap_seconds, 0) > 0
                      then ' (+' || public.race_engine_result_duration_label_v1(y.gap_seconds) || ')'
                    else ''
                  end
              end,
            'team_id', y.team_id,
            'team_name', y.team_name_snapshot,
            'club_type', y.club_type,
            'is_developing_team', (y.club_type = 'developing'),
            'elapsed_seconds', y.elapsed_seconds,
            'gap_seconds', y.gap_seconds,
            'time_label', public.race_engine_result_duration_label_v1(y.elapsed_seconds),
            'gap_label', case when coalesce(y.gap_seconds, 0) > 0
              then '+' || public.race_engine_result_duration_label_v1(y.gap_seconds)
              else null end
          ) order by y.rank nulls last, y.rider_name_snapshot
        ),
        '[]'::jsonb
      ),
      count(*)::integer,
      min(y.rank)
    into v_your_riders, v_your_rider_count, v_best_result_position
    from (
      select rsr.rank, rsr.rider_id, rsr.rider_name_snapshot, rsr.team_id,
             rsr.team_name_snapshot, rsr.elapsed_seconds, rsr.gap_seconds,
             c.club_type::text as club_type
      from public.race_stage_results rsr
      join public.clubs c on c.id = rsr.team_id
      left join public.clubs parent on parent.id = c.parent_club_id
      where rsr.simulation_run_id = p_simulation_run_id
        and coalesce(c.owner_user_id, parent.owner_user_id) = v_recipient.user_id
        and coalesce(c.is_ai, false) = false
    ) y;

    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'club_id', z.id,
            'club_name', z.name,
            'club_type', z.club_type,
            'parent_club_id', z.parent_club_id,
            'is_developing_team', (z.club_type = 'developing')
          ) order by z.club_type, z.name
        ),
        '[]'::jsonb
      ),
      string_agg(z.name, ', ' order by z.club_type, z.name)
    into v_your_teams, v_team_names
    from (
      select distinct c.id, c.name, c.club_type::text as club_type, c.parent_club_id
      from public.race_stage_results rsr
      join public.clubs c on c.id = rsr.team_id
      left join public.clubs parent on parent.id = c.parent_club_id
      where rsr.simulation_run_id = p_simulation_run_id
        and coalesce(c.owner_user_id, parent.owner_user_id) = v_recipient.user_id
        and coalesce(c.is_ai, false) = false
    ) z;

    insert into public.notifications (
      type_id, title, message, source, action_url, payload_json
    )
    values (
      v_type_id,
      concat('Race results: ', v_run.race_name),
      concat(
        'Stage results are available for ', coalesce(v_run.stage_name, v_run.race_name),
        '. Your rider results for ', coalesce(v_team_names, 'your team'), ' are included below.'
      ),
      'game',
      concat('/dashboard/races/', v_run.race_id),
      jsonb_build_object(
        'source', 'race_engine_personalized_results_v3',
        'race_id', v_run.race_id,
        'stage_id', v_run.stage_id,
        'race_name', v_run.race_name,
        'stage_name', v_run.stage_name,
        'simulation_run_id', p_simulation_run_id,
        'recipient_user_id', v_recipient.user_id,
        'participants_count', coalesce(v_your_rider_count, 0),
        'your_riders_count', coalesce(v_your_rider_count, 0),
        'best_result_position', v_best_result_position,
        'your_riders', coalesce(v_your_riders, '[]'::jsonb),
        'your_teams', coalesce(v_your_teams, '[]'::jsonb),
        'top_10', coalesce(v_top_10, '[]'::jsonb),
        'includes_developing_team', coalesce(
          exists (
            select 1
            from jsonb_array_elements(coalesce(v_your_teams, '[]'::jsonb)) e
            where coalesce((e->>'is_developing_team')::boolean, false)
          ),
          false
        ),
        'race_results_path', concat('/dashboard/races/', v_run.race_id),
        'classification_path', concat('/dashboard/races/', v_run.race_id),
        'race_preparation_path', concat('/dashboard/race-preparation?raceId=', v_run.race_id)
      )
    )
    returning id into v_notification_id;

    insert into public.user_notifications (user_id, notification_id, status, source_event_id)
    values (v_recipient.user_id, v_notification_id, 'unread', null::uuid);

    v_created_count := v_created_count + 1;
    v_recipient_count := v_recipient_count + 1;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'recipient_count', v_recipient_count,
    'created_personalized_notification_count', v_created_count,
    'already_existing_personalized_notification_count', v_existing_count,
    'model_version', 'personalized_race_results_notification_v3'
  );
end;
$function$;

comment on function public.race_engine_create_results_summary_notifications_v1(uuid) is
'Creates one personalized race-results notification per user. Includes riders from both main and developing/U23 clubs. Developing teams resolve the recipient from their own owner_user_id or, as a safety fallback, the parent club owner.';
