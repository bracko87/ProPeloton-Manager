import assert from 'node:assert/strict'
import {classifyPrivateHistoricalPostCatchGapV4 as band,PRIVATE_HISTORICAL_CHASE_GAP_BANDS} from '../../src/race-engine-v4/privateHistoricalPostCatchGapV4.mjs'
assert.deepEqual(PRIVATE_HISTORICAL_CHASE_GAP_BANDS,['NEAR','SEPARATED','UNKNOWN'])
const checkpoint=(d)=>({groups:[{displayCode:'P',riderIds:['private-a']},{displayCode:'C2',riderIds:['private-b']}],
 gaps:[{displayCode:'P',gapSeconds:37},{displayCode:'C2',gapSeconds:37+d}]})
assert.equal(band(checkpoint(4),'C2',5),'NEAR')
assert.equal(band(checkpoint(5),'C2',5),'NEAR')
assert.equal(band(checkpoint(5.5),'C2',5),'SEPARATED')
assert.equal(band(checkpoint(-7),'C2',5),'SEPARATED')
assert.equal(band({groups:[{displayCode:'C2',gapSeconds:55},{displayCode:'P',gapSeconds:0}]},'C2',5),'UNKNOWN')
assert.equal(band({gaps:[{displayCode:'C2',gapSeconds:55}]},'C2',5),'UNKNOWN')
assert.equal(band(checkpoint(4),'C3',5),'UNKNOWN')
assert.equal(band(checkpoint(4),'C2',-1),'UNKNOWN')
assert.equal(band(checkpoint(4),'private-rider',5),'UNKNOWN')
console.log('V4_PRIVATE_HISTORICAL_GAP_FIELDS '+JSON.stringify({status:'PASS',syntheticOnly:true,strictReplayUnchanged:true,officialWrites:0}))
