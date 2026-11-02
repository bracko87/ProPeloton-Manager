import assert from 'node:assert/strict'
import {patchV4MountainChaseEfficiencyCandidateSource as patch} from './mountainChaseEfficiencyCandidateV4.mjs'
const anchor='    const effectivePelotonPaceKmh = deterministicRound('
const mul='        unopposedPhysicalPelotonPaceKmh *\n          calculateBaselinePelotonCruiseMultiplierV1('
assert.throws(()=>patch('wrong source'),/anchor drift/)
assert.throws(()=>patch(anchor+anchor+mul),/anchor drift/)
const changed=patch('head\n'+anchor+'\n'+mul+'\ntail')
assert(changed.includes('effectiveExplicitChaserCount-1'))
assert(changed.includes('currentGapSeconds>0'))
assert(changed.includes('v4MountainChaseEnergyFraction'))
assert(changed.includes('unopposedPhysicalPelotonPaceKmh * v4MountainChaseEfficiency'))
assert(!changed.includes('forceCatch')&&!changed.includes('targetGap'))
console.log('V4_CHASE_EFFICIENCY_CANDIDATE_UNIT '+JSON.stringify({status:'PASS',isolated:true,productionWrites:0}))
