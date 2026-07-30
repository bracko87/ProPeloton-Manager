/**
 * replayRoutingContract.ts
 *
 * Phase 8J.6 development-only replay-routing contract.
 *
 * The contract models a future routing decision. It does not read a database,
 * modify the production route, persist replay, expose player UI, or deploy.
 */

import type {
  MigrationEnvironment,
  MigrationExecutionMode,
} from './StagingMigrationPlan'

export type ReplayRouteTarget =
  | 'legacy_replay'
  | 'generic_replay'
  | 'unavailable'

export type DeterministicReplayRunStatus =
  | 'complete'
  | 'incomplete'
  | 'failed'
  | 'superseded'

export type DeterministicReplayDiscoverySource =
  | 'synthetic_fixture'
  | 'in_memory_canary'
  | 'persisted_catalog_snapshot'

export interface LegacyReplayAvailability {
  readonly available: boolean
  readonly stageId: string
  readonly replayIdentifier:
    string | null
}

export interface DeterministicReplayCandidate {
  readonly runId: string
  readonly stageId: string
  readonly status:
    DeterministicReplayRunStatus
  readonly discoverySource:
    DeterministicReplayDiscoverySource

  readonly engineVersion: string
  readonly simulationMode: string

  readonly sourceBundleHash: string
  readonly deterministicOutputHash:
    string
  readonly replayHash: string
  readonly genericReplayModelHash:
    string

  readonly classificationCount:
    number
  readonly eventCount: number
  readonly replaySnapshotCount:
    number

  readonly replayValid: boolean
  readonly deterministicWriterCallCount:
    number
}

export interface ReplayCanaryAuthorization {
  readonly decisionHash: string
  readonly status:
    | 'eligible'
    | 'ineligible'
    | 'blocked'
  readonly environment:
    MigrationEnvironment
  readonly canProceedToCanaryImplementation:
    boolean
  readonly canExecuteCanary:
    false
}

export interface ReplayRoutingContract {
  readonly contractVersion:
    'phase_8j6_replay_routing_contract_v1'

  readonly currentProductionTarget:
    'legacy_replay'
  readonly productionNonLegacyModesAllowed:
    false

  readonly legacyFallbackRequiredForCanary:
    true
  readonly legacyFallbackRequiredForPrimary:
    true

  readonly deterministicCandidateMustBeUnique:
    true
  readonly completeBundleRequired:
    true
  readonly replayValidationRequired:
    true
  readonly deterministicWriterCallsAllowed:
    0

  readonly genericReplayModes:
    readonly MigrationExecutionMode[]

  readonly routingApplied:
    false
  readonly productionRouteChanged:
    false
  readonly playerUiExposureAllowed:
    false
  readonly persistenceEnabled:
    false
}

export const REPLAY_ROUTING_CONTRACT:
  ReplayRoutingContract = {
    contractVersion:
      'phase_8j6_replay_routing_contract_v1',

    currentProductionTarget:
      'legacy_replay',
    productionNonLegacyModesAllowed:
      false,

    legacyFallbackRequiredForCanary:
      true,
    legacyFallbackRequiredForPrimary:
      true,

    deterministicCandidateMustBeUnique:
      true,
    completeBundleRequired:
      true,
    replayValidationRequired:
      true,
    deterministicWriterCallsAllowed:
      0,

    genericReplayModes: [
      'deterministic_canary',
      'deterministic_primary_with_legacy_fallback',
      'deterministic_only',
    ],

    routingApplied:
      false,
    productionRouteChanged:
      false,
    playerUiExposureAllowed:
      false,
    persistenceEnabled:
      false,
  }
