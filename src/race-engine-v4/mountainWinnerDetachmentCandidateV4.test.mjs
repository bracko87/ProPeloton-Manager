import assert from 'node:assert/strict'
import {coalesceV4CoincidentDetachmentGroups as reconcile} from './mountainWinnerDetachmentCandidateV4.mjs'
const group=(code,riders,gap,extra={})=>({displayCode:code,groupCode:'chasing_group',
 physicalPosition:'behind_peloton',riderIds:riders,gapSeconds:gap,...extra})
const source=[group('P',['a','b','c'],0,{groupCode:'main_peloton'}),group('F1',['d'],3)]
const duplicate=[group('C1',['a'],6),group('C2',['b'],6),group('C3',['c'],7)]
const output=reconcile(source,duplicate)
assert.equal(output.length,2)
assert.deepEqual(output[0].riderIds,['a','b'])
assert.equal(output[0].gapSeconds,6)
assert.equal(output[0].displayCode,'C1')
assert.equal(output[1].displayCode,'C3')
assert.deepEqual(reconcile(source,[group('C1',['a'],6),group('C2',['d'],6)]).map(g=>g.displayCode),['C1','C2'])
assert.equal(reconcile(source,[group('C1',['a'],6),group('C2',['b'],6,{physicalLineageId:'bridge-a'})]).length,2)
assert.equal(reconcile(source,[group('C1',['a'],6),group('C2',['b'],6,{groupCode:'dropped_group'})]).length,2)
assert.equal(reconcile(source,[group('C1',['a'],6),group('C2',['b'],6.001)]).length,2)
assert.equal(reconcile(source,[group('C1',['a'],6),group('C2',['b'],6,{physicalPosition:'ahead_of_peloton'})]).length,2)
assert.deepEqual(duplicate.map(x=>x.riderIds),[['a'],['b'],['c']])
assert.throws(()=>reconcile([group('P',['a'],0),group('P2',['a'],0)],duplicate),/duplicate source/)
console.log('V4_MOUNTAIN_DETACHMENT_COALESCE_CANDIDATE_UNIT '+JSON.stringify({status:'PASS',syntheticOnly:true,officialWrites:0}))
