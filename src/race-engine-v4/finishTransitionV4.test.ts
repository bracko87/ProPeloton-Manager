import assert from 'node:assert/strict'
import {reconcileV4FinishTransition,preserveV4FinishGroupGap,canonicalV4OfficialFinishGap} from './finishTransitionV4.ts'
const context={
 allTransitionsAreFrontCaughtByPeloton:true,
 changedRiderIds:['rider-024'],
 finalDisplayCodes:['B1','P'],
 bridgeGroups:[{riderIds:['rider-024'],caughtByPeloton:false,catchKm:null,gapSamples:[{gapToPelotonSeconds:2.964}]}],
 breakawaySurvived:true,breakawayCaught:false,physicalEndGapSeconds:34.839712,officialFinishGroupingToleranceSeconds:5
}
const classification=reconcileV4FinishTransition(context)
assert.deepEqual(classification,{
 officialGroupingWithoutPhysicalCatch:true,
 eventType:'catch',
 title:'Front group joins the official peloton finish group',
 usePhysicalPelotonGapAtTransition:true
})
const truePhysicalCatch=reconcileV4FinishTransition({
 ...context,bridgeGroups:[{riderIds:['rider-024'],caughtByPeloton:true,catchKm:119.99}]
})
assert.equal(truePhysicalCatch.eventType,'catch')
assert.equal(truePhysicalCatch.officialGroupingWithoutPhysicalCatch,false)
assert.equal(truePhysicalCatch.usePhysicalPelotonGapAtTransition,false)
assert.equal(reconcileV4FinishTransition({...context,finalDisplayCodes:['P']}).eventType,'catch')
assert.equal(reconcileV4FinishTransition({...context,breakawaySurvived:false}).eventType,'catch')
assert.equal(reconcileV4FinishTransition({...context,physicalEndGapSeconds:0}).eventType,'catch')
assert.equal(reconcileV4FinishTransition({...context,changedRiderIds:['rider-024','rider-033']}).eventType,'catch')
assert.equal(reconcileV4FinishTransition({...context,allTransitionsAreFrontCaughtByPeloton:false}).eventType,'group_split')
assert.equal(reconcileV4FinishTransition({...context,bridgeGroups:[]}).usePhysicalPelotonGapAtTransition,false)
assert.equal(reconcileV4FinishTransition({...context,officialFinishGroupingToleranceSeconds:2}).usePhysicalPelotonGapAtTransition,false)
assert.equal(reconcileV4FinishTransition({...context,bridgeGroups:[{riderIds:['rider-024'],caughtByPeloton:false,catchKm:null,gapSamples:[{gapToPelotonSeconds:6}]}]}).usePhysicalPelotonGapAtTransition,false)

assert.equal(preserveV4FinishGroupGap(5.18724,false),5.18724)
assert.equal(preserveV4FinishGroupGap(5.468381,false),5.468381)
assert.equal(preserveV4FinishGroupGap(5,false),5)
assert.equal(preserveV4FinishGroupGap(5.468381,true),5)
assert.equal(preserveV4FinishGroupGap(-1,false),0)
assert.equal(preserveV4FinishGroupGap(5.18724,false)-preserveV4FinishGroupGap(0,false)>5,true)
assert.equal(preserveV4FinishGroupGap(5.468381,false)-preserveV4FinishGroupGap(0,false)>5,true)
assert.equal(preserveV4FinishGroupGap(5,false)-preserveV4FinishGroupGap(0,false)>5,false)

const physicalGaps=[0,5,5.18724,5.468381,19.655293,25.123674,214.748364]
for(const gap of physicalGaps){
 const canonical=canonicalV4OfficialFinishGap(13000,gap)
 assert.equal((13000+gap)-13000,canonical)
 assert.ok(Math.abs(gap-canonical)<0.000001)
}
assert.equal(canonicalV4OfficialFinishGap(13000,0),0)
assert.ok(canonicalV4OfficialFinishGap(13000,5.18724)>5)
assert.ok(canonicalV4OfficialFinishGap(13000,25.123674)-
 canonicalV4OfficialFinishGap(13000,19.655293)>5)
assert.throws(()=>canonicalV4OfficialFinishGap(Number.NaN,5))
assert.throws(()=>canonicalV4OfficialFinishGap(13000,-1))

console.log('V4_FINISH_GROUPING_UNIT_REPORT '+JSON.stringify({status:'PASS',cases:30,
 strictPhysicalCatchEvidenceRequired:true,v2ClassificationUnchanged:true,officialWrites:0}))
