import assert from 'node:assert/strict'
import {calculatePathDraftWorkV3} from '../../src/race-engine-v3/pathDraftExposureV3.ts'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
const road={gradePercent:0,headwindMps:0,crosswindMps:0}
const attr=(id,lane,meters)=>({riderId:id,lane,meters,energy:.8,desiredMps:10})
const before=[attr('front',0,110),attr('behind',0,106),attr('third',1,101)]
const motion=before.map(r=>({riderId:r.riderId,lane:r.lane,oldMeters:r.meters,meters:r.meters+100,speedMps:10,commandedMps:10,leadRiderId:null,slipstreamFraction:0,lateralMoves:0,overtook:false,wheelLimited:false}))
const roadMap=new Map(before.map(r=>[r.riderId,road]))
const original=JSON.stringify({before,motion})
const stable=calculatePathDraftWorkV3(before,motion,roadMap)
assert(Math.abs(stable.find(x=>x.riderId==='behind').extraWattsFromExposureChange)<1e-5,'Unchanged drafting geometry should cost unchanged watts')
assert.equal(stable.find(x=>x.riderId==='front').integratedShelter,0)
assert(stable.every(x=>x.integratedShelter>=0&&x.integratedShelter<=.3))
// Lateral preparation at the end of a tick cannot save energy earlier in the tick.
const prepare=calculatePathDraftWorkV3(before,motion,roadMap,new Map([['behind',1]]))
assert.equal(prepare.find(x=>x.riderId==='behind').integratedShelter,stable.find(x=>x.riderId==='behind').integratedShelter)
assert.equal(prepare.find(x=>x.riderId==='behind').lateralChanged,true)
// A rider losing shelter during the physical tick must do more work at
// *achieved* speed, with no extra instantaneous forward metres.
const broke=motion.map(x=>x.riderId==='behind'?{...x,lane:1}:x)
const exposed=calculatePathDraftWorkV3(before,broke,roadMap)
assert(exposed.find(x=>x.riderId==='behind').extraWattsFromExposureChange>0)
assert.equal(exposed.find(x=>x.riderId==='behind').wattsAtStartExposure,stable.find(x=>x.riderId==='behind').wattsAtStartExposure)
assert.equal(JSON.stringify({before,motion}),original,'Pure draft work cannot mutate physical state')
const rearranged=calculatePathDraftWorkV3([...before].reverse(),[...broke].reverse(),roadMap)
assert.deepEqual([...rearranged].sort((a,b)=>a.riderId.localeCompare(b.riderId)),[...exposed].sort((a,b)=>a.riderId.localeCompare(b.riderId)))
assert.throws(()=>calculatePathDraftWorkV3(before,motion.slice(1),roadMap),/roster/)
assert.throws(()=>calculatePathDraftWorkV3(before,motion,new Map()),/road/)
const rider=(i)=>({riderId:'r'+i,teamId:'A',flat:70+i%5,climbing:70+i%6,endurance:73,resistance:76,fatigueBeforeStage:30,startStamina:83,raceSharpness:76,recovery:77,morale:82,equipmentStagePerformancePct:0,inStageEnergyCostMultiplier:1})
const input={raceId:'path-draft',stageId:'synthetic',seed:'path-draft',riders:Array.from({length:24},(_,i)=>rider(i)),route:[{lengthKm:2,gradePercent:0},{lengthKm:1,gradePercent:4},{lengthKm:2,gradePercent:0}],grid:{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2},tickSeconds:10,sampleSeconds:60,gate:{offlineOnly:true,acknowledgedNoSportingApproval:true,sourceQuality:'synthetic_research'}}
const control=runCoupledV3(input)
const tuned={...input,experimentalPathDraftWork:true}
const experimental=runCoupledV3(tuned)
assert.equal(control.pathDraft,undefined)
assert.equal(experimental.sportingApproval,'NOT_APPROVED')
assert.equal(experimental.officialWrites,0)
assert.equal(experimental.finish.length,24)
assert.equal(experimental.pathDraft.affectedRiders>0,true)
assert.equal(experimental.frames.length,experimental.groups.length)
let saved=initializeCoupledV3(tuned),n=0
while(!saved.complete){saved=JSON.parse(JSON.stringify(advanceCoupledV3(tuned,saved,[1,3,13,7,23][n++%5])));assert(n<1000)}
assert.deepEqual(finalizeCoupledV3(tuned,saved),experimental,'Checkpointed draft work must resume exactly')
assert.deepEqual(runCoupledV3(input),control,'Off switch must preserve former solver')
const corrupted=JSON.parse(JSON.stringify(saved));corrupted.groupTimeline.history.pop()
assert.throws(()=>advanceCoupledV3(tuned,corrupted,1),/Divergent checkpoint/)
console.log(JSON.stringify({test:'physical shelter start-end realized watt debit',result:'PASS_ENGINEERING_ONLY',riders:24,checkpointBatches:n,controlTail:control.finish.at(-1).gapSeconds,experimentTail:experimental.finish.at(-1).gapSeconds,netExtraWorkJoules:experimental.pathDraft.netActualAdditionalJoules,sportingApproval:'NOT_APPROVED'}))
