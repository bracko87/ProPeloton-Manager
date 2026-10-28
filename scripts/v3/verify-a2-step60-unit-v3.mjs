/** A60 fast isolated acceptance controls; never touches live race state. */
import assert from 'node:assert/strict'
import {currentLaneIntentWarningsV3,auditFirstFullFieldContactV3} from './a2FirstContactFeasibilityV3.mjs'
const road={laneCount:3,centerStepM:1.1,lateralCollisionM:.5}
const states=[{id:'rear',x:100,y:0,v:10},{id:'lead',x:104,y:0,v:8}]
const actions=[{id:'rear',y1:0,accel:0},{id:'lead',y1:0,accel:0}]
assert.deepEqual(currentLaneIntentWarningsV3(states,actions,road,1).brakeRiders,['rear'])
assert.deepEqual(currentLaneIntentWarningsV3(
 [{...states[0],x:0},{...states[1],x:100}],actions,road,1).brakeRiders,[])
// Projected lane convergence triggers a warning even though current lanes differ.
const changing=[{id:'rear',x:100,y:.5,v:10},{id:'lead',x:104,y:1.1,v:8}]
const intended=[{id:'rear',y1:.88,accel:0},{id:'lead',y1:1.1,accel:0}]
assert.equal(currentLaneIntentWarningsV3(changing,intended,road,1).reasons[0].geometry,'PROJECTED_LANE_CROSSING')
const reflected=changing.map(x=>({...x,y:2.2-x.y}))
const reversed=intended.map(x=>({...x,y1:2.2-x.y1}))
assert.deepEqual(currentLaneIntentWarningsV3(reflected,reversed,road,1).brakeRiders,['rear'])
const renamed=changing.map(x=>({...x,id:x.id==='rear'?'z99':'z01'}))
const renamedActs=intended.map(x=>({...x,id:x.id==='rear'?'z99':'z01'}))
assert.deepEqual(currentLaneIntentWarningsV3(renamed,renamedActs,road,1).brakeRiders,['z99'])
assert.throws(()=>currentLaneIntentWarningsV3(changing,[intended[0],intended[0]],road,1))
assert.equal(currentLaneIntentWarningsV3(states,actions,road,1).usesHindsight,false)
// Audit a synthetic first contact using immutable initial state.
const preview={tickStartSeconds:0,substep:1,proposals:[
 {riderId:'rear',x0:100,y0:0,oldSpeedMps:10,requestedY:0},
 {riderId:'lead',x0:104,y0:0,oldSpeedMps:8,requestedY:0}
]}
const source=[{previews:[preview]},...Array.from({length:5},()=>({previews:[]}))]
const probe={records:[{t0:0,t1:1,collision:{pair:['lead','rear']}}],
 firstBlocker:{pair:['lead','rear'],whenSeconds:.25},complete:false}
const audit=auditFirstFullFieldContactV3(source,road,1,1,probe)
assert.equal(audit.status,'COLLISION')
assert.equal(audit.firstPairKind,'SAME_OR_OVERLAPPING_CORRIDOR')
assert.equal(audit.rearClosingSpeedMps,2)
assert.equal(audit.leadFromOriginalWarningSeconds,.25)
assert.equal(audit.officialWrites,0)
console.log('Step60 bounded current-state warnings and first-contact audit unit checks PASS')
