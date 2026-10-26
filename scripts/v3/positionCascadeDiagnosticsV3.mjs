/** Pure OFFLINE-only obstruction-chain interpreter. No racing mutation. */
export function diagnosePositionCascadeTickV3(before,after,seconds,spacing=1.8){
 if(!Number.isFinite(seconds)||seconds<=0||seconds>20||!Number.isFinite(spacing)||spacing<1.5||spacing>5)throw Error('Invalid cascade dt or spacing')
 if(before.length!==after.length)throw Error('Missing wheel in diagnostic tick')
 const from=new Map(before.map(r=>[r.riderId,r])),to=new Map(after.map(r=>[r.riderId,r]))
 if(from.size!==before.length||to.size!==after.length||before.some(r=>!to.has(r.riderId)))throw Error('Duplicate or unknown diagnostic rider')
 const map=new Map()
 for(const rider of before){
  const end=to.get(rider.riderId),advanced=end.meters-rider.meters
  if(!Number.isFinite(advanced)||advanced < -1e-4||!Number.isInteger(rider.lane)||!Number.isInteger(end.lane))throw Error('Invalid diagnostic movement')
  const leader=before.filter(x=>x.riderId!==rider.riderId&&x.lane===rider.lane&&x.meters>=rider.meters+spacing-1e-5).sort((a,b)=>a.meters-b.meters||a.riderId.localeCompare(b.riderId))[0]
  const blocked=end.wheelLimited===true||(Number.isInteger(end.wheelLimitedTicks)&&Number.isInteger(rider.wheelLimitedTicks)&&end.wheelLimitedTicks>rider.wheelLimitedTicks)
  map.set(rider.riderId,{riderId:rider.riderId,blocked,leaderId:leader?.riderId??null,oldLane:rider.lane,newLane:end.lane,metersAdvanced:advanced,preventedMeters:Number.isFinite(rider.desiredMps)?Math.max(0,rider.desiredMps*seconds-advanced):null})
 }
 const memo=new Map(),depth=(id,seen)=>{
  if(memo.has(id))return memo.get(id)
  if(seen.has(id))throw Error('Cyclic wheel ordering')
  seen.add(id)
  const x=map.get(id),y=x.leaderId?map.get(x.leaderId):null
  const n=x.blocked&&y?.blocked&&x.oldLane===y.oldLane?1+depth(y.riderId,seen):0
  seen.delete(id);memo.set(id,n);return n
 }
 let blocked=0,chainAffected=0,longestChain=0,blockedNoLeader=0,blockedLaneChanges=0,preventedMeters=0
 const rows=before.map(r=>{const v=map.get(r.riderId),chainDepth=depth(r.riderId,new Set());if(v.blocked){blocked++;chainAffected+=Number(chainDepth>0);longestChain=Math.max(longestChain,chainDepth);blockedNoLeader+=Number(v.leaderId===null);blockedLaneChanges+=Number(v.oldLane!==v.newLane)}preventedMeters+=v.preventedMeters??0;return {...v,chainDepth}})
 return {rows,summary:{riderTicks:before.length,blocked,chainAffected,longestChain,blockedNoLeader,blockedLaneChanges,preventedMeters:Math.round(preventedMeters*1e6)/1e6}}
}
