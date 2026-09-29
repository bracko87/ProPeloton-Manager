-- Restore selected public UI/reporting views to security definer behavior.
-- Reason: switching these views to security_invoker=true caused public/global standings,
-- statistics, rankings and profile pages to be filtered by the caller's RLS context.
-- RLS on base tables remains enabled; this migration only restores view execution mode.

begin;

do $$
declare
  v text;
begin
  foreach v in array array[
    'ai_competition_filler_club_pool_v1',
    'club_profile_popup_view',
    'club_profile_roster_view',
    'club_roster',
    'international_points_awards_ledger_v1',
    'race_engine_function_audit_v1',
    'race_engine_missing_participant_team_rows_v1',
    'race_engine_paid_orphan_prize_award_audit_v1',
    'race_engine_paid_orphan_prize_award_detail_v1',
    'race_engine_paid_orphan_prize_finance_transactions_v1',
    'race_engine_paid_orphan_prize_reversal_plan_rows_v1',
    'race_engine_paid_orphan_prize_reversal_plan_summary_v1',
    'race_engine_replay_density_audit_v1',
    'race_engine_replay_function_audit_v1',
    'race_engine_replay_storage_by_stage_v1',
    'race_engine_stage_output_integrity_v1',
    'race_engine_stage_processing_function_inventory_v1',
    'race_engine_stage_sporting_integrity_v1',
    'race_participant_riders_v1',
    'race_participant_teams_v1',
    'race_stage_weather_cancellation_candidates_v1',
    'race_stage_weather_decision_status_v1',
    'race_team_mandatory_jersey_status_v1',
    'rider_international_points_all_time_v1',
    'rider_international_points_by_season_v1',
    'rider_season_achievements_by_season_v1',
    'rider_season_achievements_ledger_v1',
    'rider_season_overview_v1',
    'rider_stage_podiums_by_season_v1',
    'rider_statistics_page_international_v1',
    'rider_statistics_page_view',
    'rider_statistics_view',
    'team_history_summary_view',
    'team_international_points_all_time_v1',
    'team_international_points_by_season_v1',
    'team_ranking_ordered_standings_by_season_v1',
    'team_ranking_tiebreakers_by_season_v1',
    'team_rankings_view',
    'team_titles_summary_view',
    'v_rider_latest_weekly_change_ui',
    'v_rider_latest_weekly_visible_deltas_ui',
    'v_rider_modal_skill_ui',
    'v_rider_skill_card_deltas'
  ]
  loop
    execute format('alter view public.%I set (security_invoker = false)', v);
  end loop;
end $$;

commit;
