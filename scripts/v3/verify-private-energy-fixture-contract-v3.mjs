import assert from 'node:assert/strict'
import {parsePrivatePowerSupplementV3,privatePowerColumns} from './privateEnergySupplementV3.mjs'
const header=privatePowerColumns.join(',')
const row=(idx,resistance=65)=>[idx,60,75,72,100,5,1,resistance].join(',')
const valid=header+'\n'+row(1)+'\n'+row(2,80)+'\n'
const parsed=parsePrivatePowerSupplementV3(valid,2)
assert.equal(parsed.size,2)
assert.equal(parsed.get(2).resistance,80)
assert.throws(()=>parsePrivatePowerSupplementV3(valid.replace(',resistance',''),2),/source resistance/)
assert.throws(()=>parsePrivatePowerSupplementV3(header+'\n'+row(1)+'\n',2),/count mismatch/)
assert.throws(()=>parsePrivatePowerSupplementV3(header+'\n'+row(1)+'\n'+row(1),2),/duplicate/)
assert.throws(()=>parsePrivatePowerSupplementV3(header+'\n'+row(1)+'\n'+row(3),2),/index/)
assert.throws(()=>parsePrivatePowerSupplementV3(header+'\n'+row(1)+'\n'+row(2,150),2),/Invalid private source resistance/)
assert.throws(()=>parsePrivatePowerSupplementV3(header+'\n'+row(1).replace(',5,1,',',5,0,')+'\n'+row(2),2),/Invalid private source inStageEnergyCostMultiplier/)
assert.throws(()=>parsePrivatePowerSupplementV3(valid.replace(',80',',NaN'),2),/Invalid private source/)
console.log('PASS operator-only source supplement validates resistance, provenance alignment, numeric bounds and duplicate guards')
