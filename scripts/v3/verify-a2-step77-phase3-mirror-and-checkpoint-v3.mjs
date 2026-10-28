/** A77 Phase3 bounded wave invariance; physical NO-GO is still a result.
 * A green gate confirms deterministic rejection/replay, NOT field success.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,advanceMultiGatePhysicalCandidateV3}
 from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const results=[]
for(const n of [32,106,168]){
 for(const roadGeometry of ['staged_pinch','double_pinch']){
  for(const pacePolicy of ['anticipatory_queue_wave','protect_lead_queue_wave']){
   const opts={mode:'five_dense',roadGeometry,pacePolicy,
    headwayStandOffM:4.5,coreMergePolicy:'preview_only'}
   const base=createMultiGatePhysicalCandidateV3(n,opts)
   const mirrored=createMultiGatePhysicalCandidateV3(n,{...opts,mirror:true})
   const renamed=createMultiGatePhysicalCandidateV3(n,{...opts,renamed:true})
   const normal=runMultiGatePhysicalCandidateV3(base,{seconds:30})
   const flipped=runMultiGatePhysicalCandidateV3(mirrored,{seconds:30})
   const relabeled=runMultiGatePhysicalCandidateV3(renamed,{seconds:30})
   assert.equal(normal.reason,flipped.reason,
    'A77 phase3 mirror changed first physical rejection')
   assert.equal(normal.reason,relabeled.reason,
    'A77 phase3 rider names changed first physical rejection')
   assert.equal(normal.physical.at,flipped.physical.at)
   assert.equal(normal.physical.at,relabeled.physical.at)
   for(let i=0;i<n;i++){
    const a=normal.physical.states[i],b=flipped.physical.states[i],
     c=relabeled.physical.states[i]
    assert(eq(a.x,b.x)&&eq(a.y+b.y,4.4),
     'A77 phase3 mirror altered physical x/y '+n+'/'+i)
    assert(eq(a.x,c.x)&&eq(a.y,c.y),
     'A77 phase3 rename altered physical x/y '+n+'/'+i)
    assert(eq(a.energy.remainingWPrimeJoules,
     b.energy.remainingWPrimeJoules))
   }
   const initial=base
   const first=runMultiGatePhysicalCandidateV3(initial,{seconds:1})
   if(!first.reason&&normal.physical.at>=1){
    const remaining=runMultiGatePhysicalCandidateV3(
     JSON.parse(JSON.stringify(first)),{seconds:29})
    assert.deepEqual(remaining,normal,
     'A77 phase3 JSON snapshot changed physical continuation')
   }
   if(normal.reason){
    assert.throws(()=>advanceMultiGatePhysicalCandidateV3(normal),
     'A77 phase3 physical rejection resumed at next tick')
    assert.equal(normal.physical.reason,null,
     'A77 phase3 collision was committed to physical state')
   }
   results.push({n,roadGeometry,pacePolicy,
    reason:normal.reason,acceptedSeconds:normal.physical.at,
    exactSpatialMirror:true,identityParity:true,
    noCollisionCommitted:true})
  }
 }
}
const report={study:'A77_PHASE3_MIRROR_ID_CHECKPOINT',
 technicalGate:'PASS_IF_SAFETY_INVARIANTS_HOLD',
 resultCount:results.length,results,officialWrites:0,
 sportingGate:'NO_GO'}
const dir=process.env.V3_A2_STEP77_PARITY_DIR??'/tmp/a77parity'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a77-phase3-mirror-id-checkpoint.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
