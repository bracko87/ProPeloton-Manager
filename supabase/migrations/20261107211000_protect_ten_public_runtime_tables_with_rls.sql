-- Public launch hardening. Previously all 10 tables were readable and WRITABLE
-- by unauthenticated callers. Protect internal state and financial records.
-- Leave server roles, trusted SECURITY DEFINER routines and normal cron owners intact.
-- Player-facing public historical/schedule tables stay selectable, never writable.

alter table public.nations_competition_schedule_config enable row level security;
revoke all privileges on table public.nations_competition_schedule_config from public, anon, authenticated;

alter table public.national_association_renewal_coin_events enable row level security;
revoke all privileges on table public.national_association_renewal_coin_events from public, anon, authenticated;

alter table public.race_eligibility_notification_state enable row level security;
revoke all privileges on table public.race_eligibility_notification_state from public, anon, authenticated;

alter table public.race_engine_due_stage_watchdog_v1 enable row level security;
revoke all privileges on table public.race_engine_due_stage_watchdog_v1 from public, anon, authenticated;

alter table public.race_engine_calculation_survival_audit_v1 enable row level security;
revoke all privileges on table public.race_engine_calculation_survival_audit_v1 from public, anon, authenticated;

alter table public.championship_calendar_draw_state_v1 enable row level security;
revoke all privileges on table public.championship_calendar_draw_state_v1 from public, anon, authenticated;

alter table public.team_policy_rider_effect_log_v1 enable row level security;
revoke all privileges on table public.team_policy_rider_effect_log_v1 from public, anon, authenticated;

alter table public.team_policy_nonrecurring_charge_state_v1 enable row level security;
revoke all privileges on table public.team_policy_nonrecurring_charge_state_v1 from public, anon, authenticated;

alter table public.youth_competition_transition_movements_v1 enable row level security;
revoke all privileges on table public.youth_competition_transition_movements_v1 from public, anon, authenticated;

alter table public.youth_team_standing_history_v1 enable row level security;
revoke all privileges on table public.youth_team_standing_history_v1 from public, anon, authenticated;

grant select on table public.nations_competition_schedule_config to anon, authenticated;
create policy "read_public_nations_competition_schedule_config" on public.nations_competition_schedule_config
  for select to anon, authenticated using (true);

grant select on table public.championship_calendar_draw_state_v1 to anon, authenticated;
create policy "read_public_championship_calendar_draw_state_v1" on public.championship_calendar_draw_state_v1
  for select to anon, authenticated using (true);

grant select on table public.youth_competition_transition_movements_v1 to anon, authenticated;
create policy "read_public_youth_competition_transition_movements_v1" on public.youth_competition_transition_movements_v1
  for select to anon, authenticated using (true);

grant select on table public.youth_team_standing_history_v1 to anon, authenticated;
create policy "read_public_youth_team_standing_history_v1" on public.youth_team_standing_history_v1
  for select to anon, authenticated using (true);

grant select on table public.race_eligibility_notification_state to authenticated;
create policy "read_own_race_eligibility_notification_state" on public.race_eligibility_notification_state
  for select to authenticated using (
    exists (
      select 1 from public.clubs c
      where c.id = team_id
        and c.owner_user_id = (select auth.uid())
    )
  );

grant select on table public.team_policy_rider_effect_log_v1 to authenticated;
create policy "read_own_team_policy_rider_effect_log_v1" on public.team_policy_rider_effect_log_v1
  for select to authenticated using (
    exists (
      select 1 from public.clubs c
      where c.id = club_id
        and c.owner_user_id = (select auth.uid())
    )
  );

grant select on table public.team_policy_nonrecurring_charge_state_v1 to authenticated;
create policy "read_own_team_policy_nonrecurring_charge_state_v1" on public.team_policy_nonrecurring_charge_state_v1
  for select to authenticated using (
    exists (
      select 1 from public.clubs c
      where c.id = club_id
        and c.owner_user_id = (select auth.uid())
    )
  );

grant select on table public.national_association_renewal_coin_events to authenticated;
create policy "read_own_national_association_renewal_coin_events" on public.national_association_renewal_coin_events
  for select to authenticated using (user_id = (select auth.uid()));
