/**
 * resolveReplayRoutingDecision.ts
 *
 * Pure Phase 8J.6 replay-routing decision.
 *
 * It resolves only a design payload. It never changes the actual React route,
 * queries Supabase, persists replay, or exposes the new player UI.
 */

import {
  discoverDeterministicReplayCandidate,
  type DeterministicReplayDiscovery,
} from './discoverDeterministicReplayCandidate'
import {
  REPLAY_ROUTING_CONTRACT,
  type DeterministicReplayCandidate,
  type LegacyReplayAvailability,
  type ReplayCanaryAuthorization,
  type ReplayRouteTarget,
} from './replayRoutingContract'
import {
  resolveMigrationExecutionMode,
  type MigrationModeDecision,
} from './migrationModeResolver'
import type {
  MigrationEnvironment,
  MigrationExecutionMode,
} from './StagingMigrationPlan'
import {
  createCanonicalHashedValue,
} from '../simulation/canonicalSerialization'

export type ReplayRoutingDecisionReason =
  | 'legacy_mode_selected'
  | 'production_legacy_only_enforced'
  | 'shadow_mode_keeps_legacy_visible'
  | 'generic_replay_selected'
  | 'canary_authorization_missing'
  | 'canary_not_eligible'
  | 'canary_environment_mismatch'
  | 'deterministic_candidate_missing'
  | 'deterministic_candidate_incomplete'
  | 'deterministic_candidate_invalid'
  | 'deterministic_candidate_ambiguous'
  | 'legacy_fallback_required'
  | 'legacy_replay_selected_as_fallback'
  | 'legacy_replay_unavailable'
  | 'deterministic_only_candidate_unavailable'

export interface ReplayRoutingDecision {
  readonly decisionVersion:
    'phase_8j6_replay_routing_decision_v1'

  readonly environment:
    MigrationEnvironment
  readonly stageId: string

  readonly modeDecision:
    MigrationModeDecision
  readonly resolvedMode:
    MigrationExecutionMode

  readonly discovery:
    DeterministicReplayDiscovery

  readonly routeTarget:
    ReplayRouteTarget
  readonly fallbackTarget:
    ReplayRouteTarget | null

  readonly selectedDeterministicRunId:
    string | null
  readonly selectedReplayIdentifier:
    string | null

  readonly genericReplayAvailable:
    boolean
  readonly legacyReplayAvailable:
    boolean
  readonly legacyFallbackReady:
    boolean

  readonly reasons:
    readonly ReplayRoutingDecisionReason[]

  readonly routingApplied:
    false
  readonly productionRouteChanged:
    false
  readonly playerUiExposureAllowed:
    false
  readonly persistenceEnabled:
    false

  readonly decisionHash: string
}

function fallbackToLegacy(
  input: {
    readonly legacy:
      LegacyReplayAvailability
    readonly reasons:
      readonly ReplayRoutingDecisionReason[]
  },
): {
  readonly routeTarget:
    ReplayRouteTarget
  readonly fallbackTarget:
    ReplayRouteTarget | null
  readonly selectedReplayIdentifier:
    string | null
  readonly reasons:
    readonly ReplayRoutingDecisionReason[]
} {
  if (input.legacy.available) {
    return {
      routeTarget:
        'legacy_replay',
      fallbackTarget:
        null,
      selectedReplayIdentifier:
        input.legacy
          .replayIdentifier,
      reasons: [
        ...input.reasons,
        'legacy_replay_selected_as_fallback',
      ],
    }
  }

  return {
    routeTarget:
      'unavailable',
    fallbackTarget:
      null,
    selectedReplayIdentifier:
      null,
    reasons: [
      ...input.reasons,
      'legacy_replay_unavailable',
    ],
  }
}

function discoveryReason(
  discovery:
    DeterministicReplayDiscovery,
):
  ReplayRoutingDecisionReason {
  if (
    discovery.status ===
    'missing'
  ) {
    return 'deterministic_candidate_missing'
  }

  if (
    discovery.status ===
    'incomplete'
  ) {
    return 'deterministic_candidate_incomplete'
  }

  if (
    discovery.status ===
    'invalid'
  ) {
    return 'deterministic_candidate_invalid'
  }

  return 'deterministic_candidate_ambiguous'
}

export function resolveReplayRoutingDecision(
  input: {
    readonly environment:
      MigrationEnvironment
    readonly requestedMode:
      unknown
    readonly stageId: string

    readonly legacyReplay:
      LegacyReplayAvailability
    readonly deterministicCandidates:
      readonly DeterministicReplayCandidate[]

    readonly canaryAuthorization?:
      ReplayCanaryAuthorization | null
  },
): ReplayRoutingDecision {
  if (!input.stageId.trim()) {
    throw new Error(
      'resolveReplayRoutingDecision: stageId must be non-empty.',
    )
  }

  if (
    input.legacyReplay.stageId !==
    input.stageId
  ) {
    throw new Error(
      'resolveReplayRoutingDecision: legacy replay stageId must match the requested stage.',
    )
  }

  const modeDecision =
    resolveMigrationExecutionMode({
      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      source:
        'diagnostic',
    })

  const discovery =
    discoverDeterministicReplayCandidate({
      stageId:
        input.stageId,
      candidates:
        input.deterministicCandidates,
    })

  const resolvedMode =
    modeDecision.resolvedMode

  const legacyReplayAvailable =
    input.legacyReplay.available

  const genericReplayAvailable =
    discovery.status ===
    'available'

  const legacyFallbackReady =
    legacyReplayAvailable

  let routeTarget:
    ReplayRouteTarget

  let fallbackTarget:
    ReplayRouteTarget | null =
      null

  let selectedDeterministicRunId:
    string | null = null

  let selectedReplayIdentifier:
    string | null = null

  let reasons:
    ReplayRoutingDecisionReason[] = []

  if (
    input.environment ===
      'production' &&
    resolvedMode ===
      'legacy_only'
  ) {
    reasons.push(
      'production_legacy_only_enforced',
    )
  }

  if (
    resolvedMode ===
    'legacy_only'
  ) {
    const fallback =
      fallbackToLegacy({
        legacy:
          input.legacyReplay,
        reasons: [
          ...reasons,
          'legacy_mode_selected',
        ],
      })

    routeTarget =
      fallback.routeTarget
    fallbackTarget =
      fallback.fallbackTarget
    selectedReplayIdentifier =
      fallback
        .selectedReplayIdentifier
    reasons =
      fallback.reasons
  } else if (
    resolvedMode ===
    'dual_run_shadow'
  ) {
    const fallback =
      fallbackToLegacy({
        legacy:
          input.legacyReplay,
        reasons: [
          'shadow_mode_keeps_legacy_visible',
        ],
      })

    routeTarget =
      fallback.routeTarget
    fallbackTarget =
      fallback.fallbackTarget
    selectedReplayIdentifier =
      fallback
        .selectedReplayIdentifier
    reasons =
      fallback.reasons
  } else if (
    resolvedMode ===
    'deterministic_canary'
  ) {
    const authorization =
      input.canaryAuthorization

    if (!authorization) {
      const fallback =
        fallbackToLegacy({
          legacy:
            input.legacyReplay,
          reasons: [
            'canary_authorization_missing',
          ],
        })

      routeTarget =
        fallback.routeTarget
      fallbackTarget =
        fallback.fallbackTarget
      selectedReplayIdentifier =
        fallback
          .selectedReplayIdentifier
      reasons =
        fallback.reasons
    } else if (
      authorization.environment !==
      input.environment
    ) {
      const fallback =
        fallbackToLegacy({
          legacy:
            input.legacyReplay,
          reasons: [
            'canary_environment_mismatch',
          ],
        })

      routeTarget =
        fallback.routeTarget
      fallbackTarget =
        fallback.fallbackTarget
      selectedReplayIdentifier =
        fallback
          .selectedReplayIdentifier
      reasons =
        fallback.reasons
    } else if (
      authorization.status !==
        'eligible' ||
      !authorization
        .canProceedToCanaryImplementation
    ) {
      const fallback =
        fallbackToLegacy({
          legacy:
            input.legacyReplay,
          reasons: [
            'canary_not_eligible',
          ],
        })

      routeTarget =
        fallback.routeTarget
      fallbackTarget =
        fallback.fallbackTarget
      selectedReplayIdentifier =
        fallback
          .selectedReplayIdentifier
      reasons =
        fallback.reasons
    } else if (!legacyFallbackReady) {
      routeTarget =
        'unavailable'
      fallbackTarget =
        null
      selectedReplayIdentifier =
        null
      reasons = [
        'legacy_fallback_required',
        'legacy_replay_unavailable',
      ]
    } else if (!genericReplayAvailable) {
      const fallback =
        fallbackToLegacy({
          legacy:
            input.legacyReplay,
          reasons: [
            discoveryReason(
              discovery,
            ),
          ],
        })

      routeTarget =
        fallback.routeTarget
      fallbackTarget =
        fallback.fallbackTarget
      selectedReplayIdentifier =
        fallback
          .selectedReplayIdentifier
      reasons =
        fallback.reasons
    } else {
      routeTarget =
        'generic_replay'
      fallbackTarget =
        'legacy_replay'
      selectedDeterministicRunId =
        discovery
          .selectedCandidate
          ?.runId ??
        null
      selectedReplayIdentifier =
        discovery
          .selectedCandidate
          ?.genericReplayModelHash ??
        null
      reasons = [
        'generic_replay_selected',
      ]
    }
  } else if (
    resolvedMode ===
    'deterministic_primary_with_legacy_fallback'
  ) {
    if (!legacyFallbackReady) {
      routeTarget =
        'unavailable'
      fallbackTarget =
        null
      selectedReplayIdentifier =
        null
      reasons = [
        'legacy_fallback_required',
        'legacy_replay_unavailable',
      ]
    } else if (!genericReplayAvailable) {
      const fallback =
        fallbackToLegacy({
          legacy:
            input.legacyReplay,
          reasons: [
            discoveryReason(
              discovery,
            ),
          ],
        })

      routeTarget =
        fallback.routeTarget
      fallbackTarget =
        fallback.fallbackTarget
      selectedReplayIdentifier =
        fallback
          .selectedReplayIdentifier
      reasons =
        fallback.reasons
    } else {
      routeTarget =
        'generic_replay'
      fallbackTarget =
        'legacy_replay'
      selectedDeterministicRunId =
        discovery
          .selectedCandidate
          ?.runId ??
        null
      selectedReplayIdentifier =
        discovery
          .selectedCandidate
          ?.genericReplayModelHash ??
        null
      reasons = [
        'generic_replay_selected',
      ]
    }
  } else {
    if (!genericReplayAvailable) {
      routeTarget =
        'unavailable'
      fallbackTarget =
        null
      selectedReplayIdentifier =
        null
      reasons = [
        discoveryReason(
          discovery,
        ),
        'deterministic_only_candidate_unavailable',
      ]
    } else {
      routeTarget =
        'generic_replay'
      fallbackTarget =
        null
      selectedDeterministicRunId =
        discovery
          .selectedCandidate
          ?.runId ??
        null
      selectedReplayIdentifier =
        discovery
          .selectedCandidate
          ?.genericReplayModelHash ??
        null
      reasons = [
        'generic_replay_selected',
      ]
    }
  }

  const withoutHash = {
    decisionVersion:
      'phase_8j6_replay_routing_decision_v1' as const,

    environment:
      input.environment,
    stageId:
      input.stageId,

    modeDecision,
    resolvedMode,

    discovery,

    routeTarget,
    fallbackTarget,

    selectedDeterministicRunId,
    selectedReplayIdentifier,

    genericReplayAvailable,
    legacyReplayAvailable,
    legacyFallbackReady,

    reasons,

    routingApplied:
      REPLAY_ROUTING_CONTRACT
        .routingApplied,
    productionRouteChanged:
      REPLAY_ROUTING_CONTRACT
        .productionRouteChanged,
    playerUiExposureAllowed:
      REPLAY_ROUTING_CONTRACT
        .playerUiExposureAllowed,
    persistenceEnabled:
      REPLAY_ROUTING_CONTRACT
        .persistenceEnabled,
  }

  return {
    ...withoutHash,

    decisionHash:
      createCanonicalHashedValue(
        withoutHash,
      ).hash,
  }
}
