import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {provisionalPassPriorityV3,resolveTargetedSimultaneousPathsV3} from './simultaneousCrossingAwareResolveV3.mjs'
import {initializeSimultaneousMicroV3 as init,advanceSimultaneousMicroV3 as step} from './simultaneousCrossingAwareMicroV3.mjs'
import {continuousBicycleCollisionV3 as hit} from './continuousLateralResearchV3.mjs'
const geometry=BATCH40_GEOMETRIES[1],g=validateRoadScenarioV3(geometry)
const r=(riderId,meters,y)=>({riderId,meters,y,speedMps:4,cpWatts:250,wPrimeJoules:18000})
const rear=r('rear',100,0),lead=r('front',110,0)
const leadIntent={riderId:'front',forwardMeters:40,targetY:0}
const passIntent={riderId:'rear',forwardMeters:55,targetY:1}
assert.equal(provisionalPassPriorityV3(rear,lead,passIntent,leadIntent,g)?.protectedRiderId,'rear')
assert.equal(provisionalPassPriorityV3(lead,rear,leadIntent,passIntent,g)?.protectedRiderId,'rear')
assert.equal(provisionalPassPriorityV3(rear,lead,{...passIntent,targetY:0},leadIntent,g),null)
assert.equal(provisionalPassPriorityV3(rear,lead,{...passIntent,forwardMeters:42},leadIntent,g),null)
assert.equal(provisionalPassPriorityV3({...rear,meters:50},lead,passIntent,leadIntent,g),null)
const fleet=[lead,rear,r('adjacent',103,3),r('other',86,2)]
const moves=[leadIntent,passIntent,{riderId:'adjacent',forwardMeters:55,targetY:3},{riderId:'other',forwardMeters:50,targetY:2}]
const solved=resolveTargetedSimultaneousPathsV3(fleet,moves,geometry)
const sort=x=>x.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId))
for(let i=0;i<solved.paths.length;i++)for(let j=i+1;j<solved.paths.length;j++)assert(!hit(solved.paths[i],solved.paths[j],{longitudinal:1.8,lateral:g.lateralCollisionM}))
assert.deepEqual(sort(solved.paths),sort(resolveTargetedSimultaneousPathsV3([...fleet].reverse(),[...moves].reverse(),geometry).paths))
let starting=init({riders:fleet,geometry}),result=starting,checkpoint=null
for(let i=0;i<15;i++){result=step(result,moves);if(i===6)checkpoint=JSON.parse(JSON.stringify(result))}
for(let i=7;i<15;i++)checkpoint=step(checkpoint,moves)
assert.deepEqual(checkpoint,result)
assert(result.riders.every(x=>x.energy.remainingWPrimeJoules>=0))
assert.equal(result.officialWrites,0)
assert(Number.isInteger(result.metrics.actualPreferenceChanges)&&Number.isInteger(result.metrics.protectedPassEdges))
console.log(JSON.stringify({suite:'A2 bounded crossing-aware yielding micro',status:'PASS',sweptSafety:true,orderInvariant:true,replayExact:true,protectedEdges:result.metrics.protectedPassEdges,policyChanges:result.metrics.actualPreferenceChanges,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
