/** Batch 29, OFFLINE ONLY. Strictly bounded early-position research.
 * Uses the existing swept-corridor planner; never moves riders longitudinally,
 * never edits rider power, fatigue, tactics, race results or game clocks.
 */
import {planAnticipatoryLanesV3} from '../../src/race-engine-v3/anticipatoryLaneResearchV3.ts'
import {chooseSingleLaneV3,forkSingleLaneV3} from './singleLaneBranchV3.mjs'
import assert from 'node:assert/strict'
export function advanceEarlyFormationResearchV3(input,state,before,options){
 const {lastShiftTick=-9999,cooldownTicks=4,formationMaxKm=5}=options
 assert(Number.isInteger(lastShiftTick)&&Number.isInteger(cooldownTicks)&&cooldownTicks>=1&&cooldownTicks<=100,'Invalid lane cooldown')
 assert(Number.isFinite(formationMaxKm)&&formationMaxKm>=.5&&formationMaxKm<=10,'Invalid formation range')
 if(state.complete||state.tick-lastShiftTick<cooldownTicks||state.elapsedSeconds%(input.sampleSeconds??120)===0)return {applied:false,rejected:false,choice:null}
 const active=before.filter(x=>state.riders.find(y=>y.riderId===x.riderId)?.finishSeconds===null)
 if(!active.length||Math.max(...active.map(x=>x.meters))>=formationMaxKm*1000)return {applied:false,rejected:false,choice:null}
 const after=new Map(state.riders.map(x=>[x.riderId,x]))
 const moves=active.map(x=>{
  const next=after.get(x.riderId)
  assert(next&&next.meters>=x.meters-1e-5,'Invalid formation trajectory')
  const velocity=(next.meters-x.meters)/(input.tickSeconds??10)
  return {riderId:x.riderId,oldMeters:x.meters,meters:next.meters,lane:next.lane,speedMps:velocity,commandedMps:velocity,leadRiderId:null,slipstreamFraction:0,lateralMoves:Number(next.lane!==x.lane),overtook:false,wheelLimited:next.wheelLimitedTicks>x.wheelLimitedTicks}
 })
 let plan
 try{plan=planAnticipatoryLanesV3(active,moves,input.grid.ridersAcross,1.8)}
 catch(err){
  if(err instanceof Error&&err.message==='Invalid anticipatory bicycle placement')return {applied:false,rejected:true,choice:null}
  throw err
 }
 const choice=chooseSingleLaneV3(active,moves,plan,1.8)
 if(!choice)return {applied:false,rejected:false,choice:null}
 const original=state.riders.map(x=>({riderId:x.riderId,meters:x.meters,energy:x.energy,work:x.cumulativeActualWorkJoules,wPrime:x.powerDurationEnergy?.remainingWPrimeJoules,finish:x.finishSeconds}))
 const branch=forkSingleLaneV3(state,choice,1.8)
 state.riders=branch.riders
 for(let i=0;i<original.length;i++){
  const a=original[i],b=state.riders[i]
  assert(a.riderId===b.riderId&&a.meters===b.meters&&a.energy===b.energy&&a.work===b.cumulativeActualWorkJoules&&a.wPrime===b.powerDurationEnergy?.remainingWPrimeJoules&&a.finish===b.finishSeconds,'Non-lateral gain in formation test')
 }
 return {applied:true,rejected:false,choice}
}
