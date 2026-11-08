import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const base = readFileSync('src/universal-race-engine/runRaceEngineReplayCpuOptimizedV1.ts', 'utf8')
const pilot = readFileSync('src/universal-race-engine/runRaceEngineReplayCpuOptimizedBreakawayTierPilotV1.ts', 'utf8')
const header = [
  '// Tour of Angola Stage 1 prospective breakaway recovery-debt canary.',
  '// Sporting phases, stage results, and replay physics are unchanged from',
  '// runRaceEngineReplayCpuOptimizedV1.ts; only post-stage recovery for this',
  '// exact unstarted stage is extended. Never apply to historic checkpoints.',
  '',
].join('\n')
assert.ok(pilot.startsWith(header), 'Canary provenance header changed')
let normalized = pilot.slice(header.length)
function replaceExactly(from, to, name) {
  const occurrences = normalized.split(from).length - 1
  assert.equal(occurrences, 1, 'Expected one ' + name + ', got ' + occurrences)
  normalized = normalized.replace(from, to)
}
replaceExactly(
  '  /** Physical exposure for the specific protected rollout stage, if enabled. */\n' +
  '  readonly breakawayExposureKm?: number\n' +
  '  /** Incremental fatigue load (20/50/100 km tiers), never live-energy physics. */\n' +
  '  readonly breakawayRecoveryDebtLoad?: number\n',
  '',
  'rider update schema extension',
)
const helperStart = '/** Per-event rollout prevents changes to in-flight or historical sporting outcomes. */'
const helperEnd = 'export function buildUniversalPostStageUpdateSummary('
const h0 = normalized.indexOf(helperStart)
const h1 = normalized.indexOf(helperEnd, h0)
assert.ok(h0 > 0 && h1 > h0, 'Missing isolated tier helper')
const helperBlock = normalized.slice(h0, h1)
assert.ok(helperBlock.includes('cc502605-4cd0-4e7f-aeed-5bdfa2417fdb'), 'Expected Angola Stage 1 gate')
assert.equal((helperBlock.match(/'[0-9a-f-]{36}'/g) ?? []).length, 1, 'Only one stage canary may be enabled')
const fnMatch = helperBlock.match(/export function calculateBreakawayTierFatigueDebt\(distanceKm: number\): number \{([\s\S]*?)\n\}/)
assert.ok(fnMatch, 'Missing callable tier formula')
const fn = runInNewContext(
  '(function(distanceKm) {' + fnMatch[1] + '\n})',
  {
    Math,
    Number,
    clamp: (n, lower, upper) => Math.max(lower, Math.min(upper, n)),
    deterministicRound: (n, decimals) => Math.round((n + Number.EPSILON) * 10 ** decimals) / 10 ** decimals,
  },
)
for (const [km, expected] of [[0, 0], [20, 0], [21, 0.15], [50, 4.5], [60, 7.3], [100, 18.5], [120, 27.5], [126, 30.2]]) {
  assert.ok(Math.abs(fn(km) - expected) < 1e-6, 'Tier fatigue ' + km + 'km must equal ' + expected + ', got ' + fn(km))
}
normalized = normalized.slice(0, h0) + normalized.slice(h1)
const mapStart = '  const phase4 = roadRaceResolution.phase4Finish\n\n  const breakawayTierPilotEnabled ='
const mapEnd = '  const phase2EnergyByRiderId ='
const m0 = normalized.indexOf(mapStart)
const m1 = normalized.indexOf(mapEnd, m0)
assert.ok(m0 > 0 && m1 > m0, 'Missing physical-membership source adapter')
const mapText = normalized.slice(m0, m1)
for (const key of ['acceptedEscapeLaunch', 'breakawayRiderIdsAtStart', 'physicalEscapeRiderIdsAtStart', 'breakawayCaught', 'escapeRiderIdsAtStart']) {
  assert.ok(mapText.includes(key), 'Missing physical breakaway source ' + key)
}
normalized = normalized.slice(0, m0)
  + '  const phase4 = roadRaceResolution.phase4Finish\n'
  + normalized.slice(m1)
const exposureStart = '      const breakawayExposureKm = breakawayTierPilotEnabled\n'
const exposureEnd = '      const distanceLoad = eligibleToStart\n'
const e0 = normalized.indexOf(exposureStart)
const e1 = normalized.indexOf(exposureEnd, e0)
assert.ok(e0 > 0 && e1 > e0, 'Missing rider-specific physical distance')
normalized = normalized.slice(0, e0) + normalized.slice(e1)
replaceExactly(
  '              exhaustionDebtLoad +\n              breakawayRecoveryDebtLoad,\n            6,',
  '              exhaustionDebtLoad,\n            6,',
  'gross fatigue canary',
)
replaceExactly(
  '        ...(breakawayTierPilotEnabled\n          ? { breakawayExposureKm, breakawayRecoveryDebtLoad }\n          : {}),\n',
  '',
  'canary rider output audit fields',
)
assert.equal(normalized, base, 'Any change outside guarded post-stage recovery invalidates the frozen sporting physics')
console.log('PASS canary unchanged physical engine / replay; only Angola Stage 1 post-stage tier debt added')
console.log('PASS 20/50/100+km tier formula: 20=0; 50=4.5; 100=18.5; 126=30.2 extra fatigue load')
