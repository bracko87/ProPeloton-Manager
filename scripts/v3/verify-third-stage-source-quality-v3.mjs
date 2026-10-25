import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assessRouteFidelityV3} from '../../src/race-engine-v3/routeFidelityV3.ts'
const fixture=JSON.parse(readFileSync(new URL('./fixtures/world-nations-mountain-2000-10-13.route.json',import.meta.url),'utf8'))
assert.equal(fixture.startableRiders,77)
assert.equal(fixture.ridersWithAllRequiredPreparationFields,77)
assert.equal(fixture.weatherMeasured,false)
const fidelity=assessRouteFidelityV3(fixture.profilePoints,fixture.distanceKm,fixture.declaredElevationGainM)
assert.equal(fidelity.profiledPositiveGainM,720)
assert.equal(fidelity.missingGainM,1065)
assert.equal(fidelity.profileIncomplete,true)
assert(fidelity.positiveGainCoverage<.5)
console.log(JSON.stringify({sourceStage:fixture.name,sourceCompleteRiders:77,distanceKm:150,declaredAscentM:1785,representedAscentM:720,missingAscentM:1065,routeFidelity:'FAILED',sportingApproval:'BLOCKED',riderRowsExported:0}))
