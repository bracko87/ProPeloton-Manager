import assert from 'node:assert/strict'
import {calculateWindExposureV3,windFromBearingV3} from '../../src/race-engine-v3/windExposureV3.ts'
assert.equal(windFromBearingV3('SW'),225)
assert.equal(windFromBearingV3('nne'),22.5)
assert.equal(windFromBearingV3(585),225)
const into=calculateWindExposureV3(22,'SW',225)
assert.deepEqual([into.headwindKph,into.crosswindKph,into.tailwindKph],[22,0,0])
const away=calculateWindExposureV3(22,'SW',45)
assert.deepEqual([away.headwindKph,away.crosswindKph,away.tailwindKph],[-22,0,22])
const cross=calculateWindExposureV3(22,'SW',315)
assert.equal(cross.crosswindKph,22)
assert(Math.abs(cross.headwindKph)<1e-5)
for(let road=0;road<360;road+=7){
 const wind=calculateWindExposureV3(22,'SW',road)
 assert(Math.abs(wind.headwindKph**2+wind.crosswindKph**2-22**2)<0.001,
  'Vector projection must conserve forecast wind magnitude')
}
assert.equal(calculateWindExposureV3(22,'SW',null),null,
 'Unknown road bearing must not silently assume a crosswind')
assert.throws(()=>calculateWindExposureV3(-1,'SW',90))
assert.throws(()=>calculateWindExposureV3(22,'unknown',90))
assert.throws(()=>calculateWindExposureV3(22,'SW',NaN))
console.log('PASS cardinal FROM wind projections: headwind, tailwind, crosswind, unknown-bearing safety')
