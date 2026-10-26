import assert from 'node:assert/strict'
import {createCorridorCoordinatorV3,admitCorridorReservationsV3,advanceCorridorCoordinatorV3} from './coordinatedCorridorV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
const geom=BATCH40_GEOMETRIES[2],energy={criticalWatts:240,wPrimeJoules:15000,remainingWPrimeJoules:15000,efficiency:.23,cumulativeMechanicalJoules:0,cumulativeMetabolicJoules:0,cumulativeSupraCriticalJoules:0,cumulativeRecoveredWPrimeJoules:0,seconds:0}
const before=[{riderId:'a',lane:0,meters:0,energy:1,desiredMps:2,tactic:'follow'},{riderId:'b',lane:0,meters:100,energy:1,desiredMps:2,tactic:'follow'},{riderId:'c',lane:2,meters:50,energy:1,desiredMps:2,tactic:'follow'}]
const moves=before.map(r=>({...r,oldMeters:r.meters,meters:r.meters+20,speedMps:2,lateralMoves:0,wheelLimited:false}))
const data=before.map(r=>({...r,powerDurationEnergy:energy}))
const proposals=[{riderId:'a',fromLane:0,toLane:1},{riderId:'c',fromLane:2,toLane:3}]
const input={proposals,atEnd:moves,before,moves,sourceRiders:data,geometry:geom,dt:10}
const init=createCorridorCoordinatorV3({geometry:geom,capacity:2,forecast:false})
const accepted=admitCorridorReservationsV3(init,input)
assert.equal(accepted.active.length,2,'Separated reservations should coexist')
assert.equal(accepted.stats.admitted,2)
assert.deepEqual(init.active,[],'Proposing must not mutate source coordinator')
assert.deepEqual(admitCorridorReservationsV3(JSON.parse(JSON.stringify(init)),input),accepted)
const one=admitCorridorReservationsV3(createCorridorCoordinatorV3({geometry:geom,capacity:1,forecast:false}),input)
assert.equal(one.active.length,1);assert.equal(one.stats.blockedByCapacity,1)
const same=[{riderId:'a',fromLane:0,toLane:1},{riderId:'b',fromLane:0,toLane:1}]
const closeBefore=before.map(x=>x.riderId==='b'?{...x,meters:1}:x)
const closeMoves=moves.map(x=>x.riderId==='b'?{...x,oldMeters:1,meters:21}:x)
const closeSubjects=data.map(x=>x.riderId==='b'?{...x,meters:1}:x)
const conflict=admitCorridorReservationsV3(init,{...input,proposals:same,before:closeBefore,moves:closeMoves,atEnd:closeMoves,sourceRiders:closeSubjects})
assert.equal(conflict.active.length,1,'Same space at nearby longitudinal metres must be rejected')
assert.equal(conflict.stats.reservationConflicts,1)
assert.throws(()=>admitCorridorReservationsV3(init,{...input,proposals:[proposals[0],proposals[0]]}),/Duplicate/)
const road={laneCount:4,dtSeconds:10,minWheelGapMeters:1.8}
const xtrace=before.map(r=>({riderId:r.riderId,actualMechanicalWatts:200}))
let current=accepted
for(let i=0;i<5;i++){
 const next=advanceCorridorCoordinatorV3(current,{before,moves,trace:xtrace,geometry:geom,road})
 assert.deepEqual(next,advanceCorridorCoordinatorV3(JSON.parse(JSON.stringify(current)),{before,moves,trace:xtrace,geometry:geom,road}))
 current=next
}
assert.equal(current.stats.completed,2)
assert.equal(current.stats.completedExtraJ,2100)
assert.equal(current.waiting.length,2)
assert.equal(current.active.length,0)
assert.equal(current.stats.physicalCollisions,0)
assert.throws(()=>createCorridorCoordinatorV3({geometry:geom,capacity:5}),/Invalid/)
console.log(JSON.stringify({status:'PASS',batch:41,competingReservationRejections:conflict.stats.reservationConflicts,simultaneous:accepted.active.length,completed:current.stats.completed,workJ:current.stats.completedExtraJ,checkpointExact:true}))
