import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {resolveSimultaneousPathsV3 as symmetric} from './simultaneousConflictResearchV3.mjs'
import {resolveTargetedSimultaneousPathsV3 as targeted} from './simultaneousTargetedResolveV3.mjs'
import {initializeSimultaneousMicroV3 as init,advanceSimultaneousMicroV3 as advance} from './simultaneousTargetedMicroV3.mjs'
import {continuousBicycleCollisionV3 as hit} from './continuousLateralResearchV3.mjs'
const g=BATCH40_GEOMETRIES[1],r=(riderId,meters,y)=>({riderId,meters,y,speedMps:4,cpWatts:250,wPrimeJoules:18000})
const rows=[r('leader',110,0),r('follower',100,0)],go=[{riderId:'leader',forwardMeters:70,targetY:0},{riderId:'follower',forwardMeters:85,targetY:0}]
const a=symmetric(rows,go,g),b=targeted(rows,go,g)
assert(b.firstConflicts>0&&b.targetedYieldDecisions>0)
assert(b.paths.find(x=>x.riderId==='leader').achievedMeters>=a.paths.find(x=>x.riderId==='leader').achievedMeters,'Targeted yield suppressed leader')
assert(b.paths.reduce((s,p)=>s+p.achievedMeters,0)>a.paths.reduce((s,p)=>s+p.achievedMeters,0),'Targeted micro failed to improve forward throughput')
const sorted=x=>x.paths.slice().sort((p,q)=>p.riderId.localeCompare(q.riderId))
assert.deepEqual(sorted(b),sorted(targeted([...rows].reverse(),[...go].reverse(),g)),'Input order changed targeted solve')
const neighbor=[r('near0',130,0),r('near1',110,1),r('near2',90,2),r('near3',70,3)]
const merging=[{riderId:'near0',forwardMeters:60,targetY:1},{riderId:'near1',forwardMeters:80,targetY:2},{riderId:'near2',forwardMeters:100,targetY:1},{riderId:'near3',forwardMeters:115,targetY:2}]
const merged=targeted(neighbor,merging,g)
for(let i=0;i<merged.paths.length;i++)for(let j=i+1;j<merged.paths.length;j++)assert(!hit(merged.paths[i],merged.paths[j],{longitudinal:1.8,lateral:.8}))
let s=init({riders:[r('a',120,0),r('b',110,0),r('c',105,2)],geometry:g})
const actions=[{riderId:'a',forwardMeters:50,targetY:0},{riderId:'b',forwardMeters:55,targetY:0},{riderId:'c',forwardMeters:52,targetY:2}]
let recovered=s,full=s
for(let i=0;i<14;i++){full=advance(full,actions);if(i===6)recovered=JSON.parse(JSON.stringify(full))}
for(let i=7;i<14;i++)recovered=advance(recovered,actions)
assert.deepEqual(recovered,full,'Targeted replay mismatch')
assert(full.riders.every(x=>x.energy.remainingWPrimeJoules>=0))
assert.equal(full.officialWrites,0)
console.log(JSON.stringify({suite:'A2 targeted single-yield micro',status:'PASS',symmetricPairMetres:a.paths.reduce((s,p)=>s+p.achievedMeters,0),targetedPairMetres:b.paths.reduce((s,p)=>s+p.achievedMeters,0),mergeIterations:merged.iterations,inputOrderExact:true,checkpointExact:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
