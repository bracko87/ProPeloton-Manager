import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {derivePhysicalGroupTimelineV3,initializePhysicalGroupTimelineV3,advancePhysicalGroupTimelineV3} from '../../src/race-engine-v3/physicalGroupTimelineV3.ts'
import {initializePhysicalRaceV3,advancePhysicalRaceV3} from '../../src/race-engine-v3/physicalRaceEngineV3.ts'
// Toy race physically launches B1, holds the gap, and catches it. No group
// may vanish without an actual position-based physical catch/merge.
const frames=[
 {elapsedSeconds:0,riders:[{riderId:'A',meters:0},{riderId:'B',meters:0},{riderId:'C',meters:0},{riderId:'D',meters:0}]},
 {elapsedSeconds:40,riders:[{riderId:'A',meters:500},{riderId:'B',meters:420},{riderId:'C',meters:415},{riderId:'D',meters:417}]},
 {elapsedSeconds:80,riders:[{riderId:'A',meters:900},{riderId:'B',meters:820},{riderId:'C',meters:815},{riderId:'D',meters:817}]},
 {elapsedSeconds:120,riders:[{riderId:'A',meters:1260},{riderId:'B',meters:1250},{riderId:'C',meters:1245},{riderId:'D',meters:1248}]},
]
const timeline=derivePhysicalGroupTimelineV3(frames,2000)
assert.deepEqual(timeline[1].groups.map(x=>x.code),['B1','P'])
assert.deepEqual(timeline[2].groups.map(x=>x.code),['B1','P'])
assert(timeline[1].groups[0].positiveGapSeconds>0)
assert.equal(timeline[1].groups[0].relationToPeloton,'ahead')
assert.deepEqual(timeline[3].groups.map(x=>x.code),['P'])
assert.deepEqual(timeline[3].events.map(x=>[x.kind,x.groupId,x.intoGroupId]),[['breakaway_caught','B1','P']])
assert(timeline.every(f=>new Set(f.assignments.map(x=>x.riderId)).size===4))
const resumable=initializePhysicalGroupTimelineV3(2000)
for(const f of frames)advancePhysicalGroupTimelineV3(resumable,f)
assert.deepEqual(resumable.history,timeline,'Resumed physical group projection changed event history')
assert.throws(()=>derivePhysicalGroupTimelineV3([...frames,{elapsedSeconds:121,riders:frames[3].riders.map(r=>r.riderId==='A'?{...r,meters:r.meters+100}:r)}],2000),/teleportation/)
const finishedFrames=[...frames.slice(0,3),{elapsedSeconds:160,riders:[{riderId:'A',meters:2000},{riderId:'B',meters:1480},{riderId:'C',meters:1478},{riderId:'D',meters:1477}]},{elapsedSeconds:220,riders:[{riderId:'A',meters:2000},{riderId:'B',meters:2000},{riderId:'C',meters:2000},{riderId:'D',meters:2000}]}]
const finished=derivePhysicalGroupTimelineV3(finishedFrames,2000)
assert.equal(finished.at(-1).finishedRiderIds.length,4)
assert.deepEqual(finished.at(-1).groups,[])
assert.equal(finished.at(-1).events.some(e=>e.kind==='breakaway_caught'),false)
assert.equal(finished.at(-2).events.some(e=>e.kind==='group_finished'&&e.groupId==='B1'),true)
assert.equal(finished.at(-1).assignments.filter(a=>a.groupId==='FINISHED').length,4)
console.log('PASS persistent B1 survives frame boundaries, retires on physical catch, and finishers never fake a catch')
// Verify the same read-only projection against a FULL frozen production roster.
const csv=readFileSync(new URL('./fixtures/dordrecht-2000-10-15.csv',import.meta.url),'utf8').trim().split('\n')
const riders=csv.slice(1).map(row=>{const [idx,team,flat,hills,climbing,cobbles,stamina,form,fatigue]=row.split(',').map(Number);return {riderId:'r'+String(idx).padStart(3,'0'),teamId:'t'+String(team).padStart(2,'0'),flat,hills,climbing,cobbles,stamina,form,fatigue}})
const points=[[0,2],[7.5,4],[14,1],[22.5,3],[31.5,0],[39,2],[43.5,3],[52,1],[61,4],[70,1],[82.5,3],[94,2],[104,5],[112,6],[118.5,4]]
const route=points.slice(1).map(([km,ele],i)=>({lengthKm:km-points[i][0],gradePercent:(ele-points[i][1])/((km-points[i][0])*10),crosswindKph:8.8}))
const stage={raceId:'research',stageId:'dordrecht',seed:'v3-group-lineage-regression',riders,route,sampleEverySeconds:60,dtSeconds:10}
const state=initializePhysicalRaceV3(stage)
let runs=0
while(!state.complete){advancePhysicalRaceV3(stage,state,180);if(++runs>1000)throw Error('Overdue research simulation')}
const history=derivePhysicalGroupTimelineV3(state.replay,118500)
const flattened=initializePhysicalGroupTimelineV3(118500)
for(const sample of state.replay)advancePhysicalGroupTimelineV3(flattened,sample)
assert.deepEqual(flattened.history,history)
assert.equal(history.length,state.replay.length)
assert(history.every(f=>f.assignments.length===106&&new Set(f.assignments.map(x=>x.riderId)).size===106))
assert.equal(history.at(-1).finishedRiderIds.length,106,'Terminal replay must show all riders finished')
assert.deepEqual(history.at(-1).groups,[])
const caught=history.flatMap(f=>f.events).filter(e=>e.kind==='breakaway_caught')
assert(caught.every(e=>e.intoGroupId==='P'))
console.log('PASS de-identified 106-rider replay: '+history.length+' frames, '+caught.length+' physically verified catches, no identity duplication')
