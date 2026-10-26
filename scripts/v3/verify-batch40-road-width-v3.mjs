import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3,predictClearCorridorV3,beginRoadCorridorV3,stepRoadCorridorV3} from './roadWidthLookaheadV3.mjs'
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
for(const x of BATCH40_GEOMETRIES){const g=validateRoadScenarioV3(x);assert(g.roadsideMarginM>=.15);assert(g.bikeWidthM>=.4);assert(g.centerStepM>=g.lateralCollisionM)}
assert.throws(()=>validateRoadScenarioV3({...BATCH40_GEOMETRIES[0],roadWidthM:2}),/Invalid|Insufficient/)
assert.throws(()=>validateRoadScenarioV3({...BATCH40_GEOMETRIES[0],centerStepM:.65}),/Overlapping/)
const before=[{riderId:'a',meters:10,lane:0},{riderId:'b',meters:30,lane:0},{riderId:'c',meters:50,lane:1}]
const moves=before.map(x=>({...x,meters:x.meters+20,speedMps:2}))
const candidate={riderId:'a',fromLane:0,toLane:1}
const energy={criticalWatts:250,wPrimeJoules:10000,efficiency:.23,remainingWPrimeJoules:10000,cumulativeMechanicalJoules:0,cumulativeMetabolicJoules:0,cumulativeSupraCriticalJoules:0,cumulativeRecoveredWPrimeJoules:0,seconds:0}
const subject={...before[0],powerDurationEnergy:energy}
assert.equal(predictClearCorridorV3(candidate,before,moves,BATCH40_GEOMETRIES[1]).predictedClear,true)
const active=beginRoadCorridorV3(candidate,subject,BATCH40_GEOMETRIES[1],'persistent')
const original=structuredClone(active);let s=active
for(let i=0;i<5;i++){const expected=stepRoadCorridorV3(s,before,moves,[{riderId:'a',actualMechanicalWatts:200}],BATCH40_GEOMETRIES[1]);assert.deepEqual(stepRoadCorridorV3(JSON.parse(JSON.stringify(s)),before,moves,[{riderId:'a',actualMechanicalWatts:200}],BATCH40_GEOMETRIES[1]),expected);s=expected}
assert.equal(s.phase,'complete');assert.equal(s.extraWorkJoules,1050);assert.equal(s.energy.seconds,50);assert.deepEqual(active,original)
let blocked=beginRoadCorridorV3(candidate,subject,BATCH40_GEOMETRIES[1],'early')
blocked=stepRoadCorridorV3(blocked,before,moves,[{riderId:'a',actualMechanicalWatts:200}],BATCH40_GEOMETRIES[1])
blocked=stepRoadCorridorV3(blocked,before,moves,[{riderId:'a',actualMechanicalWatts:200}],BATCH40_GEOMETRIES[1])
const crossingBefore=[before[0],before[1],{riderId:'c',meters:10,lane:1}]
const crossingMoves=crossingBefore.map(x=>({...x,meters:x.meters+20}))
const bad=stepRoadCorridorV3(blocked,crossingBefore,crossingMoves,[{riderId:'a',actualMechanicalWatts:200}],BATCH40_GEOMETRIES[1])
assert.equal(bad.reason,'continuous_collision');assert.equal(bad.extraWorkJoules,0)
assert.equal(continuousBicycleCollisionV3({x0:0,x1:20,y0:0,y1:1},{x0:20,x1:0,y0:1,y1:1}),true)
assert.equal(stepRoadCorridorV3(active,before,moves,[],BATCH40_GEOMETRIES[1]).reason,'source_lane_or_finish')
assert.deepEqual(subject.powerDurationEnergy,energy)
console.log(JSON.stringify({status:'PASS',suite:'batch40 width/forecast, midpoint collision, ledger, immutable and JSON resume',profiles:BATCH40_GEOMETRIES.length,energyJ:s.extraWorkJoules}))
