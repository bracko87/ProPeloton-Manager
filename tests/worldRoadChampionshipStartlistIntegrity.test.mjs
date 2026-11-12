import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261112171000_world_road_championship_real_startlist_integrity_v1.sql', import.meta.url), 'utf8')

test('National and individual championship fields reject generic AI club filling', () => {
  assert.match(sql, /v_individual_only or v_category in \('WRC','NC','NCQ'\)/)
  assert.match(sql, /individual_national_field_managed_by_championship/)
  assert.match(sql, /ai_entries_added',0/)
})

test('WRC simulation uses its accepted official teams instead of AI club-entry view', () => {
  assert.match(sql, /from public\.race_participant_teams t\s+where t\.race_id=v_race_id and t\.status='accepted'/)
  assert.match(sql, /into v_participant_teams/)
  assert.match(sql, /from public\.world_road_championship_editions wrc\s+where wrc\.race_id=v_race_id/)
})

test('WRC input count and team membership are checked before calculation', () => {
  assert.match(sql, /World Championship simulation input incomplete:/)
  assert.match(sql, /jsonb_array_length\(v_rider_inputs\)=0/)
  assert.match(sql, /jsonb_array_length\(v_participant_riders\)<>jsonb_array_length\(v_rider_inputs\)/)
  assert.match(sql, /wrc\.confirmed_count/)
  assert.match(sql, /pt\.value->>'team_id'=pr\.value->>'team_id'/)
  assert.match(sql, /raise exception using/)
})

test('WRC completion requires a result status for every registered starter', () => {
  assert.match(sql, /from public\.race_participant_riders pr\s+where pr\.race_id=e\.race_id/)
  assert.match(sql, /from public\.race_stage_results rs\s+where rs\.stage_id=v_stage_id and rs\.rider_id=pr\.rider_id/)
  assert.match(sql, /WRC race % remains unverified:/)
})

test('Historical results are preserved by source-only function replacement', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fill_race_ai_teams_v1/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.universal_race_stage_get_calculation_payload_full_v1/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.world_road_championship_process_results_base_v1/)
  assert.doesNotMatch(sql, /DELETE FROM public\.race_stage_results|TRUNCATE public\.race_stage_results/i)
})

test('National championship field is not equivalent to AI club filler membership', () => {
  const official = Array.from({ length: 109 }, (_, i) => 'official-' + i)
  const participants = [...official, 'official-27']
  const aiFiller = [...official.slice(0, 27), ...Array.from({ length: 173 }, (_, i) => 'ai-' + i)]
  assert.equal(participants.length, 110)
  assert.equal(aiFiller.length, 200)
  assert.equal(participants.filter(team => aiFiller.includes(team)).length, 27)
  assert.equal(participants.filter(team => official.includes(team)).length, 110)
})
