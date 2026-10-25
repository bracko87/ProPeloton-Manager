/**
 * V3 isolated research candidate: group velocity driven by finite rider power.
 * Assumptions (mass, bike drag, watts) are *provisional*, NOT calibrated to
 * actual ProPeloton rider units and never production-routed. No result targets.
 */
export type PowerTacticV3 = 'follow' | 'tempo' | 'chase' | 'attack' | 'recover'
export interface PackPowerRiderV3 {
  readonly riderId: string
  /** Provisional mechanically available sustained watts (not total power). */
  readonly sustainableWatts: number
  readonly energy: number // [0,1]
  readonly tactic: PowerTacticV3
  readonly massKg?: number
}
export interface PackRoadV3 {
  readonly gradePercent: number
  /** Signed: positive from ahead, negative tailwind. */
  readonly headwindMps?: number
  readonly crosswindMps?: number
  readonly rollingCoefficient?: number
  readonly airDensityKgM3?: number
}
export interface PackPowerV3Result {
  readonly attainableSpeedMps: number
  readonly sustainableSpeedMps: number
  readonly totalPowerDemandWatts: number
  readonly availablePackWatts: number
  readonly totalContributorWatts: number
  readonly peakWorkerEnergyCostPerSecond: number
  readonly perRider: readonly {readonly riderId:string;readonly watts:number;readonly dutyWatts:number;readonly energyCostPerSecond:number}[]
}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
const round=(n:number)=>Math.round(n*1e6)/1e6
const ensure=(condition:boolean,message:string)=>{if(!condition)throw new Error(message)}
/** Calculate per-rider aerodynamic and gravity work needed to hold a road speed. */
export function roadWattsRequiredV3(speedMps:number,massKg:number,cdA:number,road:PackRoadV3):number{
 ensure(Number.isFinite(speedMps)&&speedMps>=0&&speedMps<=50,'Invalid road speed')
 ensure(Number.isFinite(massKg)&&massKg>=35&&massKg<=150,'Invalid combined rider+bicycle mass')
 ensure(Number.isFinite(cdA)&&cdA>=.1&&cdA<=1,'Invalid aerodynamic drag area')
 const gradient=road.gradePercent/100
 const rolling=(road.rollingCoefficient??.005)*massKg*9.81
 const gravity=massKg*9.81*gradient
 const longitudinal=speedMps+(road.headwindMps??0)
 const cross=road.crosswindMps??0
 // Aero power is signed along the road; crosswinds increase the air velocity
 // magnitude, but only the longitudinal component performs along-road work.
 const airPower=.5*(road.airDensityKgM3??1.225)*cdA*longitudinal*Math.hypot(longitudinal,cross)*speedMps
 return Math.max(0,(rolling+gravity)*speedMps+airPower)
}
/** Power-limited pack pace, with explicit workers and no free attack inheritance. */
export function calculatePackPowerV3(riders:readonly PackPowerRiderV3[],road:PackRoadV3,dtSeconds=10):PackPowerV3Result{
 ensure(riders.length>0&&riders.length<=260,'Invalid pack count')
 ensure(Number.isFinite(dtSeconds)&&dtSeconds>0&&dtSeconds<=30,'Invalid step')
 ensure(Number.isFinite(road.gradePercent)&&Math.abs(road.gradePercent)<=22,'Invalid grade')
 ensure(Number.isFinite(road.headwindMps??0)&&Math.abs(road.headwindMps??0)<=55,'Invalid headwind')
 ensure(Number.isFinite(road.crosswindMps??0)&&Math.abs(road.crosswindMps??0)<=55,'Invalid crosswind')
 ensure(Number.isFinite(road.rollingCoefficient??.005)&&(road.rollingCoefficient??.005)>=.002&&(road.rollingCoefficient??.005)<=.04,'Invalid rolling resistance')
 ensure(Number.isFinite(road.airDensityKgM3??1.225)&&(road.airDensityKgM3??1.225)>=.9&&(road.airDensityKgM3??1.225)<=1.45,'Invalid air density')
 const ids=new Set<string>()
 for(const r of riders){
  ensure(!!r.riderId&&!ids.has(r.riderId),'Duplicate or blank rider')
  ids.add(r.riderId)
  ensure(Number.isFinite(r.energy)&&r.energy>=0&&r.energy<=1,'Invalid energy')
  ensure(Number.isFinite(r.sustainableWatts)&&r.sustainableWatts>=70&&r.sustainableWatts<=550,'Invalid sustainable watts')
  ensure(Number.isFinite(r.massKg??83)&&(r.massKg??83)>=45&&(r.massKg??83)<=130,'Invalid rider+bike mass')
  ensure(['follow','tempo','chase','attack','recover'].includes(r.tactic),'Invalid tactic')
 }
 const ordered=[...riders].sort((a,b)=>a.riderId.localeCompare(b.riderId))
 const crossFactor=clamp(1-Math.abs(road.crosswindMps??0)/20,0,1)
 const shelterFraction=ordered.length===1?0:clamp((ordered.length-1)/Math.max(3,ordered.length+3)*.5,.02,.55)*crossFactor*clamp(1-Math.max(0,road.gradePercent)/8,0,1)
 // Collective road speed cannot be derived from ONE adjacent attacker's speed.
 // Each rider must supply the actual work required at the proposed speed.
 const demand=(speed:number)=>ordered.reduce((total,r)=>{
  // Share the exposed leading duty across workers instead of arbitrarily
  // assigning the front to whichever ID sorts first.
  const dragArea=.36*(1-shelterFraction*(ordered.length-1)/ordered.length)
  return total+roadWattsRequiredV3(speed,r.massKg??83,dragArea,road)
 },0)
 const available=ordered.map(r=>{
  const energyDerate=.72+.28*clamp((r.energy-.12)/.58,0,1)
  const base=r.sustainableWatts*energyDerate
  // Increased chase/attack output uses transient energy and is NOT free.
  const bonus=r.tactic==='chase'&&r.energy>.2?.15:r.tactic==='attack'&&r.energy>.27?.25:0
  const dutyWatts=base*bonus
  return {riderId:r.riderId,watts:base+dutyWatts,dutyWatts,energyCostPerSecond:dutyWatts>0?dutyWatts*(r.tactic==='attack'?1.2e-5:3e-6):0}
 })
 const sustainable=available.reduce((s,r)=>s+r.watts-r.dutyWatts,0)
 const full=available.reduce((s,r)=>s+r.watts,0)
 function solve(watts:number):number{
  let lo=0,hi=28
  for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(demand(mid)>watts)hi=mid;else lo=mid}
  return (lo+hi)/2
 }
 const sustainableSpeed=solve(sustainable)
 const desiredSpeed=solve(full)
 const pace=round(desiredSpeed)
 const perRider=available.map(r=>({...r,watts:round(r.watts),dutyWatts:round(r.dutyWatts),energyCostPerSecond:round(r.energyCostPerSecond)}))
 return {attainableSpeedMps:pace,sustainableSpeedMps:round(sustainableSpeed),totalPowerDemandWatts:round(demand(desiredSpeed)),availablePackWatts:round(full),totalContributorWatts:round(full-sustainable),peakWorkerEnergyCostPerSecond:round(Math.max(...perRider.map(x=>x.energyCostPerSecond))),perRider}
}

/** Apply only the EXTRA tactical watt expenditure; normal aerobic cost remains
 * with the authoritative rider-motion solver. Pure, deterministic and safe
 * to run at persisted checkpoints, never changes its input objects. */
export function debitPowerReserveV3(
 riders:readonly PackPowerRiderV3[], plan:PackPowerV3Result, seconds:number,
): readonly PackPowerRiderV3[]{
 ensure(Number.isFinite(seconds)&&seconds>0&&seconds<=600,'Invalid energy step duration')
 ensure(plan.perRider.length===riders.length,'Power plan missing rider')
 const costs=new Map(plan.perRider.map(r=>[r.riderId,r.energyCostPerSecond]))
 ensure(costs.size===riders.length,'Power plan duplicated rider')
 return riders.map(r=>{
  const duty=costs.get(r.riderId)
  if(duty===undefined||!Number.isFinite(duty)||duty<0)throw new Error('Invalid extra power duty')
  return {...r,energy:round(clamp(r.energy-duty*seconds,0,1))}
 })
}
