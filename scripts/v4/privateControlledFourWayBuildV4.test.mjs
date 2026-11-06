import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {runPrivateControlledFourWayV4}
 from './runPrivateControlledFourWayV4.mjs'

test('the dual offline engine bundle builds; invalid private input fails closed',async()=>{
 const engine=resolve('src/universal-race-engine/runRaceEngine.ts')
 const original=readFileSync(engine,'utf8')
 const entries=Array.from({length:108},(_,i)=>({riderId:'SECRET-RIDER-'+i}))
 const envelope={
  input:{stage:{stageId:'SECRET-STAGE'},
   race:{raceId:'SECRET-RACE'},
   engine:{deterministicSeed:'SECRET-SEED'},
   riders:entries},
  options:{lock:{stageId:'SECRET-STAGE'},teamControl:[]},
  reference:{stageId:'SECRET-STAGE',raceId:'SECRET-RACE',
   officialRows:entries,savedClassification:entries,savedEnergyRows:entries}
 }
 await assert.rejects(
  runPrivateControlledFourWayV4(envelope),
  /V4_FOUR_WAY_PLAN_REJECTED/
 )
 assert.equal(readFileSync(engine,'utf8'),original,
  'The default engine source must remain byte-for-byte unchanged')
})
