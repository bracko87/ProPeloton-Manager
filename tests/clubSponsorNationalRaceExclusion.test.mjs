import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const setup = read('supabase/migrations/20261113092500_exclude_national_races_from_club_sponsorship_v1.sql')
const progress = read('supabase/migrations/20261113093500_exclude_national_races_from_sponsor_progress_v1.sql')

test('only eligible club competitions may be selected for sponsor objectives', () => {
  assert.match(setup, /CREATE OR REPLACE FUNCTION public\.sponsor_race_allowed_for_club_objective_v1/)
  for (const excluded of ['NC','NCQ','WRC','WNF','WNQ']) {
    assert.ok(setup.includes("'" + excluded + "'"), excluded)
  }
  for (const key of ['individual_only','national_championship','nations_competition','national_team_only']) {
    assert.ok(setup.includes(key), key)
  }
  for (const legitimate of ['1.2','2.2','1.Pro','2.Pro','1.UWT','2.UWT']) {
    assert.ok(setup.includes("'" + legitimate + "'"), legitimate)
  }
})

test('all sponsor offer generators and legacy race attachment filter ineligible races', () => {
  for (const name of [
    'sponsor_build_offer_preview_objectives_v1',
    'sponsor_build_offer_preview_objectives_v2',
    'sponsor_build_offer_preview_objectives_v3',
    'sponsor_build_offer_preview_objectives_v4',
    'sponsor_attach_race_targets_to_main_sponsor_v1'
  ]) {
    assert.ok(setup.includes('CREATE OR REPLACE FUNCTION public.' + name),name)
  }
  assert.ok((setup.match(/where public\.sponsor_race_allowed_for_club_objective_v1\(r\.id\)/g)||[]).length>=14)
})

test('signed previews and database triggers cannot reassign an individual/national race', () => {
  assert.match(setup, /CREATE OR REPLACE FUNCTION public\.sponsor_sync_signed_offer_preview_objectives_v1/)
  assert.match(setup, /CREATE OR REPLACE FUNCTION public\.sponsor_enforce_club_race_objective_v1/)
  assert.match(setup, /CREATE OR REPLACE FUNCTION public\.sponsor_enforce_club_offer_preview_v1/)
  assert.match(setup, /CREATE TRIGGER trg_sponsor_enforce_club_race_objective_v1/)
  assert.match(setup, /CREATE TRIGGER trg_sponsor_enforce_club_offer_preview_v1/)
  assert.match(setup, /National and individual-only competitions cannot be club sponsor goals/)
})

test('current invalid goal is archived before removal without affecting other contract payments', () => {
  assert.match(setup, /private\.sponsor_national_goal_cleanup_audit_v1/)
  assert.match(setup, /REVOKE ALL ON private\.sponsor_national_goal_cleanup_audit_v1/)
  assert.match(setup, /sponsor\.season_number=2 AND sponsor\.status='active'/)
  assert.match(setup, /obj\.payout_transaction_id IS NULL/)
  assert.match(setup, /DELETE FROM public\.club_sponsor_objectives/)
  assert.match(setup, /national_individual_objectives_removed_without_replacement/)
  assert.match(setup, /sponsor_build_offer_preview_objectives_v4/)
  assert.doesNotMatch(setup, /UPDATE public\.game_clock_config|UPDATE public\.game_state/i)
  assert.doesNotMatch(setup, /DELETE FROM public\.race_stage_results/i)
})

test('national-only events cannot produce sponsor results, visibility, or bonuses', () => {
  for (const name of [
    'sponsor_process_objectives_for_race_v1',
    'sponsor_process_visibility_objectives_for_race_v1',
    'sponsor_count_market_result_progress_v1',
    'sponsor_count_visibility_progress_v1',
    'sponsor_suggest_visibility_target_value_v1'
  ]) {
    assert.ok(progress.includes('CREATE OR REPLACE FUNCTION public.' + name),name)
  }
  assert.match(progress,/reason','national_or_individual_event'/)
  assert.ok((progress.match(/sponsor_race_allowed_for_club_objective_v1/g)||[]).length>=5)
  assert.doesNotMatch(progress,/UPDATE public\.game_state|DELETE FROM public\.race_stage_results/i)
})
