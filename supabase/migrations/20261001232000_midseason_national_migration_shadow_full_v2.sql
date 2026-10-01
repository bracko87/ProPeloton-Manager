-- Full mid-season Season 1 National migration rehearsal through 1 September.
-- All simulated clock moves, notifications, duties, race fixture results and
-- lifecycle transitions live inside a rollback-only subtransaction.
--
-- IMPORTANT: deterministic fixture results validate lifecycle/result handoffs.
-- They do not replace TypeScript race-engine integration tests.

create or replace function private.shadow_complete_national_championship_stage_v1(
  p_edition_id uuid,
  p_race_id uuid,
  p_stage_id uuid,
  p_event_type text,
  p_heat_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_run_id uuid;
  v_rows integer:=0;
begin
  if p_event_type not in ('qualification','final') then
    raise exception 'Unsupported shadow National Championship event type %',p_event_type;
  end if;

  select sr.id into v_run_id
  from public.race_stage_simulation_runs sr
  where sr.stage_id=p_stage_id and sr.status='completed'
  order by sr.completed_at desc nulls last,sr.started_at desc
  limit 1;

  if v_run_id is null then
    perform set_config('app.race_engine_writer_family','typescript',true);

    insert into public.race_stage_simulation_runs(
      race_id,stage_id,status,engine_version,simulation_mode,
      started_at,completed_at,input_snapshot_json,result_summary_json
    )
    values(
      p_race_id,p_stage_id,'completed','race_engine_ts_v1','deterministic_road_race_v1',
      now(),now(),
      jsonb_build_object(
        'fixture','midseason_national_migration_shadow_v2',
        'event_type',p_event_type
      ),
      jsonb_build_object(
        'fixture','midseason_national_migration_shadow_v2',
        'event_type',p_event_type
      )
    )
    returning id into v_run_id;
  end if;

  perform set_config('app.race_engine_writer_family','typescript',true);

  insert into public.race_stage_results(
    race_id,stage_id,rider_id,team_id,rank,status,elapsed_seconds,gap_seconds,
    rider_name_snapshot,team_name_snapshot,simulation_run_id,output_contract
  )
  select
    p_race_id,
    p_stage_id,
    en.rider_id,
    coalesce(en.club_id_snapshot,en.rider_id),
    row_number() over(order by en.national_rank,en.rider_id)::integer,
    'finished',
    case when p_event_type='qualification' then 12000 else 13000 end
      +row_number() over(order by en.national_rank,en.rider_id)::integer,
    row_number() over(order by en.national_rank,en.rider_id)::integer-1,
    en.rider_name_snapshot,
    coalesce(c.name,'Free Agent'),
    v_run_id,
    'run_scoped_v1'
  from public.national_championship_entries en
  left join public.clubs c on c.id=en.club_id_snapshot
  where en.edition_id=p_edition_id
    and (
      (p_event_type='qualification'
       and en.heat_id=p_heat_id
       and public.national_championship_entry_confirmed_for_event_v1(
         en.id,'qualification',p_heat_id
       ))
      or
      (p_event_type='final'
       and public.national_championship_entry_confirmed_for_event_v1(
         en.id,'final',null
       ))
    )
  on conflict do nothing;

  get diagnostics v_rows=row_count;

  return jsonb_build_object(
    'status','completed',
    'simulation_run_id',v_run_id,
    'result_rows_inserted',v_rows
  );
end;
$function$;

revoke all on function private.shadow_complete_national_championship_stage_v1(uuid,uuid,uuid,text,uuid) from public;


create or replace function private.run_midseason_national_migration_shadow_v2(
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_original_state jsonb;
  v_original_season integer;
  v_start_date date;
  v_end_date date;
  v_day date;

  v_report jsonb:='{}'::jsonb;
  v_checkpoints jsonb:='[]'::jsonb;
  v_last_snapshot jsonb:='{}'::jsonb;
  v_nc_runtime jsonb;
  v_na_runtime jsonb;
  v_q_result jsonb;
  v_f_result jsonb;
  v_nc_overview jsonb;
  v_nations_health jsonb;
  v_assoc_integrity jsonb;

  v_baseline_notifications bigint;
  v_baseline_associations integer;
  v_baseline_editions integer;
  v_baseline_nc_editions integer;
  v_baseline_elections integer;
  v_baseline_coach_terms integer;
  v_baseline_nc_entries integer;
  v_baseline_nc_duties integer;
  v_baseline_invalid_memberships integer;

  v_active_associations integer;
  v_active_coaches integer;
  v_open_elections integer;
  v_completed_elections integer;
  v_max_election_round integer;
  v_human_capable_without_coach integer;

  v_nc_planned integer;
  v_nc_qualification_pending integer;
  v_nc_final_ready integer;
  v_nc_completed integer;
  v_pending_initial integer;
  v_pending_final integer;
  v_confirmed_nc_duties integer;
  v_overdue_ready_planned integer;
  v_nonready_due integer;
  v_commitment_conflicts integer;
  v_ready_lifecycle_issue_count integer:=0;
  v_ready_lifecycle_issues jsonb:='[]'::jsonb;

  v_notifications_delta bigint;
  v_invalid_memberships integer;
  v_new_invalid_memberships integer;

  v_qualification_heats_completed_total integer:=0;
  v_finals_completed_total integer:=0;
  v_champions integer:=0;
  v_world_entries integer:=0;
  v_stage_id uuid;
  v_stage_result jsonb;

  v_world_groups integer:=0;
  v_world_groups_with_host integer:=0;
  v_world_groups_without_host integer:=0;

  v_prev_active_coaches integer:=-1;
  v_prev_open_elections integer:=-1;
  v_prev_max_election_round integer:=-1;
  v_prev_nc_completed integer:=-1;

  h record;
  e record;

  v_error text;
  v_error_detail text;
  v_error_hint text;
  v_error_context text;

  v_live_state_after jsonb;
  v_live_preserved boolean;
begin
  select to_jsonb(gs),gs.season_number,public.get_current_game_date_date()
  into v_original_state,v_original_season,v_start_date
  from public.game_state gs
  where gs.id=true;

  if v_original_season<>1 then
    return jsonb_build_object(
      'status','skipped',
      'reason','season_1_only',
      'current_season',v_original_season,
      'current_game_date',v_start_date
    );
  end if;

  v_end_date:=coalesce(p_end_date,public.game_date_from_parts(1,9,1));

  if v_end_date<v_start_date then
    return jsonb_build_object(
      'status','skipped',
      'reason','end_before_current_game_date',
      'current_game_date',v_start_date,
      'requested_end_date',v_end_date
    );
  end if;

  if v_end_date>public.game_date_from_parts(1,9,1) then
    return jsonb_build_object(
      'status','skipped',
      'reason','harness_capped_at_september_1',
      'maximum_end_date',public.game_date_from_parts(1,9,1)
    );
  end if;

  select count(*) into v_baseline_notifications from public.user_notifications;
  select count(*) into v_baseline_associations from public.national_associations;
  select count(*) into v_baseline_editions
  from public.nations_competition_editions where season_number=1;
  select count(*) into v_baseline_nc_editions
  from public.national_championship_editions where season_number=1;
  select count(*) into v_baseline_elections
  from public.national_coach_elections where season_number=1;
  select count(*) into v_baseline_coach_terms
  from public.national_coach_terms where season_number=1;
  select count(*) into v_baseline_nc_entries
  from public.national_championship_entries en
  join public.national_championship_editions ed on ed.id=en.edition_id
  where ed.season_number=1;
  select count(*) into v_baseline_nc_duties
  from public.national_championship_duties d
  join public.national_championship_editions ed on ed.id=d.edition_id
  where ed.season_number=1;

  select count(*)::integer into v_baseline_invalid_memberships
  from public.national_association_memberships m
  join public.clubs c on c.id=m.club_id
  join public.national_associations a on a.id=m.association_id
  where m.status='active'
    and (
      c.deleted_at is not null
      or coalesce(c.is_ai,false)=true
      or c.club_type<>'main'
      or c.owner_user_id<>m.user_id
      or upper(c.country_code)<>upper(a.country_code)
    );

  begin
    v_day:=v_start_date;

    while v_day<=v_end_date loop
      -- The existing game-state trigger exits immediately while paused, so this
      -- clock move cannot invoke unrelated hourly processors. Rollback restores
      -- the original live pause/date/time values.
      update public.game_state
      set season_number=1,
          month_number=extract(month from v_day)::integer,
          day_number=extract(day from v_day)::integer,
          hour_number=12,
          minute_number=0,
          is_paused=true
      where id=true;

      -- Same entry points as production National jobs.
      v_nc_runtime:=public.process_national_championship_runtime_v2();
      v_na_runtime:=public.process_national_association_nations_runtime_v4();

      -- Complete every qualification heat due today with deterministic,
      -- run-scoped TypeScript-compatible fixture results.
      for h in
        select heat.*,ed.country_code
        from public.national_championship_heats heat
        join public.national_championship_editions ed on ed.id=heat.edition_id
        where ed.season_number=1
          and ed.route_status='ready'
          and heat.qualification_date=v_day
          and heat.race_id is not null
          and heat.status<>'completed'
        order by ed.country_code,heat.heat_number
      loop
        perform public.national_championship_sync_race_participants_v1(
          h.edition_id,'qualification',h.id
        );

        select id into v_stage_id
        from public.race_stages
        where race_id=h.race_id
        order by stage_number
        limit 1;

        if v_stage_id is null then
          raise exception 'Qualification stage missing for % / heat %',
            h.country_code,h.id;
        end if;

        v_stage_result:=private.shadow_complete_national_championship_stage_v1(
          h.edition_id,h.race_id,v_stage_id,'qualification',h.id
        );

        update public.national_championship_heats
        set status='ready',updated_at=now()
        where id=h.id and status<>'completed';

        v_qualification_heats_completed_total:=
          v_qualification_heats_completed_total+1;
      end loop;

      v_q_result:=public.national_championship_process_qualification_results_v1();

      perform public.national_championship_open_final_confirmations_v1();
      perform public.national_championship_auto_approve_final_pending_v1();
      perform public.national_championship_refresh_final_participants_v1();

      -- Complete every route-ready National Final due today.
      for e in
        select ed.*
        from public.national_championship_editions ed
        where ed.season_number=1
          and ed.route_status='ready'
          and ed.final_date=v_day
          and ed.final_race_id is not null
          and ed.status<>'completed'
        order by ed.country_code
      loop
        perform public.national_championship_sync_race_participants_v1(
          e.id,'final',null
        );

        select id into v_stage_id
        from public.race_stages
        where race_id=e.final_race_id
        order by stage_number
        limit 1;

        if v_stage_id is null then
          raise exception 'Final stage missing for %',e.country_code;
        end if;

        v_stage_result:=private.shadow_complete_national_championship_stage_v1(
          e.id,e.final_race_id,v_stage_id,'final',null
        );

        update public.national_championship_editions
        set status='final_ready',updated_at=now()
        where id=e.id and status<>'completed';

        v_finals_completed_total:=v_finals_completed_total+1;
      end loop;

      v_f_result:=public.national_championship_process_final_results_v1();

      -- One more runtime pass handles any same-day handoff produced by results.
      v_nc_runtime:=public.process_national_championship_runtime_v2();

      select count(*)::integer into v_active_associations
      from public.national_associations where status='active';

      select count(*)::integer into v_active_coaches
      from public.national_coach_terms
      where season_number=1 and status='active';

      select count(*)::integer into v_open_elections
      from public.national_coach_elections
      where season_number=1
        and status in ('candidate_registration','voting','runoff');

      select count(*)::integer into v_completed_elections
      from public.national_coach_elections
      where season_number=1 and status='completed';

      select coalesce(max(current_round),0)::integer into v_max_election_round
      from public.national_coach_elections
      where season_number=1
        and status in ('candidate_registration','voting','runoff');

      -- Associations with enough genuine human memberships should not be left
      -- without both a coach and an open election.
      select count(*)::integer into v_human_capable_without_coach
      from public.national_associations a
      where a.status='active'
        and (
          select count(*)
          from public.national_association_memberships m
          join public.clubs c on c.id=m.club_id
          where m.association_id=a.id
            and m.status='active'
            and coalesce(c.is_ai,false)=false
            and c.deleted_at is null
            and c.club_type='main'
            and c.owner_user_id=m.user_id
            and upper(c.country_code)=upper(a.country_code)
        ) >= (
          select minimum_active_members
          from public.national_association_config
          where id=true
        )
        and not exists(
          select 1 from public.national_coach_terms t
          where t.association_id=a.id
            and t.season_number=1
            and t.status='active'
        )
        and not exists(
          select 1 from public.national_coach_elections ce
          where ce.association_id=a.id
            and ce.season_number=1
            and ce.status in ('candidate_registration','voting','runoff')
        );

      select
        count(*) filter(where status='planned')::integer,
        count(*) filter(where status='qualification_pending')::integer,
        count(*) filter(where status='final_ready')::integer,
        count(*) filter(where status='completed')::integer
      into
        v_nc_planned,
        v_nc_qualification_pending,
        v_nc_final_ready,
        v_nc_completed
      from public.national_championship_editions
      where season_number=1 and discipline='road';

      select count(*)::integer into v_pending_initial
      from public.national_championship_entries en
      join public.national_championship_editions ed on ed.id=en.edition_id
      where ed.season_number=1
        and en.participation_decision='pending';

      select count(*)::integer into v_pending_final
      from public.national_championship_entries en
      join public.national_championship_editions ed on ed.id=en.edition_id
      where ed.season_number=1
        and en.final_participation_decision='pending';

      select count(*)::integer into v_confirmed_nc_duties
      from public.national_championship_duties d
      join public.national_championship_editions ed on ed.id=d.edition_id
      where ed.season_number=1 and d.status='confirmed';

      select count(*)::integer into v_overdue_ready_planned
      from public.national_championship_editions ed
      where ed.season_number=1
        and ed.discipline='road'
        and ed.status='planned'
        and ed.schedule_draw_status='locked'
        and ed.climate_status='ready'
        and ed.route_status='ready'
        and ed.ranking_snapshot_date<=v_day;

      select count(*)::integer into v_nonready_due
      from public.national_championship_editions ed
      where ed.season_number=1
        and ed.discipline='road'
        and ed.status='planned'
        and coalesce(ed.route_status,'pending')<>'ready'
        and ed.ranking_snapshot_date<=v_day;

      select count(*)::integer into v_commitment_conflicts
      from (
        select distinct cd.rider_id,cd.id championship_duty_id,td.id team_duty_id
        from public.national_championship_duties cd
        join public.national_championship_editions ce
          on ce.id=cd.edition_id and ce.season_number=1
        join public.national_team_duties td
          on td.season_number=1
         and td.status in ('confirmed','on_duty')
         and td.start_date<=coalesce(cd.duty_end_date,cd.duty_date)
         and td.end_date>=coalesce(cd.duty_start_date,cd.duty_date)
        join public.national_team_squad_members sm
          on sm.squad_id=td.squad_id
         and sm.rider_id=cd.rider_id
        where cd.status='confirmed'
      ) conflicts;

      select count(*)::integer into v_invalid_memberships
      from public.national_association_memberships m
      join public.clubs c on c.id=m.club_id
      join public.national_associations a on a.id=m.association_id
      where m.status='active'
        and (
          c.deleted_at is not null
          or coalesce(c.is_ai,false)=true
          or c.club_type<>'main'
          or c.owner_user_id<>m.user_id
          or upper(c.country_code)<>upper(a.country_code)
        );

      v_new_invalid_memberships:=
        greatest(0,v_invalid_memberships-v_baseline_invalid_memberships);

      select count(*)-v_baseline_notifications
      into v_notifications_delta
      from public.user_notifications;

      select count(*)::integer,
             count(*) filter(where g.host_country_code is not null)::integer,
             count(*) filter(where g.host_country_code is null)::integer
      into v_world_groups,v_world_groups_with_host,v_world_groups_without_host
      from public.nations_competition_groups g
      join public.nations_competition_rounds r on r.id=g.round_id
      join public.nations_competition_editions ed on ed.id=r.edition_id
      where ed.season_number=1;

      select count(*)::integer into v_champions
      from public.national_championship_editions
      where season_number=1
        and status='completed'
        and champion_rider_id is not null;

      select count(*)::integer into v_world_entries
      from public.world_road_championship_entries w
      join public.national_championship_editions ed
        on ed.id=w.source_national_edition_id
      where ed.season_number=1;

      v_last_snapshot:=jsonb_build_object(
        'game_date',v_day,
        'national_association',jsonb_build_object(
          'active_associations',v_active_associations,
          'active_coaches',v_active_coaches,
          'open_elections',v_open_elections,
          'completed_elections',v_completed_elections,
          'highest_open_election_round',v_max_election_round,
          'human_capable_without_coach_or_election',v_human_capable_without_coach,
          'invalid_active_memberships',v_invalid_memberships,
          'new_invalid_memberships',v_new_invalid_memberships
        ),
        'national_championships',jsonb_build_object(
          'planned',v_nc_planned,
          'qualification_pending',v_nc_qualification_pending,
          'final_ready',v_nc_final_ready,
          'completed',v_nc_completed,
          'champions',v_champions,
          'world_entries_from_champions',v_world_entries,
          'pending_initial_decisions',v_pending_initial,
          'pending_final_decisions',v_pending_final,
          'confirmed_duties',v_confirmed_nc_duties,
          'overdue_route_ready_planned',v_overdue_ready_planned,
          'nonready_editions_past_freeze',v_nonready_due
        ),
        'world_nations',jsonb_build_object(
          'groups',v_world_groups,
          'groups_with_host',v_world_groups_with_host,
          'groups_without_host',v_world_groups_without_host
        ),
        'overlapping_national_commitments',v_commitment_conflicts,
        'notifications_generated',v_notifications_delta,
        'fixture_results',jsonb_build_object(
          'qualification_heats_completed',v_qualification_heats_completed_total,
          'national_finals_completed',v_finals_completed_total
        )
      );

      -- First/last day, month starts, election-round changes, championship
      -- completions and actual result dates become audit checkpoints.
      if v_day=v_start_date
         or v_day=v_end_date
         or extract(day from v_day)=1
         or v_active_coaches<>v_prev_active_coaches
         or v_open_elections<>v_prev_open_elections
         or v_max_election_round<>v_prev_max_election_round
         or v_nc_completed<>v_prev_nc_completed
         or coalesce((v_nc_runtime->>'rankings_frozen')::integer,0)>0
         or coalesce((v_q_result->>'qualification_heats_processed')::integer,0)>0
         or coalesce((v_f_result->>'national_finals_processed')::integer,0)>0
         or v_overdue_ready_planned>0
         or v_commitment_conflicts>0
      then
        v_checkpoints:=v_checkpoints||jsonb_build_array(v_last_snapshot);
      end if;

      v_prev_active_coaches:=v_active_coaches;
      v_prev_open_elections:=v_open_elections;
      v_prev_max_election_round:=v_max_election_round;
      v_prev_nc_completed:=v_nc_completed;

      v_day:=v_day+1;
    end loop;

    v_nc_overview:=public.national_championship_lifecycle_overview_v1();
    v_nations_health:=public.check_nations_operations_health_v1();
    v_assoc_integrity:=public.check_national_association_integrity_v1();

    select
      count(*)::integer,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'country_code',ed.country_code,
          'route_status',ed.route_status,
          'lifecycle_issue_count',(x.item->>'issue_count')::integer,
          'current_step',x.item->>'current_step',
          'ranking_freeze',x.item->>'ranking_freeze',
          'invitations',x.item->>'invitations',
          'rider_locks',x.item->>'rider_locks',
          'qualification',x.item->>'qualification',
          'final_confirmation',x.item->>'final_confirmation',
          'final_startlist',x.item->>'final_startlist',
          'results',x.item->>'results'
        )
        order by ed.country_code
      ),'[]'::jsonb)
    into v_ready_lifecycle_issue_count,v_ready_lifecycle_issues
    from jsonb_array_elements(v_nc_overview->'editions') as x(item)
    join public.national_championship_editions ed
      on ed.season_number=1
     and ed.country_code=x.item->>'country_code'
     and ed.discipline='road'
    where ed.route_status='ready'
      and (x.item->>'issue_count')::integer>0;

    v_report:=jsonb_build_object(
      'status',
        case
          when v_overdue_ready_planned=0
           and v_commitment_conflicts=0
           and v_new_invalid_memberships=0
           and v_human_capable_without_coach=0
           and v_ready_lifecycle_issue_count=0
           and coalesce((v_nations_health->>'issues')::integer,0)=0
          then 'pass'
          else 'fail'
        end,
      'mode','rollback_midseason_migration_rehearsal_full_v2',
      'result_feed','deterministic run-scoped TypeScript-compatible fixture results',
      'typescript_race_engine_executed_here',false,
      'source_season',1,
      'start_game_date',v_start_date,
      'end_game_date',v_end_date,
      'days_simulated',(v_end_date-v_start_date)+1,
      'baseline_preexisting_issues',jsonb_build_object(
        'invalid_active_memberships',v_baseline_invalid_memberships
      ),
      'final_shadow_state',v_last_snapshot,
      'ready_route_lifecycle_issue_count',v_ready_lifecycle_issue_count,
      'ready_route_lifecycle_issues',v_ready_lifecycle_issues,
      'national_championship_lifecycle_summary',v_nc_overview->'summary',
      'nations_operations_health',v_nations_health,
      'national_association_integrity',v_assoc_integrity,
      'checkpoints',v_checkpoints
    );

    raise exception using
      errcode='ZMS02',
      message='MIDSEASON_NATIONAL_MIGRATION_SHADOW_V2_ROLLBACK';

  exception
    when sqlstate 'ZMS02' then
      null;
    when others then
      v_error:=sqlerrm;
      get stacked diagnostics
        v_error_detail=PG_EXCEPTION_DETAIL,
        v_error_hint=PG_EXCEPTION_HINT,
        v_error_context=PG_EXCEPTION_CONTEXT;

      v_report:=jsonb_build_object(
        'status','fail',
        'mode','rollback_midseason_migration_rehearsal_full_v2',
        'source_season',1,
        'start_game_date',v_start_date,
        'end_game_date',v_end_date,
        'phase','daily_runtime_or_fixture_result_handoff',
        'failed_on_or_before_game_date',v_day,
        'error',v_error,
        'error_detail',v_error_detail,
        'error_hint',v_error_hint,
        'error_context',v_error_context,
        'checkpoints',v_checkpoints
      );
  end;

  select to_jsonb(gs) into v_live_state_after
  from public.game_state gs
  where gs.id=true;

  v_live_preserved:=
    v_live_state_after=v_original_state
    and (select count(*) from public.national_associations)=v_baseline_associations
    and (select count(*) from public.nations_competition_editions where season_number=1)=v_baseline_editions
    and (select count(*) from public.national_championship_editions where season_number=1)=v_baseline_nc_editions
    and (select count(*) from public.national_coach_elections where season_number=1)=v_baseline_elections
    and (select count(*) from public.national_coach_terms where season_number=1)=v_baseline_coach_terms
    and (
      select count(*)
      from public.national_championship_entries en
      join public.national_championship_editions ed on ed.id=en.edition_id
      where ed.season_number=1
    )=v_baseline_nc_entries
    and (
      select count(*)
      from public.national_championship_duties d
      join public.national_championship_editions ed on ed.id=d.edition_id
      where ed.season_number=1
    )=v_baseline_nc_duties
    and (select count(*) from public.user_notifications)=v_baseline_notifications;

  return v_report||jsonb_build_object(
    'live_state_preserved',v_live_preserved,
    'live_game_state_before',v_original_state,
    'live_game_state_after',v_live_state_after
  );
end;
$function$;

revoke all on function private.run_midseason_national_migration_shadow_v2(date) from public;
