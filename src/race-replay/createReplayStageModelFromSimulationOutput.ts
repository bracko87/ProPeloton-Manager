/**
 * createReplayStageModelFromSimulationOutput.ts
 *
 * Pure StageInput + SimulationOutput -> ReplayStageModel adapter.
 *
 * No React, Supabase, database, HTTP, timers, browser storage, Rio-specific
 * movement, or production execution is used here.
 *
 * SimulationOutput currently exposes group snapshots and final rider states,
 * but not each rider's per-frame energy. Therefore staminaPercent and
 * fatiguePercent remain null instead of being estimated.
 */

import type { SimulationOutput } from '../race-engine/domain/SimulationOutput'
import type { StageInput, StageRiderInput } from '../race-engine/domain/StageInput'
import { assertValidReplayStageModel } from './validateReplayStageModel'
import type {
  ReplayEvent,
  ReplayFinalResult,
  ReplayFrame,
  ReplayGroupFrame,
  ReplayGroupType,
  ReplayRiderFrame,
  ReplayRiderStatus,
  ReplayStageModel,
} from './replayTypes'

export interface CreateReplayStageModelFromSimulationOutputParams {
  readonly stageInput: StageInput
  readonly simulationOutput: SimulationOutput
}

type SourceSnapshot = SimulationOutput['snapshots'][number]
type SourceGroup = SourceSnapshot['groups'][number]
type SourceEvent = SimulationOutput['events'][number]
type SourceFinalRider = SimulationOutput['finalRiderStates'][number]

type CompatibleGroup = SourceGroup & {
  readonly id?: string
  readonly groupId?: string
  readonly type?: string
  readonly groupType?: string
}

type CompatibleEvent = SourceEvent & {
  readonly id?: string
  readonly type?: string
  readonly eventType?: string
  readonly km?: number
  readonly kmMarker?: number
  readonly actorRiderId?: string | null
  readonly teamId?: string | null
  readonly sourceGroupId?: string | null
  readonly targetGroupId?: string | null
  readonly riderIds?: readonly string[]
  readonly relatedRiderIds?: readonly string[]
  readonly commentaryText?: string | null
}

type CompatibleFinalRider = SourceFinalRider & {
  readonly stageStatus?: string
  readonly status?: string
}

interface ResolvedGroup {
  readonly source: SourceGroup
  readonly groupId: string
  readonly groupType: ReplayGroupType
}

interface FinishEventReference {
  readonly sequenceNumber: number
  readonly raceSecond: number
}

const GROUP_TYPES: readonly ReplayGroupType[] = [
  'peloton',
  'breakaway',
  'chase',
  'dropped',
  'finished',
  'time_trial',
]

const RIDER_STATUSES: readonly ReplayRiderStatus[] = [
  'not_started',
  'racing',
  'finished',
  'dnf',
  'dns',
]

const GROUP_LABELS: Readonly<Record<ReplayGroupType, string>> = {
  peloton: 'Peloton',
  breakaway: 'Breakaway',
  chase: 'Chase group',
  dropped: 'Dropped group',
  finished: 'Finished group',
  time_trial: 'Time trial',
}

function fail(message: string): never {
  throw new Error(`createReplayStageModelFromSimulationOutput: ${message}`)
}

function requireText(value: string, field: string): void {
  if (!value.trim()) fail(`${field} must be a non-empty string.`)
}

function requireNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    fail(`${field} must be finite and non-negative.`)
  }
}

function isGroupType(value: unknown): value is ReplayGroupType {
  return typeof value === 'string' && GROUP_TYPES.includes(value as ReplayGroupType)
}

function isRiderStatus(value: unknown): value is ReplayRiderStatus {
  return typeof value === 'string' && RIDER_STATUSES.includes(value as ReplayRiderStatus)
}

function getGroupId(group: SourceGroup): string {
  const compatible = group as unknown as CompatibleGroup
  const groupId = compatible.groupId ?? compatible.id
  if (typeof groupId !== 'string' || !groupId.trim()) {
    fail('every source group must expose groupId or id.')
  }
  return groupId
}

function getGroupType(group: SourceGroup): ReplayGroupType {
  const compatible = group as unknown as CompatibleGroup
  const groupType = compatible.groupType ?? compatible.type
  if (!isGroupType(groupType)) fail(`unsupported group type ${String(groupType)}.`)
  return groupType
}

function getEventType(event: SourceEvent): string {
  const compatible = event as unknown as CompatibleEvent
  const eventType = compatible.eventType ?? compatible.type
  if (typeof eventType !== 'string' || !eventType.trim()) {
    fail('every event must expose eventType or type.')
  }
  return eventType
}

function getEventKilometre(event: SourceEvent): number {
  const compatible = event as unknown as CompatibleEvent
  const kilometre = compatible.kmMarker ?? compatible.km
  if (typeof kilometre !== 'number') {
    fail('every event must expose kmMarker or km.')
  }
  return kilometre
}

function getEventRiderIds(event: SourceEvent): readonly string[] {
  const compatible = event as unknown as CompatibleEvent
  return compatible.relatedRiderIds ?? compatible.riderIds ?? []
}

function getFinalStatus(rider: SourceFinalRider): ReplayRiderStatus {
  const compatible = rider as unknown as CompatibleFinalRider
  const status = compatible.stageStatus ?? compatible.status
  if (!isRiderStatus(status)) fail(`unsupported final rider status ${String(status)}.`)
  return status
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>).map(([key, item]) => [
        key,
        cloneValue(item),
      ]),
    )
  }
  return value
}

function clonePayload(
  payload: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return cloneValue(payload) as Readonly<Record<string, unknown>>
}

function validateTopLevel(stageInput: StageInput, output: SimulationOutput): void {
  if (stageInput.raceId !== output.raceId) fail('raceId mismatch.')
  if (stageInput.stageId !== output.stageId) fail('stageId mismatch.')
  if (stageInput.seed !== output.seed) fail('seed mismatch.')
  if (stageInput.stageFormat !== 'road_race') {
    fail('deterministic_road_race_v1 requires a road_race StageInput.')
  }
  if (output.simulationMode !== 'deterministic_road_race_v1') {
    fail('unsupported simulation mode.')
  }
  requireText(stageInput.stageName, 'stageInput.stageName')
  if (!Number.isFinite(stageInput.distanceKm) || stageInput.distanceKm <= 0) {
    fail('stage distance must be finite and greater than zero.')
  }
  if (stageInput.riders.length === 0) fail('StageInput must contain riders.')
  if (output.snapshots.length === 0) fail('SimulationOutput must contain snapshots.')
}

function createStageRiderMap(stageInput: StageInput): ReadonlyMap<string, StageRiderInput> {
  const map = new Map<string, StageRiderInput>()
  for (const rider of stageInput.riders) {
    requireText(rider.riderId, 'stageInput.riders[].riderId')
    if (map.has(rider.riderId)) fail(`duplicate StageInput rider ${rider.riderId}.`)
    map.set(rider.riderId, rider)
  }
  return map
}

function createFinalRiderMap(
  output: SimulationOutput,
  stageRiders: ReadonlyMap<string, StageRiderInput>,
): ReadonlyMap<string, SourceFinalRider> {
  const map = new Map<string, SourceFinalRider>()

  for (const finalRider of output.finalRiderStates) {
    if (map.has(finalRider.riderId)) fail(`duplicate final rider ${finalRider.riderId}.`)
    const stageRider = stageRiders.get(finalRider.riderId)
    if (!stageRider) fail(`final output contains unknown rider ${finalRider.riderId}.`)

    if (
      stageRider.teamId !== finalRider.teamId ||
      stageRider.riderName !== finalRider.riderName ||
      stageRider.teamName !== finalRider.teamName
    ) {
      fail(`rider identity changed for ${finalRider.riderId}.`)
    }

    getFinalStatus(finalRider)
    map.set(finalRider.riderId, finalRider)
  }

  if (map.size !== stageRiders.size) {
    fail('final rider coverage does not match StageInput.')
  }

  return map
}

function validateChronology(stageInput: StageInput, output: SimulationOutput): void {
  let previousFrame = Number.NEGATIVE_INFINITY
  let previousSecond = Number.NEGATIVE_INFINITY
  let previousKm = Number.NEGATIVE_INFINITY

  output.snapshots.forEach((snapshot, index) => {
    if (!Number.isInteger(snapshot.frameNumber) || snapshot.frameNumber <= previousFrame) {
      fail(`snapshot ${index} frameNumber is not strictly increasing.`)
    }
    requireNonNegative(snapshot.raceSecond, `snapshots[${index}].raceSecond`)
    if (snapshot.raceSecond <= previousSecond) {
      fail(`snapshot ${index} raceSecond is not strictly increasing.`)
    }
    requireNonNegative(snapshot.km, `snapshots[${index}].km`)
    if (snapshot.km < previousKm) fail(`snapshot ${index} kilometre moved backwards.`)
    if (snapshot.km > stageInput.distanceKm + 0.001) {
      fail(`snapshot ${index} exceeds the stage distance.`)
    }
    previousFrame = snapshot.frameNumber
    previousSecond = snapshot.raceSecond
    previousKm = snapshot.km
  })

  let previousSequence = Number.NEGATIVE_INFINITY
  let previousEventSecond = Number.NEGATIVE_INFINITY

  output.events.forEach((event, index) => {
    if (!Number.isInteger(event.sequenceNumber) || event.sequenceNumber <= previousSequence) {
      fail(`event ${index} sequenceNumber is not strictly increasing.`)
    }
    requireNonNegative(event.raceSecond, `events[${index}].raceSecond`)
    if (event.raceSecond < previousEventSecond) {
      fail(`event ${index} raceSecond moved backwards.`)
    }
    const kilometre = getEventKilometre(event)
    requireNonNegative(kilometre, `events[${index}].kilometre`)
    if (kilometre > stageInput.distanceKm + 0.001) {
      fail(`event ${index} exceeds the stage distance.`)
    }
    getEventType(event)
    previousSequence = event.sequenceNumber
    previousEventSecond = event.raceSecond
  })
}

function resolveSnapshotGroups(
  snapshot: SourceSnapshot,
  snapshotIndex: number,
): readonly ResolvedGroup[] {
  const sourceById = new Map<string, SourceGroup>()

  for (const source of snapshot.groups) {
    const groupId = getGroupId(source)
    if (sourceById.has(groupId)) {
      fail(`snapshot ${snapshotIndex} contains duplicate group ${groupId}.`)
    }
    getGroupType(source)
    sourceById.set(groupId, source)
  }

  const seen = new Set<string>()
  const ordered = snapshot.groupOrder.map((groupId) => {
    if (seen.has(groupId)) {
      fail(`snapshot ${snapshotIndex} repeats group ${groupId} in groupOrder.`)
    }
    const source = sourceById.get(groupId)
    if (!source) {
      fail(`snapshot ${snapshotIndex} groupOrder references unknown group ${groupId}.`)
    }
    seen.add(groupId)
    return { source, groupId, groupType: getGroupType(source) }
  })

  if (ordered.length !== sourceById.size) {
    fail(`snapshot ${snapshotIndex} groupOrder must contain every group exactly once.`)
  }

  return ordered
}

function validateRiderCoverage(
  output: SimulationOutput,
  stageRiders: ReadonlyMap<string, StageRiderInput>,
): readonly (readonly ResolvedGroup[])[] {
  return output.snapshots.map((snapshot, snapshotIndex) => {
    const orderedGroups = resolveSnapshotGroups(snapshot, snapshotIndex)
    const membership = new Map<string, string>()

    for (const group of orderedGroups) {
      requireNonNegative(
        group.source.distanceKm,
        `snapshots[${snapshotIndex}].groups.${group.groupId}.distanceKm`,
      )
      requireNonNegative(
        group.source.speedKmh,
        `snapshots[${snapshotIndex}].groups.${group.groupId}.speedKmh`,
      )
      requireNonNegative(
        group.source.gapFromLeaderSeconds,
        `snapshots[${snapshotIndex}].groups.${group.groupId}.gapFromLeaderSeconds`,
      )

      const local = new Set<string>()
      for (const riderId of group.source.riderIds) {
        if (local.has(riderId)) fail(`group ${group.groupId} repeats rider ${riderId}.`)
        if (!stageRiders.has(riderId)) {
          fail(`group ${group.groupId} references unknown rider ${riderId}.`)
        }
        const previousGroupId = membership.get(riderId)
        if (previousGroupId) {
          fail(`rider ${riderId} appears in groups ${previousGroupId} and ${group.groupId}.`)
        }
        local.add(riderId)
        membership.set(riderId, group.groupId)
      }
    }

    if (membership.size !== stageRiders.size) {
      fail(`snapshot ${snapshotIndex} does not cover every StageInput rider exactly once.`)
    }

    return orderedGroups
  })
}

function createStableGroupLabels(
  groupsBySnapshot: readonly (readonly ResolvedGroup[])[],
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>()
  const nextOrdinal = new Map<ReplayGroupType, number>()

  for (const groups of groupsBySnapshot) {
    for (const group of groups) {
      if (labels.has(group.groupId)) continue
      const ordinal = (nextOrdinal.get(group.groupType) ?? 0) + 1
      nextOrdinal.set(group.groupType, ordinal)
      const base = GROUP_LABELS[group.groupType]
      labels.set(group.groupId, ordinal === 1 ? base : `${base} ${ordinal}`)
    }
  }

  return labels
}

function createFinishEventMap(
  output: SimulationOutput,
): ReadonlyMap<string, FinishEventReference> {
  const map = new Map<string, FinishEventReference>()

  for (const event of output.events) {
    if (getEventType(event) !== 'RIDER_FINISHED') continue
    const riderId = (event as unknown as CompatibleEvent).actorRiderId
    if (typeof riderId !== 'string' || !riderId.trim()) {
      fail('RIDER_FINISHED event is missing actorRiderId.')
    }
    if (map.has(riderId)) fail(`rider ${riderId} has multiple finish events.`)
    map.set(riderId, {
      sequenceNumber: event.sequenceNumber,
      raceSecond: event.raceSecond,
    })
  }

  return map
}

function getDurationSeconds(output: SimulationOutput): number {
  const snapshotDuration = output.snapshots.reduce(
    (maximum, snapshot) => Math.max(maximum, snapshot.raceSecond),
    0,
  )
  const eventDuration = output.events.reduce(
    (maximum, event) => Math.max(maximum, event.raceSecond),
    0,
  )
  const finishDuration = output.finalRiderStates.reduce(
    (maximum, rider) => Math.max(maximum, rider.finishTimeSeconds ?? 0),
    0,
  )
  return Math.max(snapshotDuration, eventDuration, finishDuration)
}

function createEvents(output: SimulationOutput): readonly ReplayEvent[] {
  return output.events.map((event) => {
    const compatible = event as unknown as CompatibleEvent
    return {
      id: compatible.id ?? `${output.stageId}:event:${event.sequenceNumber}`,
      sequenceNumber: event.sequenceNumber,
      type: getEventType(event),
      raceSecond: event.raceSecond,
      kilometre: getEventKilometre(event),
      actorRiderId: compatible.actorRiderId ?? null,
      teamId: compatible.teamId ?? null,
      sourceGroupId: compatible.sourceGroupId ?? null,
      targetGroupId: compatible.targetGroupId ?? null,
      riderIds: getEventRiderIds(event).slice(),
      title: null,
      description: compatible.commentaryText ?? null,
      payload: clonePayload(event.payload),
    }
  })
}

function createFinalResults(
  stageInput: StageInput,
  finalRiders: ReadonlyMap<string, SourceFinalRider>,
): readonly ReplayFinalResult[] {
  return stageInput.riders
    .map((stageRider) => {
      const finalRider = finalRiders.get(stageRider.riderId)
      if (!finalRider) fail(`missing final rider ${stageRider.riderId}.`)
      return {
        riderId: stageRider.riderId,
        teamId: stageRider.teamId,
        riderName: stageRider.riderName,
        teamName: stageRider.teamName,
        status: getFinalStatus(finalRider),
        finishTimeSeconds: finalRider.finishTimeSeconds,
        finishPosition: finalRider.finishPosition,
      }
    })
    .sort((left, right) => {
      const leftPosition = left.finishPosition ?? Number.POSITIVE_INFINITY
      const rightPosition = right.finishPosition ?? Number.POSITIVE_INFINITY
      if (leftPosition !== rightPosition) return leftPosition - rightPosition
      return left.riderId.localeCompare(right.riderId)
    })
}

function createGroupFrames(
  groups: readonly ResolvedGroup[],
  finishedRiderIds: ReadonlySet<string>,
  labels: ReadonlyMap<string, string>,
): readonly ReplayGroupFrame[] {
  return groups.map((group, index) => {
    const previous = groups[index - 1]
    let gapToPreviousGroupSeconds: number | null = null

    if (previous) {
      const difference =
        group.source.gapFromLeaderSeconds - previous.source.gapFromLeaderSeconds
      if (difference < -0.001) {
        fail(`group order is inconsistent with leader gaps at ${group.groupId}.`)
      }
      gapToPreviousGroupSeconds = Math.max(0, difference)
    }

    const allFinished =
      group.source.riderIds.length > 0 &&
      group.source.riderIds.every((riderId) => finishedRiderIds.has(riderId))
    const label = labels.get(group.groupId)
    if (!label) fail(`missing display label for group ${group.groupId}.`)

    return {
      groupId: group.groupId,
      type: allFinished ? 'finished' : group.groupType,
      label,
      order: index + 1,
      riderIds: group.source.riderIds.slice(),
      distanceKm: group.source.distanceKm,
      speedKmh: group.source.speedKmh,
      gapToLeaderSeconds: group.source.gapFromLeaderSeconds,
      gapToPreviousGroupSeconds,
      active: group.source.active && !allFinished,
    }
  })
}

function createRiderFrames(
  stageInput: StageInput,
  groups: readonly ResolvedGroup[],
  finishedRiderIds: ReadonlySet<string>,
  finishEvents: ReadonlyMap<string, FinishEventReference>,
  finalRiders: ReadonlyMap<string, SourceFinalRider>,
  isLastFrame: boolean,
): readonly ReplayRiderFrame[] {
  const groupByRiderId = new Map<string, ResolvedGroup>()
  for (const group of groups) {
    for (const riderId of group.source.riderIds) groupByRiderId.set(riderId, group)
  }

  return stageInput.riders.map((stageRider) => {
    const group = groupByRiderId.get(stageRider.riderId)
    const finalRider = finalRiders.get(stageRider.riderId)
    if (!group) fail(`missing replay group for rider ${stageRider.riderId}.`)
    if (!finalRider) fail(`missing final state for rider ${stageRider.riderId}.`)

    const finalStatus = getFinalStatus(finalRider)
    const hasFinished = finishedRiderIds.has(stageRider.riderId)
    let status: ReplayRiderStatus = 'racing'
    if (hasFinished) status = 'finished'
    else if (isLastFrame && finalStatus !== 'racing') status = finalStatus

    if (hasFinished && !finishEvents.has(stageRider.riderId)) {
      fail(`rider ${stageRider.riderId} is marked finished without a finish event.`)
    }

    return {
      riderId: stageRider.riderId,
      teamId: stageRider.teamId,
      riderName: stageRider.riderName,
      teamName: stageRider.teamName,
      status,
      groupId: group.groupId,
      distanceKm: group.source.distanceKm,
      speedKmh: group.source.speedKmh,
      gapToLeaderSeconds: group.source.gapFromLeaderSeconds,
      gapToPreviousRiderSeconds: null,
      position: hasFinished ? finalRider.finishPosition : null,
      staminaPercent: null,
      fatiguePercent: null,
      finishTimeSeconds: hasFinished ? finalRider.finishTimeSeconds : null,
      finishPosition: hasFinished ? finalRider.finishPosition : null,
    }
  })
}

function createFrames(
  stageInput: StageInput,
  output: SimulationOutput,
  durationSeconds: number,
  groupsBySnapshot: readonly (readonly ResolvedGroup[])[],
  labels: ReadonlyMap<string, string>,
  finishEvents: ReadonlyMap<string, FinishEventReference>,
  finalRiders: ReadonlyMap<string, SourceFinalRider>,
): readonly ReplayFrame[] {
  return output.snapshots.map((snapshot, index) => {
    const finishedRiderIds = new Set<string>()
    for (const [riderId, finishEvent] of finishEvents) {
      if (finishEvent.raceSecond <= snapshot.raceSecond) finishedRiderIds.add(riderId)
    }

    const groups = groupsBySnapshot[index]
    if (!groups) fail(`missing resolved groups for snapshot ${index}.`)

    const progress = durationSeconds > 0
      ? Math.min(1, snapshot.raceSecond / durationSeconds)
      : Math.min(1, snapshot.km / stageInput.distanceKm)

    return {
      frameNumber: snapshot.frameNumber,
      raceSecond: snapshot.raceSecond,
      progress,
      leaderDistanceKm: snapshot.km,
      riders: createRiderFrames(
        stageInput,
        groups,
        finishedRiderIds,
        finishEvents,
        finalRiders,
        index === output.snapshots.length - 1,
      ),
      groups: createGroupFrames(groups, finishedRiderIds, labels),
      eventSequenceNumbers: snapshot.eventSequenceNumbers.slice(),
    }
  })
}

/** Convert deterministic source data into the generic replay view model. */
export function createReplayStageModelFromSimulationOutput(
  params: CreateReplayStageModelFromSimulationOutputParams,
): ReplayStageModel {
  const { stageInput, simulationOutput } = params

  validateTopLevel(stageInput, simulationOutput)
  validateChronology(stageInput, simulationOutput)

  const stageRiders = createStageRiderMap(stageInput)
  const finalRiders = createFinalRiderMap(simulationOutput, stageRiders)
  const groupsBySnapshot = validateRiderCoverage(simulationOutput, stageRiders)
  const labels = createStableGroupLabels(groupsBySnapshot)
  const finishEvents = createFinishEventMap(simulationOutput)
  const durationSeconds = getDurationSeconds(simulationOutput)

  const model: ReplayStageModel = {
    contractVersion: 'race_replay_view_model_v1',
    raceId: stageInput.raceId,
    stageId: stageInput.stageId,
    stageName: stageInput.stageName,
    stageFormat: stageInput.stageFormat,
    distanceKm: stageInput.distanceKm,
    engineVersion: simulationOutput.engineVersion,
    simulationMode: simulationOutput.simulationMode,
    seed: simulationOutput.seed,
    durationSeconds,
    profilePoints: stageInput.profilePoints.map((point) => ({
      kilometre: point.kilometre,
      elevationMetres: point.elevationMetres,
    })),
    frames: createFrames(
      stageInput,
      simulationOutput,
      durationSeconds,
      groupsBySnapshot,
      labels,
      finishEvents,
      finalRiders,
    ),
    events: createEvents(simulationOutput),
    finalResults: createFinalResults(stageInput, finalRiders),
  }

  assertValidReplayStageModel(model)
  return model
}
