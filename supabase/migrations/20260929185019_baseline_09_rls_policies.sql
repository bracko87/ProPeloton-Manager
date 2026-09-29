alter table public.countries enable row level security;
alter table public.month_definitions enable row level security;
alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.club_settings enable row level security;
alter table public.club_infrastructure enable row level security;
alter table public.club_finance_summary enable row level security;
alter table public.game_state enable row level security;
alter table public.game_clock_config enable row level security;
alter table public.notification_types enable row level security;
alter table public.notifications enable row level security;
alter table public.user_notifications enable row level security;
alter table public.first_names_master enable row level security;
alter table public.last_names_master enable row level security;
alter table public.inbox_conversations enable row level security;
alter table public.inbox_conversation_participants enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.team_kits enable row level security;
alter table public.notification_preference_groups enable row level security;
alter table public.club_referrals enable row level security;
alter table finance.accounts enable row level security;
alter table finance.transactions enable row level security;
alter table finance.entries enable row level security;
alter table finance.account_balances enable row level security;
alter table public.economy_config enable row level security;
alter table public.club_sponsors enable row level security;
alter table public.user_wallets enable row level security;
alter table public.user_coin_ledger enable row level security;
alter table public.game_daily_tick_log enable row level security;
alter table public.coin_packages enable row level security;
alter table public.riders enable row level security;
alter table public.club_riders enable row level security;
alter table public.rider_daily_activity enable row level security;
alter table public.rider_contracts enable row level security;
alter table public.rider_contract_negotiations enable row level security;
alter table public.rider_payroll_state enable row level security;
alter table public.game_system_state enable row level security;
alter table public.season_reset_runs enable row level security;
alter table public.ai_team_name_pool enable row level security;
alter table public.season_reset_guard enable row level security;
alter table public.club_movement_history enable row level security;
alter table public.competition_rebalance_log enable row level security;
alter table public.clubs_season_test_backup enable row level security;
alter table public.inbox_season_start_guard enable row level security;
alter table public.team_ranking_past_winners enable row level security;
alter table public.bug_reports enable row level security;
alter table public.player_reports enable row level security;
alter table public.club_season_reward_grants enable row level security;
alter table public.season_reward_guard enable row level security;
alter table public.season_reward_runs enable row level security;
alter table public.team_ranking_season_snapshots enable row level security;
alter table public.club_infrastructure_jobs enable row level security;
alter table public.country_weather_weekly_normals enable row level security;
alter table public.sponsor_companies enable row level security;
alter table public.club_sponsor_offers enable row level security;
alter table public.club_sponsor_objectives enable row level security;
alter table public.rider_status_notification_log enable row level security;
alter table public.training_camp_catalog enable row level security;
alter table public.training_camp_bookings enable row level security;
alter table public.training_camp_participants enable row level security;
alter table public.training_camp_daily_reports enable row level security;
alter table public.rider_health_cases enable row level security;
alter table public.rider_regular_training_plans enable row level security;
alter table public.club_regular_training_defaults enable row level security;
alter table public.rider_attribute_progress_bank enable row level security;
alter table public.weekly_rider_development_log enable row level security;
alter table public.training_camp_notification_log enable row level security;
alter table public.club_staff enable row level security;
alter table public.staff_candidates enable row level security;
alter table public.staff_payroll_runs enable row level security;
alter table public.rider_weekly_skill_changes enable row level security;
alter table public.rider_weekly_development_summary enable row level security;
alter table public.skill_tier_target_bands enable row level security;
alter table public.skill_role_shape enable row level security;
alter table public.staff_course_enrollments enable row level security;
alter table public.rider_weekly_development_summaries enable row level security;
alter table public.staff_courses enable row level security;
alter table public.team_policy_option_catalog enable row level security;
alter table public.club_team_policies enable row level security;
alter table public.team_trip_cost_forecasts enable row level security;
alter table public.rider_transfer_listings enable row level security;
alter table public.rider_transfer_offers enable row level security;
alter table public.rider_free_agents enable row level security;
alter table public.rider_free_agent_negotiations enable row level security;
alter table public.country_market_groups enable row level security;
alter table public.country_market_group_members enable row level security;
alter table public.sponsor_company_eligibility enable row level security;
alter table public.rider_transfer_negotiations enable row level security;
alter table public.rider_transfer_events enable row level security;
alter table public.rider_free_agent_events enable row level security;
alter table public.market_ai_config enable row level security;
alter table public.ai_market_club_state enable row level security;
alter table public.generated_rider_first_names enable row level security;
alter table public.generated_rider_last_names enable row level security;
alter table public.free_agent_daily_maintenance_log enable row level security;
alter table public.game_job_runtime_guard enable row level security;
alter table public.transfer_value_audit enable row level security;
alter table public.rider_scout_reports enable row level security;
alter table public.v_offer_review enable row level security;
alter table public.v_contract_review enable row level security;
alter table public.rider_scout_tasks enable row level security;
alter table public.staff_scout_daily_usage enable row level security;
alter table public.staff_market_daily_runs enable row level security;
alter table public.retirement_decisions enable row level security;
alter table public.training_camp_staff_assignments enable row level security;
alter table public.rider_market_daily_runs enable row level security;
alter table public.training_camp_day_training_plans enable row level security;
alter table public.staff_assignment_load enable row level security;
alter table public.staff_role_catalog enable row level security;
alter table public.staff_role_definitions enable row level security;
alter table public.infrastructure_facility_upgrade_config enable row level security;
alter table public.infrastructure_asset_config enable row level security;
alter table public.club_infrastructure_asset_holdings enable row level security;
alter table public.club_team_cars enable row level security;
alter table public.email_outbox enable row level security;
alter table public.club_team_buses enable row level security;
alter table public.club_infrastructure_asset_repair_jobs enable row level security;
alter table public.club_equipment_vans enable row level security;
alter table public.club_mobile_workshops enable row level security;
alter table public.club_medical_vans enable row level security;
alter table public.equipment_catalog enable row level security;
alter table public.club_equipment_inventory enable row level security;
alter table public.club_equipment_default_setup enable row level security;
alter table public.club_race_supplies enable row level security;
alter table public.club_equipment_maintenance_jobs enable row level security;
alter table public.equipment_bonus_allowed_keys enable row level security;
alter table public.equipment_bonus_category_weights enable row level security;
alter table public.club_equipment_setup_presets enable row level security;
alter table public.club_equipment_starter_seed_log enable row level security;
alter table public.club_technical_sponsor_benefits enable row level security;
alter table public.club_technical_sponsor_discount_ledger enable row level security;
alter table public.races enable row level security;
alter table public.race_stages enable row level security;
alter table public.race_stage_points enable row level security;
alter table public.race_rules_config enable row level security;
alter table public.race_stage_route_profiles enable row level security;
alter table public.race_stage_route_profile_jobs enable row level security;
alter table public.race_rule_sets enable row level security;
alter table public.race_participant_teams enable row level security;
alter table public.race_participant_riders enable row level security;
alter table public.race_stage_results enable row level security;
alter table public.race_stage_point_results enable row level security;
alter table public.race_classification_standings enable row level security;
alter table public.race_leader_snapshots enable row level security;
alter table public.race_category_rules enable row level security;
alter table public.race_entry_rules enable row level security;
alter table public.race_team_applications enable row level security;
alter table public.race_prize_bucket_rules enable row level security;
alter table public.race_prize_awards enable row level security;
alter table public.race_ranking_point_rules enable row level security;
alter table public.race_ranking_point_awards enable row level security;
alter table public.race_stage_report_events enable row level security;
alter table public.race_stage_profile_details enable row level security;
alter table public.club_race_commitment_scores enable row level security;
alter table public.race_commitment_score_events enable row level security;
alter table public.race_application_penalty_rules enable row level security;
alter table public.race_team_entries enable row level security;
alter table public.game_day_processor_runs enable row level security;
alter table public.race_rider_submission_deadline_events enable row level security;
alter table public.race_day_readiness_events enable row level security;
alter table public.game_time_clock_state enable row level security;
alter table public.hourly_game_processor_runs enable row level security;
alter table public.race_preparations enable row level security;
alter table public.race_preparation_riders enable row level security;
alter table public.race_preparation_staff enable row level security;
alter table public.race_preparation_assets enable row level security;
alter table public.race_preparation_supplies enable row level security;
alter table public.race_stage_plans enable row level security;
alter table public.race_stage_plan_riders enable row level security;
alter table public.race_stage_plan_assets enable row level security;
alter table public.race_stage_plan_supplies enable row level security;
alter table public.race_plan_effect_rules enable row level security;
alter table public.race_bonus_groups enable row level security;
alter table public.race_bonus_effect_map enable row level security;
alter table public.club_race_supply_units enable row level security;
alter table public.race_stage_supply_usage_events enable row level security;
alter table public.race_stage_simulation_runs enable row level security;
alter table public.race_stage_rider_states enable row level security;
alter table public.race_stage_team_states enable row level security;
alter table public.race_stage_incidents enable row level security;
alter table public.race_stage_replay_frames enable row level security;
alter table public.race_stage_automation_settings enable row level security;
alter table public.race_stage_automation_state enable row level security;
alter table public.race_stage_time_trial_rules enable row level security;
alter table public.ai_team_kit_previews enable row level security;
alter table public.rider_race_condition enable row level security;
alter table public.rider_race_development_events enable row level security;
alter table public.overview_squad_pulse_test_restore enable row level security;
alter table public.team_tier_balance_profiles enable row level security;
alter table public.starting_roster_role_profiles enable row level security;
alter table public.club_season_identities enable row level security;
alter table public.race_engine_stage_wear_applications enable row level security;
alter table public.race_engine_stage_interaction_events enable row level security;
alter table public.race_engine_stage_command_outcomes enable row level security;
alter table public.race_engine_stage_command_outcome_delta_applications enable row level security;
alter table public.race_engine_stage_incident_equipment_damage_applications enable row level security;
alter table public.user_team_inactivity_events enable row level security;
alter table public.game_email_queue enable row level security;
alter table public.race_engine_stage_postprocessor_skip_logs enable row level security;
alter table public.club_race_supplies_low_notification_state enable row level security;
alter table public.birthday_gift_audit enable row level security;
alter table public.user_tutorial_progress enable row level security;
alter table public.sponsor_bonus_objective_rules_v1 enable row level security;
alter table public.race_stage_weather_exposure_events enable row level security;
alter table public.rewarded_ad_settings enable row level security;
alter table public.user_rewarded_ad_events enable row level security;
alter table public.user_rewarded_ad_daily_progress enable row level security;
alter table public.user_rewarded_ad_coin_grants enable row level security;
alter table public.rewarded_ad_private_settings enable row level security;
alter table public.club_roster_country_rules enable row level security;
alter table public.club_restart_history enable row level security;
alter table public.club_restart_released_riders enable row level security;
alter table public.user_coin_low_warning_state enable row level security;
alter table public.game_job_locks enable row level security;
alter table public.system_job_rate_limits_v1 enable row level security;
alter table public.race_stage_replay_retention_rules_v1 enable row level security;
alter table public.race_engine_replay_density_target_rules_v1 enable row level security;
alter table public.race_engine_access_lockdown_log_v1 enable row level security;
alter table public.db_io_monitor_snapshots enable row level security;
alter table public.homepage_player_reviews enable row level security;
alter table public.race_engine_stage_output_resolution_v1 enable row level security;
alter table public.admin_function_definition_backup_v1 enable row level security;
alter table public.race_engine_paid_orphan_prize_reversal_audit_v1 enable row level security;
alter table public.race_engine_archived_orphan_prize_awards_v1 enable row level security;
alter table public.race_engine_orphan_prize_award_cleanup_audit_v1 enable row level security;
alter table public.race_engine_stage_processing_attempts_v1 enable row level security;
alter table public.rider_unsolicited_transfer_bids enable row level security;
alter table public.rider_daily_activity_archive_summary enable row level security;
alter table public.race_engine_scheduler_config enable row level security;
alter table public.race_engine_scheduler_tick_runs enable row level security;
alter table public.race_engine_function_registry_v1 enable row level security;
alter table public.race_engine_active_component_registry_v1 enable row level security;
alter table public.game_time_job_warnings_v1 enable row level security;
alter table public.game_daily_tick_backlog_v1 enable row level security;
alter table public.game_daily_tick_backlog_processor_runs_v1 enable row level security;
alter table public.weather_backend_patch_log_v1 enable row level security;
alter table public.cron_guard_run_log_v1 enable row level security;
alter table public.health_case_catalogue_v1 enable row level security;
alter table public.rider_health_case_context_v1 enable row level security;
alter table public.rider_health_condition_effect_runs_v1 enable row level security;
alter table public.race_stage_weather_test_override_backup_20260710 enable row level security;
alter table public.race_engine_phase3q_launch_cache_v1 enable row level security;
alter table public.race_engine_phase3q_pace_cache_v1 enable row level security;
alter table public.race_engine_phase3q_survival_cache_v1 enable row level security;
alter table public.race_engine_phase3r_pursuit_calibration_v1 enable row level security;
alter table public.race_engine_phase3s_dynamic_escape_cache_v1 enable row level security;
alter table public.race_engine_phase3s_dynamic_escape_hysteresis_cache_v1 enable row level security;
alter table public.race_engine_phase3t_escape_overlap_cache_v1 enable row level security;
alter table public.race_engine_phase3t_bridge_join_cache_v1 enable row level security;
alter table public.race_engine_phase3u_two_rider_chase_cache_v1 enable row level security;
alter table public.race_engine_phase3u_three_rider_breakaway_cache_v1 enable row level security;
alter table public.race_engine_phase3v_escape_topology_cache_v1 enable row level security;
alter table public.race_engine_phase3v_escape_rider_state_cache_v1 enable row level security;
alter table public.race_engine_phase3_cache_audit_v1 enable row level security;
alter table public.race_engine_phase3w_escape_overlay_cache_v1 enable row level security;
alter table public.race_engine_phase3x_effective_group_clock_cache_v1 enable row level security;
alter table public.race_engine_phase3y_canonical_live_state_cache_v1 enable row level security;
alter table public.race_engine_phase3z_gate_function_audit_v1 enable row level security;
alter table public.race_engine_phase3z_gate_relation_audit_v1 enable row level security;
alter table public.race_engine_phase3z_gate_stage_sample_v1 enable row level security;
alter table public.race_engine_phase3z_gate_definition_cache_v1 enable row level security;
alter table public.race_engine_phase3z_gate_group_context_cache_v1 enable row level security;
alter table public.race_engine_phase3z_gate_rider_context_cache_v1 enable row level security;
alter table public.race_engine_phase3z_gate_approach_context_cache_v1 enable row level security;
alter table public.race_engine_phase3z_gate_team_support_cache_v1 enable row level security;
alter table public.race_engine_phase3z_gate_battle_preview_cache_v1 enable row level security;
alter table public.race_engine_phase3z_gate_award_preview_cache_v1 enable row level security;
alter table public.race_engine_phase3z_team_captain_cache_v1 enable row level security;
alter table public.race_engine_phase3z_team_gate_plan_cache_v1 enable row level security;
alter table public.race_engine_phase3z_refined_gate_battle_preview_cache_v1 enable row level security;
alter table public.race_engine_phase3z_refined_gate_award_preview_cache_v1 enable row level security;
alter table public.race_engine_phase3aa_point_result_preview_cache_v1 enable row level security;
alter table public.race_engine_phase3aa_stage_result_preview_cache_v1 enable row level security;
alter table public.race_engine_phase3aa_writer_function_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_result_column_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_result_constraint_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_result_index_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_result_trigger_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_downstream_stage_dependency_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_side_effect_snapshot_v1 enable row level security;
alter table public.race_engine_phase3aa_paid_prize_snapshot_v1 enable row level security;
alter table public.race_engine_phase3aa_prize_payment_function_v1 enable row level security;
alter table public.race_engine_phase3aa_finance_relation_columns_v1 enable row level security;
alter table public.race_engine_phase3aa_target_prize_reversal_plan_v1 enable row level security;
alter table public.race_engine_phase3aa_target_prize_detail_snapshot_v1 enable row level security;
alter table public.race_engine_phase3aa_target_prize_audit_snapshot_v1 enable row level security;
alter table public.race_engine_phase3aa_target_prize_archive_snapshot_v1 enable row level security;
alter table public.race_engine_phase3aa_prize_reversal_function_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_prize_function_relation_refs_v1 enable row level security;
alter table public.race_engine_phase3aa_prize_reversal_relation_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_completed_prize_entitlement_v1 enable row level security;
alter table public.race_engine_phase3aa_completed_prize_transaction_v1 enable row level security;
alter table public.race_engine_phase3aa_completed_prize_entry_v1 enable row level security;
alter table public.race_engine_phase3aa_completed_prize_event_lock_v1 enable row level security;
alter table public.race_engine_phase3aa_completed_prize_function_contract_v1 enable row level security;
alter table public.race_engine_phase3aa_completed_prize_correction_plan_v1 enable row level security;
alter table public.race_engine_phase3aa_point_gate_semantic_map_v1 enable row level security;
alter table public.race_engine_phase3aa_point_result_semantic_map_v1 enable row level security;
alter table public.race_engine_phase3aa_base_result_correction_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_classification_snapshot_v1 enable row level security;
alter table public.race_engine_phase3aa_ranking_award_snapshot_v1 enable row level security;
alter table public.race_engine_phase3aa_downstream_relation_contract_v1 enable row level security;
alter table public.race_engine_phase3aa_downstream_function_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_downstream_function_relation_refs_v1 enable row level security;
alter table public.race_engine_phase3aa_ranking_refresh_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_prize_sporting_plan_run_v2 enable row level security;
alter table public.race_engine_phase3aa_prize_sporting_plan_row_v2 enable row level security;
alter table public.race_engine_phase3aa_prize_sporting_apply_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_prize_finance_execution_run_v1 enable row level security;
alter table public.race_engine_phase3aa_prize_finance_execution_row_v1 enable row level security;
alter table public.race_engine_phase3aa_report_reconciliation_plan_run_v1 enable row level security;
alter table public.race_engine_phase3aa_report_reconciliation_plan_row_v1 enable row level security;
alter table public.race_engine_phase3aa_report_reconciliation_apply_audit_v1 enable row level security;
alter table public.race_engine_phase3aa_report_reconciliation_apply_row_v1 enable row level security;
alter table public.race_engine_golden_stage_fixture_v1 enable row level security;
alter table public.race_engine_golden_stage_fixture_relation_v1 enable row level security;
alter table public.race_engine_stage_layer_ownership_v2 enable row level security;
alter table public.race_engine_stage_effect_ledger_v2 enable row level security;
alter table public.race_engine_stage_process_runs_v2 enable row level security;
alter table public.race_engine_stage_processor_install_audit_v2 enable row level security;
alter table public.race_engine_stage_processor_shadow_run_v2 enable row level security;
alter table public.race_engine_stage_processor_shadow_case_v2 enable row level security;
alter table public.race_engine_stage_effect_contract_v2 enable row level security;
alter table public.race_engine_stage_effect_shadow_claim_v2 enable row level security;
alter table public.race_engine_stage_effect_contract_install_audit_v2 enable row level security;
alter table public.race_engine_stage_effect_ledger_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_stage_effect_writer_adapter_manifest_v2 enable row level security;
alter table public.race_engine_stage_trigger_consolidation_plan_v2 enable row level security;
alter table public.race_engine_stage_effect_adapter_manifest_install_audit_v2 enable row level security;
alter table public.race_engine_stage_ranking_adapter_test_run_v2 enable row level security;
alter table public.race_engine_stage_ranking_adapter_test_case_v2 enable row level security;
alter table public.race_engine_stage_ranking_adapter_config_v2 enable row level security;
alter table public.race_engine_stage_ranking_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_stage_prize_adapter_test_run_v2 enable row level security;
alter table public.race_engine_stage_prize_adapter_test_case_v2 enable row level security;
alter table public.race_engine_stage_prize_adapter_config_v2 enable row level security;
alter table public.race_engine_stage_prize_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_stage_prize_payment_adapter_config_v2 enable row level security;
alter table public.race_engine_stage_prize_payment_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_stage_development_adapter_config_v2 enable row level security;
alter table public.race_engine_stage_development_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_stage_fatigue_adapter_config_v2 enable row level security;
alter table public.race_engine_stage_fatigue_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_stage_weather_exposure_adapter_config_v2 enable row level security;
alter table public.race_engine_stage_weather_exposure_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_phase3aa_fixture_durability_repair_audit_v1 enable row level security;
alter table public.race_engine_stage_daily_activity_adapter_split_progress_v2 enable row level security;
alter table public.race_engine_stage_daily_activity_adapter_config_v2 enable row level security;
alter table public.race_engine_stage_daily_activity_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_weather_closeout_adapter_split_progress_v2 enable row level security;
alter table public.race_engine_weather_closeout_adapter_config_v2 enable row level security;
alter table public.race_engine_weather_closeout_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_sponsor_objective_adapter_split_progress_v2 enable row level security;
alter table public.race_engine_sponsor_objective_adapter_config_v2 enable row level security;
alter table public.race_engine_sponsor_objective_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_stage_closeout_adapter_split_progress_v3 enable row level security;
alter table public.race_engine_stage_closeout_adapter_config_v3 enable row level security;
alter table public.race_engine_stage_closeout_adapter_install_audit_v3 enable row level security;
alter table public.race_engine_atomic_stage_processor_split_progress_v2 enable row level security;
alter table public.race_engine_atomic_stage_processor_config_v2 enable row level security;
alter table public.race_engine_stage_immutable_state_v2 enable row level security;
alter table public.race_engine_atomic_stage_processor_foundation_install_audit_v2 enable row level security;
alter table public.race_engine_atomic_claim_split_progress_v2 enable row level security;
alter table public.race_engine_atomic_claim_contract_install_audit_v2 enable row level security;
alter table public.race_engine_simulation_run_claim_split_progress_v2 enable row level security;
alter table public.race_engine_simulation_run_claim_contract_install_audit_v2 enable row level security;
alter table public.race_engine_process_run_recovery_split_progress_v2 enable row level security;
alter table public.race_engine_process_run_recovery_config_v2 enable row level security;
alter table public.race_engine_stage_process_claim_v2 enable row level security;
alter table public.race_engine_process_run_recovery_contract_install_audit_v2 enable row level security;
alter table public.race_engine_atomic_orchestrator_dry_run_progress_v2 enable row level security;
alter table public.race_engine_atomic_orchestrator_dry_run_config_v2 enable row level security;
alter table public.race_engine_atomic_orchestrator_dry_run_install_audit_v2 enable row level security;
alter table public.race_engine_claim_history_and_production_claim_progress_v2 enable row level security;
alter table public.race_engine_stage_process_claim_history_v2 enable row level security;
alter table public.race_engine_production_claim_commit_config_v2 enable row level security;
alter table public.race_engine_claim_history_and_production_claim_install_audit_v2 enable row level security;
alter table public.race_engine_runner_handoff_progress_v2 enable row level security;
alter table public.race_engine_runner_handoff_config_v2 enable row level security;
alter table public.race_engine_stage_runner_handoff_v2 enable row level security;
alter table public.race_engine_stage_runner_handoff_history_v2 enable row level security;
alter table public.race_engine_runner_handoff_install_audit_v2 enable row level security;
alter table public.race_engine_effect_immutable_config_v2 enable row level security;
alter table public.race_engine_stage_effect_history_v2 enable row level security;
alter table public.race_engine_effect_immutable_install_audit_v2 enable row level security;
alter table public.race_engine_effect_immutable_patch_audit_v2 enable row level security;
alter table public.race_engine_effect_immutable_final_audit_v2 enable row level security;
alter table public.admin_rider_skill_ui_simulation_backup_v1 enable row level security;
alter table public.race_engine_effect_adapter_registry_v2 enable row level security;
alter table public.race_engine_effect_adapter_execution_config_v2 enable row level security;
alter table public.race_engine_effect_adapter_execution_state_v2 enable row level security;
alter table public.race_engine_effect_adapter_registry_install_audit_v2 enable row level security;
alter table public.race_engine_non_destructive_effect_adapter_config_v2 enable row level security;
alter table public.race_engine_non_destructive_effect_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_non_destructive_source_alignment_audit_v2 enable row level security;
alter table public.race_engine_trigger_owned_effect_contract_v2 enable row level security;
alter table public.race_engine_trigger_owned_effect_contract_install_audit_v2 enable row level security;
alter table public.race_engine_daily_activity_ordered_adapter_config_v2 enable row level security;
alter table public.race_engine_daily_activity_ordered_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_fixture_normalization_install_audit_v2 enable row level security;
alter table public.race_engine_weather_closeout_ordered_adapter_config_v2 enable row level security;
alter table public.race_engine_weather_closeout_ordered_adapter_install_audit_v2 enable row level security;
alter table public.race_engine_high_risk_writer_contract_v2 enable row level security;
alter table public.race_engine_high_risk_writer_contract_install_audit_v2 enable row level security;
alter table public.automation_forward_activation_v1 enable row level security;
alter table public.transfer_market_stock_policy_v1 enable row level security;
alter table public.race_engine_incident_linkage_known_source_evidence_contract_v1 enable row level security;
alter table public.club_regular_training_automation enable row level security;
alter table public.rider_regular_training_management enable row level security;
alter table public.rider_regular_training_daily_plans enable row level security;
alter table public.race_preparation_stage_plan_automation enable row level security;
alter table public.race_stage_plan_management enable row level security;
alter table public.race_stage_plan_generation_log enable row level security;
alter table public.race_engine_incident_official_activation_contract_v1 enable row level security;
alter table public.race_engine_incident_official_activation_install_audit_v1 enable row level security;
alter table public.race_engine_incident_official_plan_rows_v1 enable row level security;
alter table public.race_engine_group_incident_v1 enable row level security;
alter table public.race_engine_group_incident_members_v1 enable row level security;
alter table public.race_engine_incident_health_mapping_v1 enable row level security;
alter table public.race_engine_incident_gap_resolution_contract_v1 enable row level security;
alter table public.race_engine_incident_weather_probability_rule_v1 enable row level security;
alter table public.race_engine_incident_equipment_condition_rule_v1 enable row level security;
alter table public.race_engine_group_identity_selection_rule_v1 enable row level security;
alter table public.race_engine_incident_gap_resolution_install_audit_v1 enable row level security;
alter table public.race_stage_plan_automation_stage_events enable row level security;
alter table public.cycling_news_sources enable row level security;
alter table public.cycling_world_news enable row level security;
alter table public.race_engine_defect_closure_registry_v1 enable row level security;
alter table public.race_engine_runtime_control_v1 enable row level security;
alter table public.race_stage_authoritative_runs enable row level security;
alter table public.race_stage_simulation_events enable row level security;
alter table public.premium_plans enable row level security;
alter table public.user_premium_subscriptions enable row level security;
alter table public.premium_invoice_payments enable row level security;
alter table public.premium_payment_failures enable row level security;
alter table public.developing_team_service_config enable row level security;
alter table public.developing_team_season_access enable row level security;
alter table public.rider_skill_weekly_snapshots enable row level security;
alter table public.rider_training_accident_decisions_v1 enable row level security;
alter table public.equipment_setup_slot_unlocks enable row level security;
alter table public.equipment_premium_preferences enable row level security;
alter table public.equipment_auto_restock_rules enable row level security;
alter table public.infrastructure_asset_slot_unlocks enable row level security;
alter table public.race_replay_coin_unlocks enable row level security;
alter table public.transfer_saved_searches enable row level security;
alter table public.transfer_shortlist enable row level security;
alter table public.transfer_market_alerts enable row level security;
alter table public.transfer_shortlist_daily_additions enable row level security;
alter table public.club_customization_usage enable row level security;
alter table public.universal_race_integration_test_settings enable row level security;
alter table public.universal_race_integration_test_runs enable row level security;
alter table public.universal_race_integration_test_stage_state enable row level security;
alter table public.staff_advisory_config enable row level security;
alter table public.staff_advisory_access enable row level security;
alter table public.staff_advisory_purchases enable row level security;
alter table public.staff_advisory_reports enable row level security;
alter table public.staff_advisory_event_state enable row level security;
alter table public.staff_advisory_medical_case_state enable row level security;
alter table public.season_transition_control_v1 enable row level security;
alter table public.season_transition_runs_v1 enable row level security;
alter table public.season_transition_timeline_history_v1 enable row level security;
alter table public.competition_transition_movements_v1 enable row level security;
alter table public.season_transition_component_readiness_v1 enable row level security;
alter table public.rider_contract_transition_audit_v1 enable row level security;
alter table public.race_team_stage_disqualifications enable row level security;
alter table public.staff_contract_transition_audit_v1 enable row level security;
alter table public.ai_roster_transition_audit_v1 enable row level security;
alter table public.race_engine_stage_supply_applications enable row level security;
alter table public.inactive_club_transition_audit_v1 enable row level security;
alter table public.sponsor_transition_audit_v1 enable row level security;
alter table public.season_transition_protected_tables_v1 enable row level security;
alter table public.staff_advisory_notification_mutes enable row level security;
alter table public.staff_advisory_notification_category_preferences enable row level security;
alter table public.competition_hourly_ai_fill_audit_v1 enable row level security;
alter table public.competition_transition_movement_correction_archive_v1 enable row level security;
alter table public.club_season_reward_grant_correction_archive_v1 enable row level security;
alter table public.season_transition_engine_runs_v2 enable row level security;
alter table public.season_transition_engine_events_v2 enable row level security;
alter table public.season_transition_lab_checkpoints_v1 enable row level security;
alter table public.season_transition_lab_clone_quarantine_v1 enable row level security;
alter table public.game_world_reset_runs enable row level security;
alter table public.game_world_reset_checkpoints enable row level security;
alter table public.game_world_reset_s1_competition_baseline_v1 enable row level security;
alter table public.race_timeline_rollback_audit_v1 enable row level security;
alter table public.referral_activity_days enable row level security;
alter table public.travel_country_geography_v1 enable row level security;
alter table public.race_engine_scenario_runs enable row level security;
alter table public.race_stage_calculation_quarantine_v1 enable row level security;
alter table public.rider_fatigue_reconciliation_audit_v1 enable row level security;
alter table public.app_admins enable row level security;
alter table public.site_analytics_daily_visitors enable row level security;
alter table public.site_analytics_daily_sessions enable row level security;
alter table public.site_analytics_daily_pages enable row level security;
alter table public.bug_report_admin_reads enable row level security;
alter table public.bug_report_notes enable row level security;
alter table public.contact_messages enable row level security;
alter table public.contact_message_admin_reads enable row level security;
alter table public.race_operations_config_v1 enable row level security;
alter table public.race_operations_stage_status_v1 enable row level security;
alter table public.race_operations_incidents_v1 enable row level security;
alter table public.premium_manager_templates_v1 enable row level security;
alter table public.premium_manager_automation_rules_v1 enable row level security;
alter table public.race_finish_line_point_reconciliation_audit_v1 enable row level security;
alter table public.race_report_event_compaction_audit_v1 enable row level security;
alter table public.system_health_config_v1 enable row level security;
alter table public.system_monitor_processes enable row level security;
alter table public.system_monitor_runs enable row level security;
alter table public.system_incidents enable row level security;
alter table public.system_incident_admin_reads enable row level security;
alter table public.system_alert_email_outbox enable row level security;
alter table public.control_center_source_config enable row level security;
alter table public.control_center_platform_metrics_cache enable row level security;
alter table public.national_championship_config enable row level security;
alter table public.national_championship_editions enable row level security;
alter table public.national_championship_ranking_snapshots enable row level security;
alter table public.national_championship_heats enable row level security;
alter table public.national_championship_entries enable row level security;
alter table public.national_championship_duties enable row level security;
alter table public.national_championship_result_history enable row level security;
alter table public.national_championship_rider_plans enable row level security;
alter table public.national_championship_ranking_bonus_awards enable row level security;
alter table public.world_road_championship_editions enable row level security;
alter table public.world_road_championship_entries enable row level security;
alter table public.world_road_championship_duties enable row level security;
alter table public.rider_championship_honours enable row level security;
alter table public.cross_game_referral_events enable row level security;
alter table public.national_association_config enable row level security;
alter table public.national_associations enable row level security;
alter table public.national_association_memberships enable row level security;
alter table public.national_coach_elections enable row level security;
alter table public.national_coach_candidates enable row level security;
alter table public.national_coach_runoff_candidates enable row level security;
alter table public.national_coach_votes enable row level security;
alter table public.national_coach_terms enable row level security;
alter table public.national_team_standard_equipment enable row level security;
alter table public.national_team_standard_assets enable row level security;
alter table public.national_team_standard_supplies enable row level security;
alter table public.national_team_callups enable row level security;
alter table public.national_team_squads enable row level security;
alter table public.national_team_squad_members enable row level security;
alter table public.national_team_duties enable row level security;
alter table public.national_team_lineups enable row level security;
alter table public.national_team_lineup_members enable row level security;
alter table public.national_association_maintenance_log enable row level security;
alter table public.nations_points_curve enable row level security;
alter table public.nations_competition_editions enable row level security;
alter table public.nations_competition_entries enable row level security;
alter table public.nations_competition_rounds enable row level security;
alter table public.nations_competition_groups enable row level security;
alter table public.nations_group_entries enable row level security;
alter table public.nations_host_applications enable row level security;
alter table public.nations_competition_history enable row level security;
alter table public.national_association_race_team_identities enable row level security;
alter table public.nations_group_events enable row level security;
create policy countries_read_all on public.countries as permissive for select to anon, authenticated using (true);
create policy month_definitions_read_all on public.month_definitions as permissive for select to anon, authenticated using (true);
create policy game_state_read_all on public.game_state as permissive for select to anon, authenticated using (true);
create policy profiles_select_own on public.profiles as permissive for select to authenticated using ((( SELECT auth.uid() AS uid) = id));
create policy profiles_update_own on public.profiles as permissive for update to authenticated using ((( SELECT auth.uid() AS uid) = id)) with check ((( SELECT auth.uid() AS uid) = id));
create policy clubs_select_member on public.clubs as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = clubs.id) AND (cm.user_id = ( SELECT auth.uid() AS uid))))));
create policy club_memberships_select_own on public.club_memberships as permissive for select to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy club_settings_select_member on public.club_settings as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_settings.club_id) AND (cm.user_id = ( SELECT auth.uid() AS uid))))));
create policy club_infrastructure_select_member on public.club_infrastructure as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_infrastructure.club_id) AND (cm.user_id = ( SELECT auth.uid() AS uid))))));
create policy club_finance_summary_select_member on public.club_finance_summary as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_finance_summary.club_id) AND (cm.user_id = ( SELECT auth.uid() AS uid))))));
create policy "Users can view own profile" on public.profiles as permissive for select to authenticated using ((auth.uid() = id));
create policy "Users can insert own profile" on public.profiles as permissive for insert to authenticated with check ((auth.uid() = id));
create policy "Users can update own profile" on public.profiles as permissive for update to authenticated using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy "Users can update their own club" on public.clubs as permissive for update to authenticated using ((owner_user_id = auth.uid())) with check ((owner_user_id = auth.uid()));
create policy "Users can view their own club" on public.clubs as permissive for select to authenticated using ((owner_user_id = auth.uid()));
create policy inbox_conversations_select_own on public.inbox_conversations as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM inbox_conversation_participants cp
  WHERE ((cp.conversation_id = inbox_conversations.id) AND (cp.user_id = auth.uid())))));
create policy inbox_participants_select_own on public.inbox_conversation_participants as permissive for select to authenticated using ((user_id = auth.uid()));
create policy inbox_messages_select_own on public.inbox_messages as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM inbox_conversation_participants cp
  WHERE ((cp.conversation_id = inbox_messages.conversation_id) AND (cp.user_id = auth.uid())))));
create policy club_referrals_insert_by_referred_user on public.club_referrals as permissive for insert to authenticated with check ((referred_user_id = auth.uid()));
create policy club_referrals_select_by_referred_user on public.club_referrals as permissive for select to authenticated using ((referred_user_id = auth.uid()));
create policy club_referrals_select_by_referrer_owner on public.club_referrals as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_referrals.referrer_club_id) AND (c.owner_user_id = auth.uid())))));
create policy accounts_select on finance.accounts as permissive for select to authenticated using ((((club_id IS NOT NULL) AND finance.is_club_member_or_owner(club_id, auth.uid())) OR ((user_id IS NOT NULL) AND (user_id = auth.uid()))));
create policy balances_select on finance.account_balances as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM finance.accounts a
  WHERE ((a.id = account_balances.account_id) AND (((a.club_id IS NOT NULL) AND finance.is_club_member_or_owner(a.club_id, auth.uid())) OR ((a.user_id IS NOT NULL) AND (a.user_id = auth.uid())))))));
create policy entries_select on finance.entries as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM finance.accounts a
  WHERE ((a.id = entries.account_id) AND (((a.club_id IS NOT NULL) AND finance.is_club_member_or_owner(a.club_id, auth.uid())) OR ((a.user_id IS NOT NULL) AND (a.user_id = auth.uid())))))));
create policy transactions_select on finance.transactions as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (finance.entries e
     JOIN finance.accounts a ON ((a.id = e.account_id)))
  WHERE ((e.transaction_id = transactions.id) AND (((a.club_id IS NOT NULL) AND finance.is_club_member_or_owner(a.club_id, auth.uid())) OR ((a.user_id IS NOT NULL) AND (a.user_id = auth.uid())))))));
create policy club_sponsors_select_member on public.club_sponsors as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_sponsors.club_id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_sponsors.club_id) AND (c.owner_user_id = auth.uid()))))));
create policy club_sponsors_owner_insert on public.club_sponsors as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_sponsors.club_id) AND (c.owner_user_id = auth.uid())))));
create policy club_sponsors_owner_update on public.club_sponsors as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_sponsors.club_id) AND (c.owner_user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_sponsors.club_id) AND (c.owner_user_id = auth.uid())))));
create policy club_sponsors_owner_delete on public.club_sponsors as permissive for delete to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_sponsors.club_id) AND (c.owner_user_id = auth.uid())))));
create policy user_wallets_select_own on public.user_wallets as permissive for select to authenticated using ((user_id = auth.uid()));
create policy user_wallets_no_write on public.user_wallets as permissive for all to authenticated using (false) with check (false);
create policy user_coin_ledger_select_own on public.user_coin_ledger as permissive for select to authenticated using ((user_id = auth.uid()));
create policy user_coin_ledger_no_write on public.user_coin_ledger as permissive for all to authenticated using (false) with check (false);
create policy coin_packages_read on public.coin_packages as permissive for select to anon, authenticated using ((active = true));
create policy club_riders_select_member on public.club_riders as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_riders.club_id) AND (cm.user_id = auth.uid())))));
create policy riders_select_if_member_of_owning_club on public.riders as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (club_riders cr
     JOIN club_memberships cm ON ((cm.club_id = cr.club_id)))
  WHERE ((cr.rider_id = riders.id) AND (cm.user_id = auth.uid())))));
create policy club_riders_select_owner_or_member on public.club_riders as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_riders.club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_riders.club_id) AND (cm.user_id = auth.uid()))))));
create policy riders_select_if_in_owned_or_member_club on public.riders as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM (club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
  WHERE ((cr.rider_id = riders.id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (club_riders cr
     JOIN club_memberships cm ON ((cm.club_id = cr.club_id)))
  WHERE ((cr.rider_id = riders.id) AND (cm.user_id = auth.uid()))))));
create policy clubs_insert_own on public.clubs as permissive for insert to authenticated with check ((owner_user_id = auth.uid()));
create policy riders_update_owner_club on public.riders as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM (club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
  WHERE ((cr.rider_id = riders.id) AND (c.owner_user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM (club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
  WHERE ((cr.rider_id = riders.id) AND (c.owner_user_id = auth.uid())))));
create policy rider_contracts_select_member on public.rider_contracts as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_contracts.club_id) AND (cm.user_id = auth.uid())))));
create policy rider_payroll_state_select_member on public.rider_payroll_state as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_payroll_state.club_id) AND (cm.user_id = auth.uid())))));
create policy rider_contract_negotiations_select_member on public.rider_contract_negotiations as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_contract_negotiations.club_id) AND (cm.user_id = auth.uid())))));
create policy "authenticated users can insert player reports" on public.player_reports as permissive for insert to authenticated with check ((auth.uid() = reporter_user_id));
create policy "authenticated users can view unreviewed player reports" on public.player_reports as permissive for select to authenticated using ((reviewed_at IS NULL));
create policy club_infrastructure_jobs_select_member on public.club_infrastructure_jobs as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_infrastructure_jobs.club_id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_infrastructure_jobs.club_id) AND (c.owner_user_id = auth.uid()))))));
create policy sponsor_companies_select_authenticated on public.sponsor_companies as permissive for select to authenticated using (true);
create policy club_sponsor_offers_select_member on public.club_sponsor_offers as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_sponsor_offers.club_id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_sponsor_offers.club_id) AND (c.owner_user_id = auth.uid()))))));
create policy club_sponsor_objectives_select_member on public.club_sponsor_objectives as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM ((club_sponsors cs
     LEFT JOIN club_memberships cm ON (((cm.club_id = cs.club_id) AND (cm.user_id = auth.uid()))))
     LEFT JOIN clubs c ON ((c.id = cs.club_id)))
  WHERE ((cs.id = club_sponsor_objectives.club_sponsor_id) AND ((cm.user_id IS NOT NULL) OR (c.owner_user_id = auth.uid()))))));
create policy rider_health_cases_select_owner_or_member on public.rider_health_cases as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM (club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
  WHERE ((cr.rider_id = rider_health_cases.rider_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (club_riders cr
     JOIN club_memberships cm ON ((cm.club_id = cr.club_id)))
  WHERE ((cr.rider_id = rider_health_cases.rider_id) AND (cm.user_id = auth.uid()))))));
create policy club_regular_training_defaults_select_owner on public.club_regular_training_defaults as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_regular_training_defaults.club_id) AND (c.owner_user_id = auth.uid())))));
create policy club_regular_training_defaults_insert_owner on public.club_regular_training_defaults as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_regular_training_defaults.club_id) AND (c.owner_user_id = auth.uid())))));
create policy club_regular_training_defaults_update_owner on public.club_regular_training_defaults as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_regular_training_defaults.club_id) AND (c.owner_user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_regular_training_defaults.club_id) AND (c.owner_user_id = auth.uid())))));
create policy rider_regular_training_plans_select_owner on public.rider_regular_training_plans as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_regular_training_plans.club_id) AND (c.owner_user_id = auth.uid())))));
create policy rider_regular_training_plans_insert_owner on public.rider_regular_training_plans as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_regular_training_plans.club_id) AND (c.owner_user_id = auth.uid())))));
create policy rider_regular_training_plans_update_owner on public.rider_regular_training_plans as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_regular_training_plans.club_id) AND (c.owner_user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_regular_training_plans.club_id) AND (c.owner_user_id = auth.uid())))));
create policy rider_regular_training_plans_delete_owner on public.rider_regular_training_plans as permissive for delete to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_regular_training_plans.club_id) AND (c.owner_user_id = auth.uid())))));
create policy club_staff_select_owner_or_member on public.club_staff as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN club_memberships cm ON (((cm.club_id = c.id) AND (cm.user_id = auth.uid()))))
  WHERE ((c.id = club_staff.club_id) AND ((c.owner_user_id = auth.uid()) OR (cm.user_id IS NOT NULL))))));
create policy club_staff_insert_owner on public.club_staff as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_staff.club_id) AND (c.owner_user_id = auth.uid())))));
create policy club_staff_update_owner on public.club_staff as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_staff.club_id) AND (c.owner_user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_staff.club_id) AND (c.owner_user_id = auth.uid())))));
create policy club_staff_delete_owner on public.club_staff as permissive for delete to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_staff.club_id) AND (c.owner_user_id = auth.uid())))));
create policy staff_candidates_select_available on public.staff_candidates as permissive for select to authenticated using ((is_available = true));
create policy team_policy_option_catalog_select_authenticated on public.team_policy_option_catalog as permissive for select to authenticated using ((is_active = true));
create policy club_team_policies_select_owner_or_member on public.club_team_policies as permissive for select to authenticated using (finance.is_club_member_or_owner(club_id, auth.uid()));
create policy rider_transfer_listings_select_market on public.rider_transfer_listings as permissive for select to authenticated using (((status = 'listed'::text) OR (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_transfer_listings.seller_club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_transfer_listings.seller_club_id) AND (cm.user_id = auth.uid()))))));
create policy rider_transfer_offers_select_involved on public.rider_transfer_offers as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_transfer_offers.seller_club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_transfer_offers.seller_club_id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_transfer_offers.buyer_club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_transfer_offers.buyer_club_id) AND (cm.user_id = auth.uid()))))));
create policy rider_free_agents_select_market on public.rider_free_agents as permissive for select to authenticated using (((status = 'available'::text) OR ((source_club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_free_agents.source_club_id) AND (c.owner_user_id = auth.uid()))))) OR ((source_club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_free_agents.source_club_id) AND (cm.user_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM rider_free_agent_negotiations n
  WHERE ((n.free_agent_id = rider_free_agents.id) AND ((EXISTS ( SELECT 1
           FROM clubs c
          WHERE ((c.id = n.club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = n.club_id) AND (cm.user_id = auth.uid()))))))))));
create policy rider_free_agent_negotiations_select_involved on public.rider_free_agent_negotiations as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_free_agent_negotiations.club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_free_agent_negotiations.club_id) AND (cm.user_id = auth.uid()))))));
create policy rider_transfer_negotiations_select_involved on public.rider_transfer_negotiations as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_transfer_negotiations.seller_club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_transfer_negotiations.seller_club_id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_transfer_negotiations.buyer_club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_transfer_negotiations.buyer_club_id) AND (cm.user_id = auth.uid()))))));
create policy rider_transfer_events_select_involved on public.rider_transfer_events as permissive for select to authenticated using ((((seller_club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_transfer_events.seller_club_id) AND (c.owner_user_id = auth.uid()))))) OR ((seller_club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_transfer_events.seller_club_id) AND (cm.user_id = auth.uid()))))) OR ((buyer_club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_transfer_events.buyer_club_id) AND (c.owner_user_id = auth.uid()))))) OR ((buyer_club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_transfer_events.buyer_club_id) AND (cm.user_id = auth.uid())))))));
create policy user_notifications_select_own on public.user_notifications as permissive for select to authenticated using ((user_id = auth.uid()));
create policy user_notifications_update_own on public.user_notifications as permissive for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy rider_free_agent_events_select_involved on public.rider_free_agent_events as permissive for select to authenticated using ((((source_club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_free_agent_events.source_club_id) AND (c.owner_user_id = auth.uid()))))) OR ((source_club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_free_agent_events.source_club_id) AND (cm.user_id = auth.uid()))))) OR ((club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_free_agent_events.club_id) AND (c.owner_user_id = auth.uid()))))) OR ((club_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_free_agent_events.club_id) AND (cm.user_id = auth.uid())))))));
create policy training_camp_staff_assignments_select_owner_or_member on public.training_camp_staff_assignments as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN club_memberships cm ON (((cm.club_id = c.id) AND (cm.user_id = auth.uid()))))
  WHERE ((c.id = training_camp_staff_assignments.club_id) AND ((c.owner_user_id = auth.uid()) OR (cm.user_id IS NOT NULL))))));
create policy staff_role_definitions_select_authenticated on public.staff_role_definitions as permissive for select to authenticated using (true);
create policy infrastructure_facility_upgrade_config_select_authenticated on public.infrastructure_facility_upgrade_config as permissive for select to authenticated using (true);
create policy infrastructure_asset_config_select_authenticated on public.infrastructure_asset_config as permissive for select to authenticated using (true);
create policy club_infrastructure_asset_holdings_select_member on public.club_infrastructure_asset_holdings as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN club_memberships cm ON (((cm.club_id = c.id) AND (cm.user_id = auth.uid()))))
  WHERE ((c.id = club_infrastructure_asset_holdings.club_id) AND ((c.owner_user_id = auth.uid()) OR (cm.user_id IS NOT NULL))))));
create policy club_team_cars_select_member on public.club_team_cars as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN club_memberships cm ON (((cm.club_id = c.id) AND (cm.user_id = auth.uid()))))
  WHERE ((c.id = club_team_cars.club_id) AND ((c.owner_user_id = auth.uid()) OR (cm.user_id IS NOT NULL))))));
create policy club_team_buses_select_member on public.club_team_buses as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN club_memberships cm ON (((cm.club_id = c.id) AND (cm.user_id = auth.uid()))))
  WHERE ((c.id = club_team_buses.club_id) AND ((c.owner_user_id = auth.uid()) OR (cm.user_id IS NOT NULL))))));
create policy club_asset_repair_jobs_select_member on public.club_infrastructure_asset_repair_jobs as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN club_memberships cm ON (((cm.club_id = c.id) AND (cm.user_id = auth.uid()))))
  WHERE ((c.id = club_infrastructure_asset_repair_jobs.club_id) AND ((c.owner_user_id = auth.uid()) OR (cm.user_id IS NOT NULL))))));
create policy equipment_catalog_select_authenticated on public.equipment_catalog as permissive for select to authenticated using (true);
create policy club_equipment_inventory_select_member on public.club_equipment_inventory as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_equipment_inventory.club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_equipment_inventory.club_id) AND (cm.user_id = auth.uid()))))));
create policy club_equipment_default_setup_select_member on public.club_equipment_default_setup as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_equipment_default_setup.club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_equipment_default_setup.club_id) AND (cm.user_id = auth.uid()))))));
create policy club_race_supplies_select_member on public.club_race_supplies as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_race_supplies.club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_race_supplies.club_id) AND (cm.user_id = auth.uid()))))));
create policy club_equipment_maintenance_jobs_select_member on public.club_equipment_maintenance_jobs as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_equipment_maintenance_jobs.club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = club_equipment_maintenance_jobs.club_id) AND (cm.user_id = auth.uid()))))));
create policy "Authenticated users can read races" on public.races as permissive for select to authenticated using (true);
create policy "Authenticated users can read race stages" on public.race_stages as permissive for select to authenticated using (true);
create policy "Authenticated users can read race stage points" on public.race_stage_points as permissive for select to authenticated using (true);
create policy "Authenticated users can read race rules config" on public.race_rules_config as permissive for select to authenticated using (true);
create policy "Allow public read of game clock config" on public.game_clock_config as permissive for select to anon, authenticated using (true);
create policy "Allow public read of last names master" on public.last_names_master as permissive for select to anon, authenticated using (true);
create policy "Allow public read of first names master" on public.first_names_master as permissive for select to anon, authenticated using (true);
create policy "Allow public read of team kits" on public.team_kits as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race team entries" on public.race_team_entries as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race application penalty rules" on public.race_application_penalty_rules as permissive for select to anon, authenticated using (true);
create policy "Users can read own club race commitment score" on public.club_race_commitment_scores as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_race_commitment_scores.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Allow public read of race stage profile details" on public.race_stage_profile_details as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race ranking point awards" on public.race_ranking_point_awards as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race stage report events" on public.race_stage_report_events as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race ranking point rules" on public.race_ranking_point_rules as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race prize awards" on public.race_prize_awards as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race prize bucket rules" on public.race_prize_bucket_rules as permissive for select to anon, authenticated using (true);
create policy "Allow public read of equipment bonus allowed keys" on public.equipment_bonus_allowed_keys as permissive for select to anon, authenticated using (true);
create policy "Users can read own club scout reports" on public.rider_scout_reports as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_scout_reports.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Allow public read of notification preference groups" on public.notification_preference_groups as permissive for select to anon, authenticated using (true);
create policy "Users can read own club season reward grants" on public.club_season_reward_grants as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_season_reward_grants.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Allow public read of economy config" on public.economy_config as permissive for select to anon, authenticated using (true);
create policy "Allow public read of team ranking past winners" on public.team_ranking_past_winners as permissive for select to anon, authenticated using (true);
create policy race_rider_submission_deadline_events_select_authenticated on public.race_rider_submission_deadline_events as permissive for select to authenticated using (true);
create policy race_day_readiness_events_select_authenticated on public.race_day_readiness_events as permissive for select to authenticated using (true);
create policy "Allow public read of game time clock state" on public.game_time_clock_state as permissive for select to anon, authenticated using (true);
create policy "Allow public read of generated rider first names" on public.generated_rider_first_names as permissive for select to anon, authenticated using (true);
create policy "Allow public read of team ranking season snapshots" on public.team_ranking_season_snapshots as permissive for select to anon, authenticated using (true);
create policy "Allow public read of generated rider last names" on public.generated_rider_last_names as permissive for select to anon, authenticated using (true);
create policy "Allow public read of club movement history" on public.club_movement_history as permissive for select to anon, authenticated using (true);
create policy "Allow public read of country weather weekly normals" on public.country_weather_weekly_normals as permissive for select to anon, authenticated using (true);
create policy "Users can read own club training camp daily reports" on public.training_camp_daily_reports as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (training_camp_bookings b
     JOIN clubs c ON ((c.id = b.club_id)))
  WHERE ((b.id = training_camp_daily_reports.booking_id) AND (c.owner_user_id = auth.uid())))));
create policy "Users can read own club training camp participants" on public.training_camp_participants as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (training_camp_bookings b
     JOIN clubs c ON ((c.id = b.club_id)))
  WHERE ((b.id = training_camp_participants.booking_id) AND (c.owner_user_id = auth.uid())))));
create policy "Allow public read of training camp catalog" on public.training_camp_catalog as permissive for select to anon, authenticated using (true);
create policy "Allow public read of skill tier target bands" on public.skill_tier_target_bands as permissive for select to anon, authenticated using (true);
create policy "Allow public read of skill role shape" on public.skill_role_shape as permissive for select to anon, authenticated using (true);
create policy "Users can read own club staff course enrollments" on public.staff_course_enrollments as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = staff_course_enrollments.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Users can read own club staff courses" on public.staff_courses as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = staff_courses.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Users can read own club team trip cost forecasts" on public.team_trip_cost_forecasts as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = team_trip_cost_forecasts.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Allow public read of country market groups" on public.country_market_groups as permissive for select to anon, authenticated using (true);
create policy "Allow public read of country market group members" on public.country_market_group_members as permissive for select to anon, authenticated using (true);
create policy race_preparations_select_own_club on public.race_preparations as permissive for select to authenticated using (can_read_club_v1(club_id));
create policy race_preparation_riders_select_own_club on public.race_preparation_riders as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM race_preparations rp
  WHERE ((rp.id = race_preparation_riders.race_preparation_id) AND can_read_club_v1(rp.club_id)))));
create policy race_preparation_staff_select_own_club on public.race_preparation_staff as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM race_preparations rp
  WHERE ((rp.id = race_preparation_staff.race_preparation_id) AND can_read_club_v1(rp.club_id)))));
create policy race_preparation_assets_select_own_club on public.race_preparation_assets as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM race_preparations rp
  WHERE ((rp.id = race_preparation_assets.race_preparation_id) AND can_read_club_v1(rp.club_id)))));
create policy race_preparation_supplies_select_own_club on public.race_preparation_supplies as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM race_preparations rp
  WHERE ((rp.id = race_preparation_supplies.race_preparation_id) AND can_read_club_v1(rp.club_id)))));
create policy race_stage_plans_select_own_club on public.race_stage_plans as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM race_preparations rp
  WHERE ((rp.id = race_stage_plans.race_preparation_id) AND can_read_club_v1(rp.club_id)))));
create policy race_stage_plan_riders_select_own_club on public.race_stage_plan_riders as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (race_stage_plans sp
     JOIN race_preparations rp ON ((rp.id = sp.race_preparation_id)))
  WHERE ((sp.id = race_stage_plan_riders.race_stage_plan_id) AND can_read_club_v1(rp.club_id)))));
create policy race_stage_plan_assets_select_own_club on public.race_stage_plan_assets as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (race_stage_plans sp
     JOIN race_preparations rp ON ((rp.id = sp.race_preparation_id)))
  WHERE ((sp.id = race_stage_plan_assets.race_stage_plan_id) AND can_read_club_v1(rp.club_id)))));
create policy race_stage_plan_supplies_select_own_club on public.race_stage_plan_supplies as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (race_stage_plans sp
     JOIN race_preparations rp ON ((rp.id = sp.race_preparation_id)))
  WHERE ((sp.id = race_stage_plan_supplies.race_stage_plan_id) AND can_read_club_v1(rp.club_id)))));
create policy "Allow public read of sponsor company eligibility" on public.sponsor_company_eligibility as permissive for select to anon, authenticated using (true);
create policy "Users can read own club rider scout tasks" on public.rider_scout_tasks as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_scout_tasks.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Users can read own club staff scout daily usage" on public.staff_scout_daily_usage as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = staff_scout_daily_usage.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Users can read own club retirement decisions" on public.retirement_decisions as permissive for select to authenticated using (((owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = retirement_decisions.club_id) AND (c.owner_user_id = auth.uid()))))));
create policy "Users can read own club training camp bookings" on public.training_camp_bookings as permissive for select to authenticated using (((created_by_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = training_camp_bookings.club_id) AND (c.owner_user_id = auth.uid()))))));
create policy "Users can read own club staff assignment load" on public.staff_assignment_load as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = staff_assignment_load.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Users can read own club training camp day training plans" on public.training_camp_day_training_plans as permissive for select to authenticated using (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (training_camp_bookings b
     JOIN clubs c ON ((c.id = b.club_id)))
  WHERE ((b.id = training_camp_day_training_plans.booking_id) AND ((b.created_by_user_id = auth.uid()) OR (c.owner_user_id = auth.uid())))))));
create policy "Allow public read of staff role catalog" on public.staff_role_catalog as permissive for select to anon, authenticated using (true);
create policy "Users can read own club equipment vans" on public.club_equipment_vans as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_equipment_vans.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Users can read own club mobile workshops" on public.club_mobile_workshops as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_mobile_workshops.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Users can read own club medical vans" on public.club_medical_vans as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_medical_vans.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Users can read own club technical sponsor benefits" on public.club_technical_sponsor_benefits as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_technical_sponsor_benefits.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Allow public read of equipment bonus category weights" on public.equipment_bonus_category_weights as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race plan effect rules" on public.race_plan_effect_rules as permissive for select to anon, authenticated using (true);
create policy "Users can read own club equipment setup presets" on public.club_equipment_setup_presets as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_equipment_setup_presets.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Users can read own club technical sponsor discount ledger" on public.club_technical_sponsor_discount_ledger as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_technical_sponsor_discount_ledger.club_id) AND (c.owner_user_id = auth.uid())))));
create policy "Allow public read of race bonus effect map" on public.race_bonus_effect_map as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race bonus groups" on public.race_bonus_groups as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race stage route profiles" on public.race_stage_route_profiles as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race rule sets" on public.race_rule_sets as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race stage results" on public.race_stage_results as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race stage point results" on public.race_stage_point_results as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race classification standings" on public.race_classification_standings as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race category rules" on public.race_category_rules as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race leader snapshots" on public.race_leader_snapshots as permissive for select to anon, authenticated using (true);
create policy "Allow public read of race entry rules" on public.race_entry_rules as permissive for select to anon, authenticated using (true);
create policy "Participating clubs can read race stage replay frames" on public.race_stage_replay_frames as permissive for select to authenticated using (can_view_race_replay_frames_participation_only_v1(race_id));
create policy "Users can read own club race supply units" on public.club_race_supply_units as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = club_race_supply_units.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))));
create policy "Users can read own club race stage supply usage events" on public.race_stage_supply_usage_events as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = race_stage_supply_usage_events.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))));
create policy club_season_identities_select_member on public.club_season_identities as permissive for select to authenticated using (finance.is_club_member_or_owner(club_id, auth.uid()));
create policy "Users can read own tutorial progress" on public.user_tutorial_progress as permissive for select to authenticated using ((user_id = auth.uid()));
create policy "Users can insert own tutorial progress" on public.user_tutorial_progress as permissive for insert to authenticated with check ((user_id = auth.uid()));
create policy "Users can update own tutorial progress" on public.user_tutorial_progress as permissive for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy rewarded_ad_settings_read_authenticated on public.rewarded_ad_settings as permissive for select to authenticated using ((active = true));
create policy user_rewarded_ad_events_select_own on public.user_rewarded_ad_events as permissive for select to authenticated using ((auth.uid() = user_id));
create policy user_rewarded_ad_daily_progress_select_own on public.user_rewarded_ad_daily_progress as permissive for select to authenticated using ((auth.uid() = user_id));
create policy user_rewarded_ad_coin_grants_select_own on public.user_rewarded_ad_coin_grants as permissive for select to authenticated using ((auth.uid() = user_id));
create policy active_ai_team_kit_previews_are_public on public.ai_team_kit_previews as permissive for select to anon, authenticated using ((is_active = true));
create policy club_restart_history_owner_read on public.club_restart_history as permissive for select to authenticated using ((user_id = auth.uid()));
create policy homepage_player_reviews_public_read_approved_v1 on public.homepage_player_reviews as permissive for select to anon, authenticated using ((status = 'approved'::text));
create policy "Users can read own unsolicited transfer bids" on public.rider_unsolicited_transfer_bids as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = rider_unsolicited_transfer_bids.buyer_club_id) AND (c.owner_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM club_memberships cm
  WHERE ((cm.club_id = rider_unsolicited_transfer_bids.buyer_club_id) AND (cm.user_id = auth.uid()))))));
create policy "Users can read own club rider race condition" on public.rider_race_condition as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM ((club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((cr.rider_id = rider_race_condition.rider_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))));
create policy "Users can read own club rider race development events" on public.rider_race_development_events as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = rider_race_development_events.team_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))) OR (EXISTS ( SELECT 1
   FROM ((club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((cr.rider_id = rider_race_development_events.rider_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid()))))))))));
create policy "Users can read own club stage command outcomes" on public.race_engine_stage_command_outcomes as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = race_engine_stage_command_outcomes.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))) OR (EXISTS ( SELECT 1
   FROM ((club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((cr.rider_id = race_engine_stage_command_outcomes.rider_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid()))))))))));
create policy "Users can read own club race stage team states" on public.race_stage_team_states as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = race_stage_team_states.team_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))));
create policy "Users can read own club equipment damage applications" on public.race_engine_stage_incident_equipment_damage_applications as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = race_engine_stage_incident_equipment_damage_applications.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))) OR (EXISTS ( SELECT 1
   FROM ((club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((cr.rider_id = race_engine_stage_incident_equipment_damage_applications.rider_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid()))))))))));
create policy "Users can read own team inactivity events" on public.user_team_inactivity_events as permissive for select to authenticated using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = user_team_inactivity_events.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid()))))))))));
create policy "Users can read own club stage interaction events" on public.race_engine_stage_interaction_events as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = race_engine_stage_interaction_events.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))) OR (EXISTS ( SELECT 1
   FROM ((club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((cr.rider_id = race_engine_stage_interaction_events.rider_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid()))))))))));
create policy "Users can read own club race supplies low notification state" on public.club_race_supplies_low_notification_state as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = club_race_supplies_low_notification_state.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))));
create policy "Users can read own club race stage incidents" on public.race_stage_incidents as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = race_stage_incidents.team_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))) OR (EXISTS ( SELECT 1
   FROM ((club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((cr.rider_id = race_stage_incidents.rider_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid()))))))))));
create policy "Users can read own club command outcome delta applications" on public.race_engine_stage_command_outcome_delta_applications as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = race_engine_stage_command_outcome_delta_applications.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))) OR (EXISTS ( SELECT 1
   FROM ((club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((cr.rider_id = race_engine_stage_command_outcome_delta_applications.rider_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid()))))))))));
create policy "Users can read own club roster country rules" on public.club_roster_country_rules as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = club_roster_country_rules.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))));
create policy "Allow public read of race stage time trial rules" on public.race_stage_time_trial_rules as permissive for select to anon, authenticated using (true);
create policy "Allow public read of team tier balance profiles" on public.team_tier_balance_profiles as permissive for select to anon, authenticated using (true);
create policy "Allow public read of starting roster role profiles" on public.starting_roster_role_profiles as permissive for select to anon, authenticated using (true);
create policy "Allow public read of sponsor bonus objective rules" on public.sponsor_bonus_objective_rules_v1 as permissive for select to anon, authenticated using (true);
create policy club_regular_training_automation_owner_select on public.club_regular_training_automation as permissive for select to authenticated using (can_manage_club_training_v1(club_id));
create policy club_regular_training_automation_owner_write on public.club_regular_training_automation as permissive for all to authenticated using (can_manage_club_training_v1(club_id)) with check (can_manage_club_training_v1(club_id));
create policy rider_regular_training_management_owner_select on public.rider_regular_training_management as permissive for select to authenticated using (can_manage_club_training_v1(club_id));
create policy rider_regular_training_management_owner_write on public.rider_regular_training_management as permissive for all to authenticated using (can_manage_club_training_v1(club_id)) with check (can_manage_club_training_v1(club_id));
create policy rider_regular_training_daily_plans_owner_select on public.rider_regular_training_daily_plans as permissive for select to authenticated using (can_manage_club_training_v1(club_id));
create policy rider_regular_training_daily_plans_owner_write on public.rider_regular_training_daily_plans as permissive for all to authenticated using (can_manage_club_training_v1(club_id)) with check (can_manage_club_training_v1(club_id));
create policy race_preparation_stage_plan_automation_owner_select on public.race_preparation_stage_plan_automation as permissive for select to authenticated using (can_manage_race_preparation_v1(race_preparation_id));
create policy race_preparation_stage_plan_automation_owner_write on public.race_preparation_stage_plan_automation as permissive for all to authenticated using (can_manage_race_preparation_v1(race_preparation_id)) with check (can_manage_race_preparation_v1(race_preparation_id));
create policy race_stage_plan_management_owner_select on public.race_stage_plan_management as permissive for select to authenticated using (can_manage_race_preparation_v1(race_preparation_id));
create policy race_stage_plan_management_owner_write on public.race_stage_plan_management as permissive for all to authenticated using (can_manage_race_preparation_v1(race_preparation_id)) with check (can_manage_race_preparation_v1(race_preparation_id));
create policy race_stage_plan_generation_log_owner_select on public.race_stage_plan_generation_log as permissive for select to authenticated using (can_manage_race_preparation_v1(race_preparation_id));
create policy "Owners can read U23 stage automation events" on public.race_stage_plan_automation_stage_events as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (race_preparations preparation
     JOIN clubs owner_club ON ((owner_club.id = preparation.club_id)))
  WHERE ((preparation.id = race_stage_plan_automation_stage_events.race_preparation_id) AND (owner_club.owner_user_id = auth.uid())))));
create policy "Auth read own user coin low warning state" on public.user_coin_low_warning_state as permissive for select to authenticated using ((user_id = auth.uid()));
create policy rls_club_restart_released_riders_own_read on public.club_restart_released_riders as permissive for select to authenticated using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = club_restart_released_riders.club_id) AND ((c.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM clubs parent
          WHERE ((parent.id = c.parent_club_id) AND ((parent.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
                   FROM club_memberships pcm
                  WHERE ((pcm.club_id = parent.id) AND (pcm.user_id = auth.uid()))))))))))))));
create policy rls_weather_exposure_own_read on public.race_stage_weather_exposure_events as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = race_stage_weather_exposure_events.team_id) AND ((c.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM clubs parent
          WHERE ((parent.id = c.parent_club_id) AND ((parent.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
                   FROM club_memberships pcm
                  WHERE ((pcm.club_id = parent.id) AND (pcm.user_id = auth.uid())))))))))))) OR (EXISTS ( SELECT 1
   FROM (club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
  WHERE ((cr.rider_id = race_stage_weather_exposure_events.rider_id) AND ((c.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM clubs parent
          WHERE ((parent.id = c.parent_club_id) AND ((parent.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
                   FROM club_memberships pcm
                  WHERE ((pcm.club_id = parent.id) AND (pcm.user_id = auth.uid()))))))))))))));
create policy rls_rider_activity_archive_own_read on public.rider_daily_activity_archive_summary as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
  WHERE ((cr.rider_id = rider_daily_activity_archive_summary.rider_id) AND ((c.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM clubs parent
          WHERE ((parent.id = c.parent_club_id) AND ((parent.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
                   FROM club_memberships pcm
                  WHERE ((pcm.club_id = parent.id) AND (pcm.user_id = auth.uid())))))))))))));
create policy health_case_catalogue_public_read on public.health_case_catalogue_v1 as permissive for select to anon, authenticated using (true);
create policy race_stage_authoritative_runs_select_v1 on public.race_stage_authoritative_runs as permissive for select to anon, authenticated, service_role using (true);
create policy premium_plans_public_read on public.premium_plans as permissive for select to anon, authenticated using ((active = true));
create policy user_premium_subscriptions_own_read on public.user_premium_subscriptions as permissive for select to authenticated using ((user_id = auth.uid()));
create policy developing_team_season_access_owner_read on public.developing_team_season_access as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clubs main_club
  WHERE ((main_club.id = developing_team_season_access.main_club_id) AND (main_club.owner_user_id = auth.uid())))));
create policy rider_skill_weekly_snapshots_no_direct_access on public.rider_skill_weekly_snapshots as permissive for all to authenticated using (false) with check (false);
create policy staff_advisory_access_select_own on public.staff_advisory_access as permissive for select to authenticated using (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = staff_advisory_access.club_id) AND (c.owner_user_id = auth.uid()) AND (c.deleted_at IS NULL))))));
create policy staff_advisory_purchases_select_own on public.staff_advisory_purchases as permissive for select to authenticated using (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = staff_advisory_purchases.club_id) AND (c.owner_user_id = auth.uid()) AND (c.deleted_at IS NULL))))));
create policy staff_advisory_reports_select_own on public.staff_advisory_reports as permissive for select to authenticated using (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM clubs c
  WHERE ((c.id = staff_advisory_reports.club_id) AND (c.owner_user_id = auth.uid()) AND (c.deleted_at IS NULL))))));
create policy staff_advisory_notification_mutes_select_own on public.staff_advisory_notification_mutes as permissive for select to authenticated using ((user_id = auth.uid()));
create policy staff_advisory_notification_category_preferences_select_own on public.staff_advisory_notification_category_preferences as permissive for select to authenticated using ((user_id = auth.uid()));
create policy competition_transition_movements_public_read on public.competition_transition_movements_v1 as permissive for select to anon, authenticated using (true);
create policy game_world_reset_s1_competition_baseline_public_read on public.game_world_reset_s1_competition_baseline_v1 as permissive for select to anon, authenticated using (true);
create policy race_engine_runtime_control_public_read on public.race_engine_runtime_control_v1 as permissive for select to anon, authenticated using (true);
create policy race_stage_simulation_events_public_read on public.race_stage_simulation_events as permissive for select to anon, authenticated using (true);
create policy race_team_stage_disqualifications_public_read on public.race_team_stage_disqualifications as permissive for select to anon, authenticated using (true);
create policy season_transition_component_readiness_public_read on public.season_transition_component_readiness_v1 as permissive for select to anon, authenticated using (true);
create policy season_transition_control_public_read on public.season_transition_control_v1 as permissive for select to anon, authenticated using (true);
create policy season_transition_timeline_history_public_read on public.season_transition_timeline_history_v1 as permissive for select to anon, authenticated using (true);
create policy transfer_market_stock_policy_public_read on public.transfer_market_stock_policy_v1 as permissive for select to anon, authenticated using (true);
create policy travel_country_geography_public_read on public.travel_country_geography_v1 as permissive for select to anon, authenticated using (true);
create policy rider_health_case_context_own_club_read on public.rider_health_case_context_v1 as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = rider_health_case_context_v1.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))) OR (EXISTS ( SELECT 1
   FROM ((club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((cr.rider_id = rider_health_case_context_v1.rider_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid()))))))))));
create policy rider_training_accident_decisions_own_club_read on public.rider_training_accident_decisions_v1 as permissive for select to authenticated using (((EXISTS ( SELECT 1
   FROM (clubs c
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((c.id = rider_training_accident_decisions_v1.club_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid())))))))) OR (EXISTS ( SELECT 1
   FROM ((club_riders cr
     JOIN clubs c ON ((c.id = cr.club_id)))
     LEFT JOIN clubs parent_club ON ((parent_club.id = c.parent_club_id)))
  WHERE ((cr.rider_id = rider_training_accident_decisions_v1.rider_id) AND ((c.owner_user_id = auth.uid()) OR (parent_club.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM club_memberships cm
          WHERE ((cm.club_id = c.id) AND (cm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM club_memberships parent_cm
          WHERE ((parent_cm.club_id = parent_club.id) AND (parent_cm.user_id = auth.uid()))))))))));
create policy "users can insert own bug reports" on public.bug_reports as permissive for insert to authenticated with check (((auth.uid() IS NOT NULL) AND (user_id = auth.uid())));
create policy "app admins can read bug reports" on public.bug_reports as permissive for select to authenticated using (is_app_admin_v1());
create policy "app admins can read bug report notes" on public.bug_report_notes as permissive for select to authenticated using (is_app_admin_v1());
create policy "app admins can add bug report notes" on public.bug_report_notes as permissive for insert to authenticated with check ((is_app_admin_v1() AND (admin_user_id = auth.uid())));
create policy "app admins can read own bug report read state" on public.bug_report_admin_reads as permissive for select to authenticated using ((is_app_admin_v1() AND (admin_user_id = auth.uid())));
create policy "app admins can insert own bug report read state" on public.bug_report_admin_reads as permissive for insert to authenticated with check ((is_app_admin_v1() AND (admin_user_id = auth.uid())));
create policy "app admins can update own bug report read state" on public.bug_report_admin_reads as permissive for update to authenticated using ((is_app_admin_v1() AND (admin_user_id = auth.uid()))) with check ((is_app_admin_v1() AND (admin_user_id = auth.uid())));
create policy "app admins can read race operations status" on public.race_operations_stage_status_v1 as permissive for select to authenticated using (is_app_admin_v1());
create policy "app admins can read race operations incidents" on public.race_operations_incidents_v1 as permissive for select to authenticated using (is_app_admin_v1());
create policy "app admins read system incidents" on public.system_incidents as permissive for select to authenticated using (is_app_admin_v1());
create policy national_championship_config_read on public.national_championship_config as permissive for select to authenticated using (true);
create policy national_championship_editions_read on public.national_championship_editions as permissive for select to authenticated using (true);
create policy national_championship_ranking_read on public.national_championship_ranking_snapshots as permissive for select to authenticated using (true);
create policy national_championship_heats_read on public.national_championship_heats as permissive for select to authenticated using (true);
create policy national_championship_entries_read on public.national_championship_entries as permissive for select to authenticated using (true);
create policy national_championship_duties_read on public.national_championship_duties as permissive for select to authenticated using (true);
create policy national_championship_results_read on public.national_championship_result_history as permissive for select to authenticated using (true);
create policy national_championship_rider_plans_owner_read on public.national_championship_rider_plans as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM ((national_championship_entries entry
     JOIN clubs rider_club ON ((rider_club.id = entry.club_id_snapshot)))
     JOIN clubs owner_club ON ((owner_club.id =
        CASE
            WHEN ((rider_club.club_type = 'developing'::text) AND (rider_club.parent_club_id IS NOT NULL)) THEN rider_club.parent_club_id
            ELSE rider_club.id
        END)))
  WHERE ((entry.edition_id = national_championship_rider_plans.edition_id) AND (entry.rider_id = national_championship_rider_plans.rider_id) AND (owner_club.owner_user_id = ( SELECT auth.uid() AS uid))))));
create policy national_championship_bonus_read on public.national_championship_ranking_bonus_awards as permissive for select to authenticated using (true);
create policy national_association_config_read on public.national_association_config as permissive for select to authenticated using (true);
create policy national_associations_read on public.national_associations as permissive for select to authenticated using (true);
create policy nations_points_curve_read on public.nations_points_curve as permissive for select to authenticated using ((is_active = true));
create policy nations_competition_editions_read on public.nations_competition_editions as permissive for select to authenticated using (true);
create policy nations_competition_entries_read on public.nations_competition_entries as permissive for select to authenticated using (true);
create policy nations_competition_rounds_read on public.nations_competition_rounds as permissive for select to authenticated using (true);
create policy nations_competition_groups_read on public.nations_competition_groups as permissive for select to authenticated using (true);
create policy nations_group_entries_read on public.nations_group_entries as permissive for select to authenticated using (true);
create policy nations_competition_history_read on public.nations_competition_history as permissive for select to authenticated using (true);