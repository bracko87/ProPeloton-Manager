/**
 * Phase 11A universal production runner.
 *
 * One stage claim -> one immutable production input -> exactly one runRaceEngine
 * call -> one immutable output snapshot. No official result/resource/health
 * mutation occurs in Phase 11A.
 */
import { createClient } from '@supabase/supabase-js'
import { runRaceEngine } from '../../src/universal-race-engine/runRaceEngine'
import {
  buildProductionUniversalRaceEngineInput,
  type ProductionUniversalRaceSources,
} from '../../src/universal-race-engine/buildProductionRaceInput'
import { buildProductionUniversalRaceOutput } from '../../src/universal-race-engine/buildProductionRaceOutput'

const FUNCTION_CONTRACT = 'phase11a_universal_production_runner_v1'

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

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  return header?.replace(/^Bearer\s+/i, '').trim() || null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function errorPayload(error: unknown): JsonObject {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null }
  }
  return { name: 'UnknownError', message: String(error) }
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
    stagePoints: rows(payload.stage_points) as ProductionUniversalRaceSources['stagePoints'],
    participantTeams: rows(payload.participant_teams) as ProductionUniversalRaceSources['participantTeams'],
    participantRiders: rows(payload.participant_riders) as ProductionUniversalRaceSources['participantRiders'],
    riderInputRows: rows(payload.rider_inputs) as ProductionUniversalRaceSources['riderInputRows'],
    phaseCommandRows: rows(payload.phase_commands) as ProductionUniversalRaceSources['phaseCommandRows'],
    lockedPlanRows: rows(payload.locked_plans ?? payload.stage_plans) as ProductionUniversalRaceSources['lockedPlanRows'],
    preStageLeaders: payload.pre_stage_leaders,
    phase9Payload: firstObject(payload.phase9_inputs) as ProductionUniversalRaceSources['phase9Payload'],
    deterministicSeed: `universal-production:${raceId}:${stageId}:${simulationRunId}`,
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })

  const url = new URL(request.url)
  const body = request.method === 'POST'
    ? await request.json().catch(() => ({})) as JsonObject
    : {}
  const action = String(body.action ?? url.searchParams.get('action') ?? 'health').toLowerCase()

  if (action === 'health') {
    return jsonResponse({
      status: 'ok',
      contract: FUNCTION_CONTRACT,
      mutation_mode: 'verification_only',
      official_outputs_written: false,
      phase11_persistence_applied: false,
    })
  }

  const supabaseUrl = env('SUPABASE_URL')
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (bearerToken(request) !== serviceRoleKey) {
    return jsonResponse({ status: 'forbidden', contract: FUNCTION_CONTRACT }, 403)
  }

  if (action !== 'calculate') {
    return jsonResponse({ status: 'invalid_action', contract: FUNCTION_CONTRACT }, 400)
  }

  const stageId = typeof body.stage_id === 'string' ? body.stage_id.trim() : ''
  if (!stageId) return jsonResponse({ status: 'invalid_request', message: 'stage_id is required.' }, 400)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-PPM-Worker': FUNCTION_CONTRACT } },
  })

  let simulationRunId: string | null = null
  try {
    const { data: claimData, error: claimError } = await supabase.rpc(
      'universal_race_stage_claim_calculation_v1',
      { p_stage_id: stageId },
    )
    if (claimError) throw new Error(`Calculation claim failed: ${claimError.message}`)
    const claim = object(claimData)
    if (claim.status !== 'claimed') return jsonResponse({ contract: FUNCTION_CONTRACT, ...claim })

    simulationRunId = typeof claim.simulation_run_id === 'string' ? claim.simulation_run_id : null
    if (!simulationRunId) throw new Error('Calculation claim did not return simulation_run_id.')

    const sources = buildSources(claim.payload, simulationRunId)
    const input = buildProductionUniversalRaceEngineInput(sources)

    // Exactly one authoritative race calculation for this claimed stage.
    const result = runRaceEngine(input)
    const output = buildProductionUniversalRaceOutput(input, result)

    const [inputHash, outputHash] = await Promise.all([sha256(input), sha256(output)])
    const { data: submitData, error: submitError } = await supabase.rpc(
      'universal_race_stage_submit_calculation_v1',
      {
        p_stage_id: stageId,
        p_simulation_run_id: simulationRunId,
        p_input_snapshot: input,
        // Signature intentionally reused. Phase 11A stores the complete output
        // contract in this existing jsonb argument rather than adding another RPC.
        p_universal_result: output,
      },
    )
    if (submitError) throw new Error(`Calculation submit failed: ${submitError.message}`)

    return jsonResponse({
      status: 'calculated_hidden',
      contract: FUNCTION_CONTRACT,
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
      official_outputs_written: false,
      phase11_persistence_applied: false,
      submit_result: submitData,
    })
  } catch (error) {
    const serialized = errorPayload(error)
    if (simulationRunId) {
      await supabase.rpc('universal_race_stage_fail_calculation_v1', {
        p_stage_id: stageId,
        p_simulation_run_id: simulationRunId,
        p_error_message: String(serialized.message ?? 'Phase 11A calculation failed'),
        p_error_details: serialized,
      }).catch(() => undefined)
    }
    console.error(JSON.stringify({ contract: FUNCTION_CONTRACT, stage_id: stageId, simulation_run_id: simulationRunId, error: serialized }))
    return jsonResponse({ status: 'failed', contract: FUNCTION_CONTRACT, stage_id: stageId, simulation_run_id: simulationRunId, error: serialized }, 500)
  }
}
