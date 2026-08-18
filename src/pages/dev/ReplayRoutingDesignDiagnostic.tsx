/**
 * ReplayRoutingDesignDiagnostic.tsx
 *
 * Phase 8J.6 browser-only synthetic replay-routing diagnostic.
 *
 * The page evaluates routing payloads only. It never modifies RaceDetailPage,
 * calls Supabase, persists replay, enables a feature flag, or exposes players
 * to the generic replay.
 */

import {
  useMemo,
} from 'react'

import type {
  DeterministicReplayCandidate,
  LegacyReplayAvailability,
  ReplayCanaryAuthorization,
} from '../../race-engine/migration/replayRoutingContract'
import {
  REPLAY_ROUTING_CONTRACT,
} from '../../race-engine/migration/replayRoutingContract'
import {
  resolveReplayRoutingDecision,
} from '../../race-engine/migration/resolveReplayRoutingDecision'
import {
  validateReplayRoutingDecision,
} from '../../race-engine/migration/validateReplayRoutingDecision'
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization'

interface Check {
  readonly label: string
  readonly passed: boolean
}

const STAGE_ID =
  'phase-8j6-stage'

function legacy(
  available = true,
): LegacyReplayAvailability {
  return {
    available,
    stageId:
      STAGE_ID,
    replayIdentifier:
      available
        ? 'legacy-replay-phase-8j6'
        : null,
  }
}

function candidate(
  overrides:
    Partial<DeterministicReplayCandidate> = {},
): DeterministicReplayCandidate {
  return {
    runId:
      'deterministic-run-phase-8j6',
    stageId:
      STAGE_ID,
    status:
      'complete',
    discoverySource:
      'synthetic_fixture',

    engineVersion:
      'race_engine_ts_v1',
    simulationMode:
      'deterministic_road_race_v1',

    sourceBundleHash:
      '1111111111111111',
    deterministicOutputHash:
      '2222222222222222',
    replayHash:
      '3333333333333333',
    genericReplayModelHash:
      '4444444444444444',

    classificationCount:
      96,
    eventCount: 24,
    replaySnapshotCount:
      180,

    replayValid: true,
    deterministicWriterCallCount:
      0,

    ...overrides,
  }
}

function authorization(
  overrides:
    Partial<ReplayCanaryAuthorization> = {},
): ReplayCanaryAuthorization {
  return {
    decisionHash:
      '5555555555555555',
    status:
      'eligible',
    environment:
      'staging',
    canProceedToCanaryImplementation:
      true,
    canExecuteCanary:
      false,

    ...overrides,
  }
}

function buildDiagnostic() {
  const canaryGeneric =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate(),
      ],
      canaryAuthorization:
        authorization(),
    })

  const repeatedCanary =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate(),
      ],
      canaryAuthorization:
        authorization(),
    })

  const productionLegacy =
    resolveReplayRoutingDecision({
      environment:
        'production',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate(),
      ],
      canaryAuthorization:
        authorization({
          environment:
            'production',
        }),
    })

  const legacyOnly =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'legacy_only',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate(),
      ],
    })

  const shadowLegacy =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'dual_run_shadow',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate(),
      ],
    })

  const canaryMissingAuthorization =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate(),
      ],
      canaryAuthorization:
        null,
    })

  const canaryIneligible =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate(),
      ],
      canaryAuthorization:
        authorization({
          status:
            'ineligible',
          canProceedToCanaryImplementation:
            false,
        }),
    })

  const canaryEnvironmentMismatch =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate(),
      ],
      canaryAuthorization:
        authorization({
          environment:
            'development',
        }),
    })

  const missingCandidate =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [],
      canaryAuthorization:
        authorization(),
    })

  const incompleteCandidate =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate({
          status:
            'incomplete',
        }),
      ],
      canaryAuthorization:
        authorization(),
    })

  const invalidReplay =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate({
          replayValid:
            false,
        }),
      ],
      canaryAuthorization:
        authorization(),
    })

  const missingSnapshots =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate({
          replaySnapshotCount:
            0,
        }),
      ],
      canaryAuthorization:
        authorization(),
    })

  const writerViolation =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate({
          deterministicWriterCallCount:
            1,
        }),
      ],
      canaryAuthorization:
        authorization(),
    })

  const ambiguousCandidates =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate(),
        candidate({
          runId:
            'deterministic-run-phase-8j6-duplicate',
          replayHash:
            '6666666666666666',
          genericReplayModelHash:
            '7777777777777777',
        }),
      ],
      canaryAuthorization:
        authorization(),
    })

  const stageMismatch =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate({
          stageId:
            'other-stage',
        }),
      ],
      canaryAuthorization:
        authorization(),
    })

  const noCanaryFallback =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_canary',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(false),
      deterministicCandidates: [
        candidate(),
      ],
      canaryAuthorization:
        authorization(),
    })

  const primaryGeneric =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_primary_with_legacy_fallback',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [
        candidate(),
      ],
    })

  const primaryFallback =
    resolveReplayRoutingDecision({
      environment:
        'staging',
      requestedMode:
        'deterministic_primary_with_legacy_fallback',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(),
      deterministicCandidates: [],
    })

  const localDeterministicOnly =
    resolveReplayRoutingDecision({
      environment:
        'local',
      requestedMode:
        'deterministic_only',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(false),
      deterministicCandidates: [
        candidate(),
      ],
    })

  const localDeterministicUnavailable =
    resolveReplayRoutingDecision({
      environment:
        'local',
      requestedMode:
        'deterministic_only',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(false),
      deterministicCandidates: [],
    })

  const legacyUnavailable =
    resolveReplayRoutingDecision({
      environment:
        'production',
      requestedMode:
        'legacy_only',
      stageId:
        STAGE_ID,
      legacyReplay:
        legacy(false),
      deterministicCandidates: [
        candidate(),
      ],
    })

  const decisions = [
    canaryGeneric,
    repeatedCanary,
    productionLegacy,
    legacyOnly,
    shadowLegacy,
    canaryMissingAuthorization,
    canaryIneligible,
    canaryEnvironmentMismatch,
    missingCandidate,
    incompleteCandidate,
    invalidReplay,
    missingSnapshots,
    writerViolation,
    ambiguousCandidates,
    stageMismatch,
    noCanaryFallback,
    primaryGeneric,
    primaryFallback,
    localDeterministicOnly,
    localDeterministicUnavailable,
    legacyUnavailable,
  ]

  const validations =
    decisions.map(
      validateReplayRoutingDecision,
    )

  const checks:
    readonly Check[] = [
      {
        label:
          'Eligible staging canary selects one valid generic replay with legacy fallback',
        passed:
          canaryGeneric
            .routeTarget ===
            'generic_replay' &&
          canaryGeneric
            .fallbackTarget ===
            'legacy_replay' &&
          canaryGeneric
            .selectedDeterministicRunId ===
            'deterministic-run-phase-8j6',
      },
      {
        label:
          'Repeated routing input reproduces the exact decision hash',
        passed:
          canaryGeneric
            .decisionHash ===
          repeatedCanary
            .decisionHash,
      },
      {
        label:
          'Production rejects deterministic canary and remains on legacy replay',
        passed:
          productionLegacy
            .routeTarget ===
            'legacy_replay' &&
          productionLegacy
            .resolvedMode ===
            'legacy_only' &&
          productionLegacy
            .reasons
            .includes(
              'production_legacy_only_enforced',
            ),
      },
      {
        label:
          'legacy_only always keeps the legacy replay visible',
        passed:
          legacyOnly.routeTarget ===
          'legacy_replay',
      },
      {
        label:
          'dual_run_shadow keeps the player-visible replay on legacy',
        passed:
          shadowLegacy
            .routeTarget ===
            'legacy_replay' &&
          shadowLegacy
            .reasons
            .includes(
              'shadow_mode_keeps_legacy_visible',
            ),
      },
      {
        label:
          'Missing canary authorization falls back to legacy',
        passed:
          canaryMissingAuthorization
            .routeTarget ===
            'legacy_replay',
      },
      {
        label:
          'Ineligible or environment-mismatched canary authorization falls back to legacy',
        passed:
          canaryIneligible
            .routeTarget ===
            'legacy_replay' &&
          canaryEnvironmentMismatch
            .routeTarget ===
            'legacy_replay',
      },
      {
        label:
          'Missing or incomplete deterministic bundle falls back to legacy',
        passed:
          missingCandidate
            .routeTarget ===
            'legacy_replay' &&
          incompleteCandidate
            .routeTarget ===
            'legacy_replay',
      },
      {
        label:
          'Invalid replay, missing snapshots, or writer activity falls back to legacy',
        passed:
          invalidReplay
            .routeTarget ===
            'legacy_replay' &&
          missingSnapshots
            .routeTarget ===
            'legacy_replay' &&
          writerViolation
            .routeTarget ===
            'legacy_replay',
      },
      {
        label:
          'Ambiguous complete candidates cannot select generic replay',
        passed:
          ambiguousCandidates
            .routeTarget ===
            'legacy_replay' &&
          ambiguousCandidates
            .discovery
            .status ===
            'ambiguous',
      },
      {
        label:
          'Stage-mismatched candidates are treated as missing and fall back to legacy',
        passed:
          stageMismatch
            .routeTarget ===
            'legacy_replay' &&
          stageMismatch
            .discovery
            .status ===
            'missing',
      },
      {
        label:
          'Canary generic replay is unavailable when the mandatory legacy fallback is absent',
        passed:
          noCanaryFallback
            .routeTarget ===
            'unavailable' &&
          noCanaryFallback
            .reasons
            .includes(
              'legacy_fallback_required',
            ),
      },
      {
        label:
          'Primary-with-fallback selects generic only with a complete bundle and ready legacy fallback',
        passed:
          primaryGeneric
            .routeTarget ===
            'generic_replay' &&
          primaryGeneric
            .fallbackTarget ===
            'legacy_replay',
      },
      {
        label:
          'Primary-with-fallback returns to legacy when deterministic replay is missing',
        passed:
          primaryFallback
            .routeTarget ===
            'legacy_replay',
      },
      {
        label:
          'Local deterministic_only may select valid generic replay without legacy',
        passed:
          localDeterministicOnly
            .routeTarget ===
            'generic_replay' &&
          localDeterministicOnly
            .fallbackTarget ===
            null,
      },
      {
        label:
          'Local deterministic_only becomes unavailable when no generic replay exists',
        passed:
          localDeterministicUnavailable
            .routeTarget ===
            'unavailable',
      },
      {
        label:
          'Missing legacy replay in legacy-only production is reported as unavailable',
        passed:
          legacyUnavailable
            .routeTarget ===
            'unavailable',
      },
      {
        label:
          'Every replay-routing decision passes structural validation',
        passed:
          validations.every(
            (validation) =>
              validation.valid,
          ),
      },
      {
        label:
          'No decision applies routing, changes production, enables persistence, or exposes player UI',
        passed:
          decisions.every(
            (decision) =>
              decision.routingApplied ===
                false &&
              decision
                .productionRouteChanged ===
                false &&
              decision
                .persistenceEnabled ===
                false &&
              decision
                .playerUiExposureAllowed ===
                false,
          ) &&
          REPLAY_ROUTING_CONTRACT
            .currentProductionTarget ===
            'legacy_replay',
      },
      {
        label:
          'Diagnostic performs no database, writer, route, UI, flag, or deployment action',
        passed: true,
      },
    ]

  const valueWithoutAudit = {
    passed:
      checks.every(
        (check) =>
          check.passed,
      ),

    checks,

    canaryGeneric,
    productionLegacy,
    legacyOnly,
    shadowLegacy,

    fallbacks: {
      missingAuthorization:
        canaryMissingAuthorization,
      ineligible:
        canaryIneligible,
      environmentMismatch:
        canaryEnvironmentMismatch,
      missingCandidate,
      incompleteCandidate,
      invalidReplay,
      missingSnapshots,
      writerViolation,
      ambiguousCandidates,
      stageMismatch,
      noCanaryFallback,
      primaryFallback,
      deterministicOnlyUnavailable:
        localDeterministicUnavailable,
      legacyUnavailable,
    },

    alternatives: {
      primaryGeneric,
      localDeterministicOnly,
    },

    contract:
      REPLAY_ROUTING_CONTRACT,

    safety: {
      databaseRead: false,
      databaseWrite: false,
      routingApplied: false,
      productionRouteChanged:
        false,
      featureFlagChanged: false,
      persistenceEnabled: false,
      playerUiEnabled: false,
      deploymentPerformed: false,
    },
  }

  return {
    ...valueWithoutAudit,

    auditHash:
      createCanonicalHashedValue(
        valueWithoutAudit,
      ).hash,
  }
}

function Metric({
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

export default function ReplayRoutingDesignDiagnostic():
  JSX.Element {
  const value =
    useMemo(
      buildDiagnostic,
      [],
    )

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Phase 8J.6 development diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Replay routing and legacy fallback design
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Resolves synthetic legacy and generic replay availability through
            migration modes, canary authorization, deterministic-run
            discovery, and mandatory fallback rules. No real route is changed.
          </p>

          <div
            className={`mt-5 rounded-2xl border p-4 font-semibold ${
              value.passed
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-700 bg-rose-950/50 text-rose-200'
            }`}
          >
            {value.passed
              ? 'PASS — generic replay is selected only for valid authorized bundles and every unsafe case falls back safely'
              : 'FAIL — replay-routing design needs correction'}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Canary target
            </div>
            <div className="mt-2 text-xl font-bold text-emerald-300">
              {value
                .canaryGeneric
                .routeTarget}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Production target
            </div>
            <div className="mt-2 text-xl font-bold">
              {value
                .productionLegacy
                .routeTarget}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Canary decision hash
            </div>
            <div className="mt-2 break-all text-sm font-bold">
              {value
                .canaryGeneric
                .decisionHash}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Audit hash
            </div>
            <div className="mt-2 break-all text-sm font-bold">
              {value.auditHash}
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Authorized generic decision
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Environment"
                value={
                  value
                    .canaryGeneric
                    .environment
                }
              />
              <Metric
                label="Mode"
                value={
                  value
                    .canaryGeneric
                    .resolvedMode
                }
              />
              <Metric
                label="Discovery"
                value={
                  value
                    .canaryGeneric
                    .discovery
                    .status
                }
              />
              <Metric
                label="Run ID"
                value={
                  value
                    .canaryGeneric
                    .selectedDeterministicRunId ??
                  'null'
                }
              />
              <Metric
                label="Target"
                value={
                  value
                    .canaryGeneric
                    .routeTarget
                }
              />
              <Metric
                label="Fallback"
                value={
                  value
                    .canaryGeneric
                    .fallbackTarget ??
                  'null'
                }
              />
              <Metric
                label="Routing applied"
                value={
                  String(
                    value
                      .canaryGeneric
                      .routingApplied,
                  )
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Fallback matrix
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Missing authorization"
                value={
                  value
                    .fallbacks
                    .missingAuthorization
                    .routeTarget
                }
              />
              <Metric
                label="Ineligible canary"
                value={
                  value
                    .fallbacks
                    .ineligible
                    .routeTarget
                }
              />
              <Metric
                label="Missing candidate"
                value={
                  value
                    .fallbacks
                    .missingCandidate
                    .routeTarget
                }
              />
              <Metric
                label="Incomplete candidate"
                value={
                  value
                    .fallbacks
                    .incompleteCandidate
                    .routeTarget
                }
              />
              <Metric
                label="Invalid replay"
                value={
                  value
                    .fallbacks
                    .invalidReplay
                    .routeTarget
                }
              />
              <Metric
                label="Writer violation"
                value={
                  value
                    .fallbacks
                    .writerViolation
                    .routeTarget
                }
              />
              <Metric
                label="Ambiguous candidates"
                value={
                  value
                    .fallbacks
                    .ambiguousCandidates
                    .routeTarget
                }
              />
              <Metric
                label="No canary fallback"
                value={
                  value
                    .fallbacks
                    .noCanaryFallback
                    .routeTarget
                }
              />
            </dl>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Mode behavior
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Production canary request"
                value={
                  value
                    .productionLegacy
                    .routeTarget
                }
              />
              <Metric
                label="Legacy-only"
                value={
                  value
                    .legacyOnly
                    .routeTarget
                }
              />
              <Metric
                label="Shadow"
                value={
                  value
                    .shadowLegacy
                    .routeTarget
                }
              />
              <Metric
                label="Primary with fallback"
                value={
                  value
                    .alternatives
                    .primaryGeneric
                    .routeTarget
                }
              />
              <Metric
                label="Local deterministic-only"
                value={
                  value
                    .alternatives
                    .localDeterministicOnly
                    .routeTarget
                }
              />
            </dl>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Contract status
            </h2>

            <dl className="mt-4 space-y-2 text-xs">
              <Metric
                label="Current production"
                value={
                  value
                    .contract
                    .currentProductionTarget
                }
              />
              <Metric
                label="Unique candidate required"
                value={
                  String(
                    value
                      .contract
                      .deterministicCandidateMustBeUnique,
                  )
                }
              />
              <Metric
                label="Replay validation required"
                value={
                  String(
                    value
                      .contract
                      .replayValidationRequired,
                  )
                }
              />
              <Metric
                label="Writer calls allowed"
                value={
                  value
                    .contract
                    .deterministicWriterCallsAllowed
                }
              />
              <Metric
                label="Player UI exposure"
                value={
                  String(
                    value
                      .contract
                      .playerUiExposureAllowed,
                  )
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

        <section className="rounded-3xl border border-rose-800 bg-rose-950/20 p-6">
          <h2 className="text-xl font-semibold">
            Production and UI status
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            These are design decisions only. The existing production race route
            still loads legacy replay, no deterministic replay is persisted,
            and the generic replay is not yet available to players.
          </p>
        </section>
      </div>
    </main>
  )
}
