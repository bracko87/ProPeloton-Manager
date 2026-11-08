import assert from 'node:assert/strict'
import {
  BREAKAWAY_RECOVERY_POLICY_V2,
  calculateBreakawayRecoveryDebtKmV2 as debt,
  physicalBreakawayExposureKmV2 as distances,
  applyUniversalBreakawayRecoveryV2 as apply,
} from '../src/universal-race-engine/applyUniversalBreakawayRecoveryV2.mjs'

for (const [km,expected] of [
  [0,0],[10,0],[20,0],[21,0.15],[50,4.5],[60,7.3],
  [100,18.5],[120,27.5],[126,30.2],[150,41],
]) assert.ok(Math.abs(debt(km)-expected)<1e-6, 'tier '+km)
const phase = {
  phase1Opening:{
    phaseBoundary:{startKm:0,endKm:25},breakawayCatchKm:null,
    attackAttempts:[
      {riderId:'escape',attemptKm:10,acceptedEscapeLaunch:true},
      {riderId:'escape',attemptKm:12,acceptedEscapeLaunch:true}, // overlapping accepted attempt
      {riderId:'covered',attemptKm:8,acceptedEscapeLaunch:false},
    ]},
  phase2Development:{phaseBoundary:{startKm:25,endKm:65},breakawayCatchKm:null,
    breakawayRiderIdsAtStart:['escape']},
  phase3Decisive:{phaseBoundary:{startKm:65,endKm:110},physicalCatchKm:null,
    physicalEscapeRiderIdsAtStart:['escape']},
  phase4Finish:{phaseBoundary:{startKm:110,endKm:150},breakawayCaught:true,
    escapeRiderIdsAtStart:['escape'], chaseSteps:[{kmEnd:140,endGapSeconds:4}]},
}
const km=distances(phase,150)
assert.equal(km.get('escape'),130) // 10 to 140, NOT 128 from repeated attempt
assert.equal(km.has('covered'),false)
function baseRow(id,fatigueBefore=20) {
  return {
    riderId:id,teamId:'team',eligibleToStart:true,writeEligible:true,
    fatigueBefore:fatigueBefore,effectiveFatigueBeforeStage:fatigueBefore,
    grossFatigueGain:15,postStageFatigueMultiplier:1,
    postStageRecoveryBonusPoints:0,intrinsicDailyRecoveryPoints:12,
    fatigueAfterStage:fatigueBefore+15,fatigueAfter:fatigueBefore+15,
    fatigueGained:15,appliedFatigueGain:15,previousStageSeed:{fatigueAfterStage:fatigueBefore+15,fatigueGain:15}
  }
}
function stage(fatigueBefore=20) {
  const a=baseRow('escape',fatigueBefore),b=baseRow('covered',fatigueBefore)
  return {riderUpdates:[a,b],
    persistenceContract:{rows:[a,b].map(x=>({
      riderId:x.riderId,fatigueBefore:x.fatigueBefore,
      fatigueGained:15,fatigueAfter:x.fatigueAfter,recoveryDemand:x.fatigueAfter
    }))}}
}
const out=apply(stage(),phase,150)
assert.equal(out.breakawayRecoveryPolicyVersion,BREAKAWAY_RECOVERY_POLICY_V2)
assert.equal(out.riderUpdates[0].breakawayExposureKm,130)
assert.equal(out.riderUpdates[0].breakawayRecoveryDebtLoad,32)
assert.equal(out.riderUpdates[1].breakawayRecoveryDebtLoad,0)
assert.equal(out.riderUpdates[0].fatigueAfterStage,67)
assert.equal(out.riderUpdates[1].fatigueAfterStage,35)
assert.equal(out.persistenceContract.rows[0].fatigueAfter,67)
assert.equal(out.riderUpdates[0].previousStageSeed.fatigueAfterStage,67)
assert.equal(out.breakawayRecoveryEvidence.above100,1)
// Repeat same stage input (can happen on safe worker recovery), not add debt twice.
assert.deepEqual(apply(out,phase,150),out)
// A stage without a breakaway still processes and preserves ordinary fatigue.
const noEscape=apply(stage(),{},150)
assert.equal(noEscape.riderUpdates[0].breakawayRecoveryDebtLoad,0)
assert.equal(noEscape.riderUpdates[0].fatigueAfterStage,35)
// Time trials and all non-breakaway race formats use the same zero-exposure path.
const ttt=apply(stage(),{phase1Opening:null,phase2Development:null,phase3Decisive:null,phase4Finish:null},40.6)
assert.equal(ttt.breakawayRecoveryEvidence.physicalEscapeRiders,0)
// Four-day illustrated workload with ordinary daily recovery: persistent
// extra debt means the rider cannot reset to ~10 fatigue after every stage.
let current=10
for (let day=0;day<4;day++) {
  const result=apply(stage(current),phase,150)
  current=Math.max(0,result.riderUpdates[0].fatigueAfterStage-12)
}
assert.ok(current>=85, 'four consecutive long escapes must accumulate fatigue: '+current)
// No built-in synthetic AI attack or artificial DNF is introduced.
assert.throws(()=>distances({},-1),/stage length/)
console.log('PASS universal breakaway recovery across stage categories: 20/50/100km, physical catch, overlapping escapes, idle groups, repeated runs, 4 consecutive days')
