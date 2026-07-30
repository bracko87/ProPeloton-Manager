/**
 * validateStagingMigrationPlan.ts
 *
 * Pure validation for the Phase 8J planning contract.
 */

import type {
  MigrationExecutionMode,
  StagingMigrationPlan,
} from './StagingMigrationPlan'

export interface StagingMigrationPlanValidation {
  readonly valid: boolean
  readonly issues:
    readonly string[]
  readonly productionBlockingGateCount:
    number
}

function unique(
  values:
    readonly string[],
): boolean {
  return (
    new Set(values).size ===
    values.length
  )
}

export function validateStagingMigrationPlan(
  plan:
    StagingMigrationPlan,
): StagingMigrationPlanValidation {
  const issues:
    string[] = []

  if (
    plan.currentProductionMode !==
    'legacy_only'
  ) {
    issues.push(
      'Current production mode must remain legacy_only.',
    )
  }

  if (
    plan.productionReady !==
    false
  ) {
    issues.push(
      'Phase 8J must not claim production readiness.',
    )
  }

  if (
    plan.productionSwitchApproved !==
    false
  ) {
    issues.push(
      'Phase 8J must not claim production switch approval.',
    )
  }

  if (
    plan
      .featureFlag
      .defaultMode !==
    'legacy_only'
  ) {
    issues.push(
      'Feature flag default must be legacy_only.',
    )
  }

  const productionModes =
    plan
      .featureFlag
      .allowedByEnvironment
      .production

  if (
    productionModes.length !==
      1 ||
    productionModes[0] !==
      'legacy_only'
  ) {
    issues.push(
      'Production allow-list must contain only legacy_only.',
    )
  }

  if (
    plan
      .featureFlag
      .automaticProductionPromotion !==
    false
  ) {
    issues.push(
      'Automatic production promotion must remain disabled.',
    )
  }

  if (
    plan
      .dualRun
      .authoritativeWriter !==
      'legacy' ||
    plan
      .dualRun
      .deterministicWriter !==
      'disabled' ||
    plan
      .dualRun
      .productionResultMutationAllowed !==
      false
  ) {
    issues.push(
      'Dual-run shadow mode must keep legacy authoritative and deterministic writes disabled.',
    )
  }

  if (
    plan
      .persistence
      .writerEnabled !==
      false ||
    plan
      .persistence
      .historicalRewriteAllowed !==
      false
  ) {
    issues.push(
      'Persistence writer and historical rewrite must remain disabled.',
    )
  }

  if (
    plan
      .persistence
      .healthCaseWriteOwnedByRaceEngine !==
      false
  ) {
    issues.push(
      'Race engine must not own health-case persistence.',
    )
  }

  if (
    plan
      .rollback
      .rollbackMode !==
      'legacy_only' ||
    plan
      .rollback
      .legacyRouteRemainsAvailable !==
      true
  ) {
    issues.push(
      'Rollback must preserve and return to legacy_only.',
    )
  }

  if (
    plan
      .healthConsumer
      .raceEngineCreatesHealthCases !==
      false ||
    plan
      .healthConsumer
      .downstreamConsumerRequired !==
      true
  ) {
    issues.push(
      'Health persistence must remain a separate downstream consumer.',
    )
  }

  const gateIds =
    plan.gates.map(
      (gate) =>
        gate.id,
    )

  if (!unique(gateIds)) {
    issues.push(
      'Migration gate IDs must be unique.',
    )
  }

  if (
    plan.gates.some(
      (gate) =>
        !gate.blocksProduction,
    )
  ) {
    issues.push(
      'Every Phase 8J gate must block production until completed.',
    )
  }

  if (
    plan.gates.some(
      (gate) =>
        gate.status ===
        'designed',
    )
  ) {
    issues.push(
      'No production-blocking gate may be marked designed-only complete.',
    )
  }

  const requiredModes:
    readonly MigrationExecutionMode[] = [
      'legacy_only',
      'dual_run_shadow',
      'deterministic_canary',
      'deterministic_primary_with_legacy_fallback',
      'deterministic_only',
    ]

  const localModes =
    plan
      .featureFlag
      .allowedByEnvironment
      .local

  if (
    requiredModes.some(
      (mode) =>
        !localModes.includes(
          mode,
        ),
    )
  ) {
    issues.push(
      'Local environment must be able to represent every migration mode for development testing.',
    )
  }

  const productionBlockingGateCount =
    plan.gates.filter(
      (gate) =>
        gate.blocksProduction,
    ).length

  if (
    productionBlockingGateCount <
    1
  ) {
    issues.push(
      'At least one production-blocking migration gate is required.',
    )
  }

  return {
    valid:
      issues.length ===
      0,

    issues,

    productionBlockingGateCount,
  }
}
