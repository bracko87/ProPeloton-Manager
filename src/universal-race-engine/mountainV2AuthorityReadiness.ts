/**
 * Conservative Mountain V2 authority gate — diagnostic only.
 * Never grants production authority. Its only job is to explain why a
 * synthetic finish cannot stand in for the official classification.
 */
import type { MountainV2ShadowAudit } from './mountainV2ExperimentalAdapter.ts'

export interface MountainV2AuthorityReadiness {
  readonly authority: 'non_authoritative'
  readonly readyForOfficialClassification: false
  readonly blockers: readonly string[]
}
export interface MountainV2SportingContract {
  readonly starterIds: readonly string[]
  readonly nonFinisherIds: readonly string[]
  readonly bonusAwardRiderIds: readonly string[]
  readonly incidentAffectedRiderIds: readonly string[]
}
export function auditMountainV2AuthorityReadiness(
  shadow: MountainV2ShadowAudit,
  contract: MountainV2SportingContract,
): MountainV2AuthorityReadiness {
  const blockers: string[] = ['official_classification_replay_and_payout_mapping_not_implemented']
  if (shadow.status !== 'evaluated_non_authoritative' || !shadow.syntheticTiming) {
    blockers.push('synthetic_stage_unavailable')
  }
  if (contract.nonFinisherIds.length) blockers.push('nonfinishers_not_reconciled')
  if (contract.bonusAwardRiderIds.length) blockers.push('time_bonuses_not_reconciled')
  if (contract.incidentAffectedRiderIds.length) blockers.push('incident_outcomes_not_reconciled')
  const starters = new Set(contract.starterIds)
  if (starters.size !== contract.starterIds.length) blockers.push('duplicate_starters')
  const finish = shadow.syntheticTiming?.finish ?? []
  const finishIds = new Set(finish.map(row => row.riderId))
  if (shadow.syntheticTiming &&
      (finish.length !== starters.size || finishIds.size !== finish.length ||
       finish.some(row => !starters.has(row.riderId)))) {
    blockers.push('synthetic_finish_membership_mismatch')
  }
  for (const id of [...contract.nonFinisherIds,...contract.bonusAwardRiderIds,...contract.incidentAffectedRiderIds]) {
    if (!starters.has(id)) {
      blockers.push('sporting_event_references_nonstarter')
      break
    }
  }
  return {authority:'non_authoritative',readyForOfficialClassification:false,blockers}
}
