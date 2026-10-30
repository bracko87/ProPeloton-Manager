import assert from 'node:assert/strict'
import {reconcileV4ReplayBridgeMergeTargets} from './bridgeHandoffV4.ts'
const mk=(fields={})=>({
 displayCode:'F2',mergedIntoOpeningBreakaway:true,
 mergeTargetDisplayCode:'B1',mergeKm:111.5,
 gapSamples:[{gapToLeaderSeconds:9,gapToPelotonSeconds:340},
             {gapToLeaderSeconds:0,gapToPelotonSeconds:330}],
 ...fields
})
const ctx={openingBreakawayCarriesIntoPhase4:false,
 activeFrontDisplayCode:'F1',mergeToleranceSeconds:5}
const original=mk()
const [fixed]=reconcileV4ReplayBridgeMergeTargets([original],ctx)
assert.equal(fixed.mergeTargetDisplayCode,'F1')
assert.equal(fixed.mergeKm,original.mergeKm)
assert.deepEqual(fixed.gapSamples,original.gapSamples)
assert.equal(original.mergeTargetDisplayCode,'B1')
assert.notStrictEqual(fixed,original)
const noAliasCases=[
 [mk(),{...ctx,openingBreakawayCarriesIntoPhase4:true}],
 [mk(),{...ctx,activeFrontDisplayCode:'B1'}],
 [mk({mergeKm:null}),ctx],
 [mk({mergedIntoOpeningBreakaway:false}),ctx],
 [mk({mergeTargetDisplayCode:'F1'}),ctx],
 [mk({gapSamples:[{gapToLeaderSeconds:2,gapToPelotonSeconds:320}]}),ctx],
 [mk({gapSamples:[{gapToLeaderSeconds:0,gapToPelotonSeconds:3}]}),ctx],
 [mk({gapSamples:[]}),ctx]
]
for(const [bridge,context] of noAliasCases){
 const [same]=reconcileV4ReplayBridgeMergeTargets([bridge],context)
 assert.strictEqual(same,bridge,'unsafe alias must preserve identity')
}
assert.throws(()=>reconcileV4ReplayBridgeMergeTargets([original],
 {...ctx,mergeToleranceSeconds:-1}),/tolerance/)
assert.equal(reconcileV4ReplayBridgeMergeTargets([fixed],ctx)[0],fixed,
 'normalizing twice must be idempotent')
console.log('V4_BRIDGE_HANDOFF_UNIT_REPORT '+JSON.stringify({
 status:'PASS',validatedZeroGapMergeOnly:true,
 staleB1ToCurrentF1:true,originalPhysicsUnmodified:true,
 preservesUnmergedAndNearPeloton:true,negativeCases:noAliasCases.length,
 idempotent:true,productionWrites:0
}))
