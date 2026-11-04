import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateExactEventPhysicalCandidateV4 as build} from './privateExactEventPhysicalCandidateV4.mjs';
const g=(code,ids)=>({displayCode:code,groupCode:'dropped_group',riderIds:ids});
const initial={checkpointId:'base',raceProgress:{kmFromStart:80},groups:[g('C1',['a','b']),g('C2',['c'])]};
const event={checkpointId:'race:phase10-exact:incident-1:90.000000',
 raceProgress:{kmFromStart:90},groups:initial.groups,
 gaps:[{displayCode:'C1',groupCode:'dropped_group',gapSeconds:5},
 {displayCode:'C2',groupCode:'dropped_group',gapSeconds:9}],
 riderStates:['a','b','c'].map(id=>({riderId:id,status:'racing',energy:12,displayCode:'C1'})),
 commentary:[{eventType:'incident'}],finalResultsVisible:false};
const future={checkpointId:'next',raceProgress:{kmFromStart:95},
 groups:[g('C1',['a']),g('C2',['b','c'])],
 gaps:[{displayCode:'C1',groupCode:'dropped_group',gapSeconds:7},
 {displayCode:'C2',groupCode:'dropped_group',gapSeconds:11}],
 finalResultsVisible:false};
const physicalGroupsAtKm=km=>km<90?
 [{riderIds:['a','b'],gapSeconds:5},{riderIds:['c'],gapSeconds:9}]:
 [{riderIds:['a'],gapSeconds:7},{riderIds:['b','c'],gapSeconds:11}];
const args={timeline:{checkpoints:[initial,event,future]},checkpointId:event.checkpointId,
 physicalGroupsAtKm,baseTimeline:{checkpoints:[initial,future]},
 provenance:{status:'EXACT_INHERITED_STALE_BASE_MEMBERSHIP',interval:'CHANGED_BEFORE_EVENT'},
 reachedDnfRiderIds:[]};
test('repairs only exact event with verified future identities and exact physical gaps',()=>{
 const out=build(args);
 assert.equal(out.status,'EXACT_EVENT_CANDIDATE_CREATED');
 assert.deepEqual(out.timeline.checkpoints[1].groups.map(x=>x.riderIds),[['a'],['b','c']]);
 assert.equal(out.timeline.checkpoints[1].riderStates[1].displayCode,'C2');
 assert.equal(out.timeline.checkpoints[1].riderStates[1].energy,12);
 assert.equal(out.timeline.checkpoints[1].commentary[0].eventType,'incident');
 assert.deepEqual(event.groups[0].riderIds,['a','b']);
 assert.equal(out.officialWrites,0);
});
test('rejects gap invention, unsupported provenance and nonphysical future grouping',()=>{
 assert.equal(build({...args,provenance:{status:'INHERITED_BASE_DRIFT'}}).status,'PROVENANCE_NOT_CONFIRMED');
 assert.equal(build({...args,physicalGroupsAtKm:km=>km<90?
 physicalGroupsAtKm(km):[{riderIds:['a'],gapSeconds:8},{riderIds:['b','c'],gapSeconds:11}]}).status,'PHYSICAL_GAP_MISMATCH');
 assert.equal(build({...args,physicalGroupsAtKm:km=>km===95?
 [{riderIds:['a','b'],gapSeconds:5},{riderIds:['c'],gapSeconds:9}]:physicalGroupsAtKm(km)}).status,'FUTURE_GROUPS_NOT_PHYSICAL');
});
test('cannot resurrect DNF rider or change official finish',()=>{
 const changed={...event,riderStates:event.riderStates.map(s=>s.riderId==='c'?{...s,status:'dnf'}:s)};
 assert.equal(build({...args,timeline:{checkpoints:[initial,changed,future]},
 reachedDnfRiderIds:['c']}).status,'FUTURE_GROUPS_NOT_PHYSICAL');
 assert.equal(build({...args,timeline:{checkpoints:[initial,{...event,finalResultsVisible:true},future]}}).status,'CHECKPOINT_UNSAFE');
});
