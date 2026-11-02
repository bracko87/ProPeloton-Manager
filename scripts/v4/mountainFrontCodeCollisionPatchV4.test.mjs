import assert from 'node:assert/strict'
import {patchV4MountainFrontCollisionSource as patch} from './mountainFrontCodeCollisionPatchV4.mjs'
const anchor="        displayCode: lineage.displayCode,\n        physicalLineageId: lineage.lineageId,"
assert.throws(()=>patch('not a source'),/anchor drift/)
assert.throws(()=>patch(anchor+anchor),/anchor drift/)
const src=patch('header\n'+anchor+'\nfooter')
assert(src.includes("leadingDisplayCode === lineage.displayCode"))
assert(src.includes("stageDistanceKm >= 200"))
assert(src.includes("? 'F3' : lineage.displayCode"))
assert(src.includes("physicalLineageId: lineage.lineageId"))
assert(!src.includes('mergeV4')&&!src.includes('finishGapArtificial'))
console.log('V4_FRONT_DISPLAY_COLLISION_PATCH_UNIT '+JSON.stringify({status:'PASS',researchOnly:true,officialWrites:0}))
