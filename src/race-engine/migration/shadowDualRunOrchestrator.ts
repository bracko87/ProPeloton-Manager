/**
 * shadowDualRunOrchestrator.ts
 *
 * Phase 8J.2 development-only shadow dual-run orchestration.
 *
 * It executes two supplied in-memory executor functions against one immutable
 * source bundle, keeps the legacy result authoritative, keeps deterministic
 * writes disabled, and produces comparison evidence only.
 *
 * It does not:
 * - call Supabase;
 * - select a production route;
 * - persist a result;
 * - create a health case;
 * - mutate equipment;
 * - deploy anything.
 */

import {
  resolveMigrationExecutionMode,
  type MigrationModeDecision,
} from './migrationModeResolver'
import {
  compareStagingDualRun,
  type DualRunComparisonReport,
  type DualRunComparisonTolerance,
  type DualRunEventSummary,
  type DualRunRiderClassification,
  type StageRunComparisonInput,
} from './stagingDualRunComparison'
import type {
  MigrationEnvironment,
} from './StagingMigrationPlan'
import {
  createCanonicalHashedValue,
} from '../simulation/canonicalSerialization'

export type ShadowExecutorRole =
  | 'legacy'
  | 'deterministic'

export type ShadowDualRunStatus =
  | 'completed'
  | 'blocked'
  | 'failed'

export interface ShadowSourceBundle<
  TPayload,
> {
  readonly stageId: string
  readonly declaredSourceBundleHash:
    string
  readonly payload:
    TPayload
}

export interface ShadowExecutorContext<
  TPayload,
> {
  readonly executionMode:
    'dual_run_shadow'
  readonly environment:
    MigrationEnvironment
  readonly role:
    ShadowExecutorRole
  readonly runId: string

  readonly stageId: string
  readonly sourceBundleHash:
    string

  readonly sourceBundle:
    ShadowSourceBundle<TPayload>

  readonly authoritative:
    boolean
  readonly writerEnabled:
    boolean
  readonly productionResultMutationAllowed:
    false
}

export interface ShadowExecutorOutput {
  readonly riderCount: number
  readonly classifications:
    readonly DualRunRiderClassification[]
  readonly events:
    readonly DualRunEventSummary[]
  readonly replayValid: boolean
  readonly runtimeDurationMs: number
  readonly writerCallCount: number
}

export type ShadowExecutor<
  TPayload,
> = (
  context:
    ShadowExecutorContext<TPayload>,
) => ShadowExecutorOutput

export interface ShadowDualRunInput<
  TPayload,
> {
  readonly environment:
    MigrationEnvironment

  readonly requestedMode:
    unknown

  readonly sourceBundle:
    ShadowSourceBundle<TPayload>

  readonly legacyExecutor:
    ShadowExecutor<TPayload>

  readonly deterministicExecutor:
    ShadowExecutor<TPayload>

  readonly tolerance:
    DualRunComparisonTolerance

  readonly orchestrationSequence?:
    number
}

export interface ShadowExecutionFailure {
  readonly role:
    ShadowExecutorRole
  readonly message: string
}

export interface ShadowDualRunEvidence {
  readonly contractVersion:
    'phase_8j2_shadow_dual_run_v1'

  readonly status:
    ShadowDualRunStatus
  readonly passed: boolean

  readonly environment:
    MigrationEnvironment
  readonly modeDecision:
    MigrationModeDecision

  readonly stageId: string
  readonly sourceBundleHash:
    string
  readonly declaredSourceBundleHash:
    string
  readonly sourceBundleHashMatches:
    boolean

  readonly sourceObjectShared:
    boolean
  readonly sourceHashBefore:
    string
  readonly sourceHashAfterLegacy:
    string | null
  readonly sourceHashAfterDeterministic:
    string | null
  readonly sourceUnchanged:
    boolean

  readonly legacyRun:
    StageRunComparisonInput | null
  readonly deterministicRun:
    StageRunComparisonInput | null

  readonly authoritativeRunId:
    string | null
  readonly shadowRunId:
    string | null

  readonly comparison:
    DualRunComparisonReport | null

  readonly executionFailure:
    ShadowExecutionFailure | null

  readonly issues:
    readonly string[]

  readonly officialResultMutationAllowed:
    false
  readonly deterministicWriterEnabled:
    false
  readonly productionRouteChanged:
    false
  readonly databaseAccessed:
    false
  readonly deploymentPerformed:
    false

  readonly evidenceHash:
    string
}

function assertNonEmpty(
  value: string,
  fieldName: string,
): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      `orchestrateShadowDualRun: ${fieldName} must be a non-empty string.`,
    )
  }
}

function assertHash(
  value: string,
  fieldName: string,
): void {
  if (
    !/^[0-9a-f]{16}$/.test(
      value,
    )
  ) {
    throw new Error(
      `orchestrateShadowDualRun: ${fieldName} must be a 16-character lowercase hexadecimal hash.`,
    )
  }
}

function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `orchestrateShadowDualRun: ${fieldName} must be a non-negative integer.`,
    )
  }
}

function deepFreeze<
  TValue,
>(
  value:
    TValue,
  seen =
    new Set<object>(),
): TValue {
  if (
    value === null ||
    typeof value !==
      'object'
  ) {
    return value
  }

  const objectValue =
    value as
      unknown as object

  if (
    seen.has(
      objectValue,
    )
  ) {
    return value
  }

  seen.add(
    objectValue,
  )

  for (
    const propertyValue of
    Object.values(
      objectValue as
        Record<
          string,
          unknown
        >,
    )
  ) {
    deepFreeze(
      propertyValue,
      seen,
    )
  }

  return Object.freeze(
    value,
  )
}

function createRunId(
  input: {
    readonly role:
      ShadowExecutorRole
    readonly environment:
      MigrationEnvironment
    readonly stageId: string
    readonly sourceBundleHash:
      string
    readonly orchestrationSequence:
      number
  },
): string {
  const hash =
    createCanonicalHashedValue({
      contract:
        'phase_8j2_shadow_run_id_v1',
      role:
        input.role,
      environment:
        input.environment,
      stageId:
        input.stageId,
      sourceBundleHash:
        input.sourceBundleHash,
      orchestrationSequence:
        input.orchestrationSequence,
    }).hash

  return [
    'shadow',
    input.role,
    hash,
  ].join('-')
}

function createEvidenceHash(
  evidence:
    Omit<
      ShadowDualRunEvidence,
      'evidenceHash'
    >,
): string {
  return createCanonicalHashedValue(
    evidence,
  ).hash
}

function finalizeEvidence(
  evidence:
    Omit<
      ShadowDualRunEvidence,
      'evidenceHash'
    >,
): ShadowDualRunEvidence {
  return {
    ...evidence,
    evidenceHash:
      createEvidenceHash(
        evidence,
      ),
  }
}

function blockedEvidence<
  TPayload,
>(
  input: {
    readonly environment:
      MigrationEnvironment
    readonly modeDecision:
      MigrationModeDecision
    readonly sourceBundle:
      ShadowSourceBundle<TPayload>
    readonly sourceBundleHash:
      string
    readonly sourceHashBefore:
      string
    readonly sourceBundleHashMatches:
      boolean
    readonly issues:
      readonly string[]
  },
): ShadowDualRunEvidence {
  return finalizeEvidence({
    contractVersion:
      'phase_8j2_shadow_dual_run_v1',

    status:
      'blocked',
    passed:
      false,

    environment:
      input.environment,
    modeDecision:
      input.modeDecision,

    stageId:
      input
        .sourceBundle
        .stageId,
    sourceBundleHash:
      input
        .sourceBundleHash,
    declaredSourceBundleHash:
      input
        .sourceBundle
        .declaredSourceBundleHash,
    sourceBundleHashMatches:
      input
        .sourceBundleHashMatches,

    sourceObjectShared:
      true,
    sourceHashBefore:
      input
        .sourceHashBefore,
    sourceHashAfterLegacy:
      null,
    sourceHashAfterDeterministic:
      null,
    sourceUnchanged:
      true,

    legacyRun: null,
    deterministicRun: null,

    authoritativeRunId:
      null,
    shadowRunId:
      null,

    comparison: null,

    executionFailure:
      null,

    issues:
      input.issues,

    officialResultMutationAllowed:
      false,
    deterministicWriterEnabled:
      false,
    productionRouteChanged:
      false,
    databaseAccessed:
      false,
    deploymentPerformed:
      false,
  })
}

function validateExecutorOutput(
  output:
    ShadowExecutorOutput,
  role:
    ShadowExecutorRole,
): void {
  assertNonNegativeInteger(
    output.riderCount,
    `${role}.riderCount`,
  )

  assertNonNegativeInteger(
    output.writerCallCount,
    `${role}.writerCallCount`,
  )

  if (
    !Number.isFinite(
      output.runtimeDurationMs,
    ) ||
    output.runtimeDurationMs <
      0
  ) {
    throw new Error(
      `orchestrateShadowDualRun: ${role}.runtimeDurationMs must be a non-negative finite number.`,
    )
  }

  if (
    output.riderCount !==
    output
      .classifications
      .length
  ) {
    throw new Error(
      `orchestrateShadowDualRun: ${role}.riderCount must equal classifications length.`,
    )
  }
}

function stageRunInput(
  input: {
    readonly runId: string
    readonly stageId: string
    readonly sourceBundleHash:
      string
    readonly output:
      ShadowExecutorOutput
  },
): StageRunComparisonInput {
  return {
    runId:
      input.runId,
    stageId:
      input.stageId,
    sourceBundleHash:
      input.sourceBundleHash,
    riderCount:
      input
        .output
        .riderCount,
    classifications:
      input
        .output
        .classifications,
    events:
      input
        .output
        .events,
    replayValid:
      input
        .output
        .replayValid,
    runtimeDurationMs:
      input
        .output
        .runtimeDurationMs,
    writerCallCount:
      input
        .output
        .writerCallCount,
  }
}

export function orchestrateShadowDualRun<
  TPayload,
>(
  input:
    ShadowDualRunInput<TPayload>,
): ShadowDualRunEvidence {
  assertNonEmpty(
    input
      .sourceBundle
      .stageId,
    'sourceBundle.stageId',
  )

  assertHash(
    input
      .sourceBundle
      .declaredSourceBundleHash,
    'sourceBundle.declaredSourceBundleHash',
  )

  const orchestrationSequence =
    input.orchestrationSequence ??
    0

  assertNonNegativeInteger(
    orchestrationSequence,
    'orchestrationSequence',
  )

  const frozenSourceBundle =
    deepFreeze(
      input.sourceBundle,
    )

  const sourceHashBefore =
    createCanonicalHashedValue({
      stageId:
        frozenSourceBundle
          .stageId,
      payload:
        frozenSourceBundle
          .payload,
    }).hash

  const sourceBundleHashMatches =
    sourceHashBefore ===
    frozenSourceBundle
      .declaredSourceBundleHash

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
    !sourceBundleHashMatches
  ) {
    return blockedEvidence({
      environment:
        input.environment,
      modeDecision,
      sourceBundle:
        frozenSourceBundle,
      sourceBundleHash:
        sourceHashBefore,
      sourceHashBefore,
      sourceBundleHashMatches,
      issues: [
        'Declared source-bundle hash does not match the immutable source payload.',
      ],
    })
  }

  if (
    !modeDecision
      .requestAccepted ||
    modeDecision
      .resolvedMode !==
      'dual_run_shadow'
  ) {
    return blockedEvidence({
      environment:
        input.environment,
      modeDecision,
      sourceBundle:
        frozenSourceBundle,
      sourceBundleHash:
        sourceHashBefore,
      sourceHashBefore,
      sourceBundleHashMatches,
      issues: [
        `Shadow dual run is blocked because the resolved mode is ${modeDecision.resolvedMode}.`,
      ],
    })
  }

  const legacyRunId =
    createRunId({
      role:
        'legacy',
      environment:
        input.environment,
      stageId:
        frozenSourceBundle
          .stageId,
      sourceBundleHash:
        sourceHashBefore,
      orchestrationSequence,
    })

  const deterministicRunId =
    createRunId({
      role:
        'deterministic',
      environment:
        input.environment,
      stageId:
        frozenSourceBundle
          .stageId,
      sourceBundleHash:
        sourceHashBefore,
      orchestrationSequence,
    })

  const legacyContext:
    ShadowExecutorContext<TPayload> = {
    executionMode:
      'dual_run_shadow',
    environment:
      input.environment,
    role:
      'legacy',
    runId:
      legacyRunId,

    stageId:
      frozenSourceBundle
        .stageId,
    sourceBundleHash:
      sourceHashBefore,

    sourceBundle:
      frozenSourceBundle,

    authoritative:
      true,
    writerEnabled:
      true,
    productionResultMutationAllowed:
      false,
  }

  const deterministicContext:
    ShadowExecutorContext<TPayload> = {
    executionMode:
      'dual_run_shadow',
    environment:
      input.environment,
    role:
      'deterministic',
    runId:
      deterministicRunId,

    stageId:
      frozenSourceBundle
        .stageId,
    sourceBundleHash:
      sourceHashBefore,

    sourceBundle:
      frozenSourceBundle,

    authoritative:
      false,
    writerEnabled:
      false,
    productionResultMutationAllowed:
      false,
  }

  let legacyOutput:
    ShadowExecutorOutput

  try {
    legacyOutput =
      input.legacyExecutor(
        legacyContext,
      )

    validateExecutorOutput(
      legacyOutput,
      'legacy',
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error)

    return finalizeEvidence({
      contractVersion:
        'phase_8j2_shadow_dual_run_v1',

      status:
        'failed',
      passed:
        false,

      environment:
        input.environment,
      modeDecision,

      stageId:
        frozenSourceBundle
          .stageId,
      sourceBundleHash:
        sourceHashBefore,
      declaredSourceBundleHash:
        frozenSourceBundle
          .declaredSourceBundleHash,
      sourceBundleHashMatches,

      sourceObjectShared:
        true,
      sourceHashBefore,
      sourceHashAfterLegacy:
        createCanonicalHashedValue({
          stageId:
            frozenSourceBundle
              .stageId,
          payload:
            frozenSourceBundle
              .payload,
        }).hash,
      sourceHashAfterDeterministic:
        null,
      sourceUnchanged:
        true,

      legacyRun: null,
      deterministicRun: null,

      authoritativeRunId:
        legacyRunId,
      shadowRunId:
        deterministicRunId,

      comparison: null,

      executionFailure: {
        role:
          'legacy',
        message,
      },

      issues: [
        `Legacy executor failed: ${message}`,
      ],

      officialResultMutationAllowed:
        false,
      deterministicWriterEnabled:
        false,
      productionRouteChanged:
        false,
      databaseAccessed:
        false,
      deploymentPerformed:
        false,
    })
  }

  const sourceHashAfterLegacy =
    createCanonicalHashedValue({
      stageId:
        frozenSourceBundle
          .stageId,
      payload:
        frozenSourceBundle
          .payload,
    }).hash

  let deterministicOutput:
    ShadowExecutorOutput

  try {
    deterministicOutput =
      input.deterministicExecutor(
        deterministicContext,
      )

    validateExecutorOutput(
      deterministicOutput,
      'deterministic',
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error)

    const sourceHashAfterDeterministic =
      createCanonicalHashedValue({
        stageId:
          frozenSourceBundle
            .stageId,
        payload:
          frozenSourceBundle
            .payload,
      }).hash

    return finalizeEvidence({
      contractVersion:
        'phase_8j2_shadow_dual_run_v1',

      status:
        'failed',
      passed:
        false,

      environment:
        input.environment,
      modeDecision,

      stageId:
        frozenSourceBundle
          .stageId,
      sourceBundleHash:
        sourceHashBefore,
      declaredSourceBundleHash:
        frozenSourceBundle
          .declaredSourceBundleHash,
      sourceBundleHashMatches,

      sourceObjectShared:
        legacyContext
          .sourceBundle ===
        deterministicContext
          .sourceBundle,
      sourceHashBefore,
      sourceHashAfterLegacy,
      sourceHashAfterDeterministic,
      sourceUnchanged:
        sourceHashBefore ===
          sourceHashAfterLegacy &&
        sourceHashBefore ===
          sourceHashAfterDeterministic,

      legacyRun:
        stageRunInput({
          runId:
            legacyRunId,
          stageId:
            frozenSourceBundle
              .stageId,
          sourceBundleHash:
            sourceHashBefore,
          output:
            legacyOutput,
        }),
      deterministicRun:
        null,

      authoritativeRunId:
        legacyRunId,
      shadowRunId:
        deterministicRunId,

      comparison: null,

      executionFailure: {
        role:
          'deterministic',
        message,
      },

      issues: [
        `Deterministic executor failed: ${message}`,
      ],

      officialResultMutationAllowed:
        false,
      deterministicWriterEnabled:
        false,
      productionRouteChanged:
        false,
      databaseAccessed:
        false,
      deploymentPerformed:
        false,
    })
  }

  const sourceHashAfterDeterministic =
    createCanonicalHashedValue({
      stageId:
        frozenSourceBundle
          .stageId,
      payload:
        frozenSourceBundle
          .payload,
    }).hash

  const sourceObjectShared =
    legacyContext
      .sourceBundle ===
    deterministicContext
      .sourceBundle

  const sourceUnchanged =
    sourceHashBefore ===
      sourceHashAfterLegacy &&
    sourceHashBefore ===
      sourceHashAfterDeterministic

  const legacyRun =
    stageRunInput({
      runId:
        legacyRunId,
      stageId:
        frozenSourceBundle
          .stageId,
      sourceBundleHash:
        sourceHashBefore,
      output:
        legacyOutput,
    })

  const deterministicRun =
    stageRunInput({
      runId:
        deterministicRunId,
      stageId:
        frozenSourceBundle
          .stageId,
      sourceBundleHash:
        sourceHashBefore,
      output:
        deterministicOutput,
    })

  const comparison =
    compareStagingDualRun({
      legacy:
        legacyRun,
      deterministic:
        deterministicRun,
      tolerance:
        input.tolerance,
    })

  const issues = [
    ...(
      sourceObjectShared
        ? []
        : [
            'Legacy and deterministic executors did not receive the same source-bundle object.',
          ]
    ),
    ...(
      sourceUnchanged
        ? []
        : [
            'Source bundle changed during shadow execution.',
          ]
    ),
    ...comparison.issues,
  ]

  const passed =
    issues.length ===
      0 &&
    comparison.passed &&
    deterministicRun
      .writerCallCount ===
      0

  return finalizeEvidence({
    contractVersion:
      'phase_8j2_shadow_dual_run_v1',

    status:
      'completed',
    passed,

    environment:
      input.environment,
    modeDecision,

    stageId:
      frozenSourceBundle
        .stageId,
    sourceBundleHash:
      sourceHashBefore,
    declaredSourceBundleHash:
      frozenSourceBundle
        .declaredSourceBundleHash,
    sourceBundleHashMatches,

    sourceObjectShared,
    sourceHashBefore,
    sourceHashAfterLegacy,
    sourceHashAfterDeterministic,
    sourceUnchanged,

    legacyRun,
    deterministicRun,

    authoritativeRunId:
      legacyRunId,
    shadowRunId:
      deterministicRunId,

    comparison,

    executionFailure:
      null,

    issues,

    officialResultMutationAllowed:
      false,
    deterministicWriterEnabled:
      false,
    productionRouteChanged:
      false,
    databaseAccessed:
      false,
    deploymentPerformed:
      false,
  })
}
