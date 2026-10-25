import assert from 'node:assert/strict'
import {calculateSlipstreamResponseCandidateV3 as follow} from '../../src/race-engine-v3/slipstreamResponseCandidateV3.ts'
const base={ownUnassistedSpeedMps:11,frontSpeedMps:14,gapMeters:8,gradePercent:0,crosswindKph:0,wetness:0,cobbled:false,liveEnergy:.8,leaderAttacking:false,followerChasing:false}
const near=follow(base)
const far=follow({...base,gapMeters:80})
assert(near.proposedSpeedMps>far.proposedSpeedMps)
assert(near.proposedSpeedMps>base.ownUnassistedSpeedMps)
assert(near.proposedSpeedMps<=near.supportedMaximumMps)
assert(far.proposedSpeedMps-base.ownUnassistedSpeedMps<.1)
const before=follow({...base,gapMeters:23.99}).proposedSpeedMps
const after=follow({...base,gapMeters:24.01}).proposedSpeedMps
assert(Math.abs(before-after)<.01,'Cannot cross a 24 metre speed cliff')
for(let gap=0;gap<80;gap+=.2){
 const a=follow({...base,gapMeters:gap}).proposedSpeedMps
 const b=follow({...base,gapMeters:gap+.2}).proposedSpeedMps
 assert(a>=b-1e-9,'Shelter must not increase with physical separation')
 assert(Math.abs(a-b)<.1,'Spurious jump from tiny distance perturbation')
}
const attacking=follow({...base,leaderAttacking:true})
const orderedChase=follow({...base,leaderAttacking:true,followerChasing:true})
assert(attacking.proposedSpeedMps<near.proposedSpeedMps,'An uncommanded rider cannot inherit full attack speed')
assert(orderedChase.proposedSpeedMps>attacking.proposedSpeedMps,'Explicit chase makes a physical difference')
const crosswind=follow({...base,crosswindKph:30})
const steep=follow({...base,gradePercent:9})
const spent=follow({...base,liveEnergy:.1})
assert(crosswind.proposedSpeedMps<near.proposedSpeedMps)
assert(steep.proposedSpeedMps===base.ownUnassistedSpeedMps,'Steep climbs must not get flat-road slipstream speed')
assert(spent.proposedSpeedMps<near.proposedSpeedMps)
assert.throws(()=>follow({...base,frontSpeedMps:Infinity}))
assert.throws(()=>follow({...base,gapMeters:-.1}))
assert.throws(()=>follow({...base,liveEnergy:2}))
console.log('PASS smooth draft response across 24m, fatigue, attacking front, explicit chase, wind and gradient')
console.log(JSON.stringify({closeSpeed:near.proposedSpeedMps,farSpeed:far.proposedSpeedMps,at23_99:before,at24_01:after,passiveAttackFollowing:attacking.proposedSpeedMps,explicitChase:orderedChase.proposedSpeedMps},null,2))
