/**
 * validateReplayRoutingDecision.ts
 *
 * Pure structural validation for Phase 8J.6 replay-routing decisions.
 */

import type {
  ReplayRoutingDecision,
} from './resolveReplayRoutingDecision'

export interface ReplayRoutingDecisionValidation {
  readonly valid: boolean
  readonly issues:
    readonly string[]
}

function isHash(
  value: string,
): boolean {
  return /^[0-9a-f]{16}$/.test(
    value,
  )
}

export function validateReplayRoutingDecision(
  decision:
    ReplayRoutingDecision,
): ReplayRoutingDecisionValidation {
  const issues:
    string[] = []

  if (
    decision.decisionVersion !==
    'phase_8j6_replay_routing_decision_v1'
  ) {
    issues.push(
      'Unexpected replay-routing decision version.',
    )
  }

  if (
    !isHash(
      decision.decisionHash,
    ) ||
    !isHash(
      decision
        .discovery
        .discoveryHash,
    )
  ) {
    issues.push(
      'Decision and discovery hashes must be canonical.',
    )
  }

  if (
    decision.routingApplied !==
      false ||
    decision.productionRouteChanged !==
      false ||
    decision.playerUiExposureAllowed !==
      false ||
    decision.persistenceEnabled !==
      false
  ) {
    issues.push(
      'Phase 8J.6 may not apply routing, alter production, expose player UI, or enable persistence.',
    )
  }

  if (
    decision.environment ===
      'production' &&
    decision.routeTarget !==
      'legacy_replay' &&
    decision.routeTarget !==
      'unavailable'
  ) {
    issues.push(
      'Production may never select generic replay in Phase 8J.6.',
    )
  }

  if (
    decision.routeTarget ===
    'generic_replay'
  ) {
    if (
      !decision
        .genericReplayAvailable ||
      decision
        .selectedDeterministicRunId ===
        null ||
      decision
        .selectedReplayIdentifier ===
        null ||
      decision.discovery.status !==
        'available'
    ) {
      issues.push(
        'Generic replay requires one selected valid deterministic candidate.',
      )
    }

    if (
      decision.resolvedMode ===
        'deterministic_canary' ||
      decision.resolvedMode ===
        'deterministic_primary_with_legacy_fallback'
    ) {
      if (
        decision.fallbackTarget !==
          'legacy_replay' ||
        !decision
          .legacyFallbackReady
      ) {
        issues.push(
          'Canary and primary-with-fallback generic replay require a ready legacy fallback.',
        )
      }
    }
  } else if (
    decision
      .selectedDeterministicRunId !==
      null
  ) {
    issues.push(
      'Non-generic decisions may not select a deterministic run.',
    )
  }

  if (
    decision.routeTarget ===
      'legacy_replay' &&
    !decision
      .legacyReplayAvailable
  ) {
    issues.push(
      'Legacy replay may be selected only when available.',
    )
  }

  if (
    decision.routeTarget ===
      'unavailable' &&
    (
      decision
        .selectedReplayIdentifier !==
        null ||
      decision.fallbackTarget !==
        null
    )
  ) {
    issues.push(
      'Unavailable decisions may not select a replay or fallback target.',
    )
  }

  if (
    decision.reasons.length ===
    0
  ) {
    issues.push(
      'Replay-routing decisions require at least one reason.',
    )
  }

  return {
    valid:
      issues.length ===
      0,
    issues,
  }
}
