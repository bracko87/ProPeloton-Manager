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

const immutableBaselineFiles = [
  [
    "src/universal-race-engine/runRaceEngine.ts",
    "fa4ffd631d9d318ca92d6cfb8a517489b7842fcf"
  ],
  [
    "src/universal-race-engine/roadScenarioPhysicalDirectorV1.ts",
    "20c52cfb47306eca76e7b8ff5247adc359f00f73"
  ],
  [
    "src/universal-race-engine/replayPhysicalStateV16.ts",
    "88ee11ae69ddcee742372c70e5bc78b27fad49c5"
  ],
  [
    "src/universal-race-engine/summitFinishSelectivityV1.ts",
    "6eb0c543b7ab8c330c09c1ff7b54c48775450fcb"
  ]
];

for (const [baselinePath, acceptedBlob] of immutableBaselineFiles) {
  const source = readFileSync(baselinePath)
  const actualBlob = createHash('sha1')
    .update(Buffer.from(`blob ${source.byteLength}\0`))
    .update(source)
    .digest('hex')
  assert.equal(
    actualBlob,
    acceptedBlob,
    `Mountain V2 must not modify accepted shared baseline dependency: ${baselinePath}`,
  )
  console.log(`PASS unchanged accepted source ${baselinePath}`)
}
