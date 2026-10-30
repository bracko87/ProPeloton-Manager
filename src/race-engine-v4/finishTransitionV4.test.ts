import assert from 'node:assert/strict'
import {reconcileV4FinishTransition,selectV4PhysicalFrontFinishFallback} from './finishTransitionV4.ts'
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

const roadOrderBase={
 physicalFrontRiderIds:['rider-050'],
 finishEligibleRiderIds:['rider-061'],
 riderFinishStates:[
  {riderId:'rider-050',finalGapSeconds:0},
  {riderId:'rider-061',finalGapSeconds:5.18724}
 ],
 groupingToleranceSeconds:5
}
assert.deepEqual(selectV4PhysicalFrontFinishFallback(roadOrderBase),['rider-050'])
assert.deepEqual(selectV4PhysicalFrontFinishFallback({...roadOrderBase,
 riderFinishStates:[{riderId:'rider-050',finalGapSeconds:0},
 {riderId:'rider-061',finalGapSeconds:5.468}]}),['rider-050'])
assert.deepEqual(selectV4PhysicalFrontFinishFallback({...roadOrderBase,
 riderFinishStates:[{riderId:'rider-050',finalGapSeconds:0},
 {riderId:'rider-061',finalGapSeconds:5}]}),[])
assert.deepEqual(selectV4PhysicalFrontFinishFallback({...roadOrderBase,
 riderFinishStates:[{riderId:'rider-050',finalGapSeconds:0},
 {riderId:'rider-061',finalGapSeconds:4.999}]}),[])
assert.deepEqual(selectV4PhysicalFrontFinishFallback({...roadOrderBase,
 finishEligibleRiderIds:['rider-050','rider-061']}),[])
assert.deepEqual(selectV4PhysicalFrontFinishFallback({...roadOrderBase,
 physicalFrontRiderIds:['rider-051','rider-050'],
 riderFinishStates:[{riderId:'rider-050',finalGapSeconds:0},
 {riderId:'rider-051',finalGapSeconds:0},
 {riderId:'rider-061',finalGapSeconds:8}]}),['rider-050','rider-051'])
assert.deepEqual(selectV4PhysicalFrontFinishFallback({...roadOrderBase,
 physicalFrontRiderIds:['rider-unknown']}),[])
assert.deepEqual(selectV4PhysicalFrontFinishFallback({...roadOrderBase,
 groupingToleranceSeconds:Number.NaN}),[])

console.log('V4_FINISH_GROUPING_UNIT_REPORT '+JSON.stringify({status:'PASS',cases:18,
 strictPhysicalCatchEvidenceRequired:true,unchangedClassification:true,officialWrites:0}))
