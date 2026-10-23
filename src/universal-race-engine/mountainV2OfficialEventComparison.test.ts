import { describe, expect, it } from 'vitest'
import type { UniversalRaceEngineInput, UniversalRaceEngineResult } from './runMountainExperimentalEngineV1.ts'
import type { MountainV2ShadowAudit } from './mountainV2ExperimentalAdapter.ts'
import { compareMountainV2WithOfficialEvents } from './mountainV2OfficialEventComparison.ts'

/** Contract-shaped fixtures: all names derive from the experimental engine's
 * exported result types, not invented persistence/GC fields. */
function fixture() {
  const input = {
    stage: {stageId:'synthetic-stage',stageFormat:'road_race'},
    riders: [
      {riderId:'a',startStatus:'starter'},
      {riderId:'b',startStatus:'starter'},
      {riderId:'dns',startStatus:'dns'},
    ],
  } as unknown as UniversalRaceEngineInput
  const shadow = {
    stageId:'synthetic-stage',
    status:'evaluated_non_authoritative',
    syntheticTiming: {finish:[
      {riderId:'a',rank:1,elapsedSeconds:3600,gapSeconds:0},
      {riderId:'b',rank:2,elapsedSeconds:3630,gapSeconds:30},
    ],replay:[]},
  } as unknown as MountainV2ShadowAudit
  const consequence = {
    riderId:'a',statusImpact:'finished',timePenaltySeconds:0,
    actualRejoinKm:66,temporarySeparation:true,
    finalGapToTargetSeconds:0,sprintZoneProtection:{applied:false},
  }
  const result = {
    finishResolution:{classification:[
      {riderId:'a',status:'finished',rank:1,officialTimeSeconds:3600},
      {riderId:'b',status:'dnf',rank:null,officialTimeSeconds:null},
      {riderId:'dns',status:'dns',rank:null,officialTimeSeconds:null},
    ]},
    phase10Incidents:{
      statusByRiderId:{a:'finished',b:'dnf',dns:'dns'},
      incidents:[
        {incidentId:'i1',incidentKind:'technical_incident',kmFromStart:40,
         riderIds:['a'],riderConsequences:[consequence]},
        {incidentId:'i2',incidentKind:'exhaustion',kmFromStart:75,
         riderIds:['b'],riderConsequences:[{
           ...consequence,riderId:'b',statusImpact:'dnf',actualRejoinKm:null,
           temporarySeparation:false,
         }]},
      ],
      autonomousChase:{summary:{teamRescueHelperCount:0}},
    },
    intermediatePointFinalization:{pointLedger:[
      {ledgerEntryKey:'point-a',riderId:'a',bonusSecondsAwarded:5,awardApplicationCount:1},
    ]},
    roadRaceResolution:{phase4Finish:{finish:{rankings:[
      {riderId:'a',rank:1,bonusSecondsAwarded:10},
      {riderId:'b',rank:2,bonusSecondsAwarded:0},
    ]}}},
    replayTimeline:{checkpoints:[{riderStates:[
      {riderId:'a',status:'finished'},
      {riderId:'b',status:'dnf'},
      {riderId:'dns',status:'dns'},
    ]}]},
  } as unknown as UniversalRaceEngineResult
  return {input,shadow,result}
}

describe('real Phase 10/point ledger contract mapping to Mountain V2 shadow',()=>{
  it('preserves DNF and DNS, rejoin-zero penalty and both bonus award sources',()=>{
    const {input,shadow,result}=fixture()
    const unchanged=JSON.stringify(result)
    const audit=compareMountainV2WithOfficialEvents(input,result,shadow)
    expect(audit.authority).toBe('non_authoritative')
    expect(audit.readyForAuthority).toBe(false)
    expect(audit.officialStatusByRiderId).toEqual({a:'finished',b:'dnf',dns:'dns'})
    expect(audit.incidents.find(i=>i.riderId==='a')).toMatchObject({
      rejoinedAtKm:66,timePenaltySeconds:0,temporarySeparation:true,
    })
    expect(audit.bonuses.map(b=>b.source)).toEqual([
      'intermediate_point_ledger','phase4_finish_award',
    ])
    expect(audit.syntheticSportingPreview?.classified).toHaveLength(1)
    expect(audit.syntheticSportingPreview?.classified[0].adjustedSeconds).toBe(3585)
    expect(audit.syntheticSportingPreview?.nonFinishers).toEqual(['b'])
    expect(audit.blockers).toContain('nonfinisher_replay_transition_not_reconciled')
    expect(audit.blockers).toContain('incident_replay_lineage_not_reconciled')
    expect(JSON.stringify(result)).toBe(unchanged)
  })
  it('preserves pre-abandonment award instead of erasing or applying it to a DNF',()=>{
    const {input,shadow,result}=fixture()
    const pointLedger=[{
      ...result.intermediatePointFinalization.pointLedger[0],riderId:'b',
    }]
    const changed={...result,intermediatePointFinalization:{
      ...result.intermediatePointFinalization,pointLedger,
    }}
    const audit=compareMountainV2WithOfficialEvents(input,changed,shadow)
    expect(audit.bonuses.some(b=>b.riderId==='b'&&b.bonusSeconds===5)).toBe(true)
    expect(audit.syntheticSportingPreview).toBeNull()
    expect(audit.blockers).toContain('pre_abandonment_bonus_ledger_not_projected')
  })
  it('does not interpret an OTL as a classified finisher',()=>{
    const {input,shadow,result}=fixture()
    const classification=result.finishResolution.classification.map(r=>
      r.riderId==='b'?{...r,status:'otl' as const}:r)
    const updated={...result,finishResolution:{...result.finishResolution,classification},
      phase10Incidents:{...result.phase10Incidents,statusByRiderId:{
        ...result.phase10Incidents.statusByRiderId,b:'otl' as const,
      }},
      replayTimeline:{...result.replayTimeline,checkpoints:result.replayTimeline.checkpoints.map(cp=>({
        ...cp,riderStates:cp.riderStates.map(r=>r.riderId==='b'?{...r,status:'otl' as const}:r),
      }))}}
    const audit=compareMountainV2WithOfficialEvents(input,updated,shadow)
    expect(audit.officialStatusByRiderId.b).toBe('otl')
    expect(audit.syntheticSportingPreview?.nonFinishers).toEqual(['b'])
  })
  it('fails closed on contradictory incident member records or duplicate ledger awards',()=>{
    const {input,shadow,result}=fixture()
    const invalid={...result,phase10Incidents:{...result.phase10Incidents,
      incidents:result.phase10Incidents.incidents.map((i,index)=>index===0
        ?{...i,riderIds:['a','b']}:i)}}
    expect(()=>compareMountainV2WithOfficialEvents(input,invalid,shadow)).toThrow()
    const entry=result.intermediatePointFinalization.pointLedger[0]
    const badLedger={...result,intermediatePointFinalization:{
      ...result.intermediatePointFinalization,pointLedger:[entry,entry],
    }}
    expect(()=>compareMountainV2WithOfficialEvents(input,badLedger,shadow)).toThrow()
  })
})
