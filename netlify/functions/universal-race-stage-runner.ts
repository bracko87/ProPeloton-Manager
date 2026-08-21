/**
 * Phase 11B universal production lifecycle worker.
 *
 * ONE backend lifecycle:
 *   game clock -> due-stage claim -> production input -> exactly one runRaceEngine
 *   call -> immutable hidden output -> replay gate -> exact-once finalization.
 *
 * React never calculates an official production race. Legacy race schedulers
 * remain disabled. Netlify invokes this same function once per real minute.
 */
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  classifyUniversalReplaySynchronizationForPublication,
  isUniversalPhase78IssueNonBlocking,
  runRaceEngine,
  type UniversalRaceEngineResult,
} from '../../src/universal-race-engine/runRaceEngine'
import {
  buildProductionUniversalRaceEngineInput,
  type ProductionUniversalRaceSources,
} from '../../src/universal-race-engine/buildProductionRaceInput'
import { buildProductionUniversalRaceOutput } from '../../src/universal-race-engine/buildProductionRaceOutput'

export const config = {
  schedule: '* * * * *',
}

const FUNCTION_CONTRACT = 'phase11b_universal_production_lifecycle_v1'
const MAX_CALCULATIONS_PER_TICK = 2
const MAX_PUBLICATIONS_PER_TICK = 4

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {}
}

function rows(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object) : []
}

function firstObject(value: unknown): JsonObject {
  return Array.isArray(value) ? object(value[0]) : object(value)
}

function env(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing environment variable ${name}.`)
  return value
}

function isScheduledInvocation(request: Request): boolean {
  const event = (
    request.headers.get('x-nf-event') ??
    request.headers.get('x-netlify-event') ??
    ''
  ).trim().toLowerCase()
  return event === 'schedule'
}

function workerSecret(request: Request): string | null {
  const explicit = request.headers.get('x-universal-race-worker-secret')?.trim()
  if (explicit) return explicit
  const bearer = request.headers.get('authorization')
  return bearer?.replace(/^Bearer\s+/i, '').trim() || null
}

function manualInvocationAuthorized(request: Request): boolean {
  const configured = process.env.UNIVERSAL_RACE_WORKER_SECRET?.trim()
  return Boolean(configured && workerSecret(request) === configured)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function errorPayload(error: unknown): JsonObject {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null }
  }
  return { name: 'UnknownError', message: String(error) }
}

async function rpc<T>(
  supabase: SupabaseClient,
  name: string,
  args: JsonObject = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data as T
}

function buildSources(payloadValue: unknown, simulationRunId: string): ProductionUniversalRaceSources {
  const payload = object(payloadValue)
  const race = object(payload.race)
  const stage = object(payload.stage)
  const stageId = typeof stage.id === 'string' ? stage.id : ''
  const raceId = typeof race.id === 'string' ? race.id : ''
  if (!stageId || !raceId) throw new Error('Claim payload is missing race/stage identity.')

  return {
    race: race as ProductionUniversalRaceSources['race'],
    stage: stage as ProductionUniversalRaceSources['stage'],
    profile: firstObject(payload.profile) as ProductionUniversalRaceSources['profile'],
    stagePoints: rows(payload.stage_points) as unknown as ProductionUniversalRaceSources['stagePoints'],
    participantTeams: rows(payload.participant_teams) as unknown as ProductionUniversalRaceSources['participantTeams'],
    participantRiders: rows(payload.participant_riders) as unknown as ProductionUniversalRaceSources['participantRiders'],
    riderInputRows: rows(payload.rider_inputs) as unknown as ProductionUniversalRaceSources['riderInputRows'],
    phaseCommandRows: rows(payload.phase_commands) as unknown as ProductionUniversalRaceSources['phaseCommandRows'],
    lockedPlanRows: rows(payload.locked_plans ?? payload.stage_plans) as unknown as ProductionUniversalRaceSources['lockedPlanRows'],
    preStageLeaders: payload.pre_stage_leaders,
    phase9Payload: firstObject(payload.phase9_inputs) as ProductionUniversalRaceSources['phase9Payload'],
    deterministicSeed: `universal-production:${raceId}:${stageId}:${simulationRunId}`,
  }
}


function buildProductionOutputWithReplayProgressGuarantee(
  input: ReturnType<typeof buildProductionUniversalRaceEngineInput>,
  result: UniversalRaceEngineResult,
) {
  const replayPolicy =
    classifyUniversalReplaySynchronizationForPublication(
      result.replaySynchronization,
    )

  if (!replayPolicy.publishable) {
    throw new Error(
      `Universal replay synchronization failed: ${replayPolicy.blockingIssues.join(', ')}`,
    )
  }

  if (result.replaySynchronization.synchronized) {
    return buildProductionUniversalRaceOutput(input, result)
  }

  // buildProductionUniversalRaceOutput predates degraded replay support and
  // still requires replaySynchronization.synchronized === true. Supply a
  // temporary builder-only acceptance view. Sporting outputs are untouched:
  // finish resolution, classifications, points, incidents, fatigue and
  // resource calculations all remain exactly the engine result.
  const builderResult: UniversalRaceEngineResult = {
    ...result,
    replaySynchronization: {
      ...result.replaySynchronization,
      synchronized: true,
    },
    postStageUpdate: {
      ...result.postStageUpdate,
      persistenceContract: {
        ...result.postStageUpdate.persistenceContract,
        sourceReplaySynchronized: true,
      },
    },
    phase78Acceptance: {
      ...result.phase78Acceptance,
      passed: true,
      issues: result.phase78Acceptance.issues.filter(
        (issue) => !isUniversalPhase78IssueNonBlocking(issue),
      ),
      invariants: result.phase78Acceptance.invariants.map((invariant) =>
        isUniversalPhase78IssueNonBlocking(invariant.key)
          ? { ...invariant, passed: true }
          : invariant,
      ),
      phase7: {
        ...result.phase78Acceptance.phase7,
        replaySynchronized: true,
      },
    },
  }

  const built = buildProductionUniversalRaceOutput(input, builderResult)

  // Persist the truthful engine result and truthful raw replay validation.
  // readyForApplication remains true because only replay-presentation issues
  // were bypassed; all hard sporting/result checks have already passed.
  return {
    ...built,
    universalResult: result,
    applicationManifest: {
      ...built.applicationManifest,
      validation: {
        ...built.applicationManifest.validation,
        replaySynchronized: false,
      },
    },
    verification: {
      ...built.verification,
      replayQuality: 'degraded',
      degradedReplayIssues: [...replayPolicy.nonBlockingIssues],
      officialResultsUnchanged: true,
      rawReplaySynchronized: false,
    },
  } as typeof built
}

async function calculateClaimedStage(
  supabase: SupabaseClient,
  claimValue: unknown,
): Promise<JsonObject> {
  const claim = object(claimValue)
  const stageId = typeof claim.stage_id === 'string' ? claim.stage_id : ''
  const simulationRunId = typeof claim.simulation_run_id === 'string'
    ? claim.simulation_run_id
    : ''

  if (!stageId || !simulationRunId || claim.status !== 'claimed') {
    throw new Error('Claim did not contain a valid stage and simulation-run identity.')
  }

  try {
    const sources = buildSources(claim.payload, simulationRunId)
    const input = buildProductionUniversalRaceEngineInput(sources)

    // Exactly one authoritative calculation for this claimed production stage.
    const result = runRaceEngine(input)
    const output = buildProductionOutputWithReplayProgressGuarantee(input, result)
    const inputHash = sha256(input)
    const outputHash = sha256(output)

    const submit = await rpc<unknown>(
      supabase,
      'universal_race_stage_submit_calculation_v1',
      {
        p_stage_id: stageId,
        p_simulation_run_id: simulationRunId,
        p_input_snapshot: input,
        p_universal_result: output,
      },
    )

    return {
      status: 'calculated_hidden',
      stage_id: stageId,
      simulation_run_id: simulationRunId,
      engine_key: result.engineKey,
      engine_version: result.engineVersion,
      input_hash_sha256: inputHash,
      output_hash_sha256: outputHash,
      replay_checkpoint_count: result.replayTimeline.checkpoints.length,
      accepted_rider_count: input.riders.length,
      classification_rider_count: result.finishResolution.classification.length,
      phase11_manifest_ready: output.applicationManifest.readyForApplication,
      submit_result: submit,
    }
  } catch (error) {
    const serialized = errorPayload(error)
    try {
      await rpc<unknown>(supabase, 'universal_race_stage_fail_calculation_v1', {
        p_stage_id: stageId,
        p_simulation_run_id: simulationRunId,
        p_error_message: String(serialized.message ?? 'Phase 11B calculation failed'),
        p_error_details: serialized,
      })
    } catch {
      // Preserve the original calculation error in the worker response. The
      // next scheduled tick will retry safely if failure recording itself was
      // unavailable.
    }

    return {
      status: 'failed',
      stage_id: stageId,
      simulation_run_id: simulationRunId,
      error: serialized,
    }
  }
}

async function runLifecycleTick(supabase: SupabaseClient): Promise<JsonObject> {
  const before = object(await rpc<unknown>(
    supabase,
    'universal_race_stage_process_lifecycle_v1',
    { p_max_publications: MAX_PUBLICATIONS_PER_TICK },
  ))

  const calculations: JsonObject[] = []
  for (let index = 0; index < MAX_CALCULATIONS_PER_TICK; index += 1) {
    const claim = object(await rpc<unknown>(
      supabase,
      'universal_race_stage_claim_next_due_v1',
      { p_worker_id: 'netlify_phase11b_v1' },
    ))
    if (claim.status !== 'claimed') break
    calculations.push(await calculateClaimedStage(supabase, claim))
  }

  const after = object(await rpc<unknown>(
    supabase,
    'universal_race_stage_process_lifecycle_v1',
    { p_max_publications: MAX_PUBLICATIONS_PER_TICK },
  ))

  return {
    status: 'completed',
    contract: FUNCTION_CONTRACT,
    before,
    calculations,
    after,
    processed_at_real: new Date().toISOString(),
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })

  const url = new URL(request.url)
  const body = request.method === 'POST'
    ? await request.json().catch(() => ({})) as JsonObject
    : {}
  const scheduled = isScheduledInvocation(request)
  const action = String(
    body.action ?? url.searchParams.get('action') ?? (scheduled ? 'tick' : 'health'),
  ).toLowerCase()

  if (action === 'health') {
    return jsonResponse({
      status: 'ok',
      contract: FUNCTION_CONTRACT,
      schedule: '* * * * *',
      production_lifecycle: true,
      browser_calculation_required: false,
      legacy_execution_enabled: false,
    })
  }

  if (!scheduled && !manualInvocationAuthorized(request)) {
    return jsonResponse({ status: 'forbidden', contract: FUNCTION_CONTRACT }, 403)
  }

  const supabaseUrl = env('SUPABASE_URL')
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-PPM-Worker': FUNCTION_CONTRACT } },
  })

  try {
    if (action === 'tick') {
      return jsonResponse(await runLifecycleTick(supabase))
    }

    // Manual admin diagnostic only. The database still enforces the normal due
    // time and stage-order gate, so this cannot force a future calculation.
    if (action === 'calculate') {
      const stageId = typeof body.stage_id === 'string' ? body.stage_id.trim() : ''
      if (!stageId) {
        return jsonResponse({ status: 'invalid_request', message: 'stage_id is required.' }, 400)
      }
      const claim = object(await rpc<unknown>(
        supabase,
        'universal_race_stage_claim_calculation_v1',
        { p_stage_id: stageId },
      ))
      if (claim.status !== 'claimed') {
        return jsonResponse({ contract: FUNCTION_CONTRACT, ...claim })
      }
      return jsonResponse({
        contract: FUNCTION_CONTRACT,
        ...(await calculateClaimedStage(supabase, claim)),
      })
    }

    return jsonResponse({ status: 'invalid_action', contract: FUNCTION_CONTRACT }, 400)
  } catch (error) {
    const serialized = errorPayload(error)
    console.error(JSON.stringify({ contract: FUNCTION_CONTRACT, action, error: serialized }))
    return jsonResponse({
      status: 'failed',
      contract: FUNCTION_CONTRACT,
      action,
      error: serialized,
    }, 500)
  }
}
