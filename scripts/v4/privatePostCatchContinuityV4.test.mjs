import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPrivatePostCatchContinuityV4 as classify} from './privatePostCatchContinuityV4.mjs';
const group=(...rows)=>rows.map(riderIds=>({riderIds}));
const old={checkpointId:'a',raceProgress:{kmFromStart:80},groups:group(['a','b'],['c']),commentary:[]};
const changed={checkpointId:'b',raceProgress:{kmFromStart:85},groups:group(['a'],['b','c']),commentary:[{eventType:'incident'}]};
const args={timeline:{checkpoints:[old,changed]},checkpointId:'b',
 physicalGroupsAtKm:()=>group(['a','b'],['c'])};
test('distinguishes stable physics from undocumented incident replay movement',()=>{
 const result=classify(args);
 assert.equal(result.phys,'PHYSICALLY_STABLE');
 assert.equal(result.source,'CURRENT_MISMATCH');
 assert.equal(result.movement,'PRESENTATION_MEMBERSHIP_CHANGE');
 assert.equal(result.commentary,'INCIDENT_ONLY');
 assert.equal(result.status,'CLASSIFIED');
});
test('recognizes fully physically aligned transition when physical change is verified',()=>{
 const result=classify({...args,physicalGroupsAtKm:km=>
  km<85?group(['a','b'],['c']):group(['a'],['b','c'])});
 assert.equal(result.source,'BOTH_ALIGNED');
 assert.equal(result.phys,'PHYSICAL_CHANGE');
});
test('refuses same kilometre to imply a physical change',()=>{
 const result=classify({...args,timeline:{checkpoints:[old,{...changed,raceProgress:{kmFromStart:80}}]}});
 assert.equal(result.phys,'PHYSICALLY_STABLE');
});
