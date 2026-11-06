-- GP Rijeka–Split (Season 1) / BK Novi Beograd one-off race entry
-- READ-ONLY RELEASE PREFLIGHT. No transaction, DML, DDL, or deadline changes.
-- IMPORTANT: run with authorized access. Do NOT select/remove an AI entry by
-- guessing; inspect real owners and accepted applications first.
-- User request: replace exactly ONE AI team, preserve 16 accepted teams and
-- allow ONLY BK Novi Beograd to edit its race preparation until submission.
-- Issue: https://github.com/bracko87/ProPeloton-Manager/issues/213

-- 1. Confirm correct race (a similar race exists in Season 2).
select id, name, start_date, end_date, status, stage_count, category
from public.races
where id in (
  '64646309-c9ca-49de-90e3-bc1402a7e24a',
  '6b29ae7b-f2a2-beb9-6e44-2830f91fc07b'
)
order by start_date;

-- 2. Confirm both the real player team and accepted entries (the previously
-- observed test-club ID MUST be independently verified, not blindly trusted).
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'clubs','race_team_applications','race_preparations',
    'race_preparation_riders','race_participant_riders',
    'race_stage_plans','race_entry_rules'
  )
order by table_name, ordinal_position;

select *
from public.clubs
where name = 'BK Novi Beograd'
   or id = '49caba57-9a5e-4820-b4bf-06cfc684e8b2';

select id, race_id, team_id, application_status, source_type,
       selected_rider_count, created_by_user_id, metadata
from public.race_team_applications
where race_id = '64646309-c9ca-49de-90e3-bc1402a7e24a'
order by application_status, source_type, team_id;

-- 3. Existing entrants, start-list rows and engine jobs.
select team_id, count(*) as entered_riders
from public.race_participant_riders
where race_id = '64646309-c9ca-49de-90e3-bc1402a7e24a'
group by team_id order by entered_riders desc,team_id;

select stage_id, status, engine_version, created_at, updated_at
from public.race_stage_simulation_runs
where race_id = '64646309-c9ca-49de-90e3-bc1402a7e24a'
order by created_at;

-- 4. Existing preparation state: a genuine submitted/locked plan must never
-- be reverted to editable. If any race processing is underway STOP.
select *
from public.race_preparations
where race_id = '64646309-c9ca-49de-90e3-bc1402a7e24a';

select id, race_preparation_id, stage_number, stage_date, status,
       locks_on_game_date, submitted_at, locked_at
from public.race_stage_plans
where race_id = '64646309-c9ca-49de-90e3-bc1402a7e24a'
order by stage_number;

-- 5. Inspect exact backend functions and target calculation before designing
-- any race-specific grant. Late-entry permission must be checked consistently
-- by BOTH draft-save and submission RPCs, the overview UI, and stage-plan
-- save RPCs, without altering general race deadlines.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'save_race_preparation_draft_for_squad_v1',
    'submit_race_preparation_for_squad_v1',
    'get_next_race_preparation_target_v1',
    'get_race_preparation_squad_options_v1'
  )
order by p.proname, arguments;

-- RELEASE CRITERIA FOR ANY FOLLOW-ON MUTATION:
-- * One AI-controlled accepted team (verified by ownership, not merely name).
-- * BK Novi Beograd legitimately owned by the authenticated user.
-- * Exactly 16 accepted entries before AND after the swap.
-- * Remove/reconcile displaced AI riders, drafts and start-list dependencies.
-- * Do NOT affect the Season 2 race or other players.
-- * One-race and one-club grace rule: save/edit valid only before first submit;
--   after submit it must permanently lock; no global deadline extension.
-- * Test save, resave, submit, repeat submit and post-submit save rejection.
-- * Never alter completed stage simulations or historical race results.
