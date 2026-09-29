-- Resolve remaining Supabase Security Advisor "RLS Disabled in Public" findings.
-- Project: ProPeloton Manager / okuravitxocyevkexfgi
-- Applied directly to production first, then stored as migration for repository history.

begin;

-- Enable RLS on the remaining public tables.
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'ai_roster_transition_audit_v1',
    'club_season_reward_grant_correction_archive_v1',
    'competition_transition_movement_correction_archive_v1',
    'competition_transition_movements_v1',
    'developing_team_service_config',
    'game_world_reset_checkpoints',
    'game_world_reset_runs',
    'game_world_reset_s1_competition_baseline_v1',
    'inactive_club_transition_audit_v1',
    'race_engine_runtime_control_v1',
    'race_stage_simulation_events',
    'race_team_stage_disqualifications',
    'race_timeline_rollback_audit_v1',
    'rider_contract_transition_audit_v1',
    'rider_health_case_context_v1',
    'rider_training_accident_decisions_v1',
    'season_transition_component_readiness_v1',
    'season_transition_control_v1',
    'season_transition_engine_events_v2',
    'season_transition_engine_runs_v2',
    'season_transition_lab_checkpoints_v1',
    'season_transition_lab_clone_quarantine_v1',
    'season_transition_protected_tables_v1',
    'season_transition_runs_v1',
    'season_transition_timeline_history_v1',
    'sponsor_transition_audit_v1',
    'staff_advisory_config',
    'staff_advisory_medical_case_state',
    'staff_contract_transition_audit_v1',
    'transfer_market_stock_policy_v1',
    'travel_country_geography_v1'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- Public/read-only reference or race/status read-models.
-- These preserve existing frontend SELECT behaviour while RLS blocks anon/auth writes.
create policy "competition_transition_movements_public_read"
on public.competition_transition_movements_v1
for select
to anon, authenticated
using (true);

create policy "game_world_reset_s1_competition_baseline_public_read"
on public.game_world_reset_s1_competition_baseline_v1
for select
to anon, authenticated
using (true);

create policy "race_engine_runtime_control_public_read"
on public.race_engine_runtime_control_v1
for select
to anon, authenticated
using (true);

create policy "race_stage_simulation_events_public_read"
on public.race_stage_simulation_events
for select
to anon, authenticated
using (true);

create policy "race_team_stage_disqualifications_public_read"
on public.race_team_stage_disqualifications
for select
to anon, authenticated
using (true);

create policy "season_transition_component_readiness_public_read"
on public.season_transition_component_readiness_v1
for select
to anon, authenticated
using (true);

create policy "season_transition_control_public_read"
on public.season_transition_control_v1
for select
to anon, authenticated
using (true);

create policy "season_transition_timeline_history_public_read"
on public.season_transition_timeline_history_v1
for select
to anon, authenticated
using (true);

create policy "transfer_market_stock_policy_public_read"
on public.transfer_market_stock_policy_v1
for select
to anon, authenticated
using (true);

create policy "travel_country_geography_public_read"
on public.travel_country_geography_v1
for select
to anon, authenticated
using (true);

-- Private health/training tables.
-- Authenticated users can read rows for their own club or parent/development club only.
create policy "rider_health_case_context_own_club_read"
on public.rider_health_case_context_v1
for select
to authenticated
using (
  exists (
    select 1
    from public.clubs c
    left join public.clubs parent_club on parent_club.id = c.parent_club_id
    where c.id = rider_health_case_context_v1.club_id
      and (
        c.owner_user_id = auth.uid()
        or parent_club.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.club_memberships cm
          where cm.club_id = c.id
            and cm.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.club_memberships parent_cm
          where parent_cm.club_id = parent_club.id
            and parent_cm.user_id = auth.uid()
        )
      )
  )
  or exists (
    select 1
    from public.club_riders cr
    join public.clubs c on c.id = cr.club_id
    left join public.clubs parent_club on parent_club.id = c.parent_club_id
    where cr.rider_id = rider_health_case_context_v1.rider_id
      and (
        c.owner_user_id = auth.uid()
        or parent_club.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.club_memberships cm
          where cm.club_id = c.id
            and cm.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.club_memberships parent_cm
          where parent_cm.club_id = parent_club.id
            and parent_cm.user_id = auth.uid()
        )
      )
  )
);

create policy "rider_training_accident_decisions_own_club_read"
on public.rider_training_accident_decisions_v1
for select
to authenticated
using (
  exists (
    select 1
    from public.clubs c
    left join public.clubs parent_club on parent_club.id = c.parent_club_id
    where c.id = rider_training_accident_decisions_v1.club_id
      and (
        c.owner_user_id = auth.uid()
        or parent_club.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.club_memberships cm
          where cm.club_id = c.id
            and cm.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.club_memberships parent_cm
          where parent_cm.club_id = parent_club.id
            and parent_cm.user_id = auth.uid()
        )
      )
  )
  or exists (
    select 1
    from public.club_riders cr
    join public.clubs c on c.id = cr.club_id
    left join public.clubs parent_club on parent_club.id = c.parent_club_id
    where cr.rider_id = rider_training_accident_decisions_v1.rider_id
      and (
        c.owner_user_id = auth.uid()
        or parent_club.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.club_memberships cm
          where cm.club_id = c.id
            and cm.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.club_memberships parent_cm
          where parent_cm.club_id = parent_club.id
            and parent_cm.user_id = auth.uid()
        )
      )
  )
);

commit;
