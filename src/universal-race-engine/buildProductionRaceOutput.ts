/**
 * Phase 11A production output adapter.
 *
 * Pure mapping only. No official table writes occur here. The returned
 * applicationManifest is the exact Phase 8/9/10 handoff that Phase 11B will
 * persist after production verification.
 */
import type {
  UniversalOfficialFinishStatus,
  UniversalRaceEngineInput,
  UniversalRaceEngineResult,
} from './runRaceEngine.ts'

export const UNIVERSAL_RACE_STAGE_OUTPUT_CONTRACT = 'universal_race_stage_output_v1' as const
export const UNIVERSAL_PHASE11_MANIFEST_CONTRACT = 'universal_phase11_application_manifest_v1' as const

type JsonRecord = Record<string, unknown>

export type UniversalReplayProductionQuality = 'full' | 'degraded'

const REPLAY_ONLY_SYNCHRONIZATION_ISSUE_PREFIXES = [
  'duplicate_group_display_code:',
  'duplicate_physical_group_gap:',
  'group_gap_cardinality_mismatch:',
  'group_gap_identity_mismatch:',
  'rider_group_gap_mismatch:',
  'same_kilometre_physical_state_mismatch:',
  'front_group_transfer_without_physical_transition:',
  'post_catch_group_transfer_without_physical_transition:',
  'opening_breakaway_lineage_changed:',
  'opening_breakaway_lineage_changed_without_bridge_merge:',
  'gap_change_exceeds_distance_bound:',
] as const

function isReplayOnlySynchronizationIssue(issue: string): boolean {
  return REPLAY_ONLY_SYNCHRONIZATION_ISSUE_PREFIXES.some((prefix) =>
    issue.startsWith(prefix),
  )
}

function replayProductionAssessment(result: UniversalRaceEngineResult): {
  readonly acceptable: boolean
  readonly quality: UniversalReplayProductionQuality
  readonly replayOnlyIssues: readonly string[]
  readonly blockingIssues: readonly string[]
} {
  const issues = result.replaySynchronization.issues ?? []
  if (result.replaySynchronization.synchronized) {
    return {
      acceptable: true,
      quality: 'full',
      replayOnlyIssues: [],
      blockingIssues: [],
    }
  }

  const replayOnlyIssues = issues.filter(isReplayOnlySynchronizationIssue)
  const blockingIssues = issues.filter(
    (issue) => !isReplayOnlySynchronizationIssue(issue),
  )

  // A non-synchronized summary with no explicit issue is never bypassed.
  const acceptable = issues.length > 0 && blockingIssues.length === 0

  return {
    acceptable,
    quality: acceptable ? 'degraded' : 'full',
    replayOnlyIssues,
    blockingIssues,
  }
}

export interface ProductionStageResultOutputRow {
  readonly riderId: string
  readonly teamId: string
  readonly rank: number | null
  readonly status: UniversalOfficialFinishStatus
  readonly elapsedSeconds: number | null
  readonly gapSeconds: number | null
  readonly bonusSeconds: number
  readonly penaltySeconds: number
  readonly finishPoints: number
  readonly sprintPoints: number
  readonly mountainPoints: number
  readonly riderNameSnapshot: string
  readonly teamNameSnapshot: string
}

export interface ProductionPointResultOutputRow {
  readonly pointId: string
  readonly riderId: string
  readonly teamId: string
  readonly rank: number
  readonly pointsAwarded: number
  readonly bonusSecondsAwarded: number
  readonly riderNameSnapshot: string
  readonly teamNameSnapshot: string
}

export interface ProductionReportEventOutputRow {
  readonly eventOrder: number
  readonly kmMarker: number
  readonly eventType: string
  readonly title: string
  readonly description: string
  readonly riderId: string | null
  readonly teamId: string | null
  readonly riderNameSnapshot: string | null
  readonly teamNameSnapshot: string | null
  readonly metadata: JsonRecord
}

export interface UniversalPhase11RiderStateManifestRow {
  readonly riderId: string
  readonly teamId: string
  readonly finishStatus: UniversalOfficialFinishStatus
  readonly finishPosition: number | null
  readonly finishTimeSeconds: number | null
  readonly gapSeconds: number | null
  readonly fatigueBeforeStage: number
  readonly fatigueGain: number
  readonly fatigueAfterStage: number
  readonly finishStamina: number | null
  readonly staminaSpent: number
  readonly writeKey: string
}

export interface UniversalPhase11HealthCaseCandidate {
  readonly incidentId: string
  readonly riderId: string
  readonly teamId: string
  readonly caseCode: string
  readonly severity: string
  readonly bodyPart: string | null
  readonly selectionBlockedAfterStage: boolean
  readonly sourceType: 'race_stage_incident'
  readonly sourceId: string
  readonly notes: JsonRecord
}

export interface UniversalPhase11ApplicationManifest {
  readonly contractVersion: typeof UNIVERSAL_PHASE11_MANIFEST_CONTRACT
  readonly stageId: string
  readonly raceId: string
  readonly readyForApplication: boolean
  readonly persistenceApplied: false
  readonly riderStateRows: readonly UniversalPhase11RiderStateManifestRow[]
  readonly fatiguePersistenceRows: UniversalRaceEngineResult['postStageUpdate']['persistenceContract']['rows']
  readonly phase9ResourceUpdates: UniversalRaceEngineResult['phase9Modifiers']['resourceUpdates']
  readonly healthCaseCandidates: readonly UniversalPhase11HealthCaseCandidate[]
  readonly validation: {
    readonly everyAcceptedRiderHasExactlyOneStatus: boolean
    readonly acceptedRiderCount: number
    readonly classificationRiderCount: number
    readonly riderStateRiderCount: number
    readonly persistenceRiderCount: number
    readonly writeEligibleRiderCount: number
    readonly dnsRiderCount: number
    readonly replaySynchronized: boolean
    readonly replayProductionAcceptable: boolean
    readonly replayQuality: UniversalReplayProductionQuality
    readonly replayOnlyIssueCount: number
    readonly replayBlockingIssueCount: number
    readonly replayCompleteBeforePlayback: boolean
    readonly playbackRecalculatesRace: false
    readonly finalResultsHiddenUntilFinalCheckpoint: boolean
    readonly phase9PayloadValid: boolean
    readonly directEngineDatabaseWrites: false
  }
}

export interface ProductionUniversalRaceOutput {
  readonly contractVersion: typeof UNIVERSAL_RACE_STAGE_OUTPUT_CONTRACT
  readonly engineKey: UniversalRaceEngineResult['engineKey']
  readonly engineVersion: UniversalRaceEngineResult['engineVersion']
  readonly raceId: string
  readonly stageId: string
  readonly universalResult: UniversalRaceEngineResult
  readonly publication: {
    readonly stageResults: readonly ProductionStageResultOutputRow[]
    readonly pointResults: readonly ProductionPointResultOutputRow[]
    readonly reportEvents: readonly ProductionReportEventOutputRow[]
  }
  readonly applicationManifest: UniversalPhase11ApplicationManifest
  readonly verification: {
    readonly officialOutputsWrittenByBuilder: false
    readonly historicalRowsMutatedByBuilder: false
    readonly oneEngineResult: true
    readonly oneReplayTimeline: true
    readonly resultVisibleCheckpointCount: number
    readonly replayQuality: UniversalReplayProductionQuality
    readonly replayOnlyIssues: readonly string[]
    readonly officialResultsUnchangedByReplayFallback: true
    readonly readyForProductionComparison: boolean
  }
}

function riderName(input: UniversalRaceEngineInput, riderId: string): string {
  return input.riders.find((row) => row.riderId === riderId)?.snapshot.displayName?.trim() || riderId
}

function teamName(input: UniversalRaceEngineInput, teamId: string): string {
  return input.teams.find((row) => row.teamId === teamId)?.snapshot.teamName?.trim() || teamId
}

function buildPointRows(
  input: UniversalRaceEngineInput,
  result: UniversalRaceEngineResult,
): ProductionPointResultOutputRow[] {
  const rows: ProductionPointResultOutputRow[] = result.intermediatePointFinalization.pointLedger.map((entry) => ({
    pointId: entry.pointId,
    riderId: entry.riderId,
    teamId: entry.teamId,
    rank: entry.rank,
    pointsAwarded: entry.pointsAwarded,
    bonusSecondsAwarded: entry.bonusSecondsAwarded,
    riderNameSnapshot: riderName(input, entry.riderId),
    teamNameSnapshot: teamName(input, entry.teamId),
  }))

  const finishPoint = input.points.find((point) => point.pointType === 'FINISH' || point.isFinishPoint)
  const phase4Finish = result.roadRaceResolution.phase4Finish
  if (finishPoint && phase4Finish) {
    phase4Finish.finish.rankings.forEach((entry) => {
      if (entry.pointsAwarded <= 0 && entry.bonusSecondsAwarded <= 0) return
      rows.push({
        pointId: finishPoint.pointId,
        riderId: entry.riderId,
        teamId: entry.teamId,
        rank: entry.rank,
        pointsAwarded: entry.pointsAwarded,
        bonusSecondsAwarded: entry.bonusSecondsAwarded,
        riderNameSnapshot: riderName(input, entry.riderId),
        teamNameSnapshot: teamName(input, entry.teamId),
      })
    })
  }

  return rows.sort((a, b) => {
    const leftPoint = input.points.find((point) => point.pointId === a.pointId)
    const rightPoint = input.points.find((point) => point.pointId === b.pointId)
    return (leftPoint?.sortOrder ?? Number.MAX_SAFE_INTEGER) - (rightPoint?.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.rank - b.rank || a.riderId.localeCompare(b.riderId)
  })
}

function buildStageRows(
  input: UniversalRaceEngineInput,
  result: UniversalRaceEngineResult,
  pointRows: readonly ProductionPointResultOutputRow[],
): ProductionStageResultOutputRow[] {
  const pointByRider = new Map<string, { finish: number; sprint: number; mountain: number; bonus: number }>()
  pointRows.forEach((row) => {
    const current = pointByRider.get(row.riderId) ?? { finish: 0, sprint: 0, mountain: 0, bonus: 0 }
    const pointType = input.points.find((point) => point.pointId === row.pointId)?.pointType
    if (pointType === 'FINISH') current.finish += row.pointsAwarded
    else if (pointType === 'KOM') current.mountain += row.pointsAwarded
    else current.sprint += row.pointsAwarded
    current.bonus += row.bonusSecondsAwarded
    pointByRider.set(row.riderId, current)
  })

  return result.finishResolution.classification.map((official) => {
    const points = pointByRider.get(official.riderId) ?? { finish: 0, sprint: 0, mountain: 0, bonus: 0 }
    return {
      riderId: official.riderId,
      teamId: official.teamId,
      rank: official.rank,
      status: official.status,
      elapsedSeconds: official.officialTimeSeconds,
      gapSeconds: official.gapSeconds,
      bonusSeconds: official.status === 'finished' ? points.bonus : 0,
      penaltySeconds: 0,
      finishPoints: official.status === 'finished' ? points.finish : 0,
      sprintPoints: points.sprint,
      mountainPoints: points.mountain,
      riderNameSnapshot: riderName(input, official.riderId),
      teamNameSnapshot: teamName(input, official.teamId),
    }
  })
}

function buildReportRows(
  input: UniversalRaceEngineInput,
  result: UniversalRaceEngineResult,
): ProductionReportEventOutputRow[] {
  const rows: ProductionReportEventOutputRow[] = []
  const seen = new Set<string>()
  let order = 0

  result.replayTimeline.checkpoints.forEach((checkpoint) => {
    checkpoint.commentary.forEach((commentary) => {
      if (seen.has(commentary.commentaryId)) return
      seen.add(commentary.commentaryId)
      order += 1
      const riderId = commentary.riderIds[0] ?? null
      const teamId = commentary.teamIds[0] ?? null
      rows.push({
        eventOrder: order,
        kmMarker: checkpoint.raceProgress.kmFromStart,
        eventType: commentary.eventType,
        title: commentary.title,
        description: commentary.description,
        riderId,
        teamId,
        riderNameSnapshot: riderId ? riderName(input, riderId) : null,
        teamNameSnapshot: teamId ? teamName(input, teamId) : null,
        metadata: {
          source: 'universal_replay_timeline_v1',
          checkpointId: checkpoint.checkpointId,
          checkpointIndex: checkpoint.checkpointIndex,
          phase: checkpoint.phase,
          commentaryId: commentary.commentaryId,
        },
      })
    })
  })

  return rows
}

function buildHealthCandidates(
  input: UniversalRaceEngineInput,
  result: UniversalRaceEngineResult,
): UniversalPhase11HealthCaseCandidate[] {
  const rows: UniversalPhase11HealthCaseCandidate[] = []
  result.phase10Incidents.incidents.forEach((incident) => {
    incident.riderConsequences.forEach((consequence) => {
      const health = consequence.healthOutcome
      if (health.persistentAction !== 'create_health_case_after_finalization' || !health.caseCode || !health.severity) return
      rows.push({
        incidentId: incident.incidentId,
        riderId: consequence.riderId,
        teamId: consequence.teamId,
        caseCode: health.caseCode,
        severity: health.severity,
        bodyPart: health.bodyPart,
        selectionBlockedAfterStage: health.selectionBlockedAfterStage,
        sourceType: 'race_stage_incident',
        sourceId: input.stage.stageId,
        notes: {
          engineIncidentId: incident.incidentId,
          incidentKind: incident.incidentKind,
          incidentType: incident.incidentType,
          incidentSeverity: incident.severity,
          kmFromStart: incident.kmFromStart,
          currentStageContinuation: health.currentStageContinuation,
          deterministicHealthSource: health.source,
        },
      })
    })
  })
  return rows
}

function buildApplicationManifest(
  input: UniversalRaceEngineInput,
  result: UniversalRaceEngineResult,
): UniversalPhase11ApplicationManifest {
  const classificationByRider = new Map(
    result.finishResolution.classification.map(
      (row) => [row.riderId, row] as const,
    ),
  )
  const riderStateRows: UniversalPhase11RiderStateManifestRow[] =
    result.postStageUpdate.riderUpdates.map((update) => {
      const official = classificationByRider.get(update.riderId)
      if (!official) {
        throw new Error(
          `Phase 11 manifest cannot resolve rider ${update.riderId}.`,
        )
      }
      return {
        riderId: update.riderId,
        teamId: update.teamId,
        finishStatus: update.finishStatus,
        finishPosition: official.rank,
        finishTimeSeconds: official.officialTimeSeconds,
        gapSeconds: official.gapSeconds,
        fatigueBeforeStage: update.fatigueBefore,
        fatigueGain: update.fatigueGained,
        fatigueAfterStage: update.fatigueAfter,
        finishStamina: update.previousStageSeed.finishStamina,
        staminaSpent: update.energySpent,
        writeKey: update.writeKey,
      }
    })

  const replayAssessment = replayProductionAssessment(result)
  const visibleCheckpointCount = result.replayTimeline.checkpoints.filter((checkpoint) => checkpoint.finalResultsVisible).length
  const finalIndex = result.replayTimeline.checkpoints.length - 1
  const finalResultsHiddenUntilFinalCheckpoint = result.replayTimeline.checkpoints.every((checkpoint, index) => checkpoint.finalResultsVisible === (index === finalIndex))
  const validation = {
    everyAcceptedRiderHasExactlyOneStatus:
      result.phase10Incidents.allAcceptedRidersHaveExactlyOneStatus,
    acceptedRiderCount: input.riders.length,
    classificationRiderCount: result.finishResolution.classification.length,
    riderStateRiderCount: riderStateRows.length,
    persistenceRiderCount: result.postStageUpdate.persistenceContract.rowCount,
    writeEligibleRiderCount: result.postStageUpdate.writeEligibleCount,
    dnsRiderCount: result.postStageUpdate.dnsCount,
    replaySynchronized: result.replaySynchronization.synchronized,
    replayProductionAcceptable: replayAssessment.acceptable,
    replayQuality: replayAssessment.quality,
    replayOnlyIssueCount: replayAssessment.replayOnlyIssues.length,
    replayBlockingIssueCount: replayAssessment.blockingIssues.length,
    replayCompleteBeforePlayback: result.replayTimeline.completeBeforePlayback,
    playbackRecalculatesRace: false as const,
    finalResultsHiddenUntilFinalCheckpoint: finalResultsHiddenUntilFinalCheckpoint && visibleCheckpointCount === 1,
    phase9PayloadValid: result.phase9Acceptance.resourceUpdateSummary.resourceMathValid,
    directEngineDatabaseWrites: false as const,
  }
  const readyForApplication =
    result.finishResolution.complete &&
    validation.everyAcceptedRiderHasExactlyOneStatus &&
    validation.acceptedRiderCount === validation.classificationRiderCount &&
    validation.acceptedRiderCount === validation.riderStateRiderCount &&
    validation.persistenceRiderCount === validation.writeEligibleRiderCount &&
    validation.acceptedRiderCount ===
      validation.writeEligibleRiderCount + validation.dnsRiderCount &&
    validation.replayProductionAcceptable &&
    validation.finalResultsHiddenUntilFinalCheckpoint &&
    result.postStageUpdate.persistenceContract.payloadValid

  return {
    contractVersion: UNIVERSAL_PHASE11_MANIFEST_CONTRACT,
    stageId: input.stage.stageId,
    raceId: input.race.raceId,
    readyForApplication,
    persistenceApplied: false,
    riderStateRows,
    fatiguePersistenceRows: result.postStageUpdate.persistenceContract.rows,
    phase9ResourceUpdates: result.phase9Modifiers.resourceUpdates,
    healthCaseCandidates: buildHealthCandidates(input, result),
    validation,
  }
}

export function buildProductionUniversalRaceOutput(
  input: UniversalRaceEngineInput,
  result: UniversalRaceEngineResult,
): ProductionUniversalRaceOutput {
  if (result.raceId !== input.race.raceId || result.stageId !== input.stage.stageId) {
    throw new Error('Universal output identity does not match its immutable production input.')
  }
  const replayAssessment = replayProductionAssessment(result)
  if (!result.finishResolution.complete) {
    throw new Error('Universal output sporting finish is not finalized.')
  }
  if (!replayAssessment.acceptable) {
    throw new Error(
      `Universal output has blocking replay synchronization issues: ${
        replayAssessment.blockingIssues.length > 0
          ? replayAssessment.blockingIssues.join(', ')
          : 'unsynchronized replay without classified issues'
      }`,
    )
  }
  const pointResults = buildPointRows(input, result)
  const stageResults = buildStageRows(input, result, pointResults)
  const reportEvents = buildReportRows(input, result)
  const applicationManifest = buildApplicationManifest(input, result)
  if (!applicationManifest.readyForApplication) {
    throw new Error('Phase 11 application manifest failed its production handoff validation.')
  }
  return {
    contractVersion: UNIVERSAL_RACE_STAGE_OUTPUT_CONTRACT,
    engineKey: result.engineKey,
    engineVersion: result.engineVersion,
    raceId: result.raceId,
    stageId: result.stageId,
    universalResult: result,
    publication: { stageResults, pointResults, reportEvents },
    applicationManifest,
    verification: {
      officialOutputsWrittenByBuilder: false,
      historicalRowsMutatedByBuilder: false,
      oneEngineResult: true,
      oneReplayTimeline: true,
      resultVisibleCheckpointCount: result.replayTimeline.checkpoints.filter((checkpoint) => checkpoint.finalResultsVisible).length,
      replayQuality: replayAssessment.quality,
      replayOnlyIssues: replayAssessment.replayOnlyIssues,
      officialResultsUnchangedByReplayFallback: true,
      readyForProductionComparison: true,
    },
  }
}
