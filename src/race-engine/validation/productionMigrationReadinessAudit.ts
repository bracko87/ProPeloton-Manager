/**
 * productionMigrationReadinessAudit.ts
 *
 * Pure production-migration readiness report.
 *
 * It never changes a route, feature flag, database function, writer, replay,
 * classification, health case, or production execution path.
 */

export type ProductionReadinessSeverity =
  | 'blocker'
  | 'warning'

export interface ProductionReadinessFinding {
  readonly code: string
  readonly severity:
    ProductionReadinessSeverity
  readonly title: string
  readonly detail: string
  readonly requiredEvidence: string
}

export interface ProductionSafetyBoundary {
  readonly code: string
  readonly label: string
  readonly preserved: true
}

export interface ProductionMigrationReadinessAudit {
  readonly status:
    'blocked'
  readonly canSwitchProduction:
    false

  readonly deterministicClosurePassed:
    boolean

  readonly blockers:
    readonly ProductionReadinessFinding[]

  readonly warnings:
    readonly ProductionReadinessFinding[]

  readonly preservedSafetyBoundaries:
    readonly ProductionSafetyBoundary[]
}

export function createProductionMigrationReadinessAudit(
  deterministicClosurePassed:
    boolean,
): ProductionMigrationReadinessAudit {
  const blockers:
    ProductionReadinessFinding[] = [
    {
      code:
        'PRODUCTION_ROUTE_STILL_LEGACY',
      severity:
        'blocker',
      title:
        'Production replay still uses the legacy Supabase path',
      detail:
        'The production /dashboard/races/:raceId route has not been switched to the TypeScript deterministic engine.',
      requiredEvidence:
        'An explicitly approved feature-flagged staging route and rollback-tested production switch.',
    },
    {
      code:
        'AUTHORITATIVE_PERSISTENCE_NOT_CONNECTED',
      severity:
        'blocker',
      title:
        'No authoritative TypeScript result persistence boundary',
      detail:
        'The new engine produces in-memory outputs and replay models, but no approved idempotent writer persists official classifications, snapshots, or events.',
      requiredEvidence:
        'A reviewed persistence contract, idempotency strategy, transactional writer, and duplicate-run protection.',
    },
    {
      code:
        'STAGING_DUAL_RUN_NOT_COMPLETED',
      severity:
        'blocker',
      title:
        'No staging dual-run comparison',
      detail:
        'The legacy production engine and new deterministic engine have not been executed side by side against the same staging source bundle.',
      requiredEvidence:
        'Stage-by-stage dual-run reports covering classifications, gaps, events, replay, failures, and performance.',
    },
    {
      code:
        'ROLLBACK_NOT_VERIFIED',
      severity:
        'blocker',
      title:
        'Production rollback has not been exercised',
      detail:
        'No verified procedure restores the legacy path after a partial or failed deterministic-engine deployment.',
      requiredEvidence:
        'A tested rollback switch, data compatibility proof, and recovery runbook.',
    },
    {
      code:
        'PRODUCTION_MONITORING_NOT_DEFINED',
      severity:
        'blocker',
      title:
        'Production monitoring and alert thresholds are not defined',
      detail:
        'There is no accepted monitoring contract for run failures, hash divergence, replay validation, runtime duration, duplicate execution, or persistence errors.',
      requiredEvidence:
        'Dashboards, alert thresholds, ownership, and an incident-response runbook.',
    },
    {
      code:
        'HEALTH_CONSUMER_NOT_CONNECTED',
      severity:
        'blocker',
      title:
        'Persistent health outcomes remain a separate consumer',
      detail:
        'The race engine correctly does not write rider_health_cases, but the approved downstream consumer for crash and incident health outcomes is not connected to the new engine output.',
      requiredEvidence:
        'A separate health-workstream integration that consumes deterministic race events without race-engine database writes.',
    },
    {
      code:
        'PRODUCTION_DEPLOYMENT_TEST_NOT_PERFORMED',
      severity:
        'blocker',
      title:
        'Checklist item 21 is not performed',
      detail:
        'No production deployment test has been approved or executed.',
      requiredEvidence:
        'Explicit approval followed by staging, canary, rollback, monitoring, and production verification.',
    },
  ]

  if (!deterministicClosurePassed) {
    blockers.unshift({
      code:
        'DETERMINISTIC_CLOSURE_NOT_PASSED',
      severity:
        'blocker',
      title:
        'Deterministic-engine closure diagnostic has not passed',
      detail:
        'The consolidated runtime and accepted-reference verification must pass before migration planning can advance.',
      requiredEvidence:
        'A complete PASS from /dev/deterministic-engine-closure.',
    })
  }

  const warnings:
    ProductionReadinessFinding[] = [
    {
      code:
        'LIVE_NON_NEUTRAL_EQUIPMENT_NOT_OBSERVED',
      severity:
        'warning',
      title:
        'Live non-neutral equipment condition is not demonstrated',
      detail:
        'The authenticated live equipment transport passed, but all tested historical riders resolved as incomplete source with neutral condition 100.',
      requiredEvidence:
        'A future controlled stage with authoritative six-component equipment assignments and non-neutral condition.',
    },
    {
      code:
        'RIO_STAGE_2_EQUIPMENT_RUN_MISSING',
      severity:
        'warning',
      title:
        'Rio Stage 2 has no equipment simulation-run row',
      detail:
        'The live equipment resolver could not be tested for Rio Stage 2 because race_stage_simulation_runs contains no row for that stage.',
      requiredEvidence:
        'A genuine controlled completed simulation run created by the existing approved execution workstream.',
    },
  ]

  return {
    status:
      'blocked',
    canSwitchProduction:
      false,

    deterministicClosurePassed,

    blockers,
    warnings,

    preservedSafetyBoundaries: [
      {
        code:
          'LEGACY_PRODUCTION_ROUTE_PRESERVED',
        label:
          'Production replay remains on the legacy Supabase implementation.',
        preserved: true,
      },
      {
        code:
          'NO_ENGINE_DATABASE_WRITES',
        label:
          'The TypeScript engine does not persist official results or health cases.',
        preserved: true,
      },
      {
        code:
          'NO_PRODUCTION_FEATURE_FLAG_CHANGE',
        label:
          'No production execution or feature flag is changed by this audit.',
        preserved: true,
      },
      {
        code:
          'NO_HISTORICAL_REWRITE',
        label:
          'No historical race result or replay is rewritten.',
        preserved: true,
      },
      {
        code:
          'LEGACY_FALLBACK_AVAILABLE',
        label:
          'The accepted existing_v1 and legacy replay fallback remain available.',
        preserved: true,
      },
    ],
  }
}
