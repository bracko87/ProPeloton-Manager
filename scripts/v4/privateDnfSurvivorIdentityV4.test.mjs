import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateDnfSurvivorIdentityV4 as build} from './privateDnfSurvivorIdentityV4.mjs';
const grp=(code,ids)=>({groupCode:'dropped_group',displayCode:code,riderIds:ids,physicalPosition:'behind_peloton'});
const before={checkpointId:'a',raceProgress:{kmFromStart:90},groups:[grp('P',['a','b','c']),grp('C2',['d'])],finalResultsVisible:false};
const current={checkpointId:'b',raceProgress:{kmFromStart:90},
 groups:[grp('C1',['a','b']),grp('C2',['d'])],
 gaps:[{groupCode:'dropped_group',displayCode:'C1',gapSeconds:25},{groupCode:'dropped_group',displayCode:'C2',gapSeconds:50}],
 riderStates:[...['a','b'].map(riderId=>({riderId,status:'racing',groupCode:'dropped_group',displayCode:'C1',gapSeconds:25})),
 {riderId:'c',status:'dnf',groupCode:null,displayCode:null,gapSeconds:null},
 {riderId:'d',status:'racing',groupCode:'dropped_group',displayCode:'C2',gapSeconds:50}],
 commentary:[{eventType:'incident'}],finalResultsVisible:false};
const args={timeline:{checkpoints:[before,current]},checkpointId:'b',riderId:'a',
 reachedDnfRiderIds:['c'],physicalGroupsAtKm:()=>[{riderIds:['a','b','c']},{riderIds:['d']}],
 phase10Stages:{INITIAL:[{riderIds:['a','b','c']},{riderIds:['d']}],
 AFTER_DETACHMENT:[{riderIds:['a','b']},{riderIds:['d']}]}};
test('relabels confirmed DNF survivors while preserving status and physical membership',()=>{
 const out=build(args);
 assert.equal(out.status,'DNF_SURVIVOR_IDENTITY_CREATED');
 assert.equal(out.timeline.checkpoints[1].groups[0].displayCode,'P');
 assert.equal(out.timeline.checkpoints[1].gaps[0].gapSeconds,25);
 assert.equal(out.timeline.checkpoints[1].riderStates[2].status,'dnf');
 assert.equal(out.timeline.checkpoints[1].riderStates[2].displayCode,null);
 assert.equal(out.timeline.checkpoints[1].commentary[0].eventType,'incident');
 assert.equal(current.groups[0].displayCode,'C1');
 assert.equal(out.officialWrites,0);
});
test('rejects unconfirmed DNF, unrelated rider movement and code collision',()=>{
 assert.equal(build({...args,reachedDnfRiderIds:[]}).status,'EVIDENCE_NOT_CONFIRMED');
 const moved={...before,groups:[grp('P',['a','c']),grp('C2',['b','d'])]};
 assert.equal(build({...args,timeline:{checkpoints:[moved,current]}}).status,'MEMBERSHIP_CHANGED');
 const collision={...current,groups:[...current.groups,grp('P',['e'])]};
 assert.equal(build({...args,timeline:{checkpoints:[before,collision]}}).status,'EVIDENCE_NOT_CONFIRMED');
});
