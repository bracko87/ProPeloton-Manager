import assert from 'node:assert/strict'
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {resolveSimultaneousPathsV3,initializeSimultaneousMicroV3,advanceSimultaneousMicroV3} from './simultaneousConflictResearchV3.mjs'
const g=BATCH40_GEOMETRIES[1],geom=validateRoadScenarioV3(g)
const rider=(riderId,meters,y,speedMps=0)=>({riderId,meters,y,speedMps,cpWatts:240,wPrimeJoules:18000})
function check(paths){
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)assert.equal(continuousBicycleCollisionV3(paths[i],paths[j],{longitudinal:1.8,lateral:geom.lateralCollisionM}),false,paths[i].riderId+' and '+paths[j].riderId)
}
const ahead=rider('leader',110,0),behind=rider('follower',100,0)
const flow=resolveSimultaneousPathsV3([ahead,behind],[{riderId:'leader',forwardMeters:70,targetY:0},{riderId:'follower',forwardMeters:85,targetY:0}],g)
assert(flow.firstConflicts>0)
assert(flow.blockedRiders===2)
check(flow.paths)
const open=resolveSimultaneousPathsV3([ahead,{...behind,y:1}],[{riderId:'leader',forwardMeters:70,targetY:0},{riderId:'follower',forwardMeters:85,targetY:1}],g)
assert.equal(open.firstConflicts,0)
assert(open.paths.find(p=>p.riderId==='follower').x1>open.paths.find(p=>p.riderId==='leader').x1,'Adjacent-track safe overtake was suppressed')
const merge=[rider('a',130,0),rider('b',110,1),rider('c',90,2),rider('d',70,3)]
const mergeActions=[{riderId:'a',forwardMeters:60,targetY:1},{riderId:'b',forwardMeters:80,targetY:2},{riderId:'c',forwardMeters:100,targetY:1},{riderId:'d',forwardMeters:115,targetY:2}]
const merged=resolveSimultaneousPathsV3(merge,mergeActions,g)
check(merged.paths)
const reversed=resolveSimultaneousPathsV3([...merge].reverse(),[...mergeActions].reverse(),g)
const normalize=x=>x.paths.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId))
assert.deepEqual(normalize(merged),normalize(reversed),'Permutation changed simultaneous solver result')
const distant=[rider('far',800,3),...merge]
const distantMoves=[{riderId:'far',forwardMeters:60,targetY:3},...mergeActions]
const distantResolved=resolveSimultaneousPathsV3(distant,distantMoves,g)
assert.equal(distantResolved.paths[0].achievedMeters,60,'Unrelated rider artificially penalized')
assert.throws(()=>resolveSimultaneousPathsV3([ahead,behind],[{riderId:'leader',forwardMeters:70,targetY:0},{riderId:'follower',forwardMeters:85,targetY:4}],g),/Invalid simultaneous motion intent/)
assert.throws(()=>resolveSimultaneousPathsV3([ahead,{...behind,meters:109}],[{riderId:'leader',forwardMeters:70,targetY:0},{riderId:'follower',forwardMeters:85,targetY:0}],g),/Initially colliding/)
const fleet=[rider('front',110,0),rider('rear',100,0),rider('adjacent',106,2)]
const seq=[{riderId:'front',forwardMeters:30,targetY:0},{riderId:'rear',forwardMeters:35,targetY:0},{riderId:'adjacent',forwardMeters:30,targetY:2}]
const start=initializeSimultaneousMicroV3({riders:fleet,geometry:g})
let full=structuredClone(start)
for(let i=0;i<10;i++)full=advanceSimultaneousMicroV3(full,seq)
let resumed=structuredClone(start)
for(let i=0;i<5;i++)resumed=advanceSimultaneousMicroV3(resumed,seq)
resumed=JSON.parse(JSON.stringify(resumed))
for(let i=0;i<5;i++)resumed=advanceSimultaneousMicroV3(resumed,seq)
assert.deepEqual(resumed,full,'Checkpoint recovery changed simultaneous micro')
assert.equal(full.tick,10);assert.equal(full.officialWrites,0);assert.equal(full.sportingApproval,'NOT_APPROVED')
assert(full.riders.every(r=>r.energy.remainingWPrimeJoules>=0&&Number.isFinite(r.energy.cumulativeMechanicalJoules)&&r.energy.seconds===100))
assert(full.metrics.achievedMeters<=full.metrics.requestedMeters+1e-5)
assert(full.metrics.collisionPairsDetected>0)
const m=full.riders.map(r=>({x0:r.meters,x1:r.meters,y0:r.y,y1:r.y}))
check(m)
const exhausted=initializeSimultaneousMicroV3({riders:[rider('r1',100,0),rider('r2',100,2)],geometry:g})
exhausted.riders[0].energy.remainingWPrimeJoules=0
const bounded=advanceSimultaneousMicroV3(exhausted,[{riderId:'r1',forwardMeters:200,targetY:0},{riderId:'r2',forwardMeters:200,targetY:2}])
assert(bounded.riders[0].energy.remainingWPrimeJoules>=0)
assert(bounded.riders[0].energy.cumulativeMechanicalJoules<=240*10+1e-3)
console.log(JSON.stringify({suite:'A2 frozen-proposal simultaneous micro',status:'PASS',mergeConflictIterations:merged.iterations,flowConflictIterations:flow.iterations,safeAdjacentOvertake:true,orderIndependent:true,checkpointExact:true,energyBounded:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
