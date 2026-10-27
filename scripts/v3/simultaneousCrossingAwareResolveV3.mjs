/** A2 isolated research-only, bounded crossing-aware yielding prototype.
 * Counterfactual, NOT approved physical racing. Each rider plans from frozen
 * state, and no output is accepted without exhaustive swept-pair clearance.
 * A rider-pair preference is chosen by smallest sacrificed requested metres,
 * with trailing rider preferred solely as a tie-breaker for same-lane flow.
 * When neither rider can yield individually, both yield symmetrically.
 */
import {continuousBicycleCollisionV3 as collides} from './continuousLateralResearchV3.mjs'
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
const ensure=(v,msg)=>{if(!v)throw Error(msg)}
const r6=n=>Math.round(n*1e6)/1e6
const path=(r,m,s)=>({riderId:r.riderId,x0:r.meters,x1:r6(r.meters+m.forwardMeters*s),y0:r.y,y1:r6(r.y+(m.targetY-r.y)*s)})
const isHit=(a,b,g)=>collides(a,b,{longitudinal:1.8,lateral:g.lateralCollisionM})
function firstGraph(ids,pairs){
 const parent=new Map(ids.map(id=>[id,id]));
 const find=id=>{while(parent.get(id)!==id)id=parent.get(id);return id};
 for(const [a,b] of pairs){const aa=find(a),bb=find(b);if(aa!==bb)parent.set(bb,aa)}
 const sizes=new Map();for(const [a,b] of pairs)for(const id of [a,b]){const root=find(id);sizes.set(root,(sizes.get(root)??0)+0)}
 const unique=new Set(pairs.flat()),groups=new Map();
 for(const id of unique){const root=find(id);groups.set(root,(groups.get(root)??0)+1)}
 return {largestComponent:Math.max(0,...groups.values()),components:groups.size}
}
/** Protect a closing rear rider only where intended lateral corridors are
 * physically distinct. This scores conflict resolution choices; it never
 * permits unsafe swept trajectories or changes the 10-second physics.
 */
export function provisionalPassPriorityV3(a,b,aMove,bMove,g){
 const [rear,front,rearMove,frontMove]=a.meters<b.meters?[a,b,aMove,bMove]:[b,a,bMove,aMove]
 const gap=front.meters-rear.meters
 const closing=(rear.meters+rearMove.forwardMeters)-(front.meters+frontMove.forwardMeters)
 return gap>=1.8&&gap<=18&&closing>=2&&Math.abs(rearMove.targetY-frontMove.targetY)>=g.lateralCollisionM+.05
  ?{protectedRiderId:rear.riderId,frontRiderId:front.riderId,closingMetres:closing}:null
}
export function resolveTargetedSimultaneousPathsV3(riders,moves,rawGeometry,{dt=10,maxIterations=56}={}){
 ensure(Array.isArray(riders)&&riders.length>=2&&riders.length<=200&&Array.isArray(moves)&&moves.length===riders.length&&Number.isInteger(dt)&&dt>=5&&dt<=20&&Number.isInteger(maxIterations)&&maxIterations>=8&&maxIterations<=80,'Invalid targeted research input')
 const g=validateRoadScenarioV3(rawGeometry),map=new Map(moves.map(m=>[m?.riderId,m]))
 ensure(map.size===riders.length,'Duplicate targeted moves')
 const seen=new Set()
 for(const r of riders){
  ensure(typeof r?.riderId==='string'&&r.riderId.length>0&&!seen.has(r.riderId)&&Number.isFinite(r.meters)&&r.meters>=0&&Number.isFinite(r.y)&&r.y>=0&&r.y<=(g.laneCount-1)*g.centerStepM,'Invalid targeted rider')
  seen.add(r.riderId)
  const m=map.get(r.riderId)
  ensure(m&&Number.isFinite(m.forwardMeters)&&m.forwardMeters>=0&&m.forwardMeters<=20*dt&&Number.isFinite(m.targetY)&&m.targetY>=0&&m.targetY<=(g.laneCount-1)*g.centerStepM&&Math.abs(m.targetY-r.y)<=g.centerStepM+1e-8,'Invalid targeted motion')
 }
 const sorted=[...riders].sort((a,b)=>a.riderId.localeCompare(b.riderId))
 for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++)ensure(!isHit(path(sorted[i],map.get(sorted[i].riderId),0),path(sorted[j],map.get(sorted[j].riderId),0),g),'Initial bicycle collision')
 const scales=new Map(sorted.map(r=>[r.riderId,1]))
 let totalChecks=0,firstConflicts=0,largestFirstConflictComponent=0,firstConflictComponents=0,targetedYieldDecisions=0,symmetricFallbackEdges=0,protectedPassEdges=0,actualPreferenceChanges=0
 // The following counters observe EXISTING swept-safe unilateral options.
 // No scoring, tie-break or candidate trajectory is changed.
 const yieldOptions={conflictingPairs:0,zeroFeasible:0,oneFeasible:0,twoFeasible:0,
  prioritizedPairs:0,priorityZeroFeasible:0,prioritySingleFeasible:0,
  prioritySingleMustYieldProtected:0,prioritySingleAlreadyPreservesProtected:0,
  priorityTwoFeasible:0,priorityAlreadyPreserved:0,
  priorityBothButCostGapOver10m:0,priorityBothCostGapWithin10m:0,
  priorityActualSwitched:0,twoChoiceCostGap0to2m:0,twoChoiceCostGap2to10m:0,
  twoChoiceCostGap10to25m:0,twoChoiceCostGapOver25m:0}
 for(let iteration=0;iteration<=maxIterations;iteration++){
  const paths=sorted.map(r=>path(r,map.get(r.riderId),scales.get(r.riderId)))
  const edges=[]
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
   if(isHit(paths[i],paths[j],g))edges.push([i,j])
  }
  totalChecks+=edges.length
  if(iteration===0){
   firstConflicts=edges.length
   const components=firstGraph(sorted.map(r=>r.riderId),edges.map(([i,j])=>[sorted[i].riderId,sorted[j].riderId]))
   largestFirstConflictComponent=components.largestComponent
   firstConflictComponents=components.components
  }
  if(!edges.length){
   const done=new Map(sorted.map((r,i)=>[r.riderId,{...paths[i],requestedMeters:map.get(r.riderId).forwardMeters,achievedMeters:r6(paths[i].x1-paths[i].x0),scale:scales.get(r.riderId)}]))
   const result=riders.map(r=>done.get(r.riderId))
   ensure(result.every(p=>p.achievedMeters>=-1e-7&&p.achievedMeters<=p.requestedMeters+1e-5),'Invented movement')
   return {paths:result,iterations:iteration,firstConflicts,pairConflictsChecked:totalChecks,blockedRiders:[...scales.values()].filter(s=>s<1).length,allPairsSweptClear:true,largestFirstConflictComponent,firstConflictComponents,targetedYieldDecisions,symmetricFallbackEdges,protectedPassEdges,actualPreferenceChanges,yieldOptions}
  }
  ensure(iteration<maxIterations,'Targeted research conflict failed safely: no convergence')
  const changes=new Map()
  for(const [i,j] of edges){
   let choices=[]
   for(const [mine,other] of [[i,j],[j,i]]){
    const rider=sorted[mine],prev=scales.get(rider.riderId),intent=map.get(rider.riderId)
    // Quantized search is stable against non-monotonic swept lateral crossings.
    for(let k=1;k<=32;k++){
     const scale=r6(prev*(32-k)/32)
     const trial=path(rider,intent,scale)
     if(!isHit(trial,paths[other],g)){
      const sacrificed=(prev-scale)*intent.forwardMeters
      const behind=Number(rider.meters<sorted[other].meters)
      choices.push({index:mine,scale,sacrificed,behind,id:rider.riderId})
      break
     }
    }
   }
   yieldOptions.conflictingPairs++
   yieldOptions[['zeroFeasible','oneFeasible','twoFeasible'][choices.length]]++
   if(choices.length===2){
    const diff=Math.abs(choices[0].sacrificed-choices[1].sacrificed)
    if(diff<=2)yieldOptions.twoChoiceCostGap0to2m++
    else if(diff<=10)yieldOptions.twoChoiceCostGap2to10m++
    else if(diff<=25)yieldOptions.twoChoiceCostGap10to25m++
    else yieldOptions.twoChoiceCostGapOver25m++
   }
   // Count priority opportunities even when neither cyclist has a safe
   // unilateral reduction. These may previously have been invisible.
   const priorityForAudit=provisionalPassPriorityV3(sorted[i],sorted[j],map.get(sorted[i].riderId),map.get(sorted[j].riderId),g)
   if(priorityForAudit){
    yieldOptions.prioritizedPairs++
    if(choices.length===0)yieldOptions.priorityZeroFeasible++
    if(choices.length===1){
     yieldOptions.prioritySingleFeasible++
     if(choices[0].id===priorityForAudit.protectedRiderId)yieldOptions.prioritySingleMustYieldProtected++
     else yieldOptions.prioritySingleAlreadyPreservesProtected++
    }
    if(choices.length===2)yieldOptions.priorityTwoFeasible++
   }
   if(choices.length){
    const original=choices.slice().sort((a,b)=>a.sacrificed-b.sacrificed||b.behind-a.behind||a.id.localeCompare(b.id))[0]
    const priority=provisionalPassPriorityV3(sorted[i],sorted[j],map.get(sorted[i].riderId),map.get(sorted[j].riderId),g)
    if(priority)protectedPassEdges++
    if(priority&&choices.length===2){
     const other=choices.find(x=>x.id!==priority.protectedRiderId)
     const protectedChoice=choices.find(x=>x.id===priority.protectedRiderId)
     if(original.id!==priority.protectedRiderId)yieldOptions.priorityAlreadyPreserved++
     else if(other.sacrificed-protectedChoice.sacrificed>10)yieldOptions.priorityBothButCostGapOver10m++
     else yieldOptions.priorityBothCostGapWithin10m++
    }
    // No more than a 10-metre cost preference for the closing cyclist.
    // Both eligible choices must already pass full continuous collision checks.
    choices.sort((a,b)=>{
     const costA=a.sacrificed+(priority?.protectedRiderId===a.id?10:0)
     const costB=b.sacrificed+(priority?.protectedRiderId===b.id?10:0)
     return costA-costB||b.behind-a.behind||a.id.localeCompare(b.id)
    })
    const best=choices[0],id=best.id
    if(priority&&best.id!==original.id){actualPreferenceChanges++;yieldOptions.priorityActualSwitched++}
    changes.set(id,Math.min(changes.get(id)??1,best.scale))
    targetedYieldDecisions++
   }else{
    for(const index of [i,j]){
     const id=sorted[index].riderId
     changes.set(id,Math.min(changes.get(id)??1,scales.get(id)/2))
    }
    symmetricFallbackEdges++
   }
  }
  for(const [id,scale] of changes)scales.set(id,scale)
 }
 throw Error('Unreachable targeted convergence')
}
