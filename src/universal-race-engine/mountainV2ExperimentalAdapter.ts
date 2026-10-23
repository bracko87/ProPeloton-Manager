/**
 * Experimental mountain V2: non-authoritative Phase-4 shadow integration.
 *
 * This adapter is used ONLY by runMountainExperimentalEngineV1.ts.
 * The baseline universal engine, finish ranks, points, race chronology and
 * authoritative replay are not changed by these diagnostics.
 *
 * No database I/O. No production source pin update.
 */
import type { UniversalRaceEngineInput } from './runMountainExperimentalEngineV1.ts'
import { auditMountainProfileV2, type MountainProfileAuditV2 } from './mountainProfileAuditV2.ts'
import {
  simulateMountainV2Contacts,
  type MountainV2Rider,
  type MountainV2Segment,
} from './mountainContactPhysicsV2.ts'

export type MountainV2ShadowStatus =
  | 'evaluated_non_authoritative'
  | 'geometry_review_required'
  | 'insufficient_starters'

export interface MountainV2ShadowCheckpoint {
  readonly km: number
  readonly terrain: MountainV2Segment['terrain']
  readonly groups: readonly {
    readonly groupId: string
    readonly riderIds: readonly string[]
    readonly leaderGapSeconds: number
  }[]
  readonly leadGroupSize: number
  readonly individualRiderCount: number
}

export interface MountainV2ShadowAudit {
  readonly modelVersion: 'mountain_phase4_shadow_v2'
  readonly authority: 'non_authoritative'
  readonly status: MountainV2ShadowStatus
  readonly stageId: string
  readonly profileAudit: MountainProfileAuditV2
  readonly warningCodes: readonly string[]
  readonly segmentCount: number
  readonly starterCount: number
  readonly checkpoints: readonly MountainV2ShadowCheckpoint[]
  readonly finalRiderGapsSeconds: Readonly<Record<string, number>>
}

/** A coarse route is not silently reinterpreted as a steep mountain route. */
export function mountainV2SegmentsFromStage(
  stage: UniversalRaceEngineInput['stage'],
): { readonly segments: readonly MountainV2Segment[], readonly warningCodes: readonly string[] } {
  const points = stage.profilePoints
  const warnings: string[] = []
  if (
    points.length < 2 ||
    Math.abs(points[0].km) > 0.001 ||
    Math.abs(points[points.length - 1].km - stage.distanceKm) > 0.01
  ) {
    return { segments: [], warningCodes: ['incomplete_profile_distance_coverage'] }
  }
  const segments: MountainV2Segment[] = []
  for (let index = 1; index < points.length; index++) {
    const prev = points[index - 1]
    const point = points[index]
    const lengthKm = point.km - prev.km
    if (!Number.isFinite(lengthKm) || lengthKm <= 0) {
      warnings.push('invalid_segment_geometry')
      return { segments: [], warningCodes: warnings }
    }
    const grade = (point.elevationM - prev.elevationM) / (10 * lengthKm)
    if (!Number.isFinite(grade) || Math.abs(grade) > 30) {
      warnings.push('unverified_extreme_segment_gradient')
      return { segments: [], warningCodes: warnings }
    }
    const terrain = grade > 1 ? 'climb' : grade < -1 ? 'descent' : 'flat'
    segments.push({
      lengthKm,
      gradientPercent: grade,
      terrain,
    })
  }
  return { segments, warningCodes: warnings }
}

/**
 * A standalone shadow run must never be allowed to change the time keeper,
 * authoritative race results or checkpoint persistence contracts.
 */
export function buildMountainV2ShadowAudit(
  input: UniversalRaceEngineInput,
): MountainV2ShadowAudit {
  const profileAudit = auditMountainProfileV2(
    input.stage.elevationGainM, input.stage.profilePoints,
  )
  const route = mountainV2SegmentsFromStage(input.stage)
  const riders: MountainV2Rider[] = input.riders
    .filter((row) => row.startStatus !== 'dns')
    .map((row) => {
      const plan = input.stagePlans
        .find((team) => team.teamId === row.teamId)
        ?.riders.find((entry) => entry.riderId === row.riderId)
      const effort = plan?.commands.phase4 === 'attack' ? 'attack' :
        plan?.stageRole === 'helper_domestique' &&
          plan.commands.phase4 === 'team_work' ? 'support' :
          plan?.commands.phase4 === 'recover' ? 'recover' : 'steady'
      return {
        riderId: row.riderId,
        teamId: row.teamId,
        climbing: row.climbing,
        endurance: row.endurance,
        // No rated descending attribute in the current rider contract.
        // Use neutral speed until a real descending skill is persisted.
        descending: 65,
        energy: Math.max(0, Math.min(100,
          row.startStamina - row.fatigueBeforeStage * 0.2,
        )),
        effort,
        gapSeconds: 0,
      }
    })
  const warningCodes = [
    ...profileAudit.notes,
    ...route.warningCodes,
    'neutral_descending_skill_not_individual_rating',
  ]
  const base = {
    modelVersion: 'mountain_phase4_shadow_v2' as const,
    authority: 'non_authoritative' as const,
    stageId: input.stage.stageId,
    profileAudit,
    warningCodes,
    segmentCount: route.segments.length,
    starterCount: riders.length,
  }
  if (riders.length < 2) {
    return {
      ...base, status: 'insufficient_starters',
      checkpoints: [], finalRiderGapsSeconds: {},
    }
  }
  if (profileAudit.profileNeedsReview || route.warningCodes.length > 0) {
    return {
      ...base, status: 'geometry_review_required',
      checkpoints: [], finalRiderGapsSeconds: {},
    }
  }

  const preview = simulateMountainV2Contacts(riders, route.segments)
  return {
    ...base,
    status: 'evaluated_non_authoritative',
    checkpoints: preview.checkpoints.map((checkpoint) => ({
      km: checkpoint.km,
      terrain: checkpoint.terrain,
      groups: checkpoint.groups,
      leadGroupSize: checkpoint.groups[0]?.riderIds.length ?? 0,
      individualRiderCount: checkpoint.groups.filter(
        (group) => group.riderIds.length === 1,
      ).length,
    })),
    finalRiderGapsSeconds: Object.fromEntries(
      preview.finalRiders.map((rider) => [rider.riderId, rider.gapSeconds]),
    ),
  }
}
