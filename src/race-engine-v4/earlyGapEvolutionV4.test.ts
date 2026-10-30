import assert from 'node:assert/strict'
import {auditV4EarlyGapEvolution} from './earlyGapEvolutionV4.ts'
const phase=(start:number,end:number,points:[number,number][])=>({phaseBoundary:{startKm:start,endKm:end},physicalGapTrajectory:points.map(([kmFromStart,gapSeconds])=>({kmFromStart,gapSeconds}))})
const audit=auditV4EarlyGapEvolution({roadRaceResolution:{
 phase1Opening:{...phase(0,30,[[5,7],[10,30],[15,20],[30,100]]),breakawayRiderIds:['A'],riderEnergy:[{riderId:'A',startEnergy:90,energyAfterPhase:70}],breakawayCatchKm:null},
 phase2Development:{...phase(30,60,[[30,100],[45,200],[60,300]]),breakawayRiderIdsAtStart:['A'],riderEnergy:[{riderId:'A',startEnergy:70,energyAfterPhase:50}],breakawayCatchKm:null,pelotonResponse:{chasingTeamIds:['B']}},
 phase3Decisive:{...phase(60,90,[[60,300],[75,500],[90,400]]),physicalEscapeRiderIdsAtStart:['A'],riderStates:[{riderId:'A',startEnergy:50,energyAfterPhase:35}],physicalChasingTeamIds:[],physicalCatchKm:null}
}})
assert.equal(audit.researchOnly,true)
assert.equal(audit.phase1?.peakGapSeconds,100)
assert.equal(audit.phase1?.positiveGapGainSeconds,103)
assert.equal(audit.phase1?.negativeGapLossSeconds,10)
assert.equal(audit.phase1?.sampledKm,25)
assert.equal(audit.phase1?.meanFrontEnergySpent,20)
assert.equal(audit.phase2?.chaseTeamCount,1)
assert.equal(audit.phase2?.netGapChangeSeconds,200)
assert.equal(audit.phase3?.peakGapSeconds,500)
assert.equal(audit.phase3?.distanceGrowingKm,15)
assert.equal(audit.phase3?.distanceShrinkingKm,15)
assert.equal(audit.phase3?.chaseTeamCount,0)
assert.equal(audit.phase3?.meanFrontEndEnergy,35)
assert.deepEqual(auditV4EarlyGapEvolution({}),{researchOnly:true,phase1:null,phase2:null,phase3:null})
assert.throws(()=>auditV4EarlyGapEvolution({roadRaceResolution:{phase1Opening:{...phase(0,30,[[5,7],[5,10]]),breakawayRiderIds:[],riderEnergy:[],breakawayCatchKm:null}}}),/not increasing/)
console.log('V4_EARLY_GAP_EVOLUTION_UNIT_REPORT '+JSON.stringify({status:'PASS',tests:15,writes:0}))
