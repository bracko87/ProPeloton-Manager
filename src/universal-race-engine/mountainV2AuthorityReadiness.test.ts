import {describe,expect,it} from 'vitest'
import {auditMountainV2AuthorityReadiness} from './mountainV2AuthorityReadiness.ts'
import type {MountainV2ShadowAudit} from './mountainV2ExperimentalAdapter.ts'
const shadow = {
  authority:'non_authoritative',
  status:'evaluated_non_authoritative',
  syntheticTiming:{finish:[
    {riderId:'a',rank:1,elapsedSeconds:3600,gapSeconds:0},
    {riderId:'b',rank:2,elapsedSeconds:3630,gapSeconds:30},
  ],replay:[]},
} as unknown as MountainV2ShadowAudit
describe('Mountain V2 authority readiness remains fail-closed',()=>{
  it('never grants authority even for a clean synthetic stage',()=>{
    const r=auditMountainV2AuthorityReadiness(shadow,{starterIds:['a','b'],nonFinisherIds:[],bonusAwardRiderIds:[],incidentAffectedRiderIds:[]})
    expect(r.readyForOfficialClassification).toBe(false)
    expect(r.blockers).toContain('official_classification_replay_and_payout_mapping_not_implemented')
  })
  it('separately identifies DNF, time-bonus and incident blockers',()=>{
    const r=auditMountainV2AuthorityReadiness(shadow,{starterIds:['a','b'],nonFinisherIds:['b'],bonusAwardRiderIds:['a'],incidentAffectedRiderIds:['b']})
    expect(r.blockers).toContain('nonfinishers_not_reconciled')
    expect(r.blockers).toContain('time_bonuses_not_reconciled')
    expect(r.blockers).toContain('incident_outcomes_not_reconciled')
  })
  it('rejects inconsistent finishing membership and unknown sporting events',()=>{
    const r=auditMountainV2AuthorityReadiness(shadow,{starterIds:['a','c'],nonFinisherIds:[],bonusAwardRiderIds:['x'],incidentAffectedRiderIds:[]})
    expect(r.blockers).toContain('synthetic_finish_membership_mismatch')
    expect(r.blockers).toContain('sporting_event_references_nonstarter')
  })
  it('blocks incomplete profile and missing synthetic finish',()=>{
    const r=auditMountainV2AuthorityReadiness({...shadow,status:'geometry_review_required',syntheticTiming:undefined},{starterIds:['a','b'],nonFinisherIds:[],bonusAwardRiderIds:[],incidentAffectedRiderIds:[]})
    expect(r.blockers).toContain('synthetic_stage_unavailable')
  })
})
