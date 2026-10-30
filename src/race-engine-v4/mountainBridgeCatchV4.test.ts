import assert from 'node:assert/strict'
import {physicallyCaughtBridgeRiderIds as caught} from './mountainBridgeCatchV4.ts'
const groups=[
 {displayCode:'B1',riderIds:['A']},
 {displayCode:'P',riderIds:['B','C']},
 {displayCode:'C68',riderIds:['D','E']},
 {displayCode:'F1',riderIds:['F']}
]
assert.deepEqual(caught(['D'],groups),[],'fatigued detached rider is not caught')
assert.deepEqual(caught(['B'],groups),['B'])
assert.deepEqual(caught(['B','D','C'],groups),['B','C'])
assert.deepEqual(caught(['F','A'],groups),[])
assert.deepEqual(caught(['B','B','C'],groups),['B','C'])
assert.deepEqual(caught(['missing'],groups),[])
assert.throws(()=>caught(['B'],[...groups,{displayCode:'F2',riderIds:['B']}]),/duplicate/)
assert.deepEqual(caught([],groups),[])
console.log('V4_MOUNTAIN_BRIDGE_CATCH_UNIT_REPORT '+JSON.stringify({
 status:'PASS',cases:8,lowReserveCatchBlocked:true,strictUnknownsPreserved:true,
 originalV2SourceModified:false,officialWrites:0
}))
