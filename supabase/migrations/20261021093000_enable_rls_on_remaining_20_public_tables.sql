-- ProPeloton Manager / 2026-10-21
-- Narrow follow-up for 20 newly introduced tables without RLS.
-- Prior Security Definer View rollback stays intentionally unchanged:
-- don't mass-convert standings/statistics views to security_invoker=true.
-- Writes remain backend / SECURITY DEFINER RPC; no frontend DML policies.
-- Audited: existing frontend code retrieves nations/youth/team policy via RPCs,
-- and functions with direct references to these tables are security-definer.
-- Review & release via PR; NOT auto-applied on production by a Git push.
begin;

alter table public.admin_shadow_validation_runs_v1 enable row level security;
alter table public.championship_calendar_draw_state_v1 enable row level security;
alter table public.premium_trial_claim_history_v1 enable row level security;
alter table public.premium_trial_launch_v1 enable row level security;
alter table public.premium_welcome_trials_v1 enable row level security;
alter table public.race_engine_calculation_survival_audit_v1 enable row level security;
alter table public.race_engine_due_stage_watchdog_v1 enable row level security;
alter table public.race_safe_checkpoint_frames_v1 enable row level security;
alter table public.race_safe_checkpoint_shards_v1 enable row level security;
alter table public.race_safe_checkpoint_transfer_chunks_v1 enable row level security;
alter table public.race_stage_safe_calculation_v1 enable row level security;
alter table public.rider_skill_snapshot_week_health_v1 enable row level security;
alter table public.youth_academy_service_config enable row level security;
alter table public.nations_competition_schedule_config enable row level security;
alter table public.youth_competition_transition_movements_v1 enable row level security;
alter table public.youth_team_standing_history_v1 enable row level security;
alter table public.race_eligibility_notification_state enable row level security;
alter table public.team_policy_nonrecurring_charge_state_v1 enable row level security;
alter table public.team_policy_rider_effect_log_v1 enable row level security;
alter table public.national_association_renewal_coin_events enable row level security;

-- Global game reference and historical standings: signed-in read only.

drop policy if exists "nations_competition_schedule_config_authenticated_read" on public.nations_competition_schedule_config;
create policy "nations_competition_schedule_config_authenticated_read"
on public.nations_competition_schedule_config for select to authenticated using (true);

drop policy if exists "youth_competition_transition_movements_v1_authenticated_read" on public.youth_competition_transition_movements_v1;
create policy "youth_competition_transition_movements_v1_authenticated_read"
on public.youth_competition_transition_movements_v1 for select to authenticated using (true);

drop policy if exists "youth_team_standing_history_v1_authenticated_read" on public.youth_team_standing_history_v1;
create policy "youth_team_standing_history_v1_authenticated_read"
on public.youth_team_standing_history_v1 for select to authenticated using (true);

-- Financial coin events: only the event's user may read their own rows.
drop policy if exists "national_association_renewal_coin_events_own_read"
  on public.national_association_renewal_coin_events;
create policy "national_association_renewal_coin_events_own_read"
on public.national_association_renewal_coin_events
for select to authenticated
using (user_id = (select auth.uid()));

-- Club operational details: parent-club owners and memberships are supported.

drop policy if exists "race_eligibility_notification_state_own_club_read" on public.race_eligibility_notification_state;
create policy "race_eligibility_notification_state_own_club_read"
on public.race_eligibility_notification_state
for select to authenticated
using (exists (
    select 1
    from public.clubs c
    left join public.clubs parent on parent.id = c.parent_club_id
    where c.id = race_eligibility_notification_state.club_id
      and (
        c.owner_user_id = (select auth.uid())
        or parent.owner_user_id = (select auth.uid())
        or exists (
          select 1 from public.club_memberships cm
          where cm.club_id = c.id and cm.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.club_memberships pcm
          where pcm.club_id = parent.id and pcm.user_id = (select auth.uid())
        )
      )
  ));

drop policy if exists "team_policy_nonrecurring_charge_state_v1_own_club_read" on public.team_policy_nonrecurring_charge_state_v1;
create policy "team_policy_nonrecurring_charge_state_v1_own_club_read"
on public.team_policy_nonrecurring_charge_state_v1
for select to authenticated
using (exists (
    select 1
    from public.clubs c
    left join public.clubs parent on parent.id = c.parent_club_id
    where c.id = team_policy_nonrecurring_charge_state_v1.club_id 
      and (
        c.owner_user_id = (select auth.uid())
        or parent.owner_user_id = (select auth.uid())
        or exists (
          select 1 from public.club_memberships cm
          where cm.club_id = c.id and cm.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.club_memberships pcm
          where pcm.club_id = parent.id and pcm.user_id = (select auth.uid())
        )
      )
  ));

drop policy if exists "team_policy_rider_effect_log_v1_own_club_read" on public.team_policy_rider_effect_log_v1;
create policy "team_policy_rider_effect_log_v1_own_club_read"
on public.team_policy_rider_effect_log_v1
for select to authenticated
using (exists (
    select 1
    from public.clubs c
    left join public.clubs parent on parent.id = c.parent_club_id
    where c.id = team_policy_rider_effect_log_v1.club_id 
      and (
        c.owner_user_id = (select auth.uid())
        or parent.owner_user_id = (select auth.uid())
        or exists (
          select 1 from public.club_memberships cm
          where cm.club_id = c.id and cm.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.club_memberships pcm
          where pcm.club_id = parent.id and pcm.user_id = (select auth.uid())
        )
      )
  ));

-- Remaining 13 internal tables have NO SELECT/DML frontend policies.
-- service_role and table-owning backend functions keep their bypass capabilities.
commit;
