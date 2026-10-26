/** Batch 36: fixed-checkpoint factorial interventions, OFFLINE ONLY.
 * No simulation state, rider energy or requested command is edited.
 * Each alternative uses the SAME original tick's initial positions and reserves.
 */
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts'
import {boundRequestedSpeedByEnergyV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
import {draftCounterfactualWattsV3} from '../../src/race-engine-v3/draftCounterfactualV3.ts'
const close=(a,b,eps=1e-5)=>Math.abs(a-b)<=eps
const r6=x=>Math.round(x*1e6)/1e6
function requireSource(before,rows,lanes,seconds){
 if(!Array.isArray(before)||!Array.isArray(rows)||before.length!==rows.length||before.length<2||new Set(before.map(r=>r.riderId)).size!==before.length||new Set(rows.map(r=>r.riderId)).size!==rows.length||!Number.isInteger(lanes)||lanes<1||lanes>6||!Number.isInteger(seconds)||seconds<1||seconds>20)throw Error('Invalid matched source roster')
 const b=new Map(before.map(r=>[r.riderId,r]))
 for(const row of rows)if(!b.has(row.riderId)||!b.get(row.riderId).powerDurationEnergy||!Number.isFinite(row.commandedMps)||!Number.isFinite(row.achievedMps)||row.commandedMps<0||row.commandedMps>30)throw Error('Unmatched speed or W-prime checkpoint')
 return b
}
export function frozenDemandAtShelterV3(before,observation,factor,dt){
 if(![0,.5,1].includes(factor))throw Error('Invalid factor')
 if(!before?.powerDurationEnergy||!Number.isFinite(before.speedMps)||!Number.isFinite(observation.availableWatts))throw Error('Missing matched physical or energy state')
 const road={gradePercent:observation.gradePercent,headwindMps:observation.headwindMps,crosswindMps:observation.crosswindMps}
 const effectiveCdA=Math.max(.22,Math.min(.36,.36*(1-observation.shelterFraction*factor)))
 let low=0,high=25
 for(let i=0;i<34;i++){const mid=(low+high)/2;if(roadWattsRequiredV3(mid,83,effectiveCdA,road)>observation.availableWatts)high=mid;else low=mid}
 const ideal=(low+high)/2,limited=before.speedMps===0?Math.min(6,ideal):Math.max(Math.max(.1,before.speedMps-.9),Math.min(before.speedMps+.9,ideal))
 const wattsAtSpeed=v=>Math.max(roadWattsRequiredV3(v,83,.22,road),roadWattsRequiredV3(v,83,.36,road))
 const capped=boundRequestedSpeedByEnergyV3(before.powerDurationEnergy,dt,limited,wattsAtSpeed)
 return Math.max(0,Math.floor(capped*1e6)/1e6-.000002)
}
export function swapEqualRowLanesV3(riders){
 if(!Array.isArray(riders)||new Set(riders.map(r=>r.riderId)).size!==riders.length)throw Error('Invalid lane snapshot')
 const positions=riders.slice().sort((a,b)=>a.meters-b.meters||a.lane-b.lane||a.riderId.localeCompare(b.riderId))
 const middle=positions[Math.floor(positions.length/2)]?.meters
 const same=positions.filter(r=>close(r.meters,middle,1e-8)).sort((a,b)=>a.lane-b.lane||a.riderId.localeCompare(b.riderId))
 if(same.length<2||same[0].lane===same[1].lane)return null
 const [a,b]=same,changed=riders.map(r=>r.riderId===a.riderId?{...r,lane:b.lane}:r.riderId===b.riderId?{...r,lane:a.lane}: {...r})
 if(changed.some((r,i)=>changed.slice(i+1).some(other=>r.lane===other.lane&&Math.abs(r.meters-other.meters)<1.8-1e-5)))return null
 const undo=changed.map(r=>r.riderId===a.riderId?{...r,lane:a.lane}:r.riderId===b.riderId?{...r,lane:b.lane}:r)
 const normalize=x=>x.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId))
 if(JSON.stringify(normalize(undo))!==JSON.stringify(normalize(riders)))throw Error('Lane intervention mutated demand or energy')
 return {riders:changed,ids:[a.riderId,b.riderId],meters:middle}
}
export function auditFrozenTickV3(before,rows,{laneCount=4,dtSeconds=10}={}){
 const byId=requireSource(before,rows,laneCount,dtSeconds)
 const expected=new Map(rows.map(r=>[r.riderId,r]))
 const physicsRows=rows.map(r=>{const b=byId.get(r.riderId);return {riderId:r.riderId,meters:b.meters,lane:b.lane,energy:b.energy,desiredMps:r.commandedMps,tactic:r.tactic}})
 const baseline=advanceSpatialPelotonV3(physicsRows,{laneCount,dtSeconds,minWheelGapMeters:1.8})
 for(const m of baseline){const recorded=expected.get(m.riderId);if(!close(m.meters,recorded.metersAfter,2e-5)||!close(m.speedMps,recorded.achievedMps,2e-5)||m.lane!==recorded.laneAfter||m.wheelLimited!==recorded.wheelLimited)throw Error('Frozen replay does not reproduce actual solver movement')}
 const baseById=new Map(baseline.map(x=>[x.riderId,x]))
 const totals={riderTicks:rows.length,benefitingTicks:0,work100J:0,work50J:0,work0J:0}
 for(const r of rows){
  const road={gradePercent:r.gradePercent,headwindMps:r.headwindMps,crosswindMps:r.crosswindMps}
  const actual=r.actualMechanicalWatts-r.passCostWatts
  const full=draftCounterfactualWattsV3(r.achievedMps,r.integratedShelterFraction,road,1,actual)
  const half=draftCounterfactualWattsV3(r.achievedMps,r.integratedShelterFraction,road,.5)
  const bare=draftCounterfactualWattsV3(r.achievedMps,r.integratedShelterFraction,road,0)
  if(![full,half,bare].every(Number.isFinite)||!close(full,actual,1e-6))throw Error('Changed observed work in shadow')
  totals.benefitingTicks+=Number(bare>full+1e-6);totals.work100J+=full*dtSeconds;totals.work50J+=half*dtSeconds;totals.work0J+=bare*dtSeconds
 }
 const shadowFactors=[0,.5,1].map(factor=>{
  const modified=physicsRows.map(r=>({...r,desiredMps:factor===1?expected.get(r.riderId).commandedMps:frozenDemandAtShelterV3(byId.get(r.riderId),expected.get(r.riderId),factor,dtSeconds)}))
  const result=advanceSpatialPelotonV3(modified,{laneCount,dtSeconds,minWheelGapMeters:1.8}),measured=new Map(result.map(r=>[r.riderId,r]))
  let changedDemand=0,changedAchieved=0,changedWheelFlag=0,desiredMeters=0,achievedMeters=0,clipMeters=0
  for(const x of modified){
   const a=baseById.get(x.riderId),b=measured.get(x.riderId)
   changedDemand+=Number(!close(x.desiredMps,a.commandedMps,1e-5));changedAchieved+=Number(!close(b.speedMps,a.speedMps,1e-5));changedWheelFlag+=Number(b.wheelLimited!==a.wheelLimited)
   desiredMeters+=x.desiredMps*dtSeconds;achievedMeters+=b.meters-b.oldMeters;clipMeters+=Math.max(0,x.desiredMps*dtSeconds-(b.meters-b.oldMeters))
  }
  if(factor===1&&(!result.every((x,i)=>close(x.meters,baseline[i].meters,1e-6)&&x.lane===baseline[i].lane)))throw Error('Full shelter factor broke matching shadow')
  return {factor,changedDemand,changedAchieved,changedWheelFlag,desiredMeters:r6(desiredMeters),achievedMeters:r6(achievedMeters),clippedMeters:r6(clipMeters)}
 })
 const swapped=swapEqualRowLanesV3(physicsRows)
 let laneOnly=null
 if(swapped){
  const moves=advanceSpatialPelotonV3(swapped.riders,{laneCount,dtSeconds,minWheelGapMeters:1.8}),lookup=new Map(moves.map(r=>[r.riderId,r]))
  let changedAchieved=0,changedWheelFlag=0,metersDelta=0
  for(const r of physicsRows){
   const a=baseById.get(r.riderId),b=lookup.get(r.riderId)
   changedAchieved+=Number(!close(a.speedMps,b.speedMps,1e-5));changedWheelFlag+=Number(a.wheelLimited!==b.wheelLimited);metersDelta+=(b.meters-b.oldMeters)-(a.meters-a.oldMeters)
  }
  laneOnly={riderIds:swapped.ids,changedAchieved,changedWheelFlag,aggregateForwardDeltaMeters:r6(metersDelta)}
 }
 return {factorial:shadowFactors,laneOnly,energyWork:totals}
}
