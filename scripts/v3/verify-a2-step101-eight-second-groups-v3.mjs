import assert from 'node:assert/strict';
import {derivePhysicalGroupsV3} from '../../src/race-engine-v3/physicalGroupsV3.ts';
import {derivePhysicalGroupTimelineV3} from '../../src/race-engine-v3/physicalGroupTimelineV3.ts';
import {step101ObserveA64GroupsV3} from './a2Step101EightSecondGroupsV3.mjs';
import {step97BuildGlobalTimetableProbeV3} from './a2Step97TimetableProbeV3.mjs';
import {advanceMultiGatePhysicalCandidateV3} from './a2MultiGatePhysicalCandidateV3.mjs';
const course=5000;
const startRiders=Array.from({length:120},(_,i)=>({
  riderId:'r'+String(i).padStart(3,'0'),
  meters:600-Math.floor(i/5)*5.2
}));
const make=(t,offset,breakaway=false,dropped=false)=>({
  elapsedSeconds:t,riders:startRiders.map((r,i)=>({
    ...r,meters:r.meters+offset+
      (breakaway&&i<10?90:0)-(dropped&&i===119?130:0)
  }))
});
const initial=make(0,0);
const initialGroups=derivePhysicalGroupsV3(initial,null,course);
assert.equal(initialGroups.groups.length,1,'120-rider start must be one peloton');
assert.equal(initialGroups.groups[0].riderIds.length,120);
const moved=make(20,180,true,true);
const groups=derivePhysicalGroupsV3(moved,initial,course);
assert.deepEqual(groups.groups.map(g=>[g.code,g.riderIds.length]),
  [['B1',10],['P',109],['G1',1]]);
const recovered=make(40,400);
const timeline=derivePhysicalGroupTimelineV3([initial,moved,recovered],course);
assert.deepEqual(timeline[1].groups.map(g=>[g.id,g.riderIds.length]),
  [['B1',10],['P',109],['G1',1]]);
assert.deepEqual(timeline[2].groups.map(g=>[g.id,g.riderIds.length]),
  [['P',120]]);
assert(timeline[2].events.some(e=>e.kind==='breakaway_caught'&&
  e.groupId==='B1'&&e.intoGroupId==='P'));
assert(timeline[2].events.some(e=>e.kind==='group_merged'&&
  e.groupId==='G1'&&e.intoGroupId==='P'));
const two=(followerMeters)=>derivePhysicalGroupsV3(
  {elapsedSeconds:10,riders:[{riderId:'lead',meters:90},
    {riderId:'tail',meters:followerMeters}]},
  {elapsedSeconds:0,riders:[{riderId:'lead',meters:0},
    {riderId:'tail',meters:0}]},course);
assert.equal(two(50).groups.length,1,'exact 8.0 seconds joins');
assert.equal(two(50.1).groups.length,1,'below 8 seconds joins');
assert.equal(two(49.9).groups.length,2,'above 8 seconds separates');
// Ten individual leader coordinates 6s apart form ONE connected race
// group; every adjacent time gap meets the 8s membership rule.
const chain=Array.from({length:10},(_,i)=>({
  riderId:'x'+i,meters:1000-60*i
}));
const linked=derivePhysicalGroupsV3(
  {elapsedSeconds:20,riders:chain},
  {elapsedSeconds:0,riders:chain.map(x=>({...x,meters:x.meters-200}))},
  course);
assert.equal(linked.groups.length,1,'do not create ten synthetic solos');
const accepted={at:0,states:[
  {id:'leader',x:620,y:1.25,v:9},
  {id:'drafting',x:614,y:1.25,v:9},
  {id:'alone',x:410,y:3.15,v:9}
]};
const original=JSON.stringify(accepted);
const audit=step101ObserveA64GroupsV3(accepted);
assert.equal(audit.groups.length,2);
assert.equal(audit.draft.find(x=>x.riderId==='drafting').leaderId,'leader');
assert(audit.draft.find(x=>x.riderId==='drafting').aerodynamicSavingWatts>0);
assert.equal(audit.draft.find(x=>x.riderId==='alone').aerodynamicSavingWatts,0);
assert.equal(audit.draft.find(x=>x.riderId==='leader').aerodynamicSavingWatts,0);
assert.equal(JSON.stringify(accepted),original);
const headwind=step101ObserveA64GroupsV3(accepted,null,{crosswindMps:55});
assert.equal(headwind.draft.find(x=>x.riderId==='drafting').aerodynamicSavingWatts,0);
const incline=step101ObserveA64GroupsV3(accepted,null,{gradePercent:12});
assert.equal(incline.draft.find(x=>x.riderId==='drafting').aerodynamicSavingWatts,0);
assert.throws(()=>step101ObserveA64GroupsV3({
  at:0,states:[accepted.states[0],accepted.states[0]]}));
const renamed=step101ObserveA64GroupsV3({...accepted,
  states:accepted.states.map(s=>({...s,id:'name'+s.id}))});
assert.deepEqual(audit.groups.map(g=>g.riderIds.length),
  renamed.groups.map(g=>g.riderIds.length));
const mirrored=step101ObserveA64GroupsV3({...accepted,
  states:accepted.states.map(s=>({...s,y:4.4-s.y}))});
assert.deepEqual(audit.groups.map(g=>g.riderIds.length),
  mirrored.groups.map(g=>g.riderIds.length));
assert.deepEqual(audit.draft.map(d=>d.aerodynamicSavingWatts),
  mirrored.draft.map(d=>d.aerodynamicSavingWatts));
// A64 remains the physical authority: read an accepted original A64 state,
// rather than fabricating movement from a group membership.
const initialA64=step97BuildGlobalTimetableProbeV3(8,{
  roadGeometry:'double_pinch',pacePolicy:'multirow_gap_strict_v1',
  spacingSeconds:.35}).initial;
const a64Start=step101ObserveA64GroupsV3(initialA64.physical);
assert.equal(a64Start.groups.length,1);
const nextA64=advanceMultiGatePhysicalCandidateV3(initialA64);
assert.equal(nextA64.reason,null);
const acceptedObservation=step101ObserveA64GroupsV3(
  nextA64.physical,initialA64.physical);
assert.equal(acceptedObservation.assignments.length,8);
assert.equal(acceptedObservation.officialWrites,0);
console.log(JSON.stringify({study:'A101_EIGHT_SECOND_DYNAMIC_PHYSICAL_GROUPS',
  status:'PASS',initialPeloton:120,breakaway:10,dropped:1,
  groupsAfterSplit:groups.groups.length,afterCatch:timeline[2].groups.length,
  thresholdSeconds:8,exactBoundaryJoined:true,chainRidersOneGroup:10,
  acceptedA64Seconds:nextA64.physical.at,
  directDraftWattsSaved:audit.draft.find(x=>x.riderId==='drafting').aerodynamicSavingWatts,
  zeroFreeGroupSpeed:true,mirror:true,rename:true,officialWrites:0}));
