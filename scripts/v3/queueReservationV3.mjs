/** Batch 38 OFFLINE: persistent wheel queues and three/four-tick lateral reservation shadows.
 * Never authorises actual movement, official results, or a production engine switch.
 */
import {advanceEnergyBalanceResearchV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
import {planAnticipatoryLanesV3} from '../../src/race-engine-v3/anticipatoryLaneResearchV3.ts'
import {pairedOneTickLanePreparationV3} from './wheelReservationAttributionV3.mjs'
const verify=(ok,msg)=>{if(!ok)throw Error(msg)}
const round=x=>Math.round(x*1e6)/1e6
const sweep=(a0,a1,b0,b1,gap)=>{const x=a0-b0,y=a1-b1;return x*y>=0&&Math.min(Math.abs(x),Math.abs(y))>=gap-1e-6}
export function newQueueTrackerV3(){return {streaks:new Map(),completed:[],max:new Map(),blocked:0,continuing:0,episodes3:0,episodes6:0,episodes12:0,riders3:new Set(),riders6:new Set(),riders12:new Set()}}
export function recordQueueTickV3(tracker,rows,tick){
 verify(Number.isInteger(tick)&&tick>0&&new Set(rows.map(r=>r.riderId)).size===rows.length,'Invalid queue tick or duplicate rider')
 const observed=new Set()
 for(const r of rows){
  observed.add(r.riderId)
  const old=tracker.streaks.get(r.riderId)
  const blocked=!!r.blocked&&r.lossMeters>1e-6&&r.sameLaneReservationId!==null
  const continuation=blocked&&old&&old.leaderId===r.sameLaneReservationId&&old.lastTick===tick-1
  if(old&&!continuation)tracker.completed.push(old)
  if(!blocked){tracker.streaks.delete(r.riderId);continue}
  tracker.blocked++;tracker.continuing+=Number(!!continuation)
  const current={riderId:r.riderId,leaderId:r.sameLaneReservationId,lastTick:tick,length:continuation?old.length+1:1,lostMeters:round((continuation?old.lostMeters:0)+r.lossMeters)}
  tracker.streaks.set(r.riderId,current)
  if(current.length===3)tracker.episodes3++
  if(current.length===6)tracker.episodes6++
  if(current.length===12)tracker.episodes12++
  for(const n of [3,6,12])if(current.length>=n)tracker['riders'+n].add(r.riderId)
  if(!tracker.max.has(r.riderId)||current.length>tracker.max.get(r.riderId).length)tracker.max.set(r.riderId,current)
 }
 for(const [id,entry] of tracker.streaks)if(!observed.has(id)){tracker.completed.push(entry);tracker.streaks.delete(id)}
 return {atLeast3:[...tracker.streaks.values()].filter(s=>s.length>=3).length,atLeast6:[...tracker.streaks.values()].filter(s=>s.length>=6).length}
}
export function summarizeQueuesV3(t){
 const episodes=[...t.completed,...t.streaks.values()].sort((a,b)=>b.length-a.length||b.lostMeters-a.lostMeters||a.riderId.localeCompare(b.riderId))
 return {blockedRiderTicks:t.blocked,sameLeaderContinuationTicks:t.continuing,episodes:episodes.length,episodes3:t.episodes3,episodes6:t.episodes6,episodes12:t.episodes12,uniqueRiders3:t.riders3.size,uniqueRiders6:t.riders6.size,uniqueRiders12:t.riders12.size,longestQueueTicks:episodes[0]?.length??0,longestQueueEpisodes:episodes.slice(0,8)}
}
export function selectPersistentPreparationV3(before,moves,queue,{laneCount=4,minGap=1.8,minStreak=3}={}){
 verify(Number.isInteger(laneCount)&&laneCount>1&&laneCount<=6&&minStreak>=3,'Invalid reservation parameters')
 let plan
 try{plan=planAnticipatoryLanesV3(before,moves,laneCount,minGap)}
 catch(e){if(e instanceof Error&&e.message==='Invalid anticipatory bicycle placement')return null;throw e}
 const pre=new Map(before.map(x=>[x.riderId,x])),end=new Map(moves.map(x=>[x.riderId,x]))
 const selected=plan.riders.filter(p=>p.promoted&&p.fromLane!==p.lane&&queue.streaks.get(p.riderId)?.length>=minStreak&&pre.get(p.riderId)?.tactic!=='recover')
 selected.sort((a,b)=>queue.streaks.get(b.riderId).length-queue.streaks.get(a.riderId).length||a.riderId.localeCompare(b.riderId))
 for(const p of selected){
  const r=pre.get(p.riderId),m=end.get(p.riderId)
  if(!r||!m||moves.some(x=>x.riderId!==p.riderId&&x.lane===p.lane&&!sweep(r.meters,m.meters,pre.get(x.riderId).meters,x.meters,minGap)))continue
  if(moves.some(x=>x.riderId!==p.riderId&&x.lane===p.lane&&Math.abs(x.meters-m.meters)<minGap-1e-5))continue
  return {riderId:p.riderId,fromLane:p.fromLane,toLane:p.lane,blockingLeaderId:queue.streaks.get(p.riderId).leaderId,blockedConsecutiveTicks:queue.streaks.get(p.riderId).length}
 }
 return null
}
export function beginSteeringV3(candidate,rider,{reactionTicks=2,durationTicks=3,extraWatts=35}={}){
 verify(candidate&&rider?.riderId===candidate.riderId&&rider.powerDurationEnergy&&Number.isInteger(reactionTicks)&&reactionTicks>=1&&reactionTicks<=4&&[3,4].includes(durationTicks)&&[20,35,50].includes(extraWatts),'Invalid steering reservation')
 return {candidate,remainingReaction:reactionTicks,remainingSteering:durationTicks,durationTicks,reactionTicks,extraWatts,energy:structuredClone(rider.powerDurationEnergy),extraWorkJoules:0,checks:0,completed:false,rejected:null}
}
export function stepSteeringV3(shadow,before,moves,trace,{gap=1.8,dt=10}={}){
 verify(shadow&&!shadow.completed&&!shadow.rejected&&dt>0&&dt<=20,'Cannot step completed/invalid reservation')
 const id=shadow.candidate.riderId,initial=before.find(x=>x.riderId===id),after=moves.find(x=>x.riderId===id),obs=trace.find(x=>x.riderId===id)
 if(!initial||!after||!obs||initial.lane!==shadow.candidate.fromLane||after.lane!==shadow.candidate.fromLane){shadow.rejected='changed_lane_or_finished';return shadow}
 if(!shadow.remainingReaction){
  for(const r of before){if(r.riderId===id)continue;const end=moves.find(m=>m.riderId===r.riderId);verify(!!end,'Missing corridor trajectory')
   if(r.lane!==shadow.candidate.toLane&&end.lane!==shadow.candidate.toLane)continue
   if(!sweep(initial.meters,after.meters,r.meters,end.meters,gap)){shadow.rejected='swept_lane_conflict';return shadow}
  }
 }
 const watts=shadow.remainingReaction?0:shadow.extraWatts
 const step=advanceEnergyBalanceResearchV3(shadow.energy,obs.actualMechanicalWatts+watts,dt)
 if(!step.accepted){shadow.rejected='wprime_insufficient';return shadow}
 shadow.energy=step.state;shadow.extraWorkJoules+=watts*dt;shadow.checks++
 if(shadow.remainingReaction)shadow.remainingReaction--
 else if(--shadow.remainingSteering===0)shadow.completed=true
 return shadow
}
export function evaluatePreparedLaneV3(shadow,before,moves,road){
 verify(shadow?.completed&&!shadow.rejected,'Reservation not completed')
 const c=shadow.candidate
 return {...pairedOneTickLanePreparationV3(before,moves,{riderId:c.riderId,fromLane:c.fromLane,toLane:c.toLane},road),extraWorkJoules:shadow.extraWorkJoules,remainingWPrimeJoules:shadow.energy.remainingWPrimeJoules}
}