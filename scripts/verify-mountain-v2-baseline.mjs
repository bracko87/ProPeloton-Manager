/**
 * Temporary fail-closed source fingerprint for mountain V2 development.
 * We will develop mountain behavior only in the separate experimental solver.
 * Changing the accepted baseline requires its OWN explicit reviewed PR and
 * updating this fingerprint only after that baseline release is approved.
 *
 * This verifies the entire baseline physical engine remains byte-for-byte
 * unchanged; runtime scenario parity tests independently verify its behavior.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const baselinePath = 'src/universal-race-engine/runRaceEngine.ts'
const acceptedBlob = 'fa4ffd631d9d318ca92d6cfb8a517489b7842fcf'
const source = readFileSync(baselinePath)
const actualBlob = createHash('sha1')
  .update(Buffer.from(`blob ${source.byteLength}\0`))
  .update(source)
  .digest('hex')

assert.equal(
  actualBlob,
  acceptedBlob,
  'Experimental mountain V2 must not modify the accepted universal physical solver',
)
console.log(`PASS unchanged baseline source ${acceptedBlob}`)
