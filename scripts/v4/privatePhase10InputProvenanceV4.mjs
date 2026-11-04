/**
 * Private provenance diagnosis at the INPUT to Phase 10.
 * A pre-existing base checkpoint and a synthetic exact-event checkpoint have
 * different causes of an initially stale group partition. This module returns
 * fixed labels only; no rider, checkpoint, or location data leaves the worker.
 */
const partition=groups=>{
 if(!Array.isArray(groups)||groups.length===0)return null;
 const seen=new Set(),keys=[];
 for(const g of groups){
  if(!Array.isArray(g?.riderIds)||g.riderIds.length===0||
    g.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  g.riderIds.forEach(id=>seen.add(id));
  keys.push([...g.riderIds].sort().join('\u0000'));
 }
 return {ids:[...seen].sort(),keys:keys.sort()};
};
const eq=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
const same=(a,b)=>!!a&&!!b&&eq(a.ids,b.ids)&&eq(a.keys,b.keys);
export function classifyPrivatePhase10InputProvenanceV4({
 checkpoint,phase10Stages,baseTimeline,physicalGroupsAtKm
}={}){
 const unavailable={status:'UNAVAILABLE',origin:'UNAVAILABLE',
   initialParity:'UNAVAILABLE',baseParity:'UNAVAILABLE',
   inheritance:'UNAVAILABLE',interval:'UNAVAILABLE'};
 if(!checkpoint||!Array.isArray(baseTimeline?.checkpoints)||
   !Array.isArray(phase10Stages?.INITIAL)||
   typeof physicalGroupsAtKm!=='function')return unavailable;
 const km=checkpoint.raceProgress?.kmFromStart;
 if(!Number.isFinite(km))return unavailable;
 const initial=partition(phase10Stages.INITIAL);
 let physical;
 try{physical=partition(physicalGroupsAtKm(km));}catch{return unavailable;}
 if(!initial||!physical)return unavailable;
 const ordered=[...baseTimeline.checkpoints].filter(c=>
   Number.isFinite(c.raceProgress?.kmFromStart)).sort((a,b)=>
   a.raceProgress.kmFromStart-b.raceProgress.kmFromStart||
   a.checkpointIndex-b.checkpointIndex);
 const exact=checkpoint.checkpointId.includes(':phase10-exact:');
 const own=ordered.find(c=>c.checkpointId===checkpoint.checkpointId);
 const before=[...ordered].reverse().find(c=>c.raceProgress.kmFromStart<km-0.000001);
 const after=ordered.find(c=>c.raceProgress.kmFromStart>km+0.000001);
 const inherited=exact?before:own;
 if(!inherited)return {...unavailable,status:'BASE_NOT_FOUND',
   origin:exact?'EXACT_EVENT':'BASE_EVENT'};
 const base=partition(inherited.groups);
 let physicalBase;
 try{physicalBase=partition(physicalGroupsAtKm(inherited.raceProgress.kmFromStart));}
 catch{return unavailable;}
 if(!base||!physicalBase)return unavailable;
 const inheritance=same(initial,base)?'COPIED_BASE':'DIFFERS_FROM_BASE';
 const initialParity=same(initial,physical)?'INITIAL_PHYSICAL':'INITIAL_STALE';
 const baseParity=same(base,physicalBase)?'BASE_PHYSICAL':'BASE_STALE';
 let interval='NOT_APPLICABLE';
 if(exact){
   if(!before||!after)return unavailable;
   let pAfter;
   try{pAfter=partition(physicalGroupsAtKm(after.raceProgress.kmFromStart));}
   catch{return unavailable;}
   if(!pAfter)return unavailable;
   interval=same(physicalBase,physical)?'NO_CHANGE_BEFORE_EVENT':
      same(physical,pAfter)?'CHANGED_BEFORE_EVENT':'AMBIGUOUS_CHANGE';
 }
 const origin=exact?'EXACT_EVENT':'BASE_EVENT';
 const status=initialParity==='INITIAL_PHYSICAL'?'INITIAL_ALIGNED':
    inheritance==='COPIED_BASE'&&baseParity==='BASE_PHYSICAL'&&exact?
      'EXACT_INHERITED_STALE_BASE_MEMBERSHIP':
    inheritance==='COPIED_BASE'&&baseParity==='BASE_STALE'?
      'INHERITED_BASE_DRIFT':'UPSTREAM_REPLAY_DRIFT';
 return {status,origin,initialParity,baseParity,inheritance,interval};
}
