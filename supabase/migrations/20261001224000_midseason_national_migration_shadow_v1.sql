-- Mid-season National systems migration rehearsal.
-- Replays the current Season 1 state forward inside a rollback-only subtransaction.
-- It is intentionally private and never leaves simulated game-state, lifecycle,
-- notification, duty, election or competition writes behind.
--
-- Phase 1 target: current game date -> 7 April, covering the migrated activation
-- election window before any National Championship race result injection is needed.

create or replace function private.run_midseason_national_migration_shadow_v1(
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = 'public','pg_temp'
as $function$
declare
  v_original_state jsonb;
  v_original_season integer;
  v_start_date date;
  v_end_date date;
  v_day date;

  v_report jsonb := '{}'::jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_nc_runtime jsonb;
  v_na_runtime jsonb;
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

  v_active_associations integer;
  v_active_coaches integer;
  v_open_elections integer;
  v_completed_elections integer;
  v_nc_planned integer;
  v_nc_qualification_pending integer;
  v_nc_final_ready integer;
  v_nc_completed integer;
  v_pending_initial integer;
  v_pending_final integer;
  v_confirmed_nc_duties integer;
  v_overdue_ready_planned integer;
  v_overdue_missing_route integer;
  v_commitment_conflicts integer;
  v_notifications_delta bigint;

  v_prev_active_coaches integer := -1;
  v_prev_open_elections integer := -1;
  v_prev_nc_planned integer := -1;
  v_prev_nc_qualification_pending integer := -1;
  v_prev_nc_final_ready integer := -1;
  v_last_snapshot jsonb := '{}'::jsonb;

  v_error text;
  v_error_detail text;
  v_error_hint text;
  v_error_context text;

  v_live_state_after jsonb;
  v_live_preserved boolean;
begin
  select to_jsonb(gs), gs.season_number, public.get_current_game_date_date()
  into v_original_state, v_original_season, v_start_date
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

  v_end_date:=coalesce(p_end_date, public.game_date_from_parts(1,9,1));

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
      'reason','phase_1_harness_capped_at_september_1',
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

  begin
    v_day:=v_start_date;

    while v_day<=v_end_date loop
      -- Trigger-free clock move contained by this savepoint/subtransaction.
      perform set_config('session_replication_role','replica',true);
      update public.game_state
      set season_number=1,
          month_number=extract(month from v_day)::integer,
          day_number=extract(day from v_day)::integer,
          hour_number=12,
          minute_number=0
      where id=true;
      perform set_config('session_replication_role','origin',true);

      -- Exercise the same production entry points used by the 15-minute jobs.
      v_nc_runtime:=public.process_national_championship_runtime_v2();
      v_na_runtime:=public.process_national_association_nations_runtime_v4();

      select count(*)::integer into v_active_associations
      from public.national_associations
      where status='active';

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

      select
        count(*) filter (where status='planned')::integer,
        count(*) filter (where status='qualification_pending')::integer,
        count(*) filter (where status='final_ready')::integer,
        count(*) filter (where status='completed')::integer
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

      -- Any route-ready edition left planned after its freeze is a migration/runtime defect.
      select count(*)::integer into v_overdue_ready_planned
      from public.national_championship_editions ed
      where ed.season_number=1
        and ed.discipline='road'
        and ed.status='planned'
        and ed.schedule_draw_status='locked'
        and ed.climate_status='ready'
        and ed.route_status='ready'
        and ed.ranking_snapshot_date<=v_day;

      -- Missing-route editions are expected to remain skipped.
      select count(*)::integer into v_overdue_missing_route
      from public.national_championship_editions ed
      where ed.season_number=1
        and ed.discipline='road'
        and ed.status='planned'
        and coalesce(ed.route_status,'')<>'ready'
        and ed.ranking_snapshot_date<=v_day;

      -- A rider must never hold overlapping confirmed Championship and National Team duty.
      select count(*)::integer into v_commitment_conflicts
      from (
        select distinct cd.rider_id, cd.id as championship_duty_id, td.id as team_duty_id
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

      select count(*)-v_baseline_notifications
      into v_notifications_delta
      from public.user_notifications;

      v_last_snapshot:=jsonb_build_object(
        'game_date',v_day,
        'active_associations',v_active_associations,
        'active_coaches',v_active_coaches,
        'open_elections',v_open_elections,
        'completed_elections',v_completed_elections,
        'national_championships',jsonb_build_object(
          'planned',v_nc_planned,
          'qualification_pending',v_nc_qualification_pending,
          'final_ready',v_nc_final_ready,
          'completed',v_nc_completed,
          'pending_initial_decisions',v_pending_initial,
          'pending_final_decisions',v_pending_final,
          'confirmed_duties',v_confirmed_nc_duties,
          'overdue_route_ready_planned',v_overdue_ready_planned,
          'overdue_missing_route_skipped',v_overdue_missing_route
        ),
        'overlapping_national_commitments',v_commitment_conflicts,
        'notifications_generated',v_notifications_delta,
        'runtime',jsonb_build_object(
          'championship_rankings_frozen',coalesce((v_nc_runtime->>'rankings_frozen')::integer,0),
          'championship_auto_approved',coalesce((v_nc_runtime->>'pending_entries_auto_approved')::integer,0),
          'championship_final_auto_approved',coalesce((v_nc_runtime->>'national_final_pending_auto_approved')::integer,0),
          'association_elections',v_na_runtime->'coach_elections'
        )
      );

      -- Keep the report readable: first/last day plus every day where a tracked
      -- lifecycle count changes or the runtime actually freezes a ranking.
      if v_day=v_start_date
         or v_day=v_end_date
         or v_active_coaches<>v_prev_active_coaches
         or v_open_elections<>v_prev_open_elections
         or v_nc_planned<>v_prev_nc_planned
         or v_nc_qualification_pending<>v_prev_nc_qualification_pending
         or v_nc_final_ready<>v_prev_nc_final_ready
         or coalesce((v_nc_runtime->>'rankings_frozen')::integer,0)>0
         or v_overdue_ready_planned>0
         or v_commitment_conflicts>0
      then
        v_daily:=v_daily||jsonb_build_array(v_last_snapshot);
      end if;

      v_prev_active_coaches:=v_active_coaches;
      v_prev_open_elections:=v_open_elections;
      v_prev_nc_planned:=v_nc_planned;
      v_prev_nc_qualification_pending:=v_nc_qualification_pending;
      v_prev_nc_final_ready:=v_nc_final_ready;

      v_day:=v_day+1;
    end loop;

    v_nc_overview:=public.national_championship_lifecycle_overview_v1();
    v_nations_health:=public.check_nations_operations_health_v1();
    v_assoc_integrity:=public.check_national_association_integrity_v1();

    v_report:=jsonb_build_object(
      'status',
        case
          when v_overdue_ready_planned=0
           and v_commitment_conflicts=0
          then 'pass'
          else 'fail'
        end,
      'mode','rollback_midseason_migration_rehearsal',
      'source_season',1,
      'start_game_date',v_start_date,
      'end_game_date',v_end_date,
      'days_simulated',(v_end_date-v_start_date)+1,
      'checkpoints',v_daily,
      'final_shadow_state',v_last_snapshot,
      'national_championship_lifecycle',v_nc_overview,
      'nations_operations_health',v_nations_health,
      'national_association_integrity',v_assoc_integrity
    );

    -- Deliberately roll back every simulated write while preserving v_report.
    raise exception using
      errcode='ZMS01',
      message='MIDSEASON_NATIONAL_MIGRATION_SHADOW_ROLLBACK';

  exception
    when sqlstate 'ZMS01' then
      null;
    when others then
      v_error:=sqlerrm;
      get stacked diagnostics
        v_error_detail=PG_EXCEPTION_DETAIL,
        v_error_hint=PG_EXCEPTION_HINT,
        v_error_context=PG_EXCEPTION_CONTEXT;

      v_report:=jsonb_build_object(
        'status','fail',
        'mode','rollback_midseason_migration_rehearsal',
        'source_season',1,
        'start_game_date',v_start_date,
        'end_game_date',v_end_date,
        'phase','daily_runtime',
        'failed_on_or_before_game_date',v_day,
        'error',v_error,
        'error_detail',v_error_detail,
        'error_hint',v_error_hint,
        'error_context',v_error_context,
        'checkpoints',v_daily
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
    'live_game_state_after',v_live_state_after,
    'baseline_counts',jsonb_build_object(
      'associations',v_baseline_associations,
      'nations_editions',v_baseline_editions,
      'championship_editions',v_baseline_nc_editions,
      'coach_elections',v_baseline_elections,
      'coach_terms',v_baseline_coach_terms,
      'championship_entries',v_baseline_nc_entries,
      'championship_duties',v_baseline_nc_duties,
      'user_notifications',v_baseline_notifications
    )
  );
end;
$function$;

revoke all on function private.run_midseason_national_migration_shadow_v1(date) from public;
