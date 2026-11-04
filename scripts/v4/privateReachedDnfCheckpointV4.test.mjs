import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPrivateReachedDnfCheckpointV4 as audit} from './privateReachedDnfCheckpointV4.mjs';
const checkpoint=(groups,status)=>({
 checkpointId:'late',raceProgress:{kmFromStart:90},
 groups:groups.map(riderIds=>({riderIds})),
 riderStates:status.map(([riderId,s])=>({riderId,status:s}))
});
const physicalGroupsAtKm=()=>[{riderIds:['a','b','c']}];
const stages={INITIAL:[{riderIds:['a','b','c']}],AFTER_DETACHMENT:[{riderIds:['a','b']}]};
const args={checkpointId:'late',physicalGroupsAtKm,phase10Stages:stages,
 reachedDnfRiderIds:['c'],timeline:{checkpoints:[checkpoint([['a','b']],[['a','racing'],['b','racing'],['c','dnf']])]}};
test('confirms DNF handoff without changing physical or replay groups',()=>{
 const original=JSON.stringify(args.timeline);
 assert.equal(audit(args).status,'DNF_HANDOFF_CONFIRMED');
 assert.equal(JSON.stringify(args.timeline),original);
});
test('rejects missing DNF status and non-DNF removal',()=>{
 const bad=checkpoint([['a','b']],[['a','racing'],['b','racing'],['c','racing']]);
 assert.equal(audit({...args,timeline:{checkpoints:[bad]}}).status,'DNF_STATE_UNVERIFIED');
 assert.equal(audit({...args,reachedDnfRiderIds:[]}).status,'UNEXPLAINED_REMOVAL');
});
test('rejects unjustified Phase10 membership and survivor exchange',()=>{
 assert.equal(audit({...args,phase10Stages:{...stages,INITIAL:[{riderIds:['a','c']},{riderIds:['b']}]}}).status,'INITIAL_NOT_PHYSICAL');
 const wrong=checkpoint([['a'],['b']],[['a','racing'],['b','racing'],['c','dnf']]);
 assert.equal(audit({...args,timeline:{checkpoints:[wrong]},phase10Stages:{...stages,AFTER_DETACHMENT:[{riderIds:['a']},{riderIds:['b']}]}}).status,'SURVIVOR_GROUP_MISMATCH');
});
