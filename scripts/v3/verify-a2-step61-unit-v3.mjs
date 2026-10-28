/** A61 isolated controls for current-state anticipatory intent and history. */
import assert from 'node:assert/strict'
import {upstreamWarningsV3,precedingPhysicalCheckpointsV3} from './a2UpstreamPredictionV3.mjs'
const g={laneCount:3,centerStepM:1.1,lateralCollisionM:.5}
const states=[{id:'r',x:100,y:0,v:10},{id:'l',x:114,y:0,v:7}]
const actions=[{id:'r',y1:0,accel:0},{id:'l',y1:0,accel:0}]
assert.deepEqual(upstreamWarningsV3(states,actions,g,.5,{lookaheadSeconds:5}).brakeRiders,['r'])
assert.deepEqual(upstreamWarningsV3(states,actions,g,.5,{lookaheadSeconds:3}).brakeRiders,['r'])
const apart=[{...states[0],y:0},{...states[1],y:2.2}]
assert.deepEqual(upstreamWarningsV3(apart,[actions[0],{...actions[1],y1:2.2}],g,.5).brakeRiders,[])
const M=states.map(s=>({...s,y:2.2-s.y}))
const MA=actions.map(a=>({...a,y1:2.2-a.y1}))
assert.deepEqual(upstreamWarningsV3(M,MA,g,.5).brakeRiders,['r'])
const N=states.map(s=>({...s,id:s.id==='r'?'z9':'z1'}))
const NA=actions.map(a=>({...a,id:a.id==='r'?'z9':'z1'}))
assert.deepEqual(upstreamWarningsV3(N,NA,g,.5).brakeRiders,['z9'])
const source=Array.from({length:6},(_,tick)=>({previews:Array.from({length:10},(_,i)=>({
 tickStartSeconds:tick*10,substep:i+1,proposals:states
}))}))
assert.equal(precedingPhysicalCheckpointsV3(source,6,1,{maxSeconds:5}).length,5)
assert.equal(precedingPhysicalCheckpointsV3(source,1,1,{maxSeconds:5}).length,0)
assert.throws(()=>upstreamWarningsV3(states,[actions[0],actions[0]],g,.5))
console.log('A61 standalone current-state upstream warning and prior-checkpoint audit controls PASS')
