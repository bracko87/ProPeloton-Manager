/**
 * stagingIntegrationBoundary.ts
 *
 * Phase 8J.7 development-only staging integration boundary.
 *
 * This file defines injected adapter contracts for:
 * - read-only stage source loading;
 * - legacy execution;
 * - deterministic execution;
 * - generic replay preview creation.
 *
 * It does not contain a Supabase client, SQL, a persistence writer, a
 * production route integration, or a player-visible replay switch.
 */

import type {
  DeterministicReplayCandidate,
  DeterministicReplayDiscoverySource,
  LegacyReplayAvailability,
} from './replayRoutingContract'
import type {
  ReplayRoutingDecision,
} from './resolveReplayRoutingDecision'
import type {
  ShadowDualRunEvidence,
  ShadowExecutor,
  ShadowSourceBundle,
} from './shadowDualRunOrchestrator'
import type {
  DualRunComparisonTolerance,
  StageRunComparisonInput,
} from './stagingDualRunComparison'
import type {
  MigrationEnvironment,
} from './StagingMigrationPlan'

export interface StagingIntegrationAdapterManifest {
  readonly manifestVersion:
    'phase_8j7_staging_integration_adapter_manifest_v1'

  readonly sourceLoaderId: string
  readonly legacyExecutorId: string
  readonly deterministicExecutorId: string
  readonly genericReplayBuilderId: string

  readonly sourceAccess:
    'read_only'
  readonly legacyWriterEnabled:
    false
  readonly deterministicWriterEnabled:
    false
  readonly genericReplayPreviewOnly:
    true

  readonly productionAllowed:
    false
  readonly persistenceAllowed:
    false
  readonly playerUiExposureAllowed:
    false
}

export const STAGING_INTEGRATION_ADAPTER_MANIFEST:
  StagingIntegrationAdapterManifest = {
    manifestVersion:
      'phase_8j7_staging_integration_adapter_manifest_v1',

    sourceLoaderId:
      'staging_read_only_source_loader_adapter',
    legacyExecutorId:
      'legacy_stage_executor_adapter',
    deterministicExecutorId:
      'deterministic_stage_executor_adapter',
    genericReplayBuilderId:
      'generic_replay_preview_builder_adapter',

    sourceAccess:
      'read_only',
    legacyWriterEnabled:
      false,
    deterministicWriterEnabled:
      false,
    genericReplayPreviewOnly:
      true,

    productionAllowed:
      false,
    persistenceAllowed:
      false,
    playerUiExposureAllowed:
      false,
  }

export interface StagingReadOnlySourceLoadResult<
  TPayload,
> {
  readonly loaderId: string
  readonly stageId: string

  readonly sourceBundle:
    ShadowSourceBundle<TPayload>

  readonly sourceRowsRead: number
  readonly databaseReadPerformed:
    boolean
  readonly liveStagingData:
    boolean

  readonly readOnly: true
  readonly databaseWriteCount: 0

  readonly sourceLoadHash: string
}

export type StagingReadOnlySourceLoader<
  TPayload,
> = (
  input: {
    readonly environment:
      MigrationEnvironment
    readonly stageId: string
  },
) => StagingReadOnlySourceLoadResult<TPayload>

export interface GenericReplayPreview {
  readonly previewVersion:
    'phase_8j7_generic_replay_preview_v1'

  readonly builderId: string

  readonly stageId: string
  readonly deterministicRunId: string

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

  readonly previewOnly: true
  readonly persistenceWriteCount: 0
  readonly routeApplied: false
  readonly playerUiExposed: false

  readonly previewHash: string
}

export type GenericReplayPreviewBuilder<
  TPayload,
> = (
  input: {
    readonly stageId: string
    readonly sourceBundle:
      ShadowSourceBundle<TPayload>
    readonly deterministicRun:
      StageRunComparisonInput
  },
) => GenericReplayPreview

export interface StagingIntegrationBoundaryInput<
  TPayload,
> {
  readonly environment:
    MigrationEnvironment
  readonly requestedMode:
    unknown
  readonly stageId: string

  readonly manifest?:
    StagingIntegrationAdapterManifest

  readonly sourceLoader:
    StagingReadOnlySourceLoader<TPayload>

  readonly legacyExecutor:
    ShadowExecutor<TPayload>
  readonly deterministicExecutor:
    ShadowExecutor<TPayload>

  readonly genericReplayBuilder:
    GenericReplayPreviewBuilder<TPayload>

  readonly legacyReplay:
    LegacyReplayAvailability

  readonly candidateDiscoverySource:
    DeterministicReplayDiscoverySource

  readonly tolerance:
    DualRunComparisonTolerance

  readonly orchestrationSequence?:
    number
}

export type StagingIntegrationBoundaryStatus =
  | 'completed'
  | 'blocked'
  | 'failed'

export interface StagingIntegrationFailure {
  readonly step:
    | 'source_loader'
    | 'shadow_execution'
    | 'generic_replay_builder'
  readonly message: string
}

export interface StagingIntegrationBoundaryReport<
  TPayload,
> {
  readonly reportVersion:
    'phase_8j7_staging_integration_boundary_report_v1'

  readonly status:
    StagingIntegrationBoundaryStatus
  readonly passed: boolean

  readonly environment:
    MigrationEnvironment
  readonly requestedMode:
    unknown
  readonly stageId: string

  readonly manifest:
    StagingIntegrationAdapterManifest

  readonly sourceLoad:
    StagingReadOnlySourceLoadResult<TPayload> | null

  readonly shadowEvidence:
    ShadowDualRunEvidence | null

  readonly genericReplayPreview:
    GenericReplayPreview | null

  readonly deterministicReplayCandidate:
    DeterministicReplayCandidate | null

  readonly replayRoutingDecision:
    ReplayRoutingDecision | null

  readonly failure:
    StagingIntegrationFailure | null

  readonly issues:
    readonly string[]

  readonly sourceLoaderInvoked:
    boolean
  readonly legacyExecutorInvoked:
    boolean
  readonly deterministicExecutorInvoked:
    boolean
  readonly genericReplayBuilderInvoked:
    boolean

  readonly liveStagingDataAccessed:
    boolean
  readonly liveIntegrationComplete:
    false

  readonly databaseWriteCount:
    0
  readonly officialResultMutationAllowed:
    false
  readonly deterministicPersistenceEnabled:
    false
  readonly productionRouteChanged:
    false
  readonly playerUiExposed:
    false
  readonly deploymentPerformed:
    false

  readonly reportHash: string
}
