import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {initializeIntentAwareCorridorV3 as begin,advanceIntentAwareCorridorV3 as step} from './a2IntentAwareCorridorV3.mjs'
const geom=BATCH40_GEOMETRIES[1]
const r=(riderId,meters,y)=>({riderId,meters,y})
const base=[r('lead',118,1),r('rear',100,1),r('extra2',150,2)]
const intents=(members,leftTarget=2)=>members.map(x=>({riderId:x.riderId,forwardMeters:x.riderId==='rear'?75:x.riderId==='lead'?45:42,
 targetY:x.riderId==='rear'?0:x.riderId==='extra2'?leftTarget:x.y}))
const idle=step(begin(),base,intents(base,2),geom)
assert.equal(idle.state.policy,'fast','Nearby inactive rider should not impose first-tick wait')
assert.deepEqual(idle.state.initialScreen.nearby,['extra2'])
assert.deepEqual(idle.state.initialScreen.active,[])
assert.equal(idle.intents.find(x=>x.riderId==='rear').targetY,0)
const active=step(begin(),base,intents(base,1),geom)
assert.equal(active.state.policy,'watch','Communicated current lateral move must be screened')
assert.deepEqual(active.state.initialScreen.active,['extra2'])
assert.equal(active.intents.find(x=>x.riderId==='rear').targetY,1)
assert.equal(active.intents.find(x=>x.riderId==='extra2').targetY,1,'No opponent override')
const late=step(idle.state,base.map(x=>({...x,meters:x.meters+40})),intents(base,1),geom)
assert.equal(late.state.planner.phase,'rival_first')
assert(late.state.metrics.lateSignaledConflicts>0)
assert.equal(late.intents.find(x=>x.riderId==='extra2').targetY,1)
assert.deepEqual(step(JSON.parse(JSON.stringify(idle.state)),base.map(x=>({...x,meters:x.meters+40})),intents(base,1),geom),late)
const perm=step(begin(),base.slice().reverse(),intents(base,1).slice().reverse(),geom)
assert.deepEqual(perm.state.initialScreen,active.state.initialScreen)
assert.equal(perm.state.policy,active.state.policy)
assert.throws(()=>begin({riskAheadM:120}),/Invalid/)
console.log(JSON.stringify({suite:'A2 intent-aware first-tick admission',status:'PASS',inactiveProximityIgnored:true,activeIntentsDetected:true,lateIntentReaction:true,opponentIntentsUntouched:true,checkpointExact:true,officialWrites:0}))
