/**
 * OFFLINE-ONLY, non-authoritative wheel congestion diagnosis.
 * Accumulation is deterministic, bounded and lives in the same checkpoint.
 * Counts represent requested-versus-achieved motion, not lost official race time.
 */
import type {SpatialRiderV3, SpatialStepRiderV3} from './pelotonSpatialMotionV3.ts'

export interface WheelRiderCountersV3 {
  riderId:string
  ticks:number
  blockedTicks:number
  consecutiveBlockedTicks:number
  longestBlockedStreak:number
  totalRequestedMeters:number
  totalAchievedMeters:number
  preventedMeters:number
  sameLaneLeaderBlocks:number
  laneChangeBlocks:number
  otherBlocks:number
}
export interface WheelBottleneckTelemetryV3 {
  readonly version:'wheel_bottleneck_telemetry_v3_01'
  readonly riders:WheelRiderCountersV3[]
  tickCount:number
  blockedRiderTicks:number
  preventedMeters:number
  byRaceQuarter:{riderTicks:number;blockedRiderTicks:number;preventedMeters:number}[]
}
export interface WheelBottleneckSummaryV3 {
  readonly mode:'DIAGNOSTIC_ONLY_NO_MOTION_CHANGE'
  readonly riders:number
  readonly ticks:number
  readonly blockedRiderTicks:number
  readonly blockedShare:number
  readonly meanBlockedSharePerRider:number
  readonly p90BlockedSharePerRider:number
  readonly longestBlockingStreakTicks:number
  readonly accumulatedPreventedMeters:number
  readonly inferredSameLaneLeaderBlocks:number
  readonly laneChangeBlocks:number
  readonly unattributedBlocks:number
  readonly quarters:readonly {quarter:number;blockedShare:number;preventedMeters:number}[]
}
const r6=(x:number)=>Math.round(x*1e6)/1e6
const check=(v:boolean,msg:string)=>{if(!v)throw Error(msg)}
export function initializeWheelBottleneckTelemetryV3(riderIds:readonly string[]):WheelBottleneckTelemetryV3{
  check(riderIds.length>=1&&riderIds.length<=260&&riderIds.every(x=>!!x)&&new Set(riderIds).size===riderIds.length,'Invalid telemetry rider roster')
  return {version:'wheel_bottleneck_telemetry_v3_01',riders:[...riderIds].sort().map(riderId=>({riderId,ticks:0,blockedTicks:0,consecutiveBlockedTicks:0,longestBlockedStreak:0,totalRequestedMeters:0,totalAchievedMeters:0,preventedMeters:0,sameLaneLeaderBlocks:0,laneChangeBlocks:0,otherBlocks:0})),tickCount:0,blockedRiderTicks:0,preventedMeters:0,byRaceQuarter:Array.from({length:4},()=>({riderTicks:0,blockedRiderTicks:0,preventedMeters:0}))}
}
/** Read initial physical positions and the authoritative result of a tick.
 * Never changes either, and never proposes a faster speed or alternative lane. */
export function recordWheelBottleneckTickV3(
 telemetry:WheelBottleneckTelemetryV3,before:readonly SpatialRiderV3[],actual:readonly SpatialStepRiderV3[],totalMeters:number,dtSeconds:number,
):void{
  check(telemetry?.version==='wheel_bottleneck_telemetry_v3_01'&&Array.isArray(telemetry.riders)&&Array.isArray(telemetry.byRaceQuarter)&&telemetry.byRaceQuarter.length===4,'Invalid telemetry checkpoint')
  check(Number.isFinite(totalMeters)&&totalMeters>0&&Number.isFinite(dtSeconds)&&dtSeconds>0,'Invalid telemetry physics interval')
  check(before.length===actual.length,'Unexpected telemetry input lengths')
  const byId=new Map(before.map(r=>[r.riderId,r]))
  const counters=new Map(telemetry.riders.map(r=>[r.riderId,r]))
  check(byId.size===before.length&&new Set(actual.map(r=>r.riderId)).size===actual.length,'Duplicate telemetry rider state')
  for(const move of actual){
    const rider=byId.get(move.riderId),counter=counters.get(move.riderId)
    if(!rider||!counter)throw Error('Unknown telemetry rider')
    const requested= Math.max(0,rider.desiredMps*dtSeconds)
    const achieved=Math.max(0,move.meters-rider.meters)
    check(Number.isFinite(requested)&&Number.isFinite(achieved)&&Math.abs(move.oldMeters-rider.meters)<1e-4&&achieved<=requested+1e-4,'Telemetry cannot accept impossible achieved distance')
    // The executed spatial planner owns this classification. Reusing its
    // exact wheelLimited bit avoids one-tick rounding disagreements.
    const blocked=move.wheelLimited
    const prevented=Math.max(0,requested-achieved)
    const quarter=Math.min(3,Math.max(0,Math.floor(rider.meters/totalMeters*4)))
    const bucket=telemetry.byRaceQuarter[quarter]
    bucket.riderTicks++;bucket.preventedMeters=r6(bucket.preventedMeters+prevented)
    counter.ticks++
    counter.totalRequestedMeters=r6(counter.totalRequestedMeters+requested)
    counter.totalAchievedMeters=r6(counter.totalAchievedMeters+achieved)
    counter.preventedMeters=r6(counter.preventedMeters+prevented)
    if(blocked){
      telemetry.blockedRiderTicks++;bucket.blockedRiderTicks++
      counter.blockedTicks++;counter.consecutiveBlockedTicks++
      counter.longestBlockedStreak=Math.max(counter.longestBlockedStreak,counter.consecutiveBlockedTicks)
      if(move.lateralMoves>0)counter.laneChangeBlocks++
      else {
        const front=before.some(other=>other.riderId!==rider.riderId&&other.lane===rider.lane&&other.meters>rider.meters)
        if(front)counter.sameLaneLeaderBlocks++
        else counter.otherBlocks++
      }
    }else counter.consecutiveBlockedTicks=0
    telemetry.preventedMeters=r6(telemetry.preventedMeters+prevented)
  }
  telemetry.tickCount++
}
export function summarizeWheelBottlenecksV3(telemetry:WheelBottleneckTelemetryV3):WheelBottleneckSummaryV3{
  check(telemetry?.version==='wheel_bottleneck_telemetry_v3_01'&&telemetry.tickCount>=0,'Invalid bottleneck state')
  const riders=telemetry.riders, sum=(f:(r:WheelRiderCountersV3)=>number)=>riders.reduce((n,r)=>n+f(r),0)
  const riderTicks=sum(r=>r.ticks)
  const perRider=[...riders].map(r=>r.ticks?r.blockedTicks/r.ticks:0).sort((a,b)=>a-b)
  return {mode:'DIAGNOSTIC_ONLY_NO_MOTION_CHANGE',riders:riders.length,ticks:telemetry.tickCount,
    blockedRiderTicks:telemetry.blockedRiderTicks,blockedShare:r6(riderTicks?telemetry.blockedRiderTicks/riderTicks:0),
    meanBlockedSharePerRider:r6(perRider.reduce((n,x)=>n+x,0)/Math.max(1,riders.length)),
    p90BlockedSharePerRider:r6(perRider[Math.min(perRider.length-1,Math.floor(perRider.length*.9))]),
    longestBlockingStreakTicks:Math.max(0,...riders.map(r=>r.longestBlockedStreak)),
    accumulatedPreventedMeters:r6(telemetry.preventedMeters),
    inferredSameLaneLeaderBlocks:sum(r=>r.sameLaneLeaderBlocks),
    laneChangeBlocks:sum(r=>r.laneChangeBlocks),
    unattributedBlocks:sum(r=>r.otherBlocks),
    quarters:telemetry.byRaceQuarter.map((q,i)=>({quarter:i+1,blockedShare:r6(q.riderTicks?q.blockedRiderTicks/q.riderTicks:0),preventedMeters:r6(q.preventedMeters)}))}
}
