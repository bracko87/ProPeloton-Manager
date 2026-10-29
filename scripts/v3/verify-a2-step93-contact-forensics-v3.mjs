/** Step93 original A64 first swept-contact evidence. No repair or live writes. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createMultiGatePhysicalCandidateV3,advanceMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs';
const q=x=>Number.isFinite(x)?Math.round(x*1e5)/1e5:x;
const brief=s=>({id:s.id,x:q(s.x),y:q(s.y),v:q(s.v),
 targetY:q(s.targetY),startX:q(s.startX),
 wPrimeJ:q(s.energy.remainingWPrimeJoules)});
function gap(a,b){
 const dx=a.x-b.x,front=dx>0?a:b,rear=dx>0?b:a;
 return {longitudinalM:q(Math.abs(dx)),lateralM:q(Math.abs(a.y-b.y)),
  rowsApartM:q(Math.abs(a.startX-b.startX)),
  frontSpeedMps:q(front.v),rearSpeedMps:q(rear.v),
  closingMps:q(Math.max(0,rear.v-front.v)),
  idealMaxGapAfter4sM:q(Math.abs(dx)+(front.v-rear.v)*4+10.4)};
}
const dossiers=[];
for(const n of [106,168])for(const roadGeometry of ['staged_pinch','double_pinch'])
for(const pacePolicy of ['trajectory_strict_v1','lease_strict_v1','cohort_strict_v1']){
 const initial=createMultiGatePhysicalCandidateV3(n,{mode:'five_dense',
  roadGeometry,pacePolicy,headwayStandOffM:4.5,
  controllerPolicy:'coordinated_demand',coreMergePolicy:'preview_only',
  rollingStartSpeedMps:9});
 assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST');
 const immutable=JSON.stringify(initial);
 let field=initial;
 const history=[];
 for(let k=0;k<360&&!field.reason;k++){
  history.push({at:field.physical.at,
   riders:field.physical.states.map(brief)});
  if(history.length>14)history.shift();
  field=advanceMultiGatePhysicalCandidateV3(field);
 }
 assert.equal(JSON.stringify(initial),immutable);
 assert.equal(field.officialWrites,0);
 if(field.reason){
  assert.equal(field.status,'REJECTED');
  assert.equal(field.physical.reason,null,'Rejected A64 move committed');
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(field));
 }
 const m=multiGatePhysicalMetricsV3(initial,field);
 const pair=field.firstCollision?.pair??[];
 const byId=new Map(field.physical.states.map(s=>[s.id,s]));
 const riders=pair.map(id=>byId.get(id)).filter(Boolean);
 const mid=riders.length===2?(riders[0].x+riders[1].x)/2:null;
 const neighbors=mid===null?[]:field.physical.states.filter(s=>
   Math.abs(s.x-mid)<17).sort((a,b)=>
   Math.abs(a.x-mid)-Math.abs(b.x-mid)||
   Math.abs(a.y-2.2)-Math.abs(b.y-2.2)).slice(0,26).map(brief);
 const contact=field.firstCollision?{
  pair,time:field.firstCollision.time,
  withinStep:field.firstCollision.withinStep,
  originalA64ProposedStep:field.firstCollision.preCollisionField??null,
  achievedPair:riders.map(brief),
  achievedGap:riders.length===2?gap(...riders):null,
  nearbyAchievedRiders:neighbors,
  previousAccepted:history.map(h=>({at:h.at,
   pair:pair.map(id=>h.riders.find(s=>s.id===id)??null),
   nearbyCount:mid===null?0:h.riders.filter(s=>
    Math.abs(s.x-mid)<10).length}))
 }:null;
 if(field.reason==='SWEPT_CONTACT')
  assert(contact?.originalA64ProposedStep,
   'Missing original A64 swept contact trajectory evidence');
 const result={n,roadGeometry,pacePolicy,
  acceptedSeconds:field.physical.at,reason:field.reason??'FULL_180',
  contact,firstRoadViolation:field.firstRoadViolation??null,
  firstEnergyFailure:field.energyFailure??null,
  allPastSecondGate:m.allPastSecondReopening,
  nearStops:m.nearStops,
  selectedPolicyCounts:field.step90SelectedPolicies||
   field.step91SelectedPolicies||field.step92SelectedPolicies||{},
  officialWrites:0};
 dossiers.push(result);
 console.log(JSON.stringify({study:'A93_ACTUAL_CONTACT',n,roadGeometry,
  pacePolicy,acceptedSeconds:result.acceptedSeconds,
  reason:result.reason,contactPair:pair,
  achievedGap:contact?.achievedGap,
  acceptedPair:contact?.achievedPair,
  originalA64:contact?.originalA64ProposedStep,
  neighbors:neighbors.slice(0,12),
  policyCounts:result.selectedPolicyCounts}));
}
const report={study:'A93_ORIGINAL_A64_CONTACT_FORENSICS',
 cases:dossiers.length,
 full180:dossiers.filter(x=>x.acceptedSeconds===180&&!x.contact).length,
 firstContacts:dossiers.filter(x=>x.contact).length,
 originalA64Unchanged:true,officialWrites:0,dossiers};
const dir=process.env.V3_STEP93_DIAGNOSTICS_DIR??'/tmp/a93forensics';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/original-contact-dossiers.json',
 JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({study:report.study,cases:report.cases,
 full180:report.full180,firstContacts:report.firstContacts,officialWrites:0}));
