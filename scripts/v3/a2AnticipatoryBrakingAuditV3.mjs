/** A56 offline retrospective lookahead / braking-warning audit.
 * All evidence describes already recorded A44 frozen inputs. No alert is
 * turned into a solver command, changed rider state, stage result or payout.
 */
const check=(x,m)=>{if(!x)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const B=.85
function finiteNonnegative(x,label){check(Number.isFinite(x)&&x>=0,'A56 invalid '+label)}
/** Distance traveled under maximum ORDINARY continuous braking, with
 * nonnegative speed and a piecewise final stop.
 */
export function minimalOrdinaryDistanceV3(v,h,{brakingMps2=B}={}){
 finiteNonnegative(v,'speed');finiteNonnegative(h,'horizon')
 check(Number.isFinite(brakingMps2)&&brakingMps2>0,'A56 invalid braking bound')
 const tstop=v/brakingMps2
 return h<=tstop?v*h-.5*brakingMps2*h*h:v*v/(2*brakingMps2)
}
/** Optimistic analytical lead ONLY: assume same speed before warning, no
 * changes to terrain/other riders and no driver's decision latency.
 * From the already impossible current endpoint, calculate how much
 * additional *distance saving* ordinary braking starting earlier could
 * produce compared with starting at the current substep boundary.
 * This is a mathematical screening estimate, NOT a sufficient response.
 */
export function requiredOptimisticLeadV3(v,dt,shortfall,{brakingMps2=B,horizonSeconds=30}={}){
 finiteNonnegative(v,'speed');finiteNonnegative(dt,'step')
 finiteNonnegative(shortfall,'shortfall')
 check(dt>0&&dt<=5&&Number.isFinite(brakingMps2)&&brakingMps2>0&&
  Number.isFinite(horizonSeconds)&&horizonSeconds>=0&&horizonSeconds<=120,
  'A56 invalid lead-time controls')
 if(shortfall<=1e-8)return {reachable:true,leadSeconds:0}
 const saving=h=>v*h-minimalOrdinaryDistanceV3(v,h,{brakingMps2})
 const already=saving(dt)
 if(saving(dt+horizonSeconds)-already+1e-9<shortfall)
  return {reachable:false,leadSeconds:null,horizonSeconds}
 let lo=0,hi=horizonSeconds
 for(let i=0;i<52;i++){
  const mid=(lo+hi)/2
  if(saving(dt+mid)-already>=shortfall)hi=mid
  else lo=mid
 }
 return {reachable:true,leadSeconds:r6(hi),horizonSeconds}
}
function flatten(observed,dt){
 check(Array.isArray(observed)&&observed.length===6,'A56 incomplete source history')
 const out=[]
 for(const tick of observed){
  check(tick.previews.length===Math.round(10/dt),'A56 incomplete physical quantum')
  for(const preview of tick.previews){
   check(Number.isFinite(preview.tickStartSeconds)&&
    Number.isInteger(preview.substep)&&
    Number.isFinite(preview.dtSeconds),'A56 malformed freeze history')
   out.push({seconds:r6(preview.tickStartSeconds+preview.substep*preview.dtSeconds),
    preview})
  }
 }
 return out
}
/** Two strictly observational warning types:
 * RAW_SWEPT: already-existing collision in frozen proposed motion;
 * FOLLOWING_DISTANCE: same occupied lateral corridor, trailing rider
 * approaching front rider, warning distance with 1 physical step
 * assumed reaction time, front speed fixed. No braking action applied.
 */
export function classifyRetrospectiveWarningV3(preview,riderId,g,dt){
 const p=preview.proposals.find(x=>x.riderId===riderId)
 check(p&&Number.isFinite(g?.lateralCollisionM),'A56 rider not in preview')
 const raw=preview.previewConflictPairs
  .filter(pair=>pair.includes(riderId))
  .map(pair=>pair.find(id=>id!==riderId))
 const following=[]
 for(const other of preview.proposals){
  if(other.riderId===riderId)continue
  const dx=other.x0-p.x0,dy=Math.abs(other.y0-p.y0)
  if(dx<=0||dy>g.lateralCollisionM)continue
  const relative=Math.max(0,p.oldSpeedMps-other.oldSpeedMps)
  if(relative<=1e-7)continue
  const alarmDistance=1.8+relative*dt+relative*relative/(2*B)
  if(dx<=alarmDistance+1e-7)
   following.push({riderId:other.riderId,gapM:r6(dx),
    closingMps:r6(relative),alarmDistanceM:r6(alarmDistance)})
 }
 return {warning:raw.length>0||following.length>0,rawCollisionPartners:raw.sort(),
  following:following.sort((a,b)=>a.riderId.localeCompare(b.riderId))}
}
/** For one changed rider in A55's impossible frozen local alternative,
 * report optimistic needed lead and actual earlier observed alert traces.
 * A warning in the offending substep is NOT advance warning.
 */
export function auditHistoricalWarningV3(observed,eventSeconds,rider,quantum,g,
 {historySeconds=10}={}){
 check(rider?.riderId&&Number.isFinite(eventSeconds)&&
  Number.isFinite(historySeconds)&&historySeconds>=quantum&&historySeconds<=60,
  'A56 invalid event/history')
 const events=flatten(observed,quantum)
 const cutoff=eventSeconds-historySeconds
 const prior=events.filter(e=>e.seconds>=cutoff-1e-7&&
  e.seconds<eventSeconds-1e-7)
 const event=events.find(e=>Math.abs(e.seconds-eventSeconds)<=1e-6)
 check(event,'A56 event not found in stored physical traces')
 const alerts=prior.map(e=>({seconds:e.seconds,
  warning:classifyRetrospectiveWarningV3(e.preview,rider.riderId,g,quantum)}))
  .filter(e=>e.warning.warning)
 const currentWarning=classifyRetrospectiveWarningV3(
  event.preview,rider.riderId,g,quantum)
 const estimated=requiredOptimisticLeadV3(rider.startSpeedMps,quantum,
  rider.forwardShortfallFromLegalMinimumM)
 const earliest=alerts[0]??null
 const latest=alerts.at(-1)??null
 const minutes=0
 const leadAvailable=earliest?eventSeconds-earliest.seconds:0
 const enough=estimated.reachable&&earliest!==null&&
  leadAvailable+1e-5>=estimated.leadSeconds
 return {riderId:rider.riderId,eventSeconds:r6(eventSeconds),
  startSpeedMps:rider.startSpeedMps,
  forwardShortfallM:rider.forwardShortfallFromLegalMinimumM,
  requiredBrakingMps2:rider.requiredBrakeMagnitudeMps2,
  optimisticLeadSeconds:estimated.leadSeconds,
  optimisticLeadWithin30s:estimated.reachable,
  earlierWarnings:alerts.length,
  firstEarlierWarningSeconds:earliest?.seconds??null,
  lastEarlierWarningSeconds:latest?.seconds??null,
  warnedAtEvent:currentWarning.warning,
  priorRawWarnings:alerts.filter(a=>a.warning.rawCollisionPartners.length>0).length,
  priorFollowingWarnings:alerts.filter(a=>a.warning.following.length>0).length,
  earliestAlertLeadSeconds:r6(leadAvailable),
  enoughRecordedWarningUnderOptimisticAssumptions:enough,
  noRecordedEarlyWarning:earliest===null,
  evidence:'retrospective warning only; no earlier action or race correction'}
}
