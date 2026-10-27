/** A2 OFFLINE research: endpoint-identical nonlinear reconstructions.
 * Precise collision checks hold for each PIECEWISE-LINEAR reconstruction.
 * No claim is made that any reconstruction is the actual accepted path.
 * No race physics, rider results, power, or official clock is modified.
 */
const ensure=(x,msg)=>{if(!x)throw Error(msg)}
export const A2_RECONSTRUCTIONS=Object.freeze(['affine','steering_delayed','acceleration_frontloaded','steering_frontloaded','acceleration_delayed'])
const progress=(t,shape)=>shape==='delayed'?t*t:shape==='frontloaded'?1-(1-t)*(1-t):t
export function sampleNonlinearSweepV3(path,f,profile='affine'){
 ensure(A2_RECONSTRUCTIONS.includes(profile)&&Number.isFinite(f)&&f>=0&&f<=1&&
  [path?.x0,path?.x1,path?.y0,path?.y1].every(Number.isFinite),'Invalid nonlinear swept reconstruction')
 const xShape=profile==='acceleration_frontloaded'?'frontloaded':profile==='acceleration_delayed'?'delayed':'affine'
 const yShape=profile==='steering_delayed'?'delayed':profile==='steering_frontloaded'?'frontloaded':'affine'
 return {x:path.x0+(path.x1-path.x0)*progress(f,xShape),y:path.y0+(path.y1-path.y0)*progress(f,yShape)}
}
function belowInterval(a,b,limit){
 if(Math.abs(b-a)<1e-12)return Math.abs(a)<limit-1e-10?[0,1]:null
 const t1=(-limit-a)/(b-a),t2=(limit-a)/(b-a)
 const low=Math.max(0,Math.min(t1,t2)),high=Math.min(1,Math.max(t1,t2))
 return high-low>1e-10?[low,high]:null
}
function pairOverlapSegment(a,b,{longitudinal=1.8,lateral=.8}={}){
 const dx=belowInterval(a.x0-b.x0,a.x1-b.x1,longitudinal)
 const dy=belowInterval(a.y0-b.y0,a.y1-b.y1,lateral)
 return dx!==null&&dy!==null&&Math.min(dx[1],dy[1])-Math.max(dx[0],dy[0])>1e-10
}
export function inspectNonlinearPairV3(a,b,{profile='affine',segments=16,longitudinal=1.8,lateral=.8}={}){
 ensure(A2_RECONSTRUCTIONS.includes(profile)&&Number.isInteger(segments)&&segments>=4&&segments<=64&&
  Number.isFinite(longitudinal)&&longitudinal>=1.8&&longitudinal<=3&&Number.isFinite(lateral)&&lateral>=.7&&lateral<=1.2,
  'Invalid nonlinear sweep envelope')
 for(let i=0;i<segments;i++){
  const t0=i/segments,t1=(i+1)/segments
  const a0=sampleNonlinearSweepV3(a,t0,profile),a1=sampleNonlinearSweepV3(a,t1,profile)
  const b0=sampleNonlinearSweepV3(b,t0,profile),b1=sampleNonlinearSweepV3(b,t1,profile)
  if(pairOverlapSegment({x0:a0.x,x1:a1.x,y0:a0.y,y1:a1.y},{x0:b0.x,x1:b1.x,y0:b0.y,y1:b1.y},{longitudinal,lateral}))
   return {collision:true,firstSegment:i,firstWindow:[t0,t1],profile,segments}
 }
 return {collision:false,firstSegment:null,firstWindow:null,profile,segments}
}
/** True only when both centers cross longitudinally from strict behind to
 * strict ahead. Here x can be nonlinear monotonic, so bracket the crossing
 * and bisect its first root; no invented crossing in a tied endpoint.
 */
export function nonlinearPassFractionV3(passer,lead,{profile='affine',iterations=48}={}){
 ensure(A2_RECONSTRUCTIONS.includes(profile)&&Number.isInteger(iterations)&&iterations>=20&&iterations<=64,'Invalid nonlinear pass search')
 const f=t=>sampleNonlinearSweepV3(passer,t,profile).x-sampleNonlinearSweepV3(lead,t,profile).x
 if(f(0)>=-1e-7||f(1)<=1e-7)return null
 let lo=0,hi=1
 for(let i=0;i<iterations;i++){const mid=(lo+hi)/2;if(f(mid)>0)hi=mid;else lo=mid}
 return (lo+hi)/2
}
export function nonlinearLaneEntryFractionV3(path,{profile='affine',laneStepM=1,iterations=48}={}){
 ensure(A2_RECONSTRUCTIONS.includes(profile)&&Number.isFinite(laneStepM)&&laneStepM>=.75&&laneStepM<=1.5&&
  Number.isInteger(iterations)&&iterations>=20&&iterations<=64,'Invalid nonlinear lateral search')
 const boundary=laneStepM/2, y=t=>sampleNonlinearSweepV3(path,t,profile).y
 if(y(0)<=boundary+1e-7)return 0
 if(y(1)>boundary+1e-7||y(1)>=y(0))return null
 let lo=0,hi=1
 for(let i=0;i<iterations;i++){const mid=(lo+hi)/2;if(y(mid)>boundary)lo=mid;else hi=mid}
 return (lo+hi)/2
}
export function compareNonlinearOrderV3(passer,lead,claimant,{profile='affine',laneStepM=1,dt=10}={}){
 const pass=nonlinearPassFractionV3(passer,lead,{profile}),lane=nonlinearLaneEntryFractionV3(claimant,{profile,laneStepM})
 if(pass===null||lane===null)return {classification:'UNOBSERVED',passSecond:pass===null?null:pass*dt,laneSecond:lane===null?null:lane*dt}
 const delta=(pass-lane)*dt
 return {classification:Math.abs(delta)<=1e-6?'TIED_UNDER_RECONSTRUCTION':delta<0?'PASS_BEFORE':'PASS_AFTER',
  passSecond:pass*dt,laneSecond:lane*dt,deltaSeconds:delta}
}
