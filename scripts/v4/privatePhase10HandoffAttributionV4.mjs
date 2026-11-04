/**
 * Private Phase10 incident-to-publication partition attribution.
 * Compare each real checkpoint-construction stage with the authoritative
 * physical partition, excluding ONLY reached and status-confirmed DNFs.
 * Outputs fixed enums, never riders, checkpoints, km, or snapshots.
 */
const ORDER=['INITIAL','AFTER_DETACHMENT','AFTER_AUTONOMOUS_GROUPS','AFTER_CONSOLIDATION','AFTER_FINISH_COMMIT','AFTER_DISPLAY_NORMALIZATION'];
const partition=(groups,exclusions=new Set())=>{
 if(!Array.isArray(groups))return null;
 const seen=new Set(),out=[];
 for(const g of groups){
  if(!Array.isArray(g?.riderIds)||g.riderIds.some(id=>typeof id!=='string'||!id||seen.has(id)))return null;
  g.riderIds.forEach(id=>seen.add(id));
  const active=g.riderIds.filter(id=>!exclusions.has(id)).sort();
  if(active.length)out.push(active.join('\u0000'));
 }
 return {ids:[...seen].filter(id=>!exclusions.has(id)).sort(),groups:out.sort()};
};
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const equals=(a,b)=>!!a&&!!b&&same(a.ids,b.ids)&&same(a.groups,b.groups);
export function attributePrivatePhase10HandoffV4({
 checkpoint,physicalGroupsAtKm,phase10Stages,reachedDnfRiderIds
}={}){
 const unavailable={status:'UNAVAILABLE',firstDifference:'UNAVAILABLE',
  finalAlignment:'UNAVAILABLE',dnf:'UNAVAILABLE'};
 if(!checkpoint||typeof physicalGroupsAtKm!=='function'||
 !phase10Stages||typeof phase10Stages!=='object'||!Array.isArray(checkpoint.riderStates)||
 !Number.isFinite(checkpoint.raceProgress?.kmFromStart)||
 !Array.isArray(reachedDnfRiderIds)||new Set(reachedDnfRiderIds).size!==reachedDnfRiderIds.length||
 reachedDnfRiderIds.some(id=>typeof id!=='string'||!id))return unavailable;
 let physical;
 try{physical=partition(physicalGroupsAtKm(checkpoint.raceProgress.kmFromStart));}
 catch{return unavailable;}
 if(!physical)return unavailable;
 const reached=new Set(reachedDnfRiderIds);
 const activeDnf=[...reached].filter(id=>physical.ids.includes(id));
 const states=new Map(checkpoint.riderStates.map(s=>[s.riderId,s.status]));
 if(states.size!==checkpoint.riderStates.length)return unavailable;
 if(activeDnf.some(id=>states.get(id)!=='dnf'))
  return {status:'UNVERIFIED_DNF',firstDifference:'UNAVAILABLE',
   finalAlignment:'UNAVAILABLE',dnf:'STATUS_MISMATCH'};
 const expected=partition(physicalGroupsAtKm(checkpoint.raceProgress.kmFromStart),new Set(activeDnf));
 if(!expected)return unavailable;
 const snapshots=[];
 for(const name of ORDER){
  if(!Object.prototype.hasOwnProperty.call(phase10Stages,name))return unavailable;
  const p=partition(phase10Stages[name]);
  if(!p)return unavailable;
  snapshots.push({name,p});
 }
 const published=partition(checkpoint.groups);
 if(!published)return unavailable;
 // INITIAL must reflect complete pre-incident physical membership. Phase10
 // stages after detachment must represent active riders, never restored DNF.
 const initialAligned=equals(physical,snapshots[0].p);
 const active=arr=>({
   ids:arr.ids.filter(id=>!reached.has(id)),
   groups:arr.groups // partition keys are intentionally not edited after aggregation.
 });
 // Actual replay stage partitions can omit reached DNF, but must never include
 // nonphysical riders. Compare raw group membership exactly, not only labels.
 const expectedFromStage=arr=>equals(expected,arr);
 const stageAligned=snapshots.map((row,i)=>
  i===0?initialAligned:expectedFromStage(row.p));
 const finalAligned=equals(expected,published);
 const finalAlignment=finalAligned?'PHYSICAL_SURVIVORS_MATCH':
    same(expected.ids,published.ids)?'GROUP_MEMBERSHIP_DIFFERS':'RIDER_SET_DIFFERS';
 const firstWrong=stageAligned.findIndex((match,i)=>i>0&&!match);
 const firstDifference=!initialAligned?'INITIAL_DIFFERS':
   firstWrong>=0?'FIRST_'+snapshots[firstWrong].name:
   finalAligned?'NONE':'AFTER_PHASE10_STAGES';
 const dnf=activeDnf.length?
  (initialAligned?'CONFIRMED_DNF_EXCLUSION':'INITIAL_DNF_CONFLICT'):
  'NO_REACHED_DNF';
 return {status:'CLASSIFIED',firstDifference,finalAlignment,dnf};
}
