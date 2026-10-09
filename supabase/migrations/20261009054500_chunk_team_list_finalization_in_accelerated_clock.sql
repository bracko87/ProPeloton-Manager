-- Keep the accelerated clock's hourly work bounded to one due team list.
-- The next game-hour pass selects the next unfinished race.
-- Preserve full-race captain/number finalization for that race.
CREATE OR REPLACE FUNCTION public.process_due_team_list_announcements_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current record;
  v_today_ordinal integer;

  v_closed_application_rows integer := 0;

  v_race record;
  v_review_result jsonb;
  v_ai_fill_result jsonb;
  v_trim_result jsonb;
  v_captain_finalization_result jsonb;

  v_accepted_after_review integer := 0;
  v_ai_after_review integer := 0;

  v_accepted_after integer := 0;
  v_ai_after integer := 0;

  v_checked_races integer := 0;
  v_reviewed_races integer := 0;
  v_ai_fill_races integer := 0;
  v_trimmed_races integer := 0;
  v_finalized_races integer := 0;
  v_finalization_failures integer := 0;

  v_results jsonb := '[]'::jsonb;
begin
  select *
  into v_current
  from public.get_current_game_date_parts()
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'current_game_date_not_found'
    );
  end if;

  v_today_ordinal := public.game_date_ordinal_v1(
    v_current.season_number,
    v_current.month_number,
    v_current.day_number
  );

  /*
   * Step 1:
   * Close applications for all scheduled races whose team-list
   * announcement date has been reached.
   */
  update public.race_entry_rules rules
  set
    applications_status = 'closed',
    updated_at = now()
  from public.races race
  where race.id = rules.race_id
    and race.status = 'scheduled'

    /*
     * Never regress lifecycle states such as race_active or race_finished
     * back to closed merely because races.status is still legacy-scheduled.
     */
    and lower(coalesce(rules.applications_status, 'not_open')) in (
      'not_open',
      'open'
    )

    /*
     * Team-list finalization is only valid before the race starts.
     */
    and public.game_date_ordinal_v1(
      extract(year from race.start_date)::integer - 1999,
      extract(month from race.start_date)::integer,
      extract(day from race.start_date)::integer
    ) > v_today_ordinal

    and rules.team_list_announcement_season_number is not null
    and rules.team_list_announcement_month_number is not null
    and rules.team_list_announcement_day_number is not null
    and public.game_date_ordinal_v1(
      rules.team_list_announcement_season_number,
      rules.team_list_announcement_month_number,
      rules.team_list_announcement_day_number
    ) <= v_today_ordinal;

  get diagnostics v_closed_application_rows = row_count;

  /*
   * Step 2:
   * Process due races that have not yet completed the official team-list
   * captain/number finalization.
   */
  for v_race in
    select
      race.id as race_id,
      race.name as race_name,
      rules.applications_status,
      rules.min_teams,
      rules.target_teams,
      rules.max_teams,

      count(entry.id) filter (
        where entry.status = 'accepted'
      )::integer as accepted_before,

      count(entry.id) filter (
        where entry.status = 'accepted'
          and coalesce(entry.is_ai_filler, false) = true
      )::integer as ai_before,

      count(entry.id) filter (
        where entry.entry_source = 'user'
          and entry.status in (
            'applied',
            'submitted',
            'pending',
            'application_submitted'
          )
      )::integer as unresolved_user_applications_before

    from public.races race

    join public.race_entry_rules rules
      on rules.race_id = race.id

    left join public.race_team_entries entry
      on entry.race_id = race.id

    where race.status = 'scheduled'

      /*
       * Only the actual post-announcement/pre-race state is eligible.
       * This excludes race_active and race_finished even when the legacy
       * races.status column still says scheduled.
       */
      and lower(coalesce(rules.applications_status, '')) = 'closed'

      and public.game_date_ordinal_v1(
        extract(year from race.start_date)::integer - 1999,
        extract(month from race.start_date)::integer,
        extract(day from race.start_date)::integer
      ) > v_today_ordinal

      and rules.team_list_announcement_season_number is not null
      and rules.team_list_announcement_month_number is not null
      and rules.team_list_announcement_day_number is not null

      and public.game_date_ordinal_v1(
        rules.team_list_announcement_season_number,
        rules.team_list_announcement_month_number,
        rules.team_list_announcement_day_number
      ) <= v_today_ordinal

      and lower(
        coalesce(
          race.metadata ->> 'team_list_announcement_finalized',
          'false'
        )
      ) not in ('true', '1', 'yes')

    group by
      race.id,
      race.name,
      rules.applications_status,
      rules.min_teams,
      rules.target_teams,
      rules.max_teams

    order by
      race.start_date,
      race.name
    limit 1
  loop
    v_checked_races := v_checked_races + 1;

    /*
     * Step 3:
     * Review unresolved human/user applications before AI fill.
     */
    if coalesce(v_race.unresolved_user_applications_before, 0) > 0 then
      select public.review_race_applications_v1(
        v_race.race_id,
        true
      )
      into v_review_result;

      v_reviewed_races := v_reviewed_races + 1;
    else
      v_review_result := jsonb_build_object(
        'success', true,
        'skipped', true,
        'reason', 'no_unresolved_user_applications'
      );
    end if;

    /*
     * Step 4:
     * Recount after human review.
     */
    select
      count(entry.id) filter (
        where entry.status = 'accepted'
      )::integer,

      count(entry.id) filter (
        where entry.status = 'accepted'
          and coalesce(entry.is_ai_filler, false) = true
      )::integer

    into
      v_accepted_after_review,
      v_ai_after_review

    from public.race_team_entries entry
    where entry.race_id = v_race.race_id;

    /*
     * Step 5:
     * Fill AI only when still below target.
     *
     * fill_race_ai_teams_v1 assigns the AI riders before returning.
     */
    if v_accepted_after_review < coalesce(
      v_race.target_teams,
      v_race.max_teams,
      v_race.min_teams,
      0
    ) then
      select public.fill_race_ai_teams_v1(
        v_race.race_id
      )
      into v_ai_fill_result;

      v_ai_fill_races := v_ai_fill_races + 1;
    else
      /*
       * Even when no new team is required, make sure existing accepted AI
       * teams have their complete rider reservations before finalization.
       */
      select public.assign_ai_riders_to_race_v1(
        v_race.race_id
      )
      into v_ai_fill_result;
    end if;

    /*
     * Step 6:
     * Remove surplus AI filler teams after human decisions.
     */
    select public.trim_ai_filler_teams_to_target_v1(
      v_race.race_id
    )
    into v_trim_result;

    if coalesce(
      (v_trim_result ->> 'deleted_surplus_ai_entries')::integer,
      0
    ) > 0 then
      v_trimmed_races := v_trimmed_races + 1;
    end if;

    /*
     * Step 7:
     * Final recount after review, AI fill, rider assignment and trim.
     */
    select
      count(entry.id) filter (
        where entry.status = 'accepted'
      )::integer,

      count(entry.id) filter (
        where entry.status = 'accepted'
          and coalesce(entry.is_ai_filler, false) = true
      )::integer

    into
      v_accepted_after,
      v_ai_after

    from public.race_team_entries entry
    where entry.race_id = v_race.race_id;

    /*
     * Step 8 — NEW:
     * Final official captain and number assignment.
     *
     * This happens only after the complete team list and all rider rows are
     * ready. The finalizer verifies every accepted team and freezes the
     * result in races.metadata.
     */
    begin
      select public.finalize_race_team_list_announcement_v1(
        v_race.race_id
      )
      into v_captain_finalization_result;

      v_finalized_races := v_finalized_races + 1;

    exception
      when others then
        v_finalization_failures := v_finalization_failures + 1;

        v_captain_finalization_result := jsonb_build_object(
          'success', false,
          'race_id', v_race.race_id,
          'error', sqlerrm,
          'will_retry_on_next_scheduler_run', true
        );
    end;

    v_results :=
      v_results
      || jsonb_build_array(
        jsonb_build_object(
          'race_id', v_race.race_id,
          'race_name', v_race.race_name,
          'applications_status_after_close',
            v_race.applications_status,
          'min_teams', v_race.min_teams,
          'target_teams', v_race.target_teams,
          'max_teams', v_race.max_teams,

          'accepted_before', v_race.accepted_before,
          'ai_before', v_race.ai_before,
          'unresolved_user_applications_before',
            v_race.unresolved_user_applications_before,

          'review_result', v_review_result,
          'accepted_after_review', v_accepted_after_review,
          'ai_after_review', v_ai_after_review,

          'ai_fill_result', v_ai_fill_result,
          'trim_result', v_trim_result,

          'accepted_after', v_accepted_after,
          'ai_after', v_ai_after,

          'captain_finalization_result',
            v_captain_finalization_result
        )
      );
  end loop;

  return jsonb_build_object(
    'success', v_finalization_failures = 0,

    'current_game_date', public.game_date_display_v1(
      v_current.season_number,
      v_current.month_number,
      v_current.day_number
    ),

    'closed_application_rows', v_closed_application_rows,
    'checked_races', v_checked_races,
    'reviewed_races', v_reviewed_races,
    'ai_fill_races', v_ai_fill_races,
    'trimmed_races', v_trimmed_races,
    'finalized_races', v_finalized_races,
    'finalization_failures', v_finalization_failures,

    'results', v_results
  );
end;
$function$;

-- The one-race unit may require more than the default 120-second limit.
-- Scope the longer limit to the clock cron command, leaving global settings intact.
select cron.schedule(
  'run-daily-tick-every-minute',
  '* * * * *',
  $$set statement_timeout = '300s'; select public.run_daily_tick_if_needed();$$
);
