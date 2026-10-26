/** Batch 30 OFFLINE fixed power-target peloton shadow. NO official race writes.
 * Normal spatial physics is applied in both arms; experimental arm reserves a
 * separate destination corridor for 3 ticks and deducts 35 watts while active.
 * This is NOT a production-ready continuous bicycle steering simulator.
 */
import assert from 'node:assert/strict'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {planNeutralStartFormationV3} from '../../src/race-engine-v3/neutralStartFormationV3.ts'
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {planAnticipatoryLanesV3} from '../../src/race-engine-v3/anticipatoryLaneResearchV3.ts'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {chooseSingleLaneV3} from './singleLaneBranchV3.mjs'
import {firstClipCauseV3,startReservationV3,stepReservationV3,speedBudgetForPassingV3} from './passingReservationV3.mjs'
const fixtures=['dordrecht-2000-10-15','guangxi-2000-10-19']
const scenario=process.env.V3_BATCH30_SCENARIO??'flat'
assert(['flat','headwind','climb'].includes(scenario))
const folder=process.env.V3_BATCH30_OUT_DIR??'/tmp/v3-batch30'
mkdirSync(folder,{recursive:true})
const round6=x=>Math.round(x*1e6)/1e6
const road=scenario==='flat'?{gradePercent:0,headwindMps:0,crosswindMps:0}:scenario==='headwind'?{gradePercent:0,headwindMps:3,crosswindMps:2}:{gradePercent:4,headwindMps:0,crosswindMps:0}
const MAX_TICKS=96,DT=10
function fixedRoster(fixture,seed){
 const raw=readFileSync(new URL('./fixtures/'+fixture+'.csv',import.meta.url),'utf8').trim().split('\n').slice(1).map(x=>x.split(',').map(Number))
 const attrs=new Map(raw.map(([idx,team,flat,hills,climbing])=>['r'+String(idx).padStart(3,'0'),{flat,climbing}]))
 const grid=planNeutralStartFormationV3([...attrs.keys()],seed,{mode:'synthetic_neutral_rolling',ridersAcross:4,rowSpacingMeters:2})
 const riders=grid.map(p=>{const a=attrs.get(p.riderId);return {riderId:p.riderId,meters:p.meters,lane:p.gridLane,desiredMps:Math.max(4,Math.min(15,(scenario==='climb'?7.1:10.4)+.085*(a.flat-70)+.025*(a.climbing-70))),energy:.8,tactic:'follow'}})
 return {riders,raw}
}
function run(initial,enabled){
 let riders=structuredClone(initial),pending=null,lastStart=-9999
 let attempts=0,completed=0,aborted=0,plannerRejected=0,blocked=0,firstClip=null,prevented=0,workJ=0,passingExtraJ=0,lateralMoves=0,leaderLimited=0,alternateOldPositionBlocked=0,firstCompleted=null
 const logged=[]
 for(let tick=0;tick<MAX_TICKS;tick++){
  const wasPendingAtStart=Boolean(pending)
  const before=riders.map(x=>({...x}))
  const target=before.map(x=>{
   if(!enabled||pending?.riderId!==x.riderId)return x
   const demand=v=>roadWattsRequiredV3(v,83,.32,road)
   const allowed=speedBudgetForPassingV3(x.desiredMps,demand,35)
   return {...x,desiredMps:Math.max(0,allowed),tactic:'recover'}
  })
  const moves=advanceSpatialPelotonV3(target,{laneCount:4,dtSeconds:DT,minWheelGapMeters:1.8,gradePercent:road.gradePercent,crosswindMps:road.crosswindMps})
  const causes=firstClipCauseV3(target,moves,DT)
  blocked+=causes.clipped;leaderLimited+=causes.leaderConstrained;alternateOldPositionBlocked+=causes.blockedAdjacent
  if(!firstClip&&causes.clipped)firstClip={tick:tick+1,seconds:(tick+1)*DT,causes:causes.rows.slice(0,5)}
  prevented+=causes.rows.reduce((sum,x)=>sum+x.deficitMeters,0)
  const outcome=new Map(moves.map(x=>[x.riderId,{riderId:x.riderId,meters:x.meters,lane:x.lane,desiredMps:initial.find(y=>y.riderId===x.riderId).desiredMps,energy:.8,tactic:'follow'}]))
  if(pending){
   const status=stepReservationV3(pending,before,moves,DT,35)
   const added=status.mechanicalJoules-pending.mechanicalJoules
   assert(added>=0&&added<=1000)
   passingExtraJ+=added
   if(status.status==='completed'){
    const changed=outcome.get(pending.riderId)
    assert.equal(changed.lane,pending.fromLane)
    changed.lane=status.commitLane
    completed++
    if(!firstCompleted)firstCompleted={tick:tick+1,riderId:pending.riderId}
    pending=null
   }else if(status.status==='rejected'){aborted++;pending=null}
   else pending=status.reservation
  }
  if(enabled&&!pending&&!wasPendingAtStart&&tick-lastStart>=8&&Math.max(...moves.map(x=>x.meters))<5000){
   try{
    const plan=planAnticipatoryLanesV3(target,moves,4,1.8)
    const choice=chooseSingleLaneV3(target,moves,plan)
    if(choice){
     pending=startReservationV3(choice,moves,3)
     lastStart=tick;attempts++
     if(logged.length<10)logged.push({startTick:tick+1,riderId:choice.riderId,fromLane:choice.fromLane,toLane:choice.toLane,meters:round6(choice.meters)})
    }
   }catch(e){if(e instanceof Error&&e.message==='Invalid anticipatory bicycle placement'){plannerRejected++}else throw e}
  }
  workJ+=moves.reduce((n,m)=>n+roadWattsRequiredV3(m.speedMps,83,.32,road)*DT,0)
  lateralMoves+=moves.reduce((n,m)=>n+m.lateralMoves,0)
  riders=[...outcome.values()]
  // Check every full bicycle occupancy after the optional lane switch.
  for(let i=0;i<riders.length;i++)for(let j=i+1;j<riders.length;j++){
   if(riders[i].lane===riders[j].lane)assert(Math.abs(riders[i].meters-riders[j].meters)>=1.8-1e-5,'Research bicycle collision')
  }
  // JSON checkpoints, including the in-flight passing reservation, are exact.
  if(tick===31||tick===63){riders=JSON.parse(JSON.stringify(riders));pending=JSON.parse(JSON.stringify(pending))}
 }
 const ordered=[...riders].sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
 let splits=0;for(let i=1;i<ordered.length;i++)splits+=Number(ordered[i-1].meters-ordered[i].meters>=30)
 return {enabled,roster:initial.length,blocked,leaderLimited,alternateOldPositionBlocked,firstClip,preventedMeters:round6(prevented),attempts,completed,aborted,plannerRejected,lateralMoves,additionalMechanicalJoules:round6(passingExtraJ),roadWorkJoules:round6(workJ),totalWorkJoules:round6(workJ+passingExtraJ),totalForwardMeters:round6(riders.reduce((n,x,i)=>n+x.meters-initial.find(r=>r.riderId===x.riderId).meters,0)),firstCompleted,finalGapMeters:round6(ordered[0].meters-ordered.at(-1).meters),geometricGroups:splits+1,positions:riders.map(x=>({riderId:x.riderId,meters:round6(x.meters),lane:x.lane})),sampleReservations:logged}
}
for(const fixture of fixtures){
 const experiments=[]
 for(const seed of ['batch30-grid-control','batch30-grid-perturbed']){
  const {riders}=fixedRoster(fixture,seed)
  const baseline=run(riders,false),candidate=run(riders,true)
  assert.equal(baseline.roster,candidate.roster)
  assert.equal(baseline.attempts,0)
  assert(candidate.additionalMechanicalJoules>=0)
  const clone=run(riders,true);assert.deepEqual(candidate,clone,'Restart or sequencing changed deterministic outcome')
  experiments.push({seed,baseline,candidate,deltaBlocked:candidate.blocked-baseline.blocked,deltaMeters:round6(candidate.totalForwardMeters-baseline.totalForwardMeters),deltaWorkJoules:round6(candidate.totalWorkJoules-baseline.totalWorkJoules),deltaGapMeters:round6(candidate.finalGapMeters-baseline.finalGapMeters)})
 }
 const out={kind:'OFFLINE_BATCH30_DIAGNOSTIC_ONLY',fixture,scenario,roster:experiments[0].baseline.roster,officialWrites:0,sportingApproval:'NOT_APPROVED',dtSeconds:DT,durationSeconds:MAX_TICKS*DT,passing:{durationTicks:3,extraPowerWatts:35,safety:'Full double-lane clearance verified each tick; fail-closed abort; one reservation at a time'},experiments,limitations:['Fixed synthetic speed demands, not complete racing or a biological calibration','Continuous lateral steering not modelled; finite tick reservation is a conservative surrogate','No official database, clocks, or stage result writes','The extra mechanical watts reduce allowable forward target speed during attempted passing','Past Guangxi fixture lacks 718m of elevation']}
 const path=folder+'/'+fixture+'-'+scenario+'-first-clip-and-passing.json'
 writeFileSync(path,JSON.stringify(out,null,2)+'\n')
 console.log(JSON.stringify({fixture,scenario,roster:out.roster,experiments:experiments.map(x=>({seed:x.seed,baselineBlocked:x.baseline.blocked,candidateBlocked:x.candidate.blocked,firstClip:x.baseline.firstClip,leaderLimited:x.baseline.leaderLimited,blockedAdjacent:x.baseline.alternateOldPositionBlocked,attempts:x.candidate.attempts,completed:x.candidate.completed,aborted:x.candidate.aborted,additionalMechanicalJoules:x.candidate.additionalMechanicalJoules,deltaBlocked:x.deltaBlocked,deltaMeters:x.deltaMeters,deltaGapMeters:x.deltaGapMeters})),officialWrites:0,sportingApproval:'NOT_APPROVED',file:path}))
}
