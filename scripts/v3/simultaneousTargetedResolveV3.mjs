/** A2 research-only deterministic unilateral yield resolver.
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
 let totalChecks=0,firstConflicts=0,largestFirstConflictComponent=0,firstConflictComponents=0,targetedYieldDecisions=0,symmetricFallbackEdges=0
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
   return {paths:result,iterations,firstConflicts,pairConflictsChecked:totalChecks,blockedRiders:[...scales.values()].filter(s=>s<1).length,allPairsSweptClear:true,largestFirstConflictComponent,firstConflictComponents,targetedYieldDecisions,symmetricFallbackEdges}
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
   if(choices.length){
    choices.sort((a,b)=>a.sacrificed-b.sacrificed||b.behind-a.behind||a.id.localeCompare(b.id))
    const best=choices[0],id=best.id
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
