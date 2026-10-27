import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSubstepPhysicalResearchV3 as begin,advanceSubstepPhysicalResearchV3 as advance} from './a2SubstepPhysicalResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const sizes=[2,8,12,24,32],grades=[-3,0,2,4],runs=[],failures=[]
function controls(state,turn,variation,g){
 const maxY=(g.laneCount-1)*g.centerStepM
 return state.riders.map((r,i)=>{
  const from=i%g.laneCount
  const offset=(turn%3===1 && (i+variation)%4===0)?-1:(turn%3===2 && (i+variation)%5===0)?1:0
  const lane=Math.min(g.laneCount-1,Math.max(0,from+offset))
  return {riderId:r.riderId,targetSpeedMps:4.5+(i+turn+variation)%6,
   targetY:Math.min(maxY,Math.round(lane*g.centerStepM*1e6)/1e6),steeringWatts:35}
 })
}
function entrants(n,g,variation){
 return Array.from({length:n},(_,i)=>({riderId:'r'+String(i).padStart(3,'0'),
  meters:100+i*6.4+variation*2,y:(i%g.laneCount)*g.centerStepM,
  speedMps:4+(i%4),cpWatts:210+(i%7)*18,wPrimeJoules:18000}))
}
let observedNonlinearKnots=0,observedPairs=0,conflictProposals=0,attenuated=0,mechanical=0,riderSubsteps=0
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of sizes)for(let variation=0;variation<3;variation++){
  const initial=entrants(n,g,variation),config={riders:initial,geometry,road:{gradePercent:grades[variation]},substeps:4}
  try{
   const start=begin(config),frozen=structuredClone(initial)
   assert.deepEqual(initial,frozen,'A34 changed initializer input')
   let full=start
   for(let turn=0;turn<6;turn++){
    const commands=controls(full,turn,variation,g),unaltered=structuredClone(commands)
    full=advance(full,commands)
    assert.deepEqual(commands,unaltered,'A34 rewrote a submitted rider action')
    assert.equal(full.lastTickTracks.length,n)
    for(const track of full.lastTickTracks){
     assert.equal(track.knots.length,5)
     for(let j=1;j<track.knots.length;j++)assert.equal(track.knots[j].t,j/4)
     for(let j=1;j<4;j++){
      const q=track.knots[j],first=track.knots[0],last=track.knots[4]
      const linearX=first.x+(last.x-first.x)*(j/4)
      const linearY=first.y+(last.y-first.y)*(j/4)
      if(Math.abs(q.x-linearX)>1e-5||Math.abs(q.y-linearY)>1e-5)observedNonlinearKnots++
     }
    }
    const independent=auditObservedTrackSetV3(full.lastTickTracks,geometry)
    assert.equal(independent.metrics.piecewiseCollisions,0,'A34 accepted an unsafe observed movement')
    assert.equal(independent.metrics.missedByChord,0,'A34 endpoint chord missed an accepted collision')
    assert.equal(independent.metrics.pairs,n*(n-1)/2)
   }
   let restored=start
   for(let turn=0;turn<3;turn++)restored=advance(restored,controls(restored,turn,variation,g))
   restored=JSON.parse(JSON.stringify(restored))
   for(let turn=3;turn<6;turn++)restored=advance(restored,controls(restored,turn,variation,g))
   assert.deepEqual(full,restored,'A34 checkpoint replay changed physical or energy outcome')
   const reversed=begin({...config,riders:initial.slice().reverse()})
   const firstA=advance(start,controls(start,0,variation,g))
   const firstB=advance(reversed,controls(reversed,0,variation,g).reverse())
   assert.deepEqual(firstA,firstB,'A34 rider enumeration changed collision or energy result')
   assert.equal(full.tick,6);assert.equal(full.elapsedSeconds,60)
   assert.equal(full.metrics.riderSubsteps,n*24)
   assert(full.riders.every(r=>r.energy.seconds===60&&Number.isFinite(r.energy.remainingWPrimeJoules)&&
    r.energy.remainingWPrimeJoules>=0&&r.energy.remainingWPrimeJoules<=r.energy.wPrimeJoules))
   const totalMechanical=full.riders.reduce((s,r)=>s+r.energy.cumulativeMechanicalJoules,0)
   assert(Math.abs(totalMechanical-full.metrics.mechanicalJoules)<1e-5,'A34 per-substep power ledger differs from physical joules')
   assert.equal(full.metrics.remainingPiecewiseOverlaps,0)
   assert.equal(full.officialWrites,0);assert.equal(full.sportingApproval,'NOT_APPROVED')
   runs.push({road:g.id,riders:n,variation,ticks:full.tick,
    conflictProposals:full.metrics.collisionProposals,
    attenuatedRiderSubsteps:full.metrics.attenuatedRiderSubsteps,
    observedPairs:full.metrics.observedPairs,
    mechanicalJoules:totalMechanical,finalMinimumWPrime:Math.min(...full.riders.map(r=>r.energy.remainingWPrimeJoules))})
   observedPairs+=full.metrics.observedPairs;conflictProposals+=full.metrics.collisionProposals
   attenuated+=full.metrics.attenuatedRiderSubsteps;riderSubsteps+=full.metrics.riderSubsteps;mechanical+=totalMechanical
  }catch(e){failures.push({geometry:g.id,n,variation,reason:String(e.stack??e)});console.error(JSON.stringify(failures.at(-1)));}
 }
}
const small=BATCH40_GEOMETRIES[1],g=validateRoadScenarioV3(small)
const p=begin({geometry:small,riders:entrants(2,g,0)})
const invalid=controls(p,0,0,g)
invalid[0].targetY=-1
assert.throws(()=>advance(p,invalid),/Invalid frozen A34 command/)
assert.equal(p.tick,0,'A34 mutated input on failed request')
assert.throws(()=>advance({...p,officialWrites:1},controls(p,0,0,g)),/Invalid A34 replay checkpoint/)
assert.throws(()=>begin({geometry:small,riders:[{...entrants(2,g,0)[0]}, {...entrants(2,g,0)[0]}]}),/Duplicate\/blank A34 rider/)
assert.equal(failures.length,0,'A34 encountered invalid movement or lost energy')
assert.equal(runs.length,BATCH40_GEOMETRIES.length*sizes.length*3)
assert(observedNonlinearKnots>0,'No genuinely nonlinear generated intermediate state')
assert(conflictProposals>0,'Stress did not exercise any swept collision attenuation')
const output={study:'A34_SUBSTEP_PHYSICAL_ENERGY',technicalGate:'PASS',cases:runs.length,failures,
 roadGeometries:BATCH40_GEOMETRIES.length,fieldSizes:sizes,substepsPerTick:4,
 ticksPerCase:6,observedPairs,observedNonlinearKnots,conflictProposals,
 attenuatedRiderSubsteps:attenuated,riderSubsteps,mechanicalJoules:mechanical,
 restartExact:true,orderIndependent:true,unchangedIntents:true,noObservedCollisions:true,
 officialWrites:0,sportingApproval:'NOT_APPROVED',runs}
const dir=process.env.V3_A2_STEP34_DIR??'/tmp/a34-substep'
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/a34-substep-physical.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({study:output.study,technicalGate:output.technicalGate,cases:runs.length,
 failures:0,observedPairs,observedNonlinearKnots,conflictProposals,attenuatedRiderSubsteps:attenuated,
 riderSubsteps,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
