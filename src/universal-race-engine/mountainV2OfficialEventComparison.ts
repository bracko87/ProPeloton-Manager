/**
 * Diagnostic bridge from the actual experimental engine contracts to Mountain V2.
 *
 * Extracts real Phase 10 statuses, per-rider incident consequences and the
 * intermediate/finish award ledgers. Never writes classification, GC, points,
 * money or authoritative replay. Synthetic outcomes remain an explicit preview.
 */
import type { UniversalRaceEngineInput, UniversalRaceEngineResult } from './runMountainExperimentalEngineV1.ts'
import type { MountainV2ShadowAudit } from './mountainV2ExperimentalAdapter.ts'
import { buildMountainV2SportingPreview, type MountainV2SportingPreview } from './mountainV2SportingPreview.ts'

type Contract = Pick<UniversalRaceEngineResult,
  'finishResolution' | 'phase10Incidents' | 'intermediatePointFinalization' |
  'roadRaceResolution' | 'replayTimeline'>

export interface MountainV2ObservedIncident {
  readonly incidentId: string
  readonly riderId: string
  readonly km: number
  readonly kind: string
  readonly statusImpact: 'finished' | 'dnf'
  readonly timePenaltySeconds: number
  readonly rejoinedAtKm: number | null
  readonly temporarySeparation: boolean
  readonly sprintZoneProtected: boolean
  readonly finalGapToTargetSeconds: number
}
export interface MountainV2ObservedBonus {
  readonly riderId: string
  readonly source: 'intermediate_point_ledger' | 'phase4_finish_award'
  readonly sourceId: string
  readonly bonusSeconds: number
}
export interface MountainV2OfficialEventComparison {
  readonly authority: 'non_authoritative'
  readonly officialStatusByRiderId: Readonly<Record<string, 'finished' | 'dnf' | 'dns' | 'otl'>>
  readonly incidents: readonly MountainV2ObservedIncident[]
  readonly bonuses: readonly MountainV2ObservedBonus[]
  /** Derived for comparison ONLY; it is not the game's official GC calculation. */
  readonly syntheticSportingPreview: MountainV2SportingPreview | null
  readonly readyForAuthority: false
  readonly blockers: readonly string[]
}

/** Maps completed real-engine synthetic race output, without mutating it. */
export function compareMountainV2WithOfficialEvents(
  input: UniversalRaceEngineInput,
  result: Contract,
  shadow: MountainV2ShadowAudit,
): MountainV2OfficialEventComparison {
  const blockers = new Set<string>(['authoritative_finish_gc_points_prizes_replay_not_integrated'])
  const official = result.finishResolution.classification
  const accepted = new Set(input.riders.map(r => r.riderId))
  const starterIds = input.riders.filter(r => r.startStatus !== 'dns').map(r => r.riderId)
  const starters = new Set(starterIds)
  if (accepted.size !== input.riders.length || starters.size !== starterIds.length ||
      official.length !== accepted.size || new Set(official.map(r => r.riderId)).size !== accepted.size ||
      official.some(r => !accepted.has(r.riderId))) {
    throw new Error('Mountain V2: official classification membership mismatch')
  }
  const officialStatusByRiderId = Object.fromEntries(
    official.map(row => [row.riderId, row.status]),
  ) as Record<string, 'finished' | 'dnf' | 'dns' | 'otl'>
  if (official.some(row =>
    result.phase10Incidents.statusByRiderId[row.riderId] !== row.status ||
    (row.status === 'finished' && (row.rank === null || row.officialTimeSeconds === null)) ||
    (row.status === 'dns' && starters.has(row.riderId))
  )) blockers.add('official_phase10_status_or_start_inconsistency')
  if (official.some(row => row.status !== 'dns' && !starters.has(row.riderId))) {
    blockers.add('nonstarter_has_official_race_status')
  }
  const finalReplay = result.replayTimeline.checkpoints.at(-1)
  if (!finalReplay ||
      new Set(finalReplay.riderStates.map(row => row.riderId)).size !== accepted.size ||
      finalReplay.riderStates.some(row =>
        officialStatusByRiderId[row.riderId] !== row.status)) {
    blockers.add('official_final_replay_status_mismatch')
  }

  const incidents: MountainV2ObservedIncident[] = []
  const incidentIds = new Set<string>()
  for (const incident of result.phase10Incidents.incidents) {
    if (incidentIds.has(incident.incidentId)) {
      throw new Error('Mountain V2: duplicate official incident ID')
    }
    incidentIds.add(incident.incidentId)
    const incidentMembers = new Set(incident.riderIds)
    const consequenceMembers = new Set(incident.riderConsequences.map(r => r.riderId))
    if (incidentMembers.size !== incident.riderIds.length ||
        consequenceMembers.size !== incident.riderConsequences.length ||
        incidentMembers.size !== consequenceMembers.size ||
        [...consequenceMembers].some(id => !incidentMembers.has(id) || !accepted.has(id))) {
      throw new Error('Mountain V2: inconsistent official incident rider IDs')
    }
    for (const row of incident.riderConsequences) {
      if (!Number.isFinite(row.timePenaltySeconds) || row.timePenaltySeconds < 0 ||
          !Number.isFinite(row.finalGapToTargetSeconds) || row.finalGapToTargetSeconds < 0) {
        throw new Error('Mountain V2: invalid official incident time consequence')
      }
      if (row.actualRejoinKm !== null && row.temporarySeparation && row.timePenaltySeconds !== 0) {
        blockers.add('rejoined_incident_has_unexpected_final_penalty')
      }
      incidents.push({
        incidentId: incident.incidentId,
        riderId: row.riderId,
        km: incident.kmFromStart,
        kind: incident.incidentKind,
        statusImpact: row.statusImpact,
        timePenaltySeconds: row.timePenaltySeconds,
        rejoinedAtKm: row.actualRejoinKm,
        temporarySeparation: row.temporarySeparation,
        sprintZoneProtected: row.sprintZoneProtection.applied,
        finalGapToTargetSeconds: row.finalGapToTargetSeconds,
      })
    }
  }
  if (incidents.length) blockers.add('incident_replay_lineage_not_reconciled')
  if (incidents.some(i => i.sprintZoneProtected)) {
    blockers.add('sprint_zone_time_protection_not_reconciled')
  }
  if (result.phase10Incidents.autonomousChase.summary.teamRescueHelperCount > 0) {
    blockers.add('team_rescue_time_cost_not_reconciled')
  }

  const bonuses: MountainV2ObservedBonus[] = []
  const ledgerKeys = new Set<string>()
  for (const award of result.intermediatePointFinalization.pointLedger) {
    if (ledgerKeys.has(award.ledgerEntryKey) || award.awardApplicationCount !== 1 ||
        !accepted.has(award.riderId) || !Number.isFinite(award.bonusSecondsAwarded) ||
        award.bonusSecondsAwarded < 0) {
      throw new Error('Mountain V2: invalid intermediate-point bonus ledger')
    }
    ledgerKeys.add(award.ledgerEntryKey)
    if (award.bonusSecondsAwarded > 0) bonuses.push({
      riderId: award.riderId, source:'intermediate_point_ledger',
      sourceId: award.ledgerEntryKey, bonusSeconds: award.bonusSecondsAwarded,
    })
  }
  const finishAwardIds = new Set<string>()
  for (const award of result.roadRaceResolution.phase4Finish?.finish.rankings ?? []) {
    if (finishAwardIds.has(award.riderId) || !accepted.has(award.riderId) ||
        !Number.isFinite(award.bonusSecondsAwarded) || award.bonusSecondsAwarded < 0) {
      throw new Error('Mountain V2: invalid Phase 4 finish bonus award')
    }
    finishAwardIds.add(award.riderId)
    if (award.bonusSecondsAwarded > 0) bonuses.push({
      riderId: award.riderId, source:'phase4_finish_award',
      sourceId: String(award.rank), bonusSeconds: award.bonusSecondsAwarded,
    })
  }
  if (bonuses.length) blockers.add('official_bonus_gc_application_not_reconciled')
  if (shadow.status !== 'evaluated_non_authoritative' || !shadow.syntheticTiming) {
    blockers.add('mountain_shadow_geometry_or_timing_unavailable')
  }
  if (shadow.stageId !== input.stage.stageId || input.stage.stageFormat !== 'road_race') {
    blockers.add('shadow_stage_contract_mismatch')
  }
  const shadowIds = new Set(shadow.syntheticTiming?.finish.map(row => row.riderId) ?? [])
  if (shadow.syntheticTiming &&
      (shadowIds.size !== starters.size ||
       shadow.syntheticTiming.finish.length !== starters.size ||
       [...starters].some(id => !shadowIds.has(id)))) {
    blockers.add('shadow_starter_membership_mismatch')
  }
  const removedIds = official.filter(r => r.status === 'dnf' || r.status === 'otl')
    .map(r => r.riderId)
  if (removedIds.length) blockers.add('nonfinisher_replay_transition_not_reconciled')
  if (bonuses.some(b => officialStatusByRiderId[b.riderId] !== 'finished')) {
    // Intermediate awards remain valid even if a rider later abandons.
    blockers.add('pre_abandonment_bonus_ledger_not_projected')
  }

  let syntheticSportingPreview: MountainV2SportingPreview | null = null
  if (shadow.syntheticTiming &&
      !blockers.has('shadow_starter_membership_mismatch') &&
      !blockers.has('pre_abandonment_bonus_ledger_not_projected')) {
    const penalties = new Map<string, number>()
    for (const row of incidents) {
      if (officialStatusByRiderId[row.riderId] === 'finished') {
        penalties.set(row.riderId, (penalties.get(row.riderId) ?? 0) + row.timePenaltySeconds)
      }
    }
    const bonusByRider = new Map<string, number>()
    for (const row of bonuses) {
      bonusByRider.set(row.riderId,
        (bonusByRider.get(row.riderId) ?? 0) + row.bonusSeconds)
    }
    syntheticSportingPreview = buildMountainV2SportingPreview(shadow.syntheticTiming.finish, {
      nonFinisherIds: removedIds,
      incidents: [...penalties].filter(([,seconds]) => seconds > 0)
        .map(([riderId, penaltySeconds]) => ({ riderId, penaltySeconds })),
      bonuses: [...bonusByRider].filter(([,seconds]) => seconds > 0)
        .map(([riderId, bonusSeconds]) => ({ riderId, bonusSeconds })),
    })
  }
  return {
    authority:'non_authoritative',
    officialStatusByRiderId, incidents, bonuses, syntheticSportingPreview,
    readyForAuthority:false, blockers:[...blockers],
  }
}
