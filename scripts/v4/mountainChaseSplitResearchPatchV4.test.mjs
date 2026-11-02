import assert from 'node:assert/strict'
import {patchV4MeasuredChaseSplitResearchSource as patch} from './mountainChaseSplitResearchPatchV4.mjs'
const anchor='  const preFinishPublishedDefinition = [...baseDefinitions, ...eventDefinitions]'
assert.throws(()=>patch('other source'),/anchor drift/)
assert.throws(()=>patch(anchor+anchor),/anchor drift/)
const source=patch('prefix\n'+anchor+'\nsuffix')
assert(source.includes('v4MeasuredChaseSplit'))
assert(source.includes('PHASE5_GROUP_MERGE_TOLERANCE_SECONDS'))
assert(source.includes("eventType: 'group_split'"))
assert(source.includes("stageDistanceKm >= 200"))
assert(source.includes(anchor))
assert(!source.includes('finishGapArtificial'))
console.log('V4_PHYSICAL_C_SPLIT_PATCH_UNIT '+JSON.stringify({status:'PASS',syntheticOnly:true,officialWrites:0}))
