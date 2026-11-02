import assert from 'node:assert/strict'
import {patchV4EarlyChaseWorkforceTelemetrySource as patch} from './mountainEarlyChaseWorkforceTelemetryV4.mjs'
const p2='  const availableChaseAssets = phase2ChaseWorkerRows.length'
const p3='  const phase3AvailableChaseAssets = phase3ChaseWorkerRows.length'
assert.throws(()=>patch('no anchors'),/anchor drift/)
assert.throws(()=>patch(p2+'\n'+p2+'\n'+p3),/anchor drift/)
const output=patch('prefix\n'+p2+'\n'+p3+'\nsuffix')
assert(output.includes('V4_EARLY_CHASE_WORKFORCE'))
assert(output.includes('roleEligibleNonChaseWorkers'))
assert(output.includes('selectedChaseOrderedWorkers'))
assert(output.includes('eligibleChaseAssets'))
assert(output.includes('V4_EARLY_CHASE_WORKFORCE_TELEMETRY'))
assert(!output.includes('forceCatch')&&!output.includes('targetGap'))
console.log('V4_EARLY_CHASE_WORKFORCE_UNIT '+JSON.stringify({status:'PASS',isolated:true,productionWrites:0}))
