import assert from 'node:assert/strict'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {initializeCorridorReservationV3 as begin,stepCorridorReservationV3 as step} from './a2CorridorReservationResearchV3.mjs'
const geometry=BATCH40_GEOMETRIES[1],r=(id,meters,y)=>({riderId:id,meters,y})
const initial=[r('lead',118,1),r('rear',100,1),r('extra2',150,2)]
const plan=(extraY)=>[{riderId:'lead',forwardMeters:45,targetY:1},{riderId:'rear',forwardMeters:75,targetY:0},{riderId:'extra2',forwardMeters:42,targetY:extraY}]
const a=step(begin(),initial,plan(2),geometry,{acknowledgedRiderIds:['extra2']})
assert.equal(a.reservation.phase,'active');assert.equal(a.intents[1].targetY,0)
const b=step(a.reservation,initial.map(x=>({...x,meters:x.meters+40})),plan(1),geometry,{acknowledgedRiderIds:['extra2']})
assert.equal(b.reservation.phase,'active')
assert.equal(b.intents[2].targetY,2,'Acknowledging rider should defer lateral crossing')
assert.equal(b.reservation.metrics.acknowledgedDeferrals,1)
const c=step(a.reservation,initial.map(x=>({...x,meters:x.meters+40})),plan(1),geometry,{acknowledgedRiderIds:[]})
assert.equal(c.decision,'aborted');assert.equal(c.intents[2].targetY,1,'Unacknowledged rival must retain its intent')
assert.equal(c.intents[1].targetY,1,'Carrier must cancel its lane-change preference')
assert.equal(c.reservation.metrics.unacknowledgedCancels,1)
const repeated=step(b.reservation,initial.map(x=>({...x,meters:x.meters+80})),plan(1),geometry,{acknowledgedRiderIds:['extra2']})
assert.equal(repeated.reservation.metrics.acknowledgedDeferrals,2)
const exhausted=step(repeated.reservation,initial.map(x=>({...x,meters:x.meters+120})),plan(1),geometry,{acknowledgedRiderIds:['extra2']})
assert.equal(exhausted.decision,'aborted')
assert.equal(exhausted.reservation.events.at(-1).reason,'deferral_limit')
const snapshot=JSON.parse(JSON.stringify(a.reservation))
assert.deepEqual(step(snapshot,initial.map(x=>({...x,meters:x.meters+40})),plan(1),geometry,{acknowledgedRiderIds:['extra2']}),b)
const shuffled=step(begin(),initial.slice().reverse(),plan(2).slice().reverse(),geometry,{acknowledgedRiderIds:['extra2']})
assert.equal(shuffled.reservation.targetY,a.reservation.targetY)
assert.throws(()=>begin({leaseTicks:0}),/Invalid/)
console.log(JSON.stringify({suite:'A2 acknowledged micro corridor lease',status:'PASS',consentRequired:true,cancellation:true,deferralCap:true,jsonReplay:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
