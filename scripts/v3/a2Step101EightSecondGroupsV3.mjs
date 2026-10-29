/** Step101: observe 8s race groups and physically local drafting on ACTUAL
 * original-A64 accepted rider states; no mutation or movement permission.
 * One group can contain many distinct speeds and rider positions.
 */
import {derivePhysicalGroupsV3} from '../../src/race-engine-v3/physicalGroupsV3.ts';
import {roadWattsRequiredV3} from '../../src/race-engine-v3/pelotonPowerBalanceV3.ts';
const finite=Number.isFinite;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const q=v=>Math.round(v*1e6)/1e6;
function checked(p){
  if(!p||!finite(p.at)||p.at<0||!Array.isArray(p.states)||
     !p.states.length||p.states.length>168)
    throw Error('A101 invalid accepted A64 frame');
  const ids=new Set();
  for(const s of p.states){
    if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||
       ![s.x,s.y,s.v].every(finite)||s.x<0||s.y<0||
       s.y>4.4||s.v<0||s.v>50)
      throw Error('A101 invalid unique achieved bicycle');
    ids.add(s.id);
  }
  return ids;
}
export function step101ObserveA64GroupsV3(accepted,previous=null,{
  courseMeters=5000,gradePercent=0,crosswindMps=0,
  headwindMps=0
}={}){
  const ids=checked(accepted);
  if(previous){
    const previousIds=checked(previous);
    if(previous.at>=accepted.at||previousIds.size!==ids.size||
       [...ids].some(id=>!previousIds.has(id)))
      throw Error('A101 invalid physical time or roster');
  }
  if(!finite(courseMeters)||courseMeters<=0||
     !finite(gradePercent)||Math.abs(gradePercent)>22||
     !finite(crosswindMps)||Math.abs(crosswindMps)>55||
     !finite(headwindMps)||Math.abs(headwindMps)>55||
     accepted.states.some(s=>s.x>courseMeters))
    throw Error('A101 invalid road or course');
  const original=JSON.stringify([accepted,previous]);
  const sample=p=>p?{
    elapsedSeconds:p.at,
    riders:p.states.map(s=>({riderId:s.id,meters:s.x}))
  }:null;
  const previousSample=sample(previous),currentSample=sample(accepted);
  const groupFrame=derivePhysicalGroupsV3(currentSample,previousSample,courseMeters);
  const groupById=new Map(groupFrame.assignments.map(a=>[a.riderId,a.groupCode]));
  // Measurable, provisional aerodynamic savings ONLY from real nearby bikes.
  // Two riders in the same <8s group need not be in each other's slipstream.
  // A draft report never increases v or overwrites the A64 energy ledger.
  const road={gradePercent,crosswindMps,headwindMps};
  const draft=accepted.states.map(s=>{
    let leader=null,minGap=Infinity,minLateral=Infinity;
    for(const other of accepted.states){
      if(other.id===s.id)continue;
      const dx=other.x-s.x,dy=Math.abs(other.y-s.y);
      if(dx<=2.25||dx>18||dy>=.84)continue;
      if(dx<minGap-1e-7||
         (Math.abs(dx-minGap)<1e-7&&dy<minLateral-1e-7)){
        leader=other;minGap=dx;minLateral=dy;
      }
    }
    const wind=clamp(1-Math.abs(crosswindMps)/16,0,1);
    const climb=clamp(1-Math.max(0,gradePercent)/9,0,1);
    const longitudinal=leader?clamp((18-minGap)/15,0,1):0;
    const lateral=leader?clamp(1-minLateral/.84,0,1):0;
    const shelter=q(.30*longitudinal*lateral*wind*climb);
    const exposed=roadWattsRequiredV3(s.v,83,.36,road);
    const sheltered=roadWattsRequiredV3(s.v,83,.36*(1-shelter),road);
    return {riderId:s.id,groupCode:groupById.get(s.id),
      leaderId:leader?.id??null,
      longitudinalGapMeters:leader?q(minGap):null,
      shelterFraction:shelter,
      aerodynamicSavingWatts:q(Math.max(0,exposed-sheltered)),
      advisoryOnly:true};
  });
  if(JSON.stringify([accepted,previous])!==original)
    throw Error('A101 observer mutated accepted physical fields');
  return {atSeconds:accepted.at,groupingThresholdSeconds:8,
    pelotonCode:groupFrame.pelotonCode,groups:groupFrame.groups,
    assignments:groupFrame.assignments,draft,
    riderCount:accepted.states.length,
    everyRiderInExactlyOneGroup:groupFrame.assignments.length===ids.size,
    groupMembershipDoesNotEqualSpeedLock:true,
    actualLocalDraftNotAutomaticGroupBoost:true,
    noA64CommandChanges:true,noRiderEnergyChanges:true,
    researchOnly:true,officialWrites:0};
}
