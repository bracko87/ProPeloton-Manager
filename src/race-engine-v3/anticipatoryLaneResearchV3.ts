/**
 * OFFLINE-ONLY candidate. Prepares a safe lateral position for the following
 * tick without granting additional forward metres or silently changing watts.
 * Intended to diagnose/correct lane trap without instant physics catch-up.
 * A trajectory remains a linear longitudinal path during one discrete tick;
 * candidate lane change requires a conflict-free complete swept interval.
 * Lane changes are hypothetical until independently sporting-calibrated.
 */
import type {SpatialRiderV3, SpatialStepRiderV3} from './pelotonSpatialMotionV3.ts'
export interface AnticipatoryLaneCandidateV3 {
  readonly riderId:string
  readonly fromLane:number
  readonly lane:number
  readonly meters:number
  readonly promoted:boolean
  readonly nearestOldLeaderGap:number|null
  readonly nearestNewLeaderGap:number|null
}
export interface AnticipatoryLaneReportV3 {
  readonly mode:'EXPERIMENTAL_LATERAL_ONLY'
  readonly offered:number
  readonly shifted:number
  readonly riders:readonly AnticipatoryLaneCandidateV3[]
}
const close=(a:number,b:number)=>Math.abs(a-b)<1e-4
const safeDistanceDuring=(a0:number,a1:number,b0:number,b1:number,gap:number):boolean=>{
  const d0=a0-b0,d1=a1-b1
  // Same or opposite longitudinal order must be respected at all times.
  if(d0*d1<0)return false
  return Math.min(Math.abs(d0),Math.abs(d1))>=gap-1e-6
}
export function planAnticipatoryLanesV3(
  before:readonly SpatialRiderV3[],motion:readonly SpatialStepRiderV3[],
  laneCount:number,minWheelGapMeters=1.8,
):AnticipatoryLaneReportV3{
  if(!Number.isInteger(laneCount)||laneCount<1||laneCount>6||!Number.isFinite(minWheelGapMeters)||minWheelGapMeters<1.5||minWheelGapMeters>5)throw Error('Invalid lane physics')
  if(before.length!==motion.length||new Set(before.map(r=>r.riderId)).size!==before.length||new Set(motion.map(r=>r.riderId)).size!==motion.length)throw Error('Duplicate or missing wheel')
  const bmap=new Map(before.map(r=>[r.riderId,r])),mmap=new Map(motion.map(r=>[r.riderId,r]))
  const assignments=new Map(motion.map(m=>[m.riderId,m.lane]))
  for(const r of before){const m=mmap.get(r.riderId);if(!m||!close(m.oldMeters,r.meters)||m.meters+1e-6<r.meters||!Number.isInteger(m.lane)||m.lane<0||m.lane>=laneCount)throw Error('Invalid wheel trajectory')}
  const sorted=[...motion].sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
  const picked=new Set<string>()
  let offered=0,shifted=0
  for(const m of sorted){
    const r=bmap.get(m.riderId)!
    if(!m.wheelLimited||m.lateralMoves!==0||r.tactic==='recover')continue
    const others=sorted.filter(o=>o.riderId!==r.riderId)
    const oldLeader=others.filter(o=>assignments.get(o.riderId)===m.lane&&o.meters>m.meters).sort((a,b)=>a.meters-b.meters)[0]
    const oldGap=oldLeader?oldLeader.meters-m.meters:Infinity
    const alternatives=[m.lane-1,m.lane+1].filter(l=>l>=0&&l<laneCount)
    const eligible:{lane:number;gap:number}[]=[]
    for(const lane of alternatives){
      // Front-to-back deterministic reservations: check the initial track,
      // full linear longitudinal travel, and destination track to prevent
      // swept-through bicycle crossings. Conservative by construction.
      if(others.some(o=>(assignments.get(o.riderId)===lane || (picked.has(o.riderId) && o.lane===lane))&&
        !safeDistanceDuring(r.meters,m.meters,bmap.get(o.riderId)!.meters,o.meters,minWheelGapMeters)))continue
      const ahead=others.filter(o=>assignments.get(o.riderId)===lane&&o.meters>m.meters).sort((a,b)=>a.meters-b.meters)[0]
      const gap=ahead?ahead.meters-m.meters:Infinity
      // Improvement must have tangible geometric headway. No targets, watts,
      // recovery, longitudinal distance or race outcome is assigned here.
      if(gap>=oldGap+1.8)eligible.push({lane,gap})
    }
    if(!eligible.length)continue
    offered++
    eligible.sort((a,b)=>b.gap-a.gap||a.lane-b.lane)
    const best=eligible[0]
    // A same-tick lane reservation must be collision free even if a previous
    // candidate already moved there. The 'assignments' map includes it.
    assignments.set(r.riderId,best.lane);picked.add(r.riderId);shifted++
  }
  const riders=motion.map(m=>{
    const here=assignments.get(m.riderId)!
    const others=motion.filter(o=>o.riderId!==m.riderId)
    const oldAhead=others.filter(o=>o.lane===m.lane&&o.meters>m.meters).sort((a,b)=>a.meters-b.meters)[0]
    const newAhead=others.filter(o=>assignments.get(o.riderId)===here&&o.meters>m.meters).sort((a,b)=>a.meters-b.meters)[0]
    return {riderId:m.riderId,fromLane:m.lane,lane:here,meters:m.meters,promoted:picked.has(m.riderId),nearestOldLeaderGap:oldAhead?Math.round((oldAhead.meters-m.meters)*1e6)/1e6:null,nearestNewLeaderGap:newAhead?Math.round((newAhead.meters-m.meters)*1e6)/1e6:null}
  })
  for(let i=0;i<riders.length;i++)for(let j=i+1;j<riders.length;j++){
    if(riders[i].lane===riders[j].lane&&Math.abs(riders[i].meters-riders[j].meters)<minWheelGapMeters-1e-5)throw Error('Invalid anticipatory bicycle placement')
  }
  return {mode:'EXPERIMENTAL_LATERAL_ONLY',offered,shifted,riders}
}
