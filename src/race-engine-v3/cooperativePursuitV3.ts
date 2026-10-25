/**
 * V3 research-only group pursuit controller, not connected to official racing.
 * Applies chase effort only to physical groups with a measurable group ahead.
 * It produces bounded candidate pace and energy duty, not invented group gaps.
 */
export interface PursuitRiderV3 {
 readonly riderId:string
 readonly meters:number
 readonly sustainableMps:number
 readonly energy:number
 readonly action:'follow'|'tempo'|'attack'|'chase'|'recover'
}
export interface PursuitPackV3 {
 readonly memberIds:readonly string[]
 readonly frontMeters:number
 readonly rearMeters:number
 readonly targetMps:number
 readonly paceGainMps:number
 readonly gapToFrontMeters:number
 readonly workingRiderIds:readonly string[]
 readonly workPerSecond:Readonly<Record<string,number>>
}
const clamp=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n))
export function planCooperativePursuitV3(
 riders:readonly PursuitRiderV3[],
 baselinePackMps:number,
 neighborGapMeters=26,
 minBreakawayGapMeters=120,
): readonly PursuitPackV3[] {
 if(!Number.isFinite(baselinePackMps)||baselinePackMps<1||baselinePackMps>30||!Number.isFinite(neighborGapMeters)||neighborGapMeters<8||neighborGapMeters>50||!Number.isFinite(minBreakawayGapMeters)||minBreakawayGapMeters<30||minBreakawayGapMeters>300)throw Error('Invalid group pursuit bounds')
 const ids=new Set<string>()
 for(const r of riders){
  if(!r.riderId||ids.has(r.riderId)||![r.meters,r.energy,r.sustainableMps].every(Number.isFinite)||r.meters<0||r.energy<0||r.energy>1||r.sustainableMps<=0||r.sustainableMps>30||!['follow','tempo','attack','chase','recover'].includes(r.action))throw Error('Invalid physical pursuit rider')
  ids.add(r.riderId)
 }
 const ordered=[...riders].sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
 const groups:PursuitRiderV3[][]=[]
 for(const rider of ordered){
  const last=groups.at(-1)
  if(!last||last.at(-1)!.meters-rider.meters>neighborGapMeters)groups.push([rider]);else last.push(rider)
 }
 const raceFront=groups[0]?.[0]?.meters??0
 return groups.map((members,i)=>{
  const front=members[0].meters,tail=members.at(-1)!.meters
  const gap=raceFront-front
  const pursuing=gap>=minBreakawayGapMeters&&i>0
  const workers=pursuing?members.filter(r=>r.action==='chase'&&r.energy>.2):[]
  const contributors=workers.map(r=>({r,effort:clamp((r.energy-.2)/.65,0,1)}))
  const effectiveWorkers=contributors.reduce((sum,x)=>sum+x.effort,0)
  // Diminishing returns: two cooperating riders cannot instantly double
  // power or overcome their own sustainable road speeds.
  const requestedGain=clamp(.015*Math.log2(1+effectiveWorkers),0,.07)
  const capacity=workers.length?Math.max(...workers.map(r=>r.sustainableMps))*1.02:baselinePackMps
  const target=workers.length?Math.min(baselinePackMps*(1+requestedGain),capacity):baselinePackMps
  const work:Record<string,number>=Object.create(null)
  for(const {r,effort} of contributors){
   // Whole pack can benefit from helpers, but helpers pay real energy. The
   // charge is not divided by the pack's entire rider count.
   work[r.riderId]=.000035*effort*(1+requestedGain*5)
  }
  return {memberIds:members.map(r=>r.riderId),frontMeters:front,rearMeters:tail,targetMps:target,paceGainMps:Math.max(0,target-baselinePackMps),gapToFrontMeters:gap,workingRiderIds:workers.map(r=>r.riderId),workPerSecond:work}
 })
}
