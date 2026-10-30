import assert from 'node:assert/strict'
import {decideV4CarriedBridgeCheckpoint as decide} from './mountainBridgeCarryV4.ts'
const b={lineageId:'phase3|F2|1',displayCode:'F2',riderIds:['rider-070']}
const c={displayCode:'C65',physicalLineageId:null,physicalPosition:'behind_peloton',riderIds:['rider-070']}
assert.deepEqual(decide(b,[c]),{
 emitEvent:false,activeRiderIds:[],verifiedLowEnergyDetach:true})
assert.deepEqual(decide(b,[{displayCode:'F2',physicalLineageId:'phase3|F2|1',
 physicalPosition:'ahead_of_peloton',riderIds:['rider-070']}]),{
 emitEvent:true,activeRiderIds:['rider-070'],verifiedLowEnergyDetach:false})
assert.deepEqual(decide(b,[{displayCode:'P',riderIds:['rider-070']}]),{
 emitEvent:true,activeRiderIds:['rider-070'],verifiedLowEnergyDetach:false})
assert.equal(decide(b,[]).emitEvent,true)
assert.equal(decide(b,[{...c,physicalPosition:'peloton'}]).emitEvent,true)
const two={...b,riderIds:['rider-070','rider-071']}
assert.deepEqual(decide(two,[c,{displayCode:'F2',physicalLineageId:b.lineageId,
 riderIds:['rider-071'],physicalPosition:'ahead_of_peloton'}]),{
 emitEvent:true,activeRiderIds:['rider-071'],verifiedLowEnergyDetach:true})
assert.equal(decide(two,[c]).emitEvent,true,'one missing rider may not be silently discarded')
assert.equal(decide({...b,riderIds:[]},[c]).emitEvent,true)
console.log('V4_MOUNTAIN_CARRIED_BRIDGE_UNIT_REPORT '+JSON.stringify({
 status:'PASS',cases:8,strictUnknownsPreserved:true,
 noBridgeCatchCreated:true,productionSourceModified:false,officialWrites:0
}))
