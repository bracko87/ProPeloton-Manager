/**
 * IndividualRiderCrashDiagnostic.tsx
 *
 * Phase 8H.2A browser-only diagnostic for pure individual crash application.
 *
 * No risk evaluation, database access, injury persistence, or production
 * execution occurs here.
 */

import {
  useMemo,
} from 'react'

import {
  applyIndividualRiderCrash,
  applyOptionalIndividualRiderCrash,
  type IndividualCrashStateContract,
} from '../../race-engine/simulation/applyIndividualRiderCrash'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'
import {
  calculateIndividualCrashOutcome,
  type IndividualCrashSeverity,
} from '../../race-engine/simulation/individualCrashOutcome'

interface DiagnosticRider {
  readonly riderId: string
  readonly teamId: string
  readonly currentGroupId: string
  readonly distanceKm: number
  readonly speedKmh: number
  readonly stageStatus: string

  readonly riderName: string
  readonly energy: number
  readonly runtimeFatigue: number
}

type DiagnosticState =
  IndividualCrashStateContract<
    DiagnosticRider
  >

interface Check {
  readonly label: string
  readonly passed: boolean
}

function createState():
  DiagnosticState {
  return {
    raceId:
      'individual-crash-diagnostic-race',
    stageId:
      'individual-crash-diagnostic-stage',
    seed:
      'individual-crash-diagnostic-seed-v1',

    raceSecond: 1800,
    currentKm: 50,
    stageDistanceKm: 150,
    completed: false,

    riders: {
      rider_a: {
        riderId:
          'rider_a',
        riderName:
          'Ada Rider',
        teamId:
          'team_a',
        currentGroupId:
          'peloton_main',
        distanceKm: 50,
        speedKmh: 45,
        stageStatus:
          'racing',
        energy: 82,
        runtimeFatigue: 24,
      },
      rider_b: {
        riderId:
          'rider_b',
        riderName:
          'Bora Rider',
        teamId:
          'team_b',
        currentGroupId:
          'peloton_main',
        distanceKm: 50,
        speedKmh: 45,
        stageStatus:
          'racing',
        energy: 79,
        runtimeFatigue: 18,
      },
      rider_c: {
        riderId:
          'rider_c',
        riderName:
          'Ciro Rider',
        teamId:
          'team_c',
        currentGroupId:
          'peloton_main',
        distanceKm: 50,
        speedKmh: 45,
        stageStatus:
          'racing',
        energy: 88,
        runtimeFatigue: 12,
      },
    },

    groups: {
      peloton_main: {
        groupId:
          'peloton_main',
        groupType:
          'peloton',
        riderIds: [
          'rider_a',
          'rider_b',
          'rider_c',
        ],
        distanceKm: 50,
        speedKmh: 45,
        gapFromLeaderSeconds: 0,
        createdAtRaceSecond: 0,
        createdAtKm: 0,
        active: true,
      },
    },

    events: [
      {
        sequenceNumber: 1,
        eventType:
          'SIMULATION_STARTED',
        raceSecond: 0,
        kmMarker: 0,
        actorRiderId: null,
        teamId: null,
        sourceGroupId: null,
        targetGroupId:
          'peloton_main',
        relatedRiderIds: [
          'rider_a',
          'rider_b',
          'rider_c',
        ],
        payload: {
          raceId:
            'individual-crash-diagnostic-race',
          stageId:
            'individual-crash-diagnostic-stage',
          seed:
            'individual-crash-diagnostic-seed-v1',
          teamCount: 3,
          riderCount: 3,
          orderCount: 0,
        },
        commentaryText: null,
      },
    ],

    nextEventSequenceNumber: 2,
    nextDroppedGroupNumber: 1,

    separationPressureSecondsByRiderId: {
      rider_a: 90,
      rider_b: 60,
      rider_c: 30,
    },
  }
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

function outcomeForSeverity(
  severity:
    IndividualCrashSeverity,
) {
  return calculateIndividualCrashOutcome({
    raceId:
      'individual-crash-diagnostic-race',
    stageId:
      'individual-crash-diagnostic-stage',
    seed:
      'individual-crash-diagnostic-seed-v1',
    occurrenceIndex: 0,
    riderId:
      'rider_a',
    sourceGroupId:
      'peloton_main',
    raceSecond: 1800,
    sourceDistanceKm: 50,
    sourceGapFromLeaderSeconds: 0,
    sourceSpeedKmh: 45,
    severity,
  })
}

function buildDiagnostic() {
  const initialState =
    createState()

  const applicationA =
    applyIndividualRiderCrash({
      state:
        initialState,
      riderId:
        'rider_a',
      severity:
        'moderate',
      occurrenceIndex: 0,
      causes: [
        'wet_road',
        'runtime_fatigue',
      ],
    })

  const applicationB =
    applyIndividualRiderCrash({
      state:
        createState(),
      riderId:
        'rider_a',
      severity:
        'moderate',
      occurrenceIndex: 0,
      causes: [
        'wet_road',
        'runtime_fatigue',
      ],
    })

  const noSelection =
    applyOptionalIndividualRiderCrash({
      state:
        initialState,
      selectedRiderId: null,
      severity:
        'minor',
      occurrenceIndex: 0,
    })

  const minor =
    outcomeForSeverity(
      'minor',
    )

  const moderate =
    outcomeForSeverity(
      'moderate',
    )

  const serious =
    outcomeForSeverity(
      'serious',
    )

  const state =
    applicationA.state

  const crashedRider =
    state.riders.rider_a

  const sourceGroup =
    state.groups.peloton_main

  const targetGroup =
    state.groups[
      applicationA.targetGroupId
    ]

  const unchangedRiderB =
    createCanonicalHashedValue(
      initialState.riders.rider_b,
    ).hash ===
    createCanonicalHashedValue(
      state.riders.rider_b,
    ).hash

  const unchangedRiderC =
    createCanonicalHashedValue(
      initialState.riders.rider_c,
    ).hash ===
    createCanonicalHashedValue(
      state.riders.rider_c,
    ).hash

  const repeatedHashA =
    createCanonicalHashedValue(
      applicationA,
    ).hash

  const repeatedHashB =
    createCanonicalHashedValue(
      applicationB,
    ).hash

  let emptySourceRejected =
    false

  try {
    const singleRiderState = {
      ...createState(),
      riders: {
        rider_a:
          createState()
            .riders
            .rider_a,
      },
      groups: {
        peloton_main: {
          ...createState()
            .groups
            .peloton_main,
          riderIds: [
            'rider_a',
          ],
        },
      },
      separationPressureSecondsByRiderId: {
        rider_a: 30,
      },
    }

    applyIndividualRiderCrash({
      state:
        singleRiderState,
      riderId:
        'rider_a',
      severity:
        'minor',
      occurrenceIndex: 0,
    })
  } catch {
    emptySourceRejected =
      true
  }

  const expectedLoss =
    expectedDistanceLoss(
      45,
      applicationA
        .outcome
        .timeLossSeconds,
    )

  const checks:
    readonly Check[] = [
      {
        label:
          'Repeated crash application is byte-for-byte deterministic',
        passed:
          repeatedHashA ===
          repeatedHashB,
      },
      {
        label:
          'Original state remains immutable',
        passed:
          initialState
            .groups
            .peloton_main
            .riderIds
            .length ===
            3 &&
          initialState
            .riders
            .rider_a
            .currentGroupId ===
            'peloton_main' &&
          initialState
            .events
            .length ===
            1,
      },
      {
        label:
          'Exactly one rider leaves the source group',
        passed:
          sourceGroup
            ?.riderIds
            .length ===
            2 &&
          !sourceGroup
            .riderIds
            .includes(
              'rider_a',
            ),
      },
      {
        label:
          'Every unaffected rider remains unchanged',
        passed:
          unchangedRiderB &&
          unchangedRiderC,
      },
      {
        label:
          'Source group remains active and non-empty',
        passed:
          sourceGroup
            ?.active ===
            true &&
          sourceGroup
            .riderIds
            .length >
            0,
      },
      {
        label:
          'Crash creates one permanent dropped_N group',
        passed:
          targetGroup
            ?.groupId ===
            'dropped_1' &&
          targetGroup
            .groupType ===
            'dropped' &&
          targetGroup
            .riderIds
            .length ===
            1 &&
          targetGroup
            .riderIds[0] ===
            'rider_a',
      },
      {
        label:
          'Physical distance loss equals source speed multiplied by time loss',
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
          'Crash gap increases by the exact time loss',
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
          'Crashed rider stays racing at zero speed in the new group',
        passed:
          crashedRider
            ?.stageStatus ===
            'racing' &&
          crashedRider
            .currentGroupId ===
            'dropped_1' &&
          crashedRider
            .speedKmh ===
            0,
      },
      {
        label:
          'Crashed rider separation pressure resets to zero',
        passed:
          state
            .separationPressureSecondsByRiderId
            .rider_a ===
            0,
      },
      {
        label:
          'Crash event uses the active engine event contract',
        passed:
          applicationA
            .event
            .eventType ===
            'RIDER_CRASHED' &&
          applicationA
            .event
            .kmMarker ===
            50 &&
          applicationA
            .event
            .relatedRiderIds
            .length ===
            1 &&
          applicationA
            .event
            .relatedRiderIds[0] ===
            'rider_a' &&
          applicationA
            .event
            .commentaryText ===
            null,
      },
      {
        label:
          'RIDER_CRASHED event sequence and payload match the state change',
        passed:
          applicationA
            .event
            .sequenceNumber ===
            2 &&
          applicationA
            .event
            .eventType ===
            'RIDER_CRASHED' &&
          applicationA
            .event
            .actorRiderId ===
            'rider_a' &&
          applicationA
            .event
            .sourceGroupId ===
            'peloton_main' &&
          applicationA
            .event
            .targetGroupId ===
            'dropped_1' &&
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
            3 &&
          state
            .nextDroppedGroupNumber ===
            2,
      },
      {
        label:
          'Minor time loss remains between fifteen and thirty-five seconds',
        passed:
          minor.timeLossSeconds >=
            15 &&
          minor.timeLossSeconds <=
            35,
      },
      {
        label:
          'Moderate time loss remains between thirty-six and ninety seconds',
        passed:
          moderate
            .timeLossSeconds >=
            36 &&
          moderate
            .timeLossSeconds <=
            90,
      },
      {
        label:
          'Serious time loss remains between ninety-one and one hundred eighty seconds',
        passed:
          serious
            .timeLossSeconds >=
            91 &&
          serious
            .timeLossSeconds <=
            180,
      },
      {
        label:
          'Null incident selection preserves the exact state reference',
        passed:
          noSelection.state ===
            initialState &&
          noSelection.application ===
            null,
      },
      {
        label:
          'An individual crash may not empty its source group',
        passed:
          emptySourceRejected,
      },
      {
        label:
          'No persistent health outcome is created in this phase',
        passed:
          applicationA
            .event
            .payload
            .persistentHealthOutcome ===
            'not_created_in_phase_8h2a',
      },
    ]

  return {
    application:
      applicationA,
    checks,
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),
    auditHash:
      createCanonicalHashedValue({
        application:
          applicationA,
        checks,
        minor,
        moderate,
        serious,
      }).hash,
    minor,
    moderate,
    serious,
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
      <dd className="text-right font-semibold text-slate-100">
        {value}
      </dd>
    </div>
  )
}

export default function IndividualRiderCrashDiagnostic():
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
            Phase 8H.2A.1 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Deterministic individual rider crash application
          </h1>

          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
            Applies one already-selected crash to an in-memory race state,
            creates a physical distance and time loss, moves exactly one rider
            into a new dropped group, and emits RIDER_CRASHED without accessing
            persistence or the production runner.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — one deterministic rider crash applies an exact physical time loss and authoritative replay event'
              : 'FAIL — individual crash application needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Applied crash
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
              <Row
                label="Event sequence"
                value={
                  application
                    .event
                    .sequenceNumber
                }
              />
              <Row
                label="Deterministic hash"
                value={
                  application
                    .outcome
                    .deterministicHash
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Severity bounds
            </h2>

            <dl className="mt-4 space-y-2 text-sm">
              <Row
                label="Minor"
                value={`${value.minor.timeLossSeconds}s · 15–35s`}
              />
              <Row
                label="Moderate"
                value={`${value.moderate.timeLossSeconds}s · 36–90s`}
              />
              <Row
                label="Serious"
                value={`${value.serious.timeLossSeconds}s · 91–180s`}
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
            The diagnostic does not evaluate live crash probability, modify the
            calibrated runner, create injuries, write Supabase rows, persist
            replay output, change classifications, or activate production
            execution.
          </p>
        </section>
      </div>
    </main>
  )
}
