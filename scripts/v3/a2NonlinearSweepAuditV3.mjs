/** A2 STEP 33: independent piecewise-observed movement screen, OFFLINE ONLY.
 * The existing V3 collision predicate is exact for the LINEAR motion given
 * to it. Intermediate knots are separate observations, never future guesses.
 * This audit checks piecewise-linear paths between such observed knots.
 * It does not certify arbitrary curvature between unobserved knots.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
const must=(x,msg)=>{if(!x)throw Error(msg)}
const EPS=1e-9
function checkTrack(track){
 must(Array.isArray(track)&&track.length>=2&&track.length<=65,'Bad observed nonlinear track length')
 let prevT=-1,prevX=-Infinity
 for(const p of track){
  must(p&&[p.t,p.x,p.y].every(Number.isFinite)&&p.t>=0&&p.t<=1&&p.t>prevT&&p.x>=prevX-1e-8,
    'Invalid time, forward path or position in observed knots')
  prevT=p.t;prevX=p.x
 }
 must(track[0].t===0&&track.at(-1).t===1,'Observed track must cover complete tick')
 return track
}
function interpolate(track,t){
 if(t<=0)return track[0]
 if(t>=1)return track.at(-1)
 for(let i=1;i<track.length;i++){
  const p=track[i-1],q=track[i]
  if(t<=q.t+EPS){
   const f=Math.max(0,Math.min(1,(t-p.t)/(q.t-p.t)))
   return {x:p.x+(q.x-p.x)*f,y:p.y+(q.y-p.y)*f}
  }
 }
 throw Error('Observed track interpolation failed')
}
function chord(track){return {x0:track[0].x,x1:track.at(-1).x,y0:track[0].y,y1:track.at(-1).y}}
export function evaluateObservedPiecewisePairV3(rawA,rawB,options={}){
 const a=checkTrack(rawA),b=checkTrack(rawB)
 const endsCollide=continuousBicycleCollisionV3(chord(a),chord(b),options)
 const intervals=[...new Set([...a.map(p=>p.t),...b.map(p=>p.t)])].sort((x,y)=>x-y)
 let observedCollision=false,firstInterval=null,checked=0
 for(let i=1;i<intervals.length;i++){
  const t0=intervals[i-1],t1=intervals[i]
  const pa=interpolate(a,t0),qa=interpolate(a,t1),pb=interpolate(b,t0),qb=interpolate(b,t1)
  const pathA={x0:pa.x,x1:qa.x,y0:pa.y,y1:qa.y}
  const pathB={x0:pb.x,x1:qb.x,y0:pb.y,y1:qb.y}
  checked++
  if(continuousBicycleCollisionV3(pathA,pathB,options)){
   observedCollision=true
   if(!firstInterval)firstInterval={start:t0,end:t1}
  }
 }
 return {linearEndpointCollision:endsCollide,piecewiseObservedCollision:observedCollision,
  missedByEndpointChord:observedCollision&&!endsCollide,
  falseAlarmFromEndpointChord:endsCollide&&!observedCollision,
  intervalsChecked:checked,firstCollisionInterval:firstInterval}
}
export function auditObservedTrackSetV3(tracks,rawGeometry){
 const g=validateRoadScenarioV3(rawGeometry)
 must(Array.isArray(tracks)&&tracks.length>=2&&tracks.length<=32,'Invalid research track set')
 const ordered=tracks.map(x=>{
  must(x&&typeof x.riderId==='string'&&x.riderId.length>0,'Missing rider identity')
  return {riderId:x.riderId,knots:checkTrack(x.knots)}
 }).sort((a,b)=>a.riderId.localeCompare(b.riderId))
 must(new Set(ordered.map(x=>x.riderId)).size===ordered.length,'Duplicate observed track rider ID')
 const cases=[],metrics={pairs:0,chordCollisions:0,piecewiseCollisions:0,
  missedByChord:0,falseAlarmsByChord:0,observedSegmentsChecked:0}
 for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
  const a=ordered[i],b=ordered[j]
  const out=evaluateObservedPiecewisePairV3(a.knots,b.knots,{longitudinal:1.8,lateral:g.lateralCollisionM})
  metrics.pairs++;metrics.chordCollisions+=Number(out.linearEndpointCollision)
  metrics.piecewiseCollisions+=Number(out.piecewiseObservedCollision)
  metrics.missedByChord+=Number(out.missedByEndpointChord)
  metrics.falseAlarmsByChord+=Number(out.falseAlarmFromEndpointChord)
  metrics.observedSegmentsChecked+=out.intervalsChecked
  if(out.missedByEndpointChord||out.falseAlarmFromEndpointChord)cases.push({a:a.riderId,b:b.riderId,...out})
 }
 return {version:1,gate:'A2_STEP33_RESEARCH_ONLY',geometry:g.id,riders:ordered.length,
  metrics,disagreements:cases,officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
