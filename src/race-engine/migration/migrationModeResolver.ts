/**
 * migrationModeResolver.ts
 *
 * Phase 8J.1 pure environment-scoped migration-mode resolver.
 *
 * Safety properties:
 * - every missing, malformed, unsupported, or disallowed request falls back to
 *   legacy_only;
 * - production can resolve only legacy_only;
 * - no global environment variable is read directly;
 * - no feature flag is written;
 * - no engine or route is executed;
 * - no database access occurs.
 */

import {
  STAGING_MIGRATION_PLAN,
  type MigrationEnvironment,
  type MigrationExecutionMode,
  type StagingMigrationPlan,
} from './StagingMigrationPlan'

export const MIGRATION_MODE_CONFIG_KEY =
  'RACE_ENGINE_MIGRATION_MODE'

export type MigrationModeRequestSource =
  | 'default'
  | 'environment_variable'
  | 'query_parameter'
  | 'local_override'
  | 'diagnostic'

export type MigrationModeRequestedValueType =
  | 'missing'
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'function'
  | 'symbol'
  | 'bigint'

export type MigrationModeDecisionReason =
  | 'requested_mode_missing'
  | 'requested_mode_blank'
  | 'requested_mode_invalid_type'
  | 'requested_mode_unsupported'
  | 'requested_mode_allowed'
  | 'requested_mode_disallowed_for_environment'
  | 'production_legacy_only_enforced'
  | 'default_legacy_only_applied'

export interface ResolveMigrationExecutionModeInput {
  readonly environment:
    MigrationEnvironment
  readonly requestedMode:
    unknown
  readonly source:
    MigrationModeRequestSource
  readonly plan?:
    StagingMigrationPlan
}

export interface ResolveMigrationExecutionModeFromConfigInput {
  readonly environment:
    MigrationEnvironment
  readonly config:
    Readonly<
      Record<
        string,
        unknown
      >
    >
  readonly configKey?: string
  readonly source?:
    MigrationModeRequestSource
  readonly plan?:
    StagingMigrationPlan
}

export interface MigrationModeDecision {
  readonly planVersion:
    StagingMigrationPlan[
      'planVersion'
    ]

  readonly environment:
    MigrationEnvironment
  readonly source:
    MigrationModeRequestSource
  readonly configKey:
    string | null

  readonly requestedValueType:
    MigrationModeRequestedValueType
  readonly requestedValueText:
    string | null
  readonly requestedMode:
    MigrationExecutionMode | null

  readonly resolvedMode:
    MigrationExecutionMode
  readonly allowedModes:
    readonly MigrationExecutionMode[]

  readonly requestAccepted:
    boolean
  readonly defaultApplied:
    boolean
  readonly fallbackApplied:
    boolean
  readonly productionRestrictionApplied:
    boolean

  readonly safeForEnvironment:
    true
  readonly productionSafe:
    true

  readonly reasons:
    readonly MigrationModeDecisionReason[]
}

export interface MigrationModeDecisionValidation {
  readonly valid: boolean
  readonly issues:
    readonly string[]
}

const SUPPORTED_MODES:
  readonly MigrationExecutionMode[] = [
    'legacy_only',
    'dual_run_shadow',
    'deterministic_canary',
    'deterministic_primary_with_legacy_fallback',
    'deterministic_only',
  ]

function isMigrationExecutionMode(
  value: string,
): value is
  MigrationExecutionMode {
  return (
    SUPPORTED_MODES as
      readonly string[]
  ).includes(
    value,
  )
}

function classifyRequestedValue(
  value: unknown,
): MigrationModeRequestedValueType {
  if (
    value === undefined ||
    value === null
  ) {
    return 'missing'
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  const valueType =
    typeof value

  if (
    valueType === 'string' ||
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'function' ||
    valueType === 'symbol' ||
    valueType === 'bigint'
  ) {
    return valueType
  }

  return 'object'
}

function fallbackDecision(
  input: {
    readonly plan:
      StagingMigrationPlan
    readonly environment:
      MigrationEnvironment
    readonly source:
      MigrationModeRequestSource
    readonly configKey:
      string | null
    readonly requestedValueType:
      MigrationModeRequestedValueType
    readonly requestedValueText:
      string | null
    readonly requestedMode:
      MigrationExecutionMode | null
    readonly reasons:
      readonly MigrationModeDecisionReason[]
    readonly productionRestrictionApplied:
      boolean
  },
): MigrationModeDecision {
  const allowedModes =
    input
      .plan
      .featureFlag
      .allowedByEnvironment[
        input.environment
      ]

  if (
    !allowedModes.includes(
      'legacy_only',
    )
  ) {
    throw new Error(
      `resolveMigrationExecutionMode: environment ${input.environment} does not allow the mandatory legacy_only fallback.`,
    )
  }

  return {
    planVersion:
      input.plan
        .planVersion,

    environment:
      input.environment,
    source:
      input.source,
    configKey:
      input.configKey,

    requestedValueType:
      input
        .requestedValueType,
    requestedValueText:
      input
        .requestedValueText,
    requestedMode:
      input.requestedMode,

    resolvedMode:
      'legacy_only',
    allowedModes:
      allowedModes.slice(),

    requestAccepted:
      false,
    defaultApplied:
      true,
    fallbackApplied:
      true,
    productionRestrictionApplied:
      input
        .productionRestrictionApplied,

    safeForEnvironment:
      true,
    productionSafe:
      true,

    reasons: [
      ...input.reasons,
      'default_legacy_only_applied',
    ],
  }
}

function resolveInternal(
  input: {
    readonly environment:
      MigrationEnvironment
    readonly requestedMode:
      unknown
    readonly source:
      MigrationModeRequestSource
    readonly configKey:
      string | null
    readonly plan:
      StagingMigrationPlan
  },
): MigrationModeDecision {
  const allowedModes =
    input
      .plan
      .featureFlag
      .allowedByEnvironment[
        input.environment
      ]

  if (!allowedModes) {
    throw new Error(
      `resolveMigrationExecutionMode: unknown environment ${String(input.environment)}.`,
    )
  }

  const requestedValueType =
    classifyRequestedValue(
      input.requestedMode,
    )

  if (
    requestedValueType ===
    'missing'
  ) {
    return fallbackDecision({
      plan:
        input.plan,
      environment:
        input.environment,
      source:
        input.source,
      configKey:
        input.configKey,
      requestedValueType,
      requestedValueText:
        null,
      requestedMode:
        null,
      reasons: [
        'requested_mode_missing',
      ],
      productionRestrictionApplied:
        false,
    })
  }

  if (
    requestedValueType !==
    'string'
  ) {
    return fallbackDecision({
      plan:
        input.plan,
      environment:
        input.environment,
      source:
        input.source,
      configKey:
        input.configKey,
      requestedValueType,
      requestedValueText:
        String(
          input.requestedMode,
        ),
      requestedMode:
        null,
      reasons: [
        'requested_mode_invalid_type',
      ],
      productionRestrictionApplied:
        false,
    })
  }

  const requestedValueText =
    (
      input.requestedMode as
        string
    ).trim()

  if (
    requestedValueText.length ===
    0
  ) {
    return fallbackDecision({
      plan:
        input.plan,
      environment:
        input.environment,
      source:
        input.source,
      configKey:
        input.configKey,
      requestedValueType,
      requestedValueText:
        '',
      requestedMode:
        null,
      reasons: [
        'requested_mode_blank',
      ],
      productionRestrictionApplied:
        false,
    })
  }

  if (
    !isMigrationExecutionMode(
      requestedValueText,
    )
  ) {
    return fallbackDecision({
      plan:
        input.plan,
      environment:
        input.environment,
      source:
        input.source,
      configKey:
        input.configKey,
      requestedValueType,
      requestedValueText,
      requestedMode:
        null,
      reasons: [
        'requested_mode_unsupported',
      ],
      productionRestrictionApplied:
        false,
    })
  }

  if (
    input.environment ===
      'production' &&
    requestedValueText !==
      'legacy_only'
  ) {
    return fallbackDecision({
      plan:
        input.plan,
      environment:
        input.environment,
      source:
        input.source,
      configKey:
        input.configKey,
      requestedValueType,
      requestedValueText,
      requestedMode:
        requestedValueText,
      reasons: [
        'production_legacy_only_enforced',
        'requested_mode_disallowed_for_environment',
      ],
      productionRestrictionApplied:
        true,
    })
  }

  if (
    !allowedModes.includes(
      requestedValueText,
    )
  ) {
    return fallbackDecision({
      plan:
        input.plan,
      environment:
        input.environment,
      source:
        input.source,
      configKey:
        input.configKey,
      requestedValueType,
      requestedValueText,
      requestedMode:
        requestedValueText,
      reasons: [
        'requested_mode_disallowed_for_environment',
      ],
      productionRestrictionApplied:
        false,
    })
  }

  return {
    planVersion:
      input.plan
        .planVersion,

    environment:
      input.environment,
    source:
      input.source,
    configKey:
      input.configKey,

    requestedValueType,
    requestedValueText,
    requestedMode:
      requestedValueText,

    resolvedMode:
      requestedValueText,
    allowedModes:
      allowedModes.slice(),

    requestAccepted:
      true,
    defaultApplied:
      false,
    fallbackApplied:
      false,
    productionRestrictionApplied:
      false,

    safeForEnvironment:
      true,
    productionSafe:
      true,

    reasons: [
      'requested_mode_allowed',
    ],
  }
}

export function resolveMigrationExecutionMode(
  input:
    ResolveMigrationExecutionModeInput,
): MigrationModeDecision {
  return resolveInternal({
    environment:
      input.environment,
    requestedMode:
      input.requestedMode,
    source:
      input.source,
    configKey:
      null,
    plan:
      input.plan ??
      STAGING_MIGRATION_PLAN,
  })
}

export function resolveMigrationExecutionModeFromConfig(
  input:
    ResolveMigrationExecutionModeFromConfigInput,
): MigrationModeDecision {
  const configKey =
    input.configKey ??
    MIGRATION_MODE_CONFIG_KEY

  if (
    !configKey.trim()
  ) {
    throw new Error(
      'resolveMigrationExecutionModeFromConfig: configKey must be non-empty.',
    )
  }

  return resolveInternal({
    environment:
      input.environment,
    requestedMode:
      input.config[
        configKey
      ],
    source:
      input.source ??
      'environment_variable',
    configKey,
    plan:
      input.plan ??
      STAGING_MIGRATION_PLAN,
  })
}

export function validateMigrationModeDecision(
  decision:
    MigrationModeDecision,
  plan:
    StagingMigrationPlan =
      STAGING_MIGRATION_PLAN,
): MigrationModeDecisionValidation {
  const issues:
    string[] = []

  const allowedModes =
    plan
      .featureFlag
      .allowedByEnvironment[
        decision.environment
      ]

  if (
    decision.planVersion !==
    plan.planVersion
  ) {
    issues.push(
      'Decision planVersion does not match the migration plan.',
    )
  }

  if (
    JSON.stringify(
      decision.allowedModes,
    ) !==
    JSON.stringify(
      allowedModes,
    )
  ) {
    issues.push(
      'Decision allowedModes do not match the environment allow-list.',
    )
  }

  if (
    !allowedModes.includes(
      decision.resolvedMode,
    )
  ) {
    issues.push(
      'Resolved mode is not allowed for the environment.',
    )
  }

  if (
    decision.environment ===
      'production' &&
    decision.resolvedMode !==
      'legacy_only'
  ) {
    issues.push(
      'Production resolved a non-legacy mode.',
    )
  }

  if (
    decision.requestAccepted &&
    (
      decision.fallbackApplied ||
      decision.defaultApplied
    )
  ) {
    issues.push(
      'Accepted requests may not also be fallback/default decisions.',
    )
  }

  if (
    !decision.requestAccepted &&
    (
      !decision.fallbackApplied ||
      !decision.defaultApplied ||
      decision.resolvedMode !==
        'legacy_only'
    )
  ) {
    issues.push(
      'Rejected requests must apply the legacy_only fallback.',
    )
  }

  if (
    decision.productionRestrictionApplied &&
    decision.environment !==
      'production'
  ) {
    issues.push(
      'Production restriction may be marked only for production.',
    )
  }

  if (
    decision.productionRestrictionApplied &&
    !decision.reasons.includes(
      'production_legacy_only_enforced',
    )
  ) {
    issues.push(
      'Production restriction requires the production enforcement reason.',
    )
  }

  if (
    decision.reasons.length ===
    0
  ) {
    issues.push(
      'Decision requires at least one reason.',
    )
  }

  return {
    valid:
      issues.length ===
      0,
    issues,
  }
}
