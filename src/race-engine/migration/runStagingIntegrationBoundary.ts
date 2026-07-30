/**
 * runStagingIntegrationBoundary.ts
 *
 * Pure injected-adapter runner for Phase 8J.7.
 *
 * The function is intentionally staging + dual_run_shadow only. Production,
 * canary execution, authoritative persistence, and player UI routing remain
 * blocked.
 */

import {
  STAGING_INTEGRATION_ADAPTER_MANIFEST,
  type GenericReplayPreview,
  type StagingIntegrationAdapterManifest,
  type StagingIntegrationBoundaryInput,
  type StagingIntegrationBoundaryReport,
  type StagingIntegrationFailure,
  type StagingReadOnlySourceLoadResult,
} from './stagingIntegrationBoundary'
import {
  orchestrateShadowDualRun,
  type ShadowDualRunEvidence,
} from './shadowDualRunOrchestrator'
import {
  resolveReplayRoutingDecision,
  type ReplayRoutingDecision,
} from './resolveReplayRoutingDecision'
import {
  validateReplayRoutingDecision,
} from './validateReplayRoutingDecision'
import {
  resolveMigrationExecutionMode,
} from './migrationModeResolver'
import type {
  DeterministicReplayCandidate,
} from './replayRoutingContract'
import {
  createCanonicalHashedValue,
} from '../simulation/canonicalSerialization'

function isCanonicalHash(
  value: string,
): boolean {
  return /^[0-9a-f]{16}$/.test(
    value,
  )
}

function nonEmpty(
  value: string,
): boolean {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  )
}

function manifestIssues(
  manifest:
    StagingIntegrationAdapterManifest,
): readonly string[] {
  const issues:
    string[] = []

  if (
    manifest.manifestVersion !==
    'phase_8j7_staging_integration_adapter_manifest_v1'
  ) {
    issues.push(
      'Unexpected staging integration adapter manifest version.',
    )
  }

  for (
    const [
      name,
      value,
    ] of
    Object.entries({
      sourceLoaderId:
        manifest.sourceLoaderId,
      legacyExecutorId:
        manifest.legacyExecutorId,
      deterministicExecutorId:
        manifest.deterministicExecutorId,
      genericReplayBuilderId:
        manifest.genericReplayBuilderId,
    })
  ) {
    if (!nonEmpty(value)) {
      issues.push(
        `${name} must be non-empty.`,
      )
    }
  }

  if (
    manifest.sourceAccess !==
      'read_only' ||
    manifest.legacyWriterEnabled !==
      false ||
    manifest.deterministicWriterEnabled !==
      false ||
    manifest.genericReplayPreviewOnly !==
      true ||
    manifest.productionAllowed !==
      false ||
    manifest.persistenceAllowed !==
      false ||
    manifest.playerUiExposureAllowed !==
      false
  ) {
    issues.push(
      'Adapter manifest violates the read-only staging boundary.',
    )
  }

  return issues
}

function sourceLoadIssues<
  TPayload,
>(
  input: {
    readonly stageId: string
    readonly manifest:
      StagingIntegrationAdapterManifest
    readonly sourceLoad:
      StagingReadOnlySourceLoadResult<TPayload>
  },
): readonly string[] {
  const issues:
    string[] = []

  const sourceLoad =
    input.sourceLoad

  if (
    sourceLoad.loaderId !==
    input.manifest.sourceLoaderId
  ) {
    issues.push(
      'Source loader ID does not match the adapter manifest.',
    )
  }

  if (
    sourceLoad.stageId !==
      input.stageId ||
    sourceLoad
      .sourceBundle
      .stageId !==
      input.stageId
  ) {
    issues.push(
      'Loaded source stage does not match the requested stage.',
    )
  }

  if (
    !Number.isInteger(
      sourceLoad.sourceRowsRead,
    ) ||
    sourceLoad.sourceRowsRead <
      1
  ) {
    issues.push(
      'sourceRowsRead must be a positive integer.',
    )
  }

  if (
    sourceLoad.readOnly !==
      true ||
    sourceLoad.databaseWriteCount !==
      0
  ) {
    issues.push(
      'Source loading must remain read-only with zero writes.',
    )
  }

  if (
    !isCanonicalHash(
      sourceLoad.sourceLoadHash,
    )
  ) {
    issues.push(
      'sourceLoadHash must be canonical.',
    )
  }

  if (
    !isCanonicalHash(
      sourceLoad
        .sourceBundle
        .declaredSourceBundleHash,
    )
  ) {
    issues.push(
      'declaredSourceBundleHash must be canonical.',
    )
  }

  const calculatedSourceHash =
    createCanonicalHashedValue({
      stageId:
        sourceLoad
          .sourceBundle
          .stageId,
      payload:
        sourceLoad
          .sourceBundle
          .payload,
    }).hash

  if (
    calculatedSourceHash !==
    sourceLoad
      .sourceBundle
      .declaredSourceBundleHash
  ) {
    issues.push(
      'Loaded source bundle hash does not match its payload.',
    )
  }

  const calculatedLoadHash =
    createCanonicalHashedValue({
      contract:
        'phase_8j7_source_load_v1',
      loaderId:
        sourceLoad.loaderId,
      stageId:
        sourceLoad.stageId,
      sourceBundleHash:
        calculatedSourceHash,
      sourceRowsRead:
        sourceLoad.sourceRowsRead,
      databaseReadPerformed:
        sourceLoad.databaseReadPerformed,
      liveStagingData:
        sourceLoad.liveStagingData,
      readOnly:
        sourceLoad.readOnly,
      databaseWriteCount:
        sourceLoad.databaseWriteCount,
    }).hash

  if (
    calculatedLoadHash !==
    sourceLoad.sourceLoadHash
  ) {
    issues.push(
      'sourceLoadHash does not match the canonical source-load evidence.',
    )
  }

  return issues
}

function previewIssues(
  input: {
    readonly manifest:
      StagingIntegrationAdapterManifest
    readonly shadowEvidence:
      ShadowDualRunEvidence
    readonly preview:
      GenericReplayPreview
  },
): readonly string[] {
  const issues:
    string[] = []

  const preview =
    input.preview

  const deterministicRun =
    input
      .shadowEvidence
      .deterministicRun

  if (!deterministicRun) {
    return [
      'A generic replay preview requires a deterministic shadow run.',
    ]
  }

  if (
    preview.previewVersion !==
    'phase_8j7_generic_replay_preview_v1'
  ) {
    issues.push(
      'Unexpected generic replay preview version.',
    )
  }

  if (
    preview.builderId !==
    input
      .manifest
      .genericReplayBuilderId
  ) {
    issues.push(
      'Generic replay builder ID does not match the adapter manifest.',
    )
  }

  if (
    preview.stageId !==
      deterministicRun.stageId ||
    preview.deterministicRunId !==
      deterministicRun.runId ||
    preview.sourceBundleHash !==
      deterministicRun.sourceBundleHash
  ) {
    issues.push(
      'Generic replay preview identity does not match the deterministic run.',
    )
  }

  for (
    const [
      name,
      value,
    ] of
    Object.entries({
      deterministicOutputHash:
        preview.deterministicOutputHash,
      replayHash:
        preview.replayHash,
      genericReplayModelHash:
        preview.genericReplayModelHash,
      previewHash:
        preview.previewHash,
    })
  ) {
    if (!isCanonicalHash(value)) {
      issues.push(
        `${name} must be canonical.`,
      )
    }
  }

  if (
    preview.classificationCount !==
    deterministicRun
      .classifications
      .length
  ) {
    issues.push(
      'Generic replay classification count does not match the deterministic run.',
    )
  }

  if (
    preview.eventCount !==
    deterministicRun.events.length
  ) {
    issues.push(
      'Generic replay event count does not match the deterministic run.',
    )
  }

  if (
    !Number.isInteger(
      preview.replaySnapshotCount,
    ) ||
    preview.replaySnapshotCount <
      1
  ) {
    issues.push(
      'Generic replay preview requires at least one replay snapshot.',
    )
  }

  if (
    !preview.replayValid ||
    !deterministicRun.replayValid
  ) {
    issues.push(
      'Generic replay preview and deterministic run must both be valid.',
    )
  }

  if (
    preview.previewOnly !==
      true ||
    preview.persistenceWriteCount !==
      0 ||
    preview.routeApplied !==
      false ||
    preview.playerUiExposed !==
      false
  ) {
    issues.push(
      'Generic replay preview violates the preview-only safety boundary.',
    )
  }

  const calculatedPreviewHash =
    createCanonicalHashedValue({
      previewVersion:
        preview.previewVersion,
      builderId:
        preview.builderId,
      stageId:
        preview.stageId,
      deterministicRunId:
        preview.deterministicRunId,
      sourceBundleHash:
        preview.sourceBundleHash,
      deterministicOutputHash:
        preview.deterministicOutputHash,
      replayHash:
        preview.replayHash,
      genericReplayModelHash:
        preview.genericReplayModelHash,
      classificationCount:
        preview.classificationCount,
      eventCount:
        preview.eventCount,
      replaySnapshotCount:
        preview.replaySnapshotCount,
      replayValid:
        preview.replayValid,
      previewOnly:
        preview.previewOnly,
      persistenceWriteCount:
        preview.persistenceWriteCount,
      routeApplied:
        preview.routeApplied,
      playerUiExposed:
        preview.playerUiExposed,
    }).hash

  if (
    calculatedPreviewHash !==
    preview.previewHash
  ) {
    issues.push(
      'previewHash does not match the canonical generic replay preview.',
    )
  }

  return issues
}

function failureMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error)
}

function finalize<
  TPayload,
>(
  input: Omit<
    StagingIntegrationBoundaryReport<TPayload>,
    'reportHash'
  >,
): StagingIntegrationBoundaryReport<TPayload> {
  return {
    ...input,

    reportHash:
      createCanonicalHashedValue(
        input,
      ).hash,
  }
}

function blockedReport<
  TPayload,
>(
  input: {
    readonly environment:
      StagingIntegrationBoundaryInput<TPayload>[
        'environment'
      ]
    readonly requestedMode:
      unknown
    readonly stageId: string
    readonly manifest:
      StagingIntegrationAdapterManifest
    readonly issues:
      readonly string[]
  },
): StagingIntegrationBoundaryReport<TPayload> {
  return finalize({
    reportVersion:
      'phase_8j7_staging_integration_boundary_report_v1',

    status:
      'blocked',
    passed:
      false,

    environment:
      input.environment,
    requestedMode:
      input.requestedMode,
    stageId:
      input.stageId,

    manifest:
      input.manifest,

    sourceLoad:
      null,
    shadowEvidence:
      null,
    genericReplayPreview:
      null,
    deterministicReplayCandidate:
      null,
    replayRoutingDecision:
      null,

    failure:
      null,

    issues:
      input.issues,

    sourceLoaderInvoked:
      false,
    legacyExecutorInvoked:
      false,
    deterministicExecutorInvoked:
      false,
    genericReplayBuilderInvoked:
      false,

    liveStagingDataAccessed:
      false,
    liveIntegrationComplete:
      false,

    databaseWriteCount:
      0,
    officialResultMutationAllowed:
      false,
    deterministicPersistenceEnabled:
      false,
    productionRouteChanged:
      false,
    playerUiExposed:
      false,
    deploymentPerformed:
      false,
  })
}

export function runStagingIntegrationBoundary<
  TPayload,
>(
  input:
    StagingIntegrationBoundaryInput<TPayload>,
): StagingIntegrationBoundaryReport<TPayload> {
  if (!nonEmpty(input.stageId)) {
    throw new Error(
      'runStagingIntegrationBoundary: stageId must be non-empty.',
    )
  }

  if (
    input.legacyReplay.stageId !==
    input.stageId
  ) {
    throw new Error(
      'runStagingIntegrationBoundary: legacy replay stageId must match the requested stage.',
    )
  }

  const manifest =
    input.manifest ??
    STAGING_INTEGRATION_ADAPTER_MANIFEST

  const initialManifestIssues =
    manifestIssues(
      manifest,
    )

  if (
    initialManifestIssues.length >
    0
  ) {
    return blockedReport({
      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      stageId:
        input.stageId,
      manifest,
      issues:
        initialManifestIssues,
    })
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

  if (
    input.environment !==
      'staging'
  ) {
    return blockedReport({
      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      stageId:
        input.stageId,
      manifest,
      issues: [
        'Phase 8J.7 integration boundary is restricted to staging.',
      ],
    })
  }

  if (
    !modeDecision.requestAccepted ||
    modeDecision.resolvedMode !==
      'dual_run_shadow'
  ) {
    return blockedReport({
      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      stageId:
        input.stageId,
      manifest,
      issues: [
        `Phase 8J.7 requires dual_run_shadow; resolved mode is ${modeDecision.resolvedMode}.`,
      ],
    })
  }

  let sourceLoad:
    StagingReadOnlySourceLoadResult<TPayload>

  try {
    sourceLoad =
      input.sourceLoader({
        environment:
          input.environment,
        stageId:
          input.stageId,
      })
  } catch (error) {
    const failure:
      StagingIntegrationFailure = {
      step:
        'source_loader',
      message:
        failureMessage(
          error,
        ),
    }

    return finalize({
      reportVersion:
        'phase_8j7_staging_integration_boundary_report_v1',

      status:
        'failed',
      passed:
        false,

      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      stageId:
        input.stageId,

      manifest,

      sourceLoad:
        null,
      shadowEvidence:
        null,
      genericReplayPreview:
        null,
      deterministicReplayCandidate:
        null,
      replayRoutingDecision:
        null,

      failure,

      issues: [
        `Source loader failed: ${failure.message}`,
      ],

      sourceLoaderInvoked:
        true,
      legacyExecutorInvoked:
        false,
      deterministicExecutorInvoked:
        false,
      genericReplayBuilderInvoked:
        false,

      liveStagingDataAccessed:
        false,
      liveIntegrationComplete:
        false,

      databaseWriteCount:
        0,
      officialResultMutationAllowed:
        false,
      deterministicPersistenceEnabled:
        false,
      productionRouteChanged:
        false,
      playerUiExposed:
        false,
      deploymentPerformed:
        false,
    })
  }

  const loadedSourceIssues =
    sourceLoadIssues({
      stageId:
        input.stageId,
      manifest,
      sourceLoad,
    })

  if (
    loadedSourceIssues.length >
    0
  ) {
    return finalize({
      reportVersion:
        'phase_8j7_staging_integration_boundary_report_v1',

      status:
        'blocked',
      passed:
        false,

      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      stageId:
        input.stageId,

      manifest,

      sourceLoad,
      shadowEvidence:
        null,
      genericReplayPreview:
        null,
      deterministicReplayCandidate:
        null,
      replayRoutingDecision:
        null,

      failure:
        null,

      issues:
        loadedSourceIssues,

      sourceLoaderInvoked:
        true,
      legacyExecutorInvoked:
        false,
      deterministicExecutorInvoked:
        false,
      genericReplayBuilderInvoked:
        false,

      liveStagingDataAccessed:
        sourceLoad.liveStagingData,
      liveIntegrationComplete:
        false,

      databaseWriteCount:
        0,
      officialResultMutationAllowed:
        false,
      deterministicPersistenceEnabled:
        false,
      productionRouteChanged:
        false,
      playerUiExposed:
        false,
      deploymentPerformed:
        false,
    })
  }

  let legacyExecutorInvoked =
    false
  let deterministicExecutorInvoked =
    false

  let shadowEvidence:
    ShadowDualRunEvidence

  try {
    shadowEvidence =
      orchestrateShadowDualRun({
        environment:
          input.environment,
        requestedMode:
          input.requestedMode,
        sourceBundle:
          sourceLoad.sourceBundle,

        legacyExecutor:
          (context) => {
            legacyExecutorInvoked =
              true

            const output =
              input.legacyExecutor(
                context,
              )

            if (
              output.writerCallCount !==
              0
            ) {
              throw new Error(
                'Read-only staging legacy adapter reported writer calls.',
              )
            }

            return output
          },

        deterministicExecutor:
          (context) => {
            deterministicExecutorInvoked =
              true

            const output =
              input.deterministicExecutor(
                context,
              )

            if (
              output.writerCallCount !==
              0
            ) {
              throw new Error(
                'Read-only staging deterministic adapter reported writer calls.',
              )
            }

            return output
          },

        tolerance:
          input.tolerance,

        orchestrationSequence:
          input.orchestrationSequence,
      })
  } catch (error) {
    const failure:
      StagingIntegrationFailure = {
      step:
        'shadow_execution',
      message:
        failureMessage(
          error,
        ),
    }

    return finalize({
      reportVersion:
        'phase_8j7_staging_integration_boundary_report_v1',

      status:
        'failed',
      passed:
        false,

      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      stageId:
        input.stageId,

      manifest,

      sourceLoad,
      shadowEvidence:
        null,
      genericReplayPreview:
        null,
      deterministicReplayCandidate:
        null,
      replayRoutingDecision:
        null,

      failure,

      issues: [
        `Shadow execution failed: ${failure.message}`,
      ],

      sourceLoaderInvoked:
        true,
      legacyExecutorInvoked,
      deterministicExecutorInvoked,
      genericReplayBuilderInvoked:
        false,

      liveStagingDataAccessed:
        sourceLoad.liveStagingData,
      liveIntegrationComplete:
        false,

      databaseWriteCount:
        0,
      officialResultMutationAllowed:
        false,
      deterministicPersistenceEnabled:
        false,
      productionRouteChanged:
        false,
      playerUiExposed:
        false,
      deploymentPerformed:
        false,
    })
  }

  if (
    shadowEvidence.status !==
      'completed' ||
    !shadowEvidence.passed ||
    !shadowEvidence.deterministicRun
  ) {
    return finalize({
      reportVersion:
        'phase_8j7_staging_integration_boundary_report_v1',

      status:
        'blocked',
      passed:
        false,

      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      stageId:
        input.stageId,

      manifest,

      sourceLoad,
      shadowEvidence,
      genericReplayPreview:
        null,
      deterministicReplayCandidate:
        null,
      replayRoutingDecision:
        null,

      failure:
        shadowEvidence
          .executionFailure
          ? {
              step:
                'shadow_execution',
              message:
                shadowEvidence
                  .executionFailure
                  .message,
            }
          : null,

      issues: [
        'Shadow evidence did not pass the read-only staging integration boundary.',
        ...shadowEvidence.issues,
      ],

      sourceLoaderInvoked:
        true,
      legacyExecutorInvoked,
      deterministicExecutorInvoked,
      genericReplayBuilderInvoked:
        false,

      liveStagingDataAccessed:
        sourceLoad.liveStagingData,
      liveIntegrationComplete:
        false,

      databaseWriteCount:
        0,
      officialResultMutationAllowed:
        false,
      deterministicPersistenceEnabled:
        false,
      productionRouteChanged:
        false,
      playerUiExposed:
        false,
      deploymentPerformed:
        false,
    })
  }

  let genericReplayBuilderInvoked =
    false

  let preview:
    GenericReplayPreview

  try {
    genericReplayBuilderInvoked =
      true

    preview =
      input.genericReplayBuilder({
        stageId:
          input.stageId,
        sourceBundle:
          sourceLoad.sourceBundle,
        deterministicRun:
          shadowEvidence
            .deterministicRun,
      })
  } catch (error) {
    const failure:
      StagingIntegrationFailure = {
      step:
        'generic_replay_builder',
      message:
        failureMessage(
          error,
        ),
    }

    return finalize({
      reportVersion:
        'phase_8j7_staging_integration_boundary_report_v1',

      status:
        'failed',
      passed:
        false,

      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      stageId:
        input.stageId,

      manifest,

      sourceLoad,
      shadowEvidence,
      genericReplayPreview:
        null,
      deterministicReplayCandidate:
        null,
      replayRoutingDecision:
        null,

      failure,

      issues: [
        `Generic replay preview builder failed: ${failure.message}`,
      ],

      sourceLoaderInvoked:
        true,
      legacyExecutorInvoked,
      deterministicExecutorInvoked,
      genericReplayBuilderInvoked,

      liveStagingDataAccessed:
        sourceLoad.liveStagingData,
      liveIntegrationComplete:
        false,

      databaseWriteCount:
        0,
      officialResultMutationAllowed:
        false,
      deterministicPersistenceEnabled:
        false,
      productionRouteChanged:
        false,
      playerUiExposed:
        false,
      deploymentPerformed:
        false,
    })
  }

  const replayPreviewIssues =
    previewIssues({
      manifest,
      shadowEvidence,
      preview,
    })

  if (
    replayPreviewIssues.length >
    0
  ) {
    return finalize({
      reportVersion:
        'phase_8j7_staging_integration_boundary_report_v1',

      status:
        'blocked',
      passed:
        false,

      environment:
        input.environment,
      requestedMode:
        input.requestedMode,
      stageId:
        input.stageId,

      manifest,

      sourceLoad,
      shadowEvidence,
      genericReplayPreview:
        preview,
      deterministicReplayCandidate:
        null,
      replayRoutingDecision:
        null,

      failure:
        null,

      issues:
        replayPreviewIssues,

      sourceLoaderInvoked:
        true,
      legacyExecutorInvoked,
      deterministicExecutorInvoked,
      genericReplayBuilderInvoked,

      liveStagingDataAccessed:
        sourceLoad.liveStagingData,
      liveIntegrationComplete:
        false,

      databaseWriteCount:
        0,
      officialResultMutationAllowed:
        false,
      deterministicPersistenceEnabled:
        false,
      productionRouteChanged:
        false,
      playerUiExposed:
        false,
      deploymentPerformed:
        false,
    })
  }

  const deterministicReplayCandidate:
    DeterministicReplayCandidate = {
    runId:
      preview.deterministicRunId,
    stageId:
      preview.stageId,
    status:
      'complete',
    discoverySource:
      input
        .candidateDiscoverySource,

    engineVersion:
      'race_engine_ts_v1',
    simulationMode:
      'deterministic_road_race_v1',

    sourceBundleHash:
      preview.sourceBundleHash,
    deterministicOutputHash:
      preview.deterministicOutputHash,
    replayHash:
      preview.replayHash,
    genericReplayModelHash:
      preview.genericReplayModelHash,

    classificationCount:
      preview.classificationCount,
    eventCount:
      preview.eventCount,
    replaySnapshotCount:
      preview.replaySnapshotCount,

    replayValid:
      preview.replayValid,
    deterministicWriterCallCount:
      0,
  }

  const replayRoutingDecision:
    ReplayRoutingDecision =
      resolveReplayRoutingDecision({
        environment:
          input.environment,
        requestedMode:
          input.requestedMode,
        stageId:
          input.stageId,

        legacyReplay:
          input.legacyReplay,
        deterministicCandidates: [
          deterministicReplayCandidate,
        ],
      })

  const routingValidation =
    validateReplayRoutingDecision(
      replayRoutingDecision,
    )

  const finalIssues: string[] = []

  if (!routingValidation.valid) {
    finalIssues.push(
      ...routingValidation.issues,
    )
  }

  if (
    replayRoutingDecision
      .routeTarget !==
      'legacy_replay'
  ) {
    finalIssues.push(
      'dual_run_shadow must keep the visible replay target on legacy_replay.',
    )
  }

  if (
    replayRoutingDecision
      .genericReplayAvailable !==
      true
  ) {
    finalIssues.push(
      'A valid generic replay preview must remain discoverable even though shadow mode does not expose it.',
    )
  }

  if (
    replayRoutingDecision
      .routingApplied !==
      false ||
    replayRoutingDecision
      .playerUiExposureAllowed !==
      false ||
    replayRoutingDecision
      .persistenceEnabled !==
      false
  ) {
    finalIssues.push(
      'Replay routing decision violates the unapplied preview boundary.',
    )
  }

  return finalize({
    reportVersion:
      'phase_8j7_staging_integration_boundary_report_v1',

    status:
      finalIssues.length ===
      0
        ? 'completed'
        : 'blocked',

    passed:
      finalIssues.length ===
      0,

    environment:
      input.environment,
    requestedMode:
      input.requestedMode,
    stageId:
      input.stageId,

    manifest,

    sourceLoad,
    shadowEvidence,
    genericReplayPreview:
      preview,
    deterministicReplayCandidate,
    replayRoutingDecision,

    failure:
      null,

    issues:
      finalIssues,

    sourceLoaderInvoked:
      true,
    legacyExecutorInvoked,
    deterministicExecutorInvoked,
    genericReplayBuilderInvoked,

    liveStagingDataAccessed:
      sourceLoad.liveStagingData,
    liveIntegrationComplete:
      false,

    databaseWriteCount:
      0,
    officialResultMutationAllowed:
      false,
    deterministicPersistenceEnabled:
      false,
    productionRouteChanged:
      false,
    playerUiExposed:
      false,
    deploymentPerformed:
      false,
  })
}
