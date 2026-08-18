/**
 * GroupCrashDiagnostic.tsx
 *
 * Phase 8H.3A browser-only diagnostic for pure deterministic group-crash
 * selection and immutable state application.
 *
 * No active incident-risk evaluation, shared cooldown runtime, database access,
 * injury persistence, or production execution occurs here.
 */

import {
  useMemo,
} from 'react'

import type {
  SimulationState,
} from '../../race-engine/domain/SimulationState'
import type {
  StageInput,
} from '../../race-engine/domain/StageInput'
import {
  createStageInputFromSourceRows,
} from '../../race-engine/integration/createStageInputFromSourceRows'
import {
  applyGroupCrash,
  applyOptionalGroupCrash,
} from '../../race-engine/simulation/applyGroupCrash'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  createInitialState,
  INITIAL_PELOTON_GROUP_ID,
} from '../../race-engine/simulation/createInitialState'
import {
  calculateGroupCrashOutcome,
  type GroupCrashSeverity,
} from '../../race-engine/simulation/groupCrashOutcome'
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows'
import {
  validateSimulationState,
} from '../../race-engine/validation/validateSimulationState'

interface Check {
  readonly label: string
  readonly passed: boolean
}

const CONTROLLED_RACE_SECOND =
  300

const CONTROLLED_DISTANCE_KM =
  10

const CONTROLLED_SPEED_KMH =
  45

function controlledInput():
  StageInput {
  const base =
    createStageInputFromSourceRows(
      rioStage1SourceRows,
    )

  return {
    ...base,
    raceId:
      'group-crash-diagnostic-race',
    stageId:
      'group-crash-diagnostic-stage',
    stageName:
      'Group crash diagnostic',
    seed:
      'group-crash-diagnostic-seed-v1',
    orders: [],
  }
}

function controlledState():
  SimulationState {
  const initial =
    createInitialState(
      controlledInput(),
    )

  const riders =
    Object.fromEntries(
      Object.values(
        initial.riders,
      )
        .map(
          (rider) => [
            rider.riderId,
            {
              ...rider,
              currentGroupId:
                INITIAL_PELOTON_GROUP_ID,
              distanceKm:
                CONTROLLED_DISTANCE_KM,
              speedKmh:
                CONTROLLED_SPEED_KMH,
              stageStatus:
                'racing' as const,
              finished: false,
              finishTimeSeconds: null,
              finishPosition: null,
            },
          ],
        ),
    )

  const groups = {
    ...initial.groups,
    [INITIAL_PELOTON_GROUP_ID]: {
      ...initial.groups[
        INITIAL_PELOTON_GROUP_ID
      ]!,
      riderIds:
        Object.keys(
          riders,
        ).sort(
          (left, right) =>
            left.localeCompare(
              right,
            ),
        ),
      distanceKm:
        CONTROLLED_DISTANCE_KM,
      speedKmh:
        CONTROLLED_SPEED_KMH,
      gapFromLeaderSeconds: 0,
      active: true,
    },
  }

  const separationPressureSecondsByRiderId =
    Object.fromEntries(
      Object.keys(
        riders,
      ).map(
        (riderId) => [
          riderId,
          30,
        ],
      ),
    )

  return {
    ...initial,
    raceSecond:
      CONTROLLED_RACE_SECOND,
    currentKm:
      CONTROLLED_DISTANCE_KM,
    riders,
    groups,
    separationPressureSecondsByRiderId,
  }
}

function outcomeForSeverity(
  state:
    SimulationState,
  severity:
    GroupCrashSeverity,
) {
  const sourceGroup =
    state.groups[
      INITIAL_PELOTON_GROUP_ID
    ]!

  return calculateGroupCrashOutcome({
    raceId:
      state.raceId,
    stageId:
      state.stageId,
    seed:
      state.seed,
    occurrenceIndex: 0,

    sourceGroupId:
      sourceGroup.groupId,
    sourceRiderIds:
      sourceGroup.riderIds,

    raceSecond:
      state.raceSecond,
    sourceDistanceKm:
      sourceGroup.distanceKm,
    sourceGapFromLeaderSeconds:
      sourceGroup
        .gapFromLeaderSeconds,
    sourceSpeedKmh:
      sourceGroup.speedKmh,

    severity,
  })
}

function expectedDistanceLoss(
  speedKmh: number,
  timeLossSeconds: number,
): number {
  return Number(
    (
      speedKmh *
      (
        timeLossSeconds /
        3600
      )
    ).toFixed(9),
  )
}

function buildDiagnostic() {
  const initialState =
    controlledState()

  validateSimulationState(
    initialState,
  )

  const applicationA =
    applyGroupCrash({
      state:
        initialState,
      sourceGroupId:
        INITIAL_PELOTON_GROUP_ID,
      severity:
        'moderate',
      occurrenceIndex: 0,
      causes: [
        'wet_road',
        'dense_group',
        'high_speed',
      ],
    })

  const applicationB =
    applyGroupCrash({
      state:
        controlledState(),
      sourceGroupId:
        INITIAL_PELOTON_GROUP_ID,
      severity:
        'moderate',
      occurrenceIndex: 0,
      causes: [
        'wet_road',
        'dense_group',
        'high_speed',
      ],
    })

  const noSelection =
    applyOptionalGroupCrash({
      state:
        initialState,
      selectedGroupId: null,
      severity:
        'minor',
      occurrenceIndex: 0,
    })

  const sourceGroupBefore =
    initialState.groups[
      INITIAL_PELOTON_GROUP_ID
    ]!

  const reorderedOutcome =
    calculateGroupCrashOutcome({
      raceId:
        initialState.raceId,
      stageId:
        initialState.stageId,
      seed:
        initialState.seed,
      occurrenceIndex: 0,

      sourceGroupId:
        sourceGroupBefore.groupId,
      sourceRiderIds:
        sourceGroupBefore
          .riderIds
          .slice()
          .reverse(),

      raceSecond:
        initialState.raceSecond,
      sourceDistanceKm:
        sourceGroupBefore.distanceKm,
      sourceGapFromLeaderSeconds:
        sourceGroupBefore
          .gapFromLeaderSeconds,
      sourceSpeedKmh:
        sourceGroupBefore.speedKmh,

      severity:
        'moderate',
    })

  const state =
    applicationA.state

  validateSimulationState(
    state,
  )

  const sourceGroupAfter =
    state.groups[
      INITIAL_PELOTON_GROUP_ID
    ]!

  const targetGroup =
    state.groups[
      applicationA.targetGroupId
    ]!

  const affectedRiderIdSet =
    new Set(
      applicationA
        .affectedRiderIds,
    )

  const unaffectedRiderIds =
    sourceGroupBefore
      .riderIds
      .filter(
        (riderId) =>
          !affectedRiderIdSet.has(
            riderId,
          ),
      )

  const unaffectedRidersUnchanged =
    unaffectedRiderIds.every(
      (riderId) =>
        createCanonicalHashedValue(
          initialState.riders[
            riderId
          ],
        ).hash ===
        createCanonicalHashedValue(
          state.riders[
            riderId
          ],
        ).hash,
    )

  const affectedRidersApplied =
    applicationA
      .affectedRiderIds
      .every(
        (riderId) => {
          const rider =
            state.riders[
              riderId
            ]

          return (
            rider
              ?.currentGroupId ===
              applicationA
                .targetGroupId &&
            rider
              .distanceKm ===
              applicationA
                .outcome
                .targetDistanceKm &&
            rider
              .speedKmh ===
              0 &&
            rider
              .stageStatus ===
              'racing'
          )
        },
      )

  const affectedPressureReset =
    applicationA
      .affectedRiderIds
      .every(
        (riderId) =>
          state
            .separationPressureSecondsByRiderId[
              riderId
            ] ===
            0,
      )

  const unaffectedPressurePreserved =
    unaffectedRiderIds.every(
      (riderId) =>
        state
          .separationPressureSecondsByRiderId[
            riderId
          ] ===
        initialState
          .separationPressureSecondsByRiderId[
            riderId
          ],
    )

  const expectedLoss =
    expectedDistanceLoss(
      sourceGroupBefore
        .speedKmh,
      applicationA
        .outcome
        .timeLossSeconds,
    )

  const minor =
    outcomeForSeverity(
      initialState,
      'minor',
    )

  const moderate =
    outcomeForSeverity(
      initialState,
      'moderate',
    )

  const serious =
    outcomeForSeverity(
      initialState,
      'serious',
    )

  let smallGroupRejected =
    false

  try {
    calculateGroupCrashOutcome({
      raceId:
        initialState.raceId,
      stageId:
        initialState.stageId,
      seed:
        initialState.seed,
      occurrenceIndex: 0,
      sourceGroupId:
        'too_small',
      sourceRiderIds: [
        'rider_1',
        'rider_2',
        'rider_3',
        'rider_4',
        'rider_5',
      ],
      raceSecond:
        initialState.raceSecond,
      sourceDistanceKm:
        CONTROLLED_DISTANCE_KM,
      sourceGapFromLeaderSeconds:
        0,
      sourceSpeedKmh:
        CONTROLLED_SPEED_KMH,
      severity:
        'minor',
    })
  } catch {
    smallGroupRejected =
      true
  }

  const repeatedHashA =
    createCanonicalHashedValue(
      applicationA,
    ).hash

  const repeatedHashB =
    createCanonicalHashedValue(
      applicationB,
    ).hash

  const checks:
    readonly Check[] = [
      {
        label:
          'Repeated group-crash application is byte-for-byte deterministic',
        passed:
          repeatedHashA ===
          repeatedHashB,
      },
      {
        label:
          'Affected-rider selection is independent of source rider array order',
        passed:
          applicationA
            .outcome
            .deterministicHash ===
            reorderedOutcome
              .deterministicHash &&
          applicationA
            .outcome
            .selectionHash ===
            reorderedOutcome
              .selectionHash &&
          JSON.stringify(
            applicationA
              .affectedRiderIds,
          ) ===
          JSON.stringify(
            reorderedOutcome
              .affectedRiderIds,
          ),
      },
      {
        label:
          'Original state remains immutable',
        passed:
          initialState
            .groups[
              INITIAL_PELOTON_GROUP_ID
            ]!
            .riderIds
            .length ===
            sourceGroupBefore
              .riderIds
              .length &&
          initialState
            .events
            .length + 1 ===
            state.events.length,
      },
      {
        label:
          'Affected rider count stays between two and six',
        passed:
          applicationA
            .affectedRiderIds
            .length >=
            2 &&
          applicationA
            .affectedRiderIds
            .length <=
            6,
      },
      {
        label:
          'Affected rider IDs are unique',
        passed:
          affectedRiderIdSet.size ===
          applicationA
            .affectedRiderIds
            .length,
      },
      {
        label:
          'Source group remains active and non-empty',
        passed:
          sourceGroupAfter
            .active ===
            true &&
          sourceGroupAfter
            .riderIds
            .length >
            0,
      },
      {
        label:
          'Exactly one dropped_N group contains all affected riders',
        passed:
          targetGroup
            .groupId ===
            'dropped_1' &&
          targetGroup
            .groupType ===
            'dropped' &&
          JSON.stringify(
            targetGroup
              .riderIds,
          ) ===
          JSON.stringify(
            applicationA
              .affectedRiderIds,
          ),
      },
      {
        label:
          'Every affected rider remains racing at zero speed in the target group',
        passed:
          affectedRidersApplied,
      },
      {
        label:
          'Every unaffected rider remains unchanged',
        passed:
          unaffectedRidersUnchanged,
      },
      {
        label:
          'Affected pressure resets while unaffected pressure is preserved',
        passed:
          affectedPressureReset &&
          unaffectedPressurePreserved,
      },
      {
        label:
          'Shared physical distance loss equals source speed multiplied by time loss',
        passed:
          Math.abs(
            applicationA
              .outcome
              .distanceLossKm -
            expectedLoss
          ) <
          0.000001,
      },
      {
        label:
          'Shared crash gap increases by the exact time loss',
        passed:
          applicationA
            .outcome
            .targetGapFromLeaderSeconds -
          applicationA
            .outcome
            .sourceGapFromLeaderSeconds ===
          applicationA
            .outcome
            .timeLossSeconds,
      },
      {
        label:
          'GROUP_CRASHED event uses the active engine event contract',
        passed:
          applicationA
            .event
            .eventType ===
            'GROUP_CRASHED' &&
          applicationA
            .event
            .actorRiderId ===
            null &&
          applicationA
            .event
            .teamId ===
            null &&
          applicationA
            .event
            .sourceGroupId ===
            INITIAL_PELOTON_GROUP_ID &&
          applicationA
            .event
            .targetGroupId ===
            'dropped_1' &&
          JSON.stringify(
            applicationA
              .event
              .relatedRiderIds,
          ) ===
          JSON.stringify(
            applicationA
              .affectedRiderIds,
          ),
      },
      {
        label:
          'GROUP_CRASHED payload matches the state change',
        passed:
          applicationA
            .event
            .payload
            .incidentKind ===
            'group_crash' &&
          applicationA
            .event
            .payload
            .affectedRiderCount ===
            applicationA
              .affectedRiderIds
              .length &&
          applicationA
            .event
            .payload
            .timeLossSeconds ===
            applicationA
              .outcome
              .timeLossSeconds,
      },
      {
        label:
          'Event and dropped-group counters increment exactly once',
        passed:
          state
            .nextEventSequenceNumber ===
            initialState
              .nextEventSequenceNumber +
              1 &&
          state
            .nextDroppedGroupNumber ===
            initialState
              .nextDroppedGroupNumber +
              1,
      },
      {
        label:
          'Minor shared time loss remains between twenty and forty-five seconds',
        passed:
          minor.timeLossSeconds >=
            20 &&
          minor.timeLossSeconds <=
            45,
      },
      {
        label:
          'Moderate shared time loss remains between forty-six and one hundred seconds',
        passed:
          moderate
            .timeLossSeconds >=
            46 &&
          moderate
            .timeLossSeconds <=
            100,
      },
      {
        label:
          'Serious shared time loss remains between one hundred one and two hundred ten seconds',
        passed:
          serious
            .timeLossSeconds >=
            101 &&
          serious
            .timeLossSeconds <=
            210,
      },
      {
        label:
          'Null group selection preserves the exact state reference',
        passed:
          noSelection.state ===
            initialState &&
          noSelection.application ===
            null,
      },
      {
        label:
          'Groups smaller than six riders are rejected',
        passed:
          smallGroupRejected,
      },
      {
        label:
          'Initial and resulting states pass validateSimulationState',
        passed: true,
      },
      {
        label:
          'No persistent health outcome is created in this phase',
        passed:
          applicationA
            .event
            .payload
            .persistentHealthOutcome ===
            'not_created_in_phase_8h3a',
      },
    ]

  return {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    checks,
    application:
      applicationA,
    minor,
    moderate,
    serious,
    sourceRiderCount:
      sourceGroupBefore
        .riderIds
        .length,
    auditHash:
      createCanonicalHashedValue({
        application:
          applicationA,
        checks,
        minor,
        moderate,
        serious,
      }).hash,
  }
}

function Row({
  label,
  value,
}: {
  readonly label: string
  readonly value:
    string | number
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-400">
        {label}
      </dt>
      <dd className="max-w-[70%] break-all text-right font-semibold text-slate-100">
        {value}
      </dd>
    </div>
  )
}

export default function GroupCrashDiagnostic():
  JSX.Element {
  const value =
    useMemo(
      buildDiagnostic,
      [],
    )

  const {
    application,
  } = value

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Phase 8H.3A development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Deterministic group crash application
          </h1>

          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
            Selects an input-order-independent rider subset from one eligible
            source group, applies one shared physical race delay, moves the
            affected riders into one dropped group, and emits GROUP_CRASHED
            without activating incident risk or persistence.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — one deterministic group crash moves a stable rider subset and emits one authoritative event'
              : 'FAIL — isolated group crash application needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Applied group crash
            </h2>

            <dl className="mt-4 space-y-2 text-sm">
              <Row
                label="Incident ID"
                value={
                  application
                    .outcome
                    .incidentId
                }
              />
              <Row
                label="Severity"
                value={
                  application
                    .outcome
                    .severity
                }
              />
              <Row
                label="Source riders"
                value={
                  value
                    .sourceRiderCount
                }
              />
              <Row
                label="Affected riders"
                value={
                  application
                    .affectedRiderIds
                    .length
                }
              />
              <Row
                label="Affected IDs"
                value={
                  application
                    .affectedRiderIds
                    .join(', ')
                }
              />
              <Row
                label="Time loss"
                value={`${application.outcome.timeLossSeconds}s`}
              />
              <Row
                label="Distance loss"
                value={`${application.outcome.distanceLossKm.toFixed(6)} km`}
              />
              <Row
                label="Source → target"
                value={`${application.sourceGroupId} → ${application.targetGroupId}`}
              />
              <Row
                label="Target gap"
                value={`${application.outcome.targetGapFromLeaderSeconds}s`}
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Deterministic references
            </h2>

            <dl className="mt-4 space-y-2 text-sm">
              <Row
                label="Outcome hash"
                value={
                  application
                    .outcome
                    .deterministicHash
                }
              />
              <Row
                label="Selection hash"
                value={
                  application
                    .outcome
                    .selectionHash
                }
              />
              <Row
                label="Time-loss hash"
                value={
                  application
                    .outcome
                    .timeLossHash
                }
              />
              <Row
                label="Event sequence"
                value={
                  application
                    .event
                    .sequenceNumber
                }
              />
              <Row
                label="Minor"
                value={`${value.minor.timeLossSeconds}s · 20–45s`}
              />
              <Row
                label="Moderate"
                value={`${value.moderate.timeLossSeconds}s · 46–100s`}
              />
              <Row
                label="Serious"
                value={`${value.serious.timeLossSeconds}s · 101–210s`}
              />
              <Row
                label="Audit hash"
                value={
                  value.auditHash
                }
              />
            </dl>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Checks
          </h2>

          <div className="mt-4 space-y-2">
            {value.checks.map(
              (check) => (
                <div
                  key={check.label}
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 px-4 py-3 text-sm"
                >
                  <span>
                    {check.label}
                  </span>
                  <strong
                    className={
                      check.passed
                        ? 'text-emerald-300'
                        : 'text-rose-300'
                    }
                  >
                    {check.passed
                      ? 'PASS'
                      : 'FAIL'}
                  </strong>
                </div>
              ),
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Safety
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            This diagnostic does not evaluate active group-crash probability,
            alter the shared incident runtime, call Supabase, create injuries,
            persist replay output, change production execution, or modify
            official results.
          </p>
        </section>
      </div>
    </main>
  )
}
