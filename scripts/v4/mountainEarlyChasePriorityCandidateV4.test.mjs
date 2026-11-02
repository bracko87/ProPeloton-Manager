import assert from 'node:assert/strict'
import {patchV4MountainEarlyChasePriorityCandidateSource as patch} from './mountainEarlyChasePriorityCandidateV4.mjs'
const pace="    effectivePelotonPaceKmh = clamp(\n      stepReferencePaceKmh *\n        pelotonComponents.selectedResponseMultiplier *"
const multiplier="        pelotonComponents.selectedResponseMultiplier *\n        (chasingTeamIds.length === 0 ? 0.97 : 1) *"
assert.throws(()=>patch('wrong source'),/anchor drift/)
assert.throws(()=>patch(pace+'\n'+pace+'\n'+multiplier),/anchor drift/)
assert.throws(()=>patch('head'+pace+'\n'+multiplier,{gain:0.03}),/gain/)
assert.throws(()=>patch('head'+pace+'\n'+multiplier,{gain:-1}),/gain/)
const changed=patch('head\n'+pace+'\n'+multiplier+'\nfooter')
assert(changed.includes("phase.behaviour==='chase'"))
assert(changed.includes('phase2WorkerEnergyFraction'))
assert(changed.includes('v4Phase2ChasePriorityMultiplier'))
assert(changed.includes('1+0.012*v4Phase2ExplicitCommitmentFraction'))
assert(!changed.includes('forceCatch')&&!changed.includes('targetGap'))
const baseline=patch('head\n'+pace+'\n'+multiplier,{gain:0})
assert(baseline.includes('1+0*v4Phase2ExplicitCommitmentFraction'))
console.log('V4_EARLY_CHASE_PRIORITY_UNIT '+JSON.stringify({status:'PASS',researchOnly:true,productionChanges:0}))
