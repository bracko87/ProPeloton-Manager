import assert from 'node:assert/strict'
import {patchV4MountainChaseWorkerTelemetrySource as patch} from './mountainChaseWorkerTelemetryV4.mjs'
const anchor='    const stepEscapePaceKmh = calculateRoadPhysicalGroupPaceKmh('
assert.throws(()=>patch('no anchor'),/anchor drift/)
assert.throws(()=>patch(anchor+anchor),/anchor drift/)
const changed=patch('before\n'+anchor+'\nafter')
assert(changed.includes("activeAutomatic:activeAutomaticWorkerCount"))
assert(changed.includes("pelotonPaceKmh:effectivePelotonPaceKmh"))
assert(changed.includes("V4_CHASE_PHYSICS_STEP"))
assert(changed.endsWith(anchor+'\nafter'))
console.log('V4_CHASE_TELEMETRY_UNIT '+JSON.stringify({status:'PASS',readOnly:true}))
