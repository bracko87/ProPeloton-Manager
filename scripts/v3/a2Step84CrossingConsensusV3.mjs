/** Step84: simultaneous shared crossing-order request consensus.
 *
 * All conflicts are derived from CURRENT states/commands and Step83
 * approximate 2D tubes. Votes accumulate first and are applied ONCE:
 * neither pair order nor rider ID determines priority or speed.
 *
 * No forecast is a clearance certificate; original A64 full-field
 * swept bicycle, road-edge, W-prime solver must accept every actual tick.
 */
import {jointReachableTubesV3} from './a2Step83JointTubesV3.mjs'
const EPS=1e-7,DT=.5,ACCEL=.45,BRAKE=.85;
const finite=Number.isFinite,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const q=x=>Math.round(x*1e6)/1e6;
const isMove=(s,r)=>Math.abs(s.y-r.targetY)>EPS;
function validate(states,requests){
 if(!Array.isArray(states)||states.length<2||states.length>168||
  !Array.isArray(requests)||requests.length!==states.length)
  throw Error('A84 invalid rider field');
 const ids=new Set();
 for(let k=0;k<states.length;k++){
  const s=states[k],r=requests[k];
  if(!s||!r||typeof s.id!=='string'||!s.id||ids.has(s.id)||
   r.id!==s.id||![s.x,s.y,s.v,r.speed,r.targetY].every(finite)||
   s.v<0||s.v>50||r.speed<0||r.speed>50||
   s.y<0||s.y>4.4||r.targetY<0||r.targetY>4.4)
   throw Error('A84 invalid rider requests');
  ids.add(s.id);
 }
}
/** The one group-wide contract is request-level conflict *resolution*,
 * not a claim of physically sufficient space-time feasibility.
 * Equal-x crossings without a geometry-based precedence cannot invent
 * a privileged rider. The involved steering requests both wait.
 */
export function step84CrossingConsensusV3(states,requests,{
 horizonSeconds=6,urgentSeconds=3.5,minimumMovingSpeed=7.5,
 brakeBufferM=2.65
}={}){
 validate(states,requests);
 if(![horizonSeconds,urgentSeconds,minimumMovingSpeed,brakeBufferM]
 .every(finite)||horizonSeconds<2||horizonSeconds>10||
 horizonSeconds/.5%1!==0||urgentSeconds<.5||
 urgentSeconds>horizonSeconds||minimumMovingSpeed<5||
 minimumMovingSpeed>12||brakeBufferM<2||brakeBufferM>4)
 throw Error('A84 invalid consensus bounds');
 const tubes=jointReachableTubesV3(states,requests,{horizonSeconds});
 const holds=Array(states.length).fill(false);
 const caps=Array(states.length).fill(Infinity);
 const boosts=Array(states.length).fill(-Infinity);
 const sourcePairs=Array.from({length:states.length},()=>new Set());
 let orderedPairs=0,ambiguousPairs=0,pairWarnings=0;
 for(const w of tubes.warnings){
  if(w.firstRiskSeconds>urgentSeconds)continue;
  const {i,j}=w,s=states;
  pairWarnings++;
  sourcePairs[i].add(j);sourcePairs[j].add(i);
  if(!w.ordered){
   // Mirror/rename invariant; don't allow an arbitrary winner.
   if(isMove(s[i],requests[i]))holds[i]=true;
   if(isMove(s[j],requests[j]))holds[j]=true;
   ambiguousPairs++;continue;
  }
  orderedPairs++;
  const ahead=w.ahead,behind=w.behind,lead=s[ahead],rear=s[behind];
  const gap=lead.x-rear.x,closing=Math.max(0,rear.v-lead.v);
  const required=brakeBufferM+2.5*closing+closing*closing/(2*BRAKE);
  const wantsMerge=isMove(rear,requests[behind]);
  // The rear rider cannot cross an occupied corridor until room exists.
  // Holding lateral steering is preferable to braking an entire row.
  if(wantsMerge&&gap<required+6)holds[behind]=true;
  // A leader can contribute space at bounded physical acceleration.
  if(gap<required+10){
   boosts[ahead]=Math.max(boosts[ahead],lead.v+ACCEL*DT);
   // Not a physical velocity reset; A64 strictly limits actual braking.
   // This is applied only by the pace-support variant.
   const modest=clamp(lead.v+(gap-required)/4,
     minimumMovingSpeed,Math.max(minimumMovingSpeed,lead.v+.5));
   caps[behind]=Math.min(caps[behind],modest);
  }
 }
 const groups=tubes.groups.filter(g=>g.some(i=>sourcePairs[i].size));
 return {tubes,holds,caps,boosts,
  groups,urgentPairs:pairWarnings,orderedPairs,ambiguousPairs,
  ridersWithConflicts:sourcePairs.filter(s=>s.size>0).length,
  holdCount:holds.filter(Boolean).length,
  capCount:caps.filter(finite).length,
  boostCount:boosts.filter(finite).length,
  geometryConsensusOnly:true,
  noPhysicalGuarantee:true,officialWrites:0};
}
function proposal(states,requests,consensus,mode){
 const out=requests.map(r=>({...r}));
 let holdsApplied=0,pacesCapped=0,leadersSupported=0;
 for(let i=0;i<states.length;i++){
  const s=states[i],r=out[i];
  if(consensus.holds[i]&&['crossing_hold','balanced',
   'limited_wave','gated_release'].includes(mode)&&isMove(s,r)){
   r.targetY=s.y;holdsApplied++;
  }
  if(['balanced','limited_wave'].includes(mode)&&
   finite(consensus.caps[i])&&
   consensus.caps[i]<r.speed-EPS){
   // Only in the most urgent local corridors; never drop requests
   // below the stated moving floor, and never force actual speeds.
   const low=mode==='limited_wave'?8.3:7.5;
   const cap=Math.max(low,consensus.caps[i]);
   if(cap<r.speed-EPS){r.speed=q(cap);pacesCapped++}
  }
  if(['balanced','gated_release'].includes(mode)&&
   finite(consensus.boosts[i])&&
   consensus.boosts[i]>r.speed+EPS){
   r.speed=q(clamp(consensus.boosts[i],0,50));leadersSupported++;
  }
 }
 return {policy:'consensus_'+mode,requests:out,
  holdsApplied,pacesCapped,leadersSupported,
  originalPhysicsMandatory:true,officialWrites:0};
}
export function step84ConsensusCandidatesV3(states,requests,{
 horizonSeconds=6,urgentSeconds=3.5
}={}){
 const consensus=step84CrossingConsensusV3(states,requests,{
  horizonSeconds,urgentSeconds});
 const candidates=['crossing_hold','limited_wave','balanced',
  'gated_release'].map(mode=>proposal(states,requests,consensus,mode));
 return {consensus,candidates,originalPhysicsMandatory:true,
  outputIsRequestedControlsOnly:true,officialWrites:0};
}
