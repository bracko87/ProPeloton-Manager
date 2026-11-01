import assert from 'node:assert/strict'
import {explainHistoricalClassificationParity as compare,safeHistoricalErrorType as errorType,
 safeHistoricalTerrain as terrain,HISTORICAL_PARITY_REASONS,HISTORICAL_ERROR_TYPES}
 from '../../src/race-engine-v4/privateHistoricalDiagnosticsV4.mjs'
const row={id:'PRIVATE_RIDER_SHOULD_NEVER_BE_PRINTED',rank:1,status:'finished',gap:0,time:300}
const run=(change)=>compare([row],[{...row,...change}])
assert.deepEqual(run({}),{equal:true,reasons:[]})
assert.equal(run({gap:0.009,time:300.005}).equal,true)
assert.deepEqual(run({rank:2,officialTime:1}).reasons,['RANK'])
assert.deepEqual(run({id:'another',rank:4,status:'dnf',gap:3,time:310}).reasons,
 ['RIDER_IDENTITY','RANK','STATUS','GAP','OFFICIAL_TIME'])
assert.deepEqual(compare([row],[]).reasons,['RIDER_COUNT'])
assert.deepEqual(compare([row],[row]).reasons,[])
assert.deepEqual(HISTORICAL_PARITY_REASONS,
 ['RIDER_COUNT','RIDER_IDENTITY','RANK','STATUS','GAP','OFFICIAL_TIME'])
assert.deepEqual(HISTORICAL_ERROR_TYPES,
 ['TYPE_ERROR','RANGE_ERROR','SYNTAX_ERROR','OTHER_ERROR','NON_ERROR_THROW'])
assert.equal(errorType(new TypeError('private details')),'TYPE_ERROR')
assert.equal(errorType(new RangeError('private details')),'RANGE_ERROR')
assert.equal(errorType(new SyntaxError('private details')),'SYNTAX_ERROR')
assert.equal(errorType(new Error('private details')),'OTHER_ERROR')
assert.equal(errorType('private details'),'NON_ERROR_THROW')
assert.equal(terrain({input_snapshot_json:{stage:{terrainType:'mountain',stageId:'secret'}}}),'mountain')
assert.equal(terrain({input_snapshot_json:{stage:{terrainType:'UNKNOWN'}}}),'unknown')
assert.equal(terrain(null),'unknown')
assert.equal(JSON.stringify({type:errorType(new Error('private details')),kinds:run({rank:99}).reasons})
 .includes('private'),false)
console.log('V4_PRIVATE_HISTORY_DIAGNOSTICS_UNIT '+JSON.stringify({status:'PASS',syntheticOnly:true,
 cases:16,rawHistoryPublished:false,officialWrites:0}))
