/**
 * Read-only categorical diagnosis of the first strict post-catch transfer
 * remaining after an evidence-gated DNF survivor pair repair.
 * Never export rider IDs, checkpoint IDs, group members or distances.
 */
const prefix='post_catch_group_transfer_without_physical_transition:';
const parseIssue=issue=>{
 if(typeof issue!=='string'||!issue.startsWith(prefix))return null;
 const tail=issue.slice(prefix.length);
 // The validator's own issue layout is riderId:fromCode->toCode:checkpointId.
 const m=/^([^:]+):([^:]+)->([^:]+):(.+)$/.exec(tail);
 if(!m)return null;
 return {riderId:m[1],fromCode:m[2],toCode:m[3],checkpointId:m[4]
   .split(':v4_private_phase=')[0]};
};
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
 a.length===b.length&&a.every((x,i)=>x===b[i]);
const members=(cp,id)=>cp?.groups?.find(g=>Array.isArray(g.riderIds)&&
 g.riderIds.includes(id))?.riderIds;
const physicalMembers=(func,cp,id)=>{
 if(typeof func!=='function'||!Number.isFinite(cp?.raceProgress?.kmFromStart))
  return null;
 try{
  const groups=func(cp.raceProgress.kmFromStart);
  return Array.isArray(groups)?groups.find(g=>Array.isArray(g?.riderIds)&&
   g.riderIds.includes(id))?.riderIds??null:null;
 }catch{return null;}
};
const transition=(from,to)=>from==='P'&&/^C\d+$/.test(to)?'P_TO_C':
 /^C\d+$/.test(from)&&to==='P'?'C_TO_P':
 /^C\d+$/.test(from)&&/^C\d+$/.test(to)?'C_TO_C':
 from===to?'NO_TRANSFER':'OTHER';
export function classifyPrivateDnfPairStrictResidualV4({
 timeline,blockingIssues,firstId,secondId,
 baselineIssue,physicalGroupsAtKm
}={}){
 const invalid={status:'UNAVAILABLE',position:'UNAVAILABLE',
  rider:'UNKNOWN',transfer:'UNAVAILABLE',
  publishedMembership:'UNAVAILABLE',physicalMembership:'UNAVAILABLE',
  kinds:'UNAVAILABLE'};
 const cps=timeline?.checkpoints;
 if(!Array.isArray(cps)||!Array.isArray(blockingIssues))return invalid;
 const firstIndex=cps.findIndex(c=>c.checkpointId===firstId);
 const secondIndex=cps.findIndex(c=>c.checkpointId===secondId);
 if(firstIndex<1||secondIndex!==firstIndex+1)return invalid;
 const old=parseIssue(baselineIssue);
 const found=blockingIssues.map(parseIssue).filter(Boolean);
 if(!found.length)return {...invalid,status:'NO_POST_CATCH_TRANSFER'};
 // Always distinguish multiple failures rather than silently picking one.
 if(found.length>1)return {...invalid,status:'MULTIPLE_TRANSFERS'};
 const issue=found[0];
 const index=cps.findIndex(c=>c.checkpointId===issue.checkpointId);
 if(index<1)return {...invalid,status:'ISSUE_CHECKPOINT_MISSING'};
 const previous=cps[index-1],current=cps[index];
 const before=members(previous,issue.riderId);
 const after=members(current,issue.riderId);
 const pm=physicalMembers(physicalGroupsAtKm,previous,issue.riderId);
 const cm=physicalMembers(physicalGroupsAtKm,current,issue.riderId);
 const kinds=[previous.checkpointKind,current.checkpointKind];
 const allowedKinds=['base','event'];
 const position=index<firstIndex?'BEFORE_PAIR':
  index===firstIndex?'INTO_FIRST':
  index===secondIndex?'FIRST_TO_SECOND':
  index===secondIndex+1?'OUT_OF_SECOND':'AFTER_PAIR';
 const kindsCategory=kinds.every(x=>allowedKinds.includes(x))?
  kinds.map(x=>x.toUpperCase()).join('_TO_'):'OTHER';
 return {status:'CLASSIFIED',position,
  rider:old?(issue.riderId===old.riderId?'SAME_AS_BASE_RESIDUAL':
    'DIFFERENT_FROM_BASE_RESIDUAL'):'UNKNOWN',
  transfer:transition(issue.fromCode,issue.toCode),
  publishedMembership:!before||!after?'UNAVAILABLE':
   same([...before].sort(),[...after].sort())?'UNCHANGED':'CHANGED',
  physicalMembership:!pm||!cm?'UNAVAILABLE':
   same([...pm].sort(),[...cm].sort())?'UNCHANGED':'CHANGED',
  kinds:kindsCategory};
}
