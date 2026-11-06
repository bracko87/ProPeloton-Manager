// Contract checks for the live-backed, deterministic national-rider attack
// selection SQL. This script is side-effect-free: production verification is
// performed separately through the read-only phase-command RPC.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const sql = readFileSync('scripts/sql/national_individual_ai_opening_attacks_v1.sql','utf8')
for(const guard of [
  "stage.is_national_championship",
  "stage.distance_km >= 40",
  "stage.stage_date >= date '2000-10-24'",
  "n.normalized_phase_1 = 'follow_team_plan'",
  "saved.updated_by_user_id is not null",
  "owner.owner_user_id is not null",
  "not exists (",
  "attack_draw < 343597384",
  "limit 5",
  "when stage.is_national_championship and nat_attack.rider_id is not null then 'attack'",
  "when n.normalized_phase_1 <> 'follow_team_plan' then n.normalized_phase_1",
  "when stage.is_national_championship then 'ride_naturally'",
]) {
  assert.ok(sql.includes(guard), `Missing required guard: ${guard}`)
}
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\.race_engine_get_stage_phase_commands_v1\(/g)||[]).length, 1)
assert.ok(sql.trimEnd().endsWith('$function$;'))
assert.ok(!sql.includes('random()'), 'Using PostgreSQL random() would break deterministic replay')
assert.ok(!sql.includes('UPDATE public.race_stage_results'))
assert.ok(!sql.includes('DELETE FROM public.race_stage'))
console.log('PASS: AI-only, human-ownership, eligibility, old-stage and replay protections')

const draw = (stageId, riderId) => Number.parseInt(
 createHash('md5').update(`${stageId}:national-ai-opening-attack-v1:${riderId}`).digest('hex').slice(0,8),16
)
const pick = (stageId, riders) => riders
  .filter(r => !r.humanControlled && !r.humanSaved && r.available && r.command === 'follow_team_plan')
  .map(r => ({id:r.id,roll:draw(stageId,r.id)}))
  .filter(r => r.roll < 343597384)
  .sort((a,b) => a.roll - b.roll || a.id.localeCompare(b.id))
  .slice(0,5).map(r => r.id)

const riders = Array.from({length:120},(_,i)=>({
  id: `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
  humanControlled: i<5, humanSaved:i===5, available:i!==6,
  command: i===7?'attack':'follow_team_plan',
}))
const chosen = pick('00000000-0000-4000-8000-123456789000',riders)
assert.ok(chosen.length>0 && chosen.length<=5)
assert.deepEqual(pick('00000000-0000-4000-8000-123456789000',riders),chosen)
for(const chosenId of chosen){
  const r=riders.find(x=>x.id===chosenId)
  assert.ok(r && !r.humanControlled && !r.humanSaved && r.available && r.command==='follow_team_plan')
}
console.log(`PASS: replay-stable draw and cap; synthetic selected attacks=${chosen.length}`)
