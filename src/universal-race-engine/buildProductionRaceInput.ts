/**
 * Phase 11A production input adapter.
 *
 * Pure adapter only: no RPCs, no database writes, no race calculation.
 * It converts production rows already loaded by the application/Edge Function
 * into the single UniversalRaceEngineInput consumed by runRaceEngine().
 */
import {
  AVAILABILITY_STATUSES,
  PPM_UNIVERSAL_RACE_ENGINE_KEY,
  PPM_UNIVERSAL_RACE_ENGINE_VERSION,
  RIDER_STAGE_ROLES,
  ROAD_PHASE_1_TO_3_COMMANDS,
  ROAD_PHASE_4_COMMANDS,
  ROAD_TEAM_TACTICS,
  type AvailabilityStatus,
  type FinishType,
  type JsonRecord,
  type RiderStageRole,
  type RoadPhase1To3Command,
  type RoadPhase4Command,
  type StageFormat,
  type TerrainType,
  type UniversalPreparationInput,
  type UniversalPreStageLeadersInput,
  type UniversalRaceEngineInput,
} from './runRaceEngine.ts'

type Row = Record<string, unknown>

export interface ProductionRaceRow extends Row {
  id: string
}

export interface ProductionStageRow extends Row {
  id: string
  race_id: string
}

export interface ProductionProfilePayload extends Row {}
export interface ProductionStagePointRow extends Row {}
export interface ProductionStageRiderInputRow extends Row {
  rider_id: string
  team_id: string
}
export interface ProductionStagePhaseCommandRow extends Row {
  rider_id: string
  team_id: string
}
export interface ProductionParticipantTeamRow extends Row {
  race_id?: string
  team_id?: string
  club_id?: string
  status?: string
}
export interface ProductionParticipantRiderRow extends Row {
  race_id?: string
  rider_id: string
  team_id: string
}
export interface ProductionLockedStagePlanRow extends Row {
  team_id?: string
  club_id?: string
  participating_club_id?: string
}

export interface ProductionPhase9Payload extends Row {
  riderModifiers?: readonly Row[]
  rider_modifiers?: readonly Row[]
  preparation?: UniversalPreparationInput | Row
  diagnostics?: Row
  modelVersion?: string | null
  model_version?: string | null
  source?: string | null
}

export interface ProductionUniversalRaceSources {
  readonly race: ProductionRaceRow
  readonly stage: ProductionStageRow
  readonly profile: ProductionProfilePayload
  readonly stagePoints: readonly ProductionStagePointRow[]
  readonly participantTeams: readonly ProductionParticipantTeamRow[]
  readonly participantRiders: readonly ProductionParticipantRiderRow[]
  readonly riderInputRows: readonly ProductionStageRiderInputRow[]
  readonly phaseCommandRows: readonly ProductionStagePhaseCommandRow[]
  readonly lockedPlanRows: readonly ProductionLockedStagePlanRow[]
  readonly preStageLeaders?: unknown
  readonly phase9Payload?: ProductionPhase9Payload | null
  readonly deterministicSeed: string
}

const availabilitySet = new Set<string>(AVAILABILITY_STATUSES)
const roleSet = new Set<string>(RIDER_STAGE_ROLES)
const phase1To3Set = new Set<string>(ROAD_PHASE_1_TO_3_COMMANDS)
const phase4Set = new Set<string>(ROAD_PHASE_4_COMMANDS)
const teamTacticSet = new Set<string>(ROAD_TEAM_TACTICS)

function object(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : {}
}

function array(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(object) : []
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function optionalNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function integerValue(value: unknown, fallback = 0): number {
  return Math.trunc(numberValue(value, fallback))
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase())
  }
  return false
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function percent(value: unknown, fallback = 50): number {
  return clamp(numberValue(value, fallback), 0, 100)
}

function numericArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map(Number)
      .filter((entry) => Number.isFinite(entry) && entry >= 0)
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return numericArray(JSON.parse(value))
    } catch {
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed >= 0 ? [parsed] : []
    }
  }
  return []
}

function nestedNumber(
  sources: readonly unknown[],
  keys: readonly string[],
  fallback: number,
): number {
  for (const source of sources) {
    const row = object(source)
    for (const key of keys) {
      const parsed = Number(row[key])
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return fallback
}

function normalizeStageFormat(stage: Row): StageFormat {
  const raw = `${text(stage.stage_format) ?? ''} ${text(stage.terrain_type) ?? ''}`
    .trim()
    .toLowerCase()
  if (raw.includes('team_time_trial')) return 'team_time_trial'
  if (raw.includes('pair_time_trial')) return 'pair_time_trial'
  if (raw.includes('individual_time_trial') || raw === 'time_trial') {
    return 'individual_time_trial'
  }
  if (raw.includes('prologue')) return 'prologue'
  return 'road_race'
}

function normalizeTerrainType(
  stage: Row,
  profile: Row,
  stageFormat: StageFormat,
): TerrainType {
  if (stageFormat === 'individual_time_trial') return 'individual_time_trial'
  if (stageFormat === 'team_time_trial' || stageFormat === 'pair_time_trial') {
    return 'team_time_trial'
  }
  if (stageFormat === 'prologue') return 'prologue'
  const raw = (text(profile.terrain_type) ?? text(stage.terrain_type) ?? 'flat').toLowerCase()
  if (raw.includes('mountain')) return 'mountain'
  if (raw.includes('hill')) return 'hilly'
  if (raw.includes('cobbl')) return 'cobbled'
  return 'flat'
}

function normalizeFinishType(
  stage: Row,
  profile: Row,
  stageFormat: StageFormat,
  terrainType: TerrainType,
): FinishType {
  if (stageFormat === 'individual_time_trial') return 'time_trial_finish'
  if (stageFormat === 'team_time_trial' || stageFormat === 'pair_time_trial') {
    return 'team_time_trial_finish'
  }
  if (stageFormat === 'prologue') return 'prologue_finish'
  const hint = `${text(stage.finish_type) ?? ''} ${text(profile.profile_type) ?? text(stage.profile_type) ?? ''}`.toLowerCase()
  if (booleanValue(stage.is_summit_finish) || hint.includes('summit')) return 'summit_finish'
  if (hint.includes('uphill')) return 'uphill_finish'
  if (terrainType === 'cobbled' || hint.includes('cobbl')) return 'cobbled_finish'
  return 'flat_finish'
}

function normalizeSprintZoneKm(
  stage: Row,
  stageFormat: StageFormat,
  finishType: FinishType,
): number {
  if (stageFormat !== 'road_race' || finishType !== 'flat_finish') return 0
  const rules = object(stage.rules_snapshot)
  const metadata = object(stage.metadata)
  const configured =
    rules.sprint_zone_km ?? rules.sprintZoneKm ??
    metadata.sprint_zone_km ?? metadata.sprintZoneKm
  if (configured === null || configured === undefined || configured === '') return 3
  return clamp(numberValue(configured, 3), 0, 5)
}

function buildTerrainPercentages(stage: Row, profile: Row, terrainType: TerrainType) {
  const split = object(profile.terrain_split)
  const raw = {
    flat: Math.max(0, numberValue(split.flat ?? stage.flat_pct, 0)),
    hilly: Math.max(0, numberValue(split.hilly ?? stage.hilly_pct, 0)),
    mountain: Math.max(0, numberValue(split.mountain ?? stage.mountain_pct, 0)),
    cobbled: Math.max(0, numberValue(split.cobbled ?? stage.cobbled_pct, 0)),
  }
  let total = raw.flat + raw.hilly + raw.mountain + raw.cobbled
  if (total <= 0) {
    raw.flat = terrainType === 'flat' ? 100 : 0
    raw.hilly = terrainType === 'hilly' ? 100 : 0
    raw.mountain = terrainType === 'mountain' ? 100 : 0
    raw.cobbled = terrainType === 'cobbled' ? 100 : 0
    total = 100
  }
  const normalized = {
    flat: Number(((raw.flat / total) * 100).toFixed(6)),
    hilly: Number(((raw.hilly / total) * 100).toFixed(6)),
    mountain: Number(((raw.mountain / total) * 100).toFixed(6)),
    cobbled: Number(((raw.cobbled / total) * 100).toFixed(6)),
  }
  const normalizedTotal = normalized.flat + normalized.hilly + normalized.mountain + normalized.cobbled
  normalized.flat = Number((normalized.flat + (100 - normalizedTotal)).toFixed(6))
  return normalized
}

function buildProfilePoints(profile: Row, distanceKm: number) {
  const source = array(profile.profile_points)
  const byKm = new Map<number, { km: number; elevationM: number }>()
  source.forEach((point) => {
    const km = clamp(numberValue(point.km, 0), 0, distanceKm)
    byKm.set(km, {
      km,
      elevationM: numberValue(point.elevation_m ?? point.elevationM ?? point.elevation, 0),
    })
  })
  const points = [...byKm.values()].sort((a, b) => a.km - b.km)
  const firstElevation = points[0]?.elevationM ?? 0
  const lastElevation = points[points.length - 1]?.elevationM ?? firstElevation
  if (points[0]?.km !== 0) points.unshift({ km: 0, elevationM: firstElevation })
  if (points[points.length - 1]?.km !== distanceKm) points.push({ km: distanceKm, elevationM: lastElevation })
  return points.length >= 2
    ? points
    : [{ km: 0, elevationM: 0 }, { km: distanceKm, elevationM: 0 }]
}

function normalizePointType(value: unknown): 'START' | 'INTERMEDIATE_SPRINT' | 'KOM' | 'BONUS_SPRINT' | 'FINISH' | null {
  const raw = String(value ?? '').trim().toUpperCase()
  if (['START', 'INTERMEDIATE_SPRINT', 'KOM', 'BONUS_SPRINT', 'FINISH'].includes(raw)) {
    return raw as 'START' | 'INTERMEDIATE_SPRINT' | 'KOM' | 'BONUS_SPRINT' | 'FINISH'
  }
  if (['SPRINT', 'INTERMEDIATE', 'INTERMEDIATE SPRINT'].includes(raw)) return 'INTERMEDIATE_SPRINT'
  if (['BONUS', 'BONUS SPRINT'].includes(raw)) return 'BONUS_SPRINT'
  if (['CLIMB', 'MOUNTAIN_CLIMB', 'MOUNTAIN CLIMB'].includes(raw)) return 'KOM'
  return null
}

function normalizeKomCategory(value: unknown): 'HC' | '1' | '2' | '3' | '4' {
  const raw = String(value ?? '').trim().toUpperCase().replace(/^CAT(?:EGORY)?\s*/i, '')
  return ['HC', '1', '2', '3', '4'].includes(raw) ? raw as 'HC' | '1' | '2' | '3' | '4' : '4'
}

function buildStagePoints(stageId: string, distanceKm: number, rows: readonly Row[]) {
  return rows
    .map((row, index) => {
      const pointType = normalizePointType(row.point_type)
      if (!pointType) return null
      const isFinish = booleanValue(row.is_finish_point) || pointType === 'FINISH'
      return {
        pointId: text(row.id) ?? `${stageId}:${pointType.toLowerCase()}:${index}`,
        stageId,
        pointType,
        kmFromStart: clamp(numberValue(row.km_from_start, isFinish ? distanceKm : 0), 0, distanceKm),
        name: text(row.name),
        komCategory: pointType === 'KOM' ? normalizeKomCategory(row.kom_category) : null,
        pointsScheme: numericArray(row.points_scheme),
        timeBonusSeconds: numericArray(row.time_bonus_seconds),
        isFinishPoint: isFinish,
        sortOrder: integerValue(row.sort_order, index),
        metadata: object(row.metadata) as JsonRecord,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.kmFromStart - b.kmFromStart || a.sortOrder - b.sortOrder || a.pointId.localeCompare(b.pointId))
    .map((row, index) => ({ ...row, sortOrder: index }))
}

function normalizeAvailability(value: unknown): AvailabilityStatus {
  const raw = String(value ?? '').trim().toLowerCase()
  return availabilitySet.has(raw) ? raw as AvailabilityStatus : 'fit'
}

function normalizeRole(value: unknown): RiderStageRole {
  const raw = String(value ?? '').trim().toLowerCase()
  const aliases: Record<string, string> = {
    leader: 'team_leader_gc', team_leader: 'team_leader_gc', gc_leader: 'team_leader_gc',
    protected: 'protected_rider', leadout: 'lead_out_rider', lead_out: 'lead_out_rider',
    domestique: 'helper_domestique', helper: 'helper_domestique', mountain_helper: 'mountain_domestique',
    breakaway: 'breakaway_rider', chaser: 'breakaway_chaser', road_captain: 'free_role',
  }
  const normalized = aliases[raw] ?? raw
  return roleSet.has(normalized) ? normalized as RiderStageRole : 'free_role'
}

function normalizePhase1To3Command(value: unknown): RoadPhase1To3Command {
  const raw = String(value ?? '').trim().toLowerCase()
  const aliases: Record<string, string> = {
    balanced: 'follow_team_plan', normal: 'follow_team_plan', safe: 'avoid_risks', defensive: 'avoid_risks',
    control: 'control_race', chase_breakaways: 'chase_breakaway', go_for_kom: 'fight_kom_points', go_for_sprint: 'fight_sprint_points',
  }
  const normalized = aliases[raw] ?? raw
  return phase1To3Set.has(normalized) ? normalized as RoadPhase1To3Command : 'follow_team_plan'
}

function normalizePhase4Command(value: unknown): RoadPhase4Command {
  const raw = String(value ?? '').trim().toLowerCase()
  const aliases: Record<string, string> = {
    balanced: 'follow_team_plan', normal: 'follow_team_plan', safe: 'avoid_risks', defensive: 'avoid_risks',
    go_for_kom: 'fight_kom_points', go_for_sprint: 'fight_sprint_points', sprint_for_stage: 'final_sprint', leadout: 'lead_out_rider',
  }
  const normalized = aliases[raw] ?? raw
  return phase4Set.has(normalized) ? normalized as RoadPhase4Command : 'follow_team_plan'
}

function normalizeTeamTactic(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase()
  const aliases: Record<string, string> = { defensive: 'balanced', conservative: 'balanced', protect_gc: 'gc_protection', stage_win: 'aggressive' }
  const normalized = aliases[raw] ?? raw
  return teamTacticSet.has(normalized) ? normalized : 'balanced'
}

function phase9Rows(payload: ProductionPhase9Payload | null | undefined): Row[] {
  if (!payload) return []
  return array(payload.riderModifiers ?? payload.rider_modifiers)
}

function phase9Preparation(payload: ProductionPhase9Payload | null | undefined): UniversalPreparationInput {
  const prep = object(payload?.preparation)
  return {
    equipment: object(prep.equipment),
    staff: object(prep.staff),
    assets: object(prep.assets),
    raceSupplies: object(prep.raceSupplies ?? prep.race_supplies),
    standardizedBonuses: {
      ...object(prep.standardizedBonuses ?? prep.standardized_bonuses),
      productionDiagnostics: object(payload?.diagnostics),
      productionSource: text(payload?.source) ?? 'race_engine_get_stage_phase9_inputs_v1',
      productionModelVersion: text(payload?.modelVersion ?? payload?.model_version),
    },
  }
}

function normalizePreStageLeaders(value: unknown): UniversalPreStageLeadersInput | null {
  const root = Array.isArray(value) ? object(value[0]) : object(value)
  if (Object.keys(root).length === 0) return null
  const result: { hasEstablishedLeaders: boolean; general?: UniversalPreStageLeadersInput['general']; points?: UniversalPreStageLeadersInput['points']; mountain?: UniversalPreStageLeadersInput['mountain'] } = {
    hasEstablishedLeaders: booleanValue(root.hasEstablishedLeaders ?? root.has_established_leaders),
  }
  for (const classificationType of ['general', 'points', 'mountain'] as const) {
    const nested = object(root[classificationType])
    const riderId = text(nested.riderId ?? nested.rider_id ?? root[`${classificationType}_rider_id`])
    const teamId = text(nested.teamId ?? nested.team_id ?? root[`${classificationType}_team_id`])
    if (riderId && teamId) {
      result[classificationType] = { classificationType, riderId, teamId, rank: 1 }
      result.hasEstablishedLeaders = true
    }
  }
  return result as UniversalPreStageLeadersInput
}

function teamIdFromParticipant(row: Row): string | null {
  return text(row.team_id ?? row.club_id ?? row.participating_club_id)
}

export function buildProductionUniversalRaceEngineInput(
  sources: ProductionUniversalRaceSources,
): UniversalRaceEngineInput {
  const race = object(sources.race)
  const stage = object(sources.stage)
  const profile = object(sources.profile)
  const raceId = text(race.id)
  const stageId = text(stage.id)
  if (!raceId || !stageId || text(stage.race_id) !== raceId) {
    throw new Error('Production race/stage identity is missing or inconsistent.')
  }
  if (!text(sources.deterministicSeed)) throw new Error('Production deterministic seed is required.')

  const acceptedTeams = sources.participantTeams.filter((row) => {
    const status = text(row.status)?.toLowerCase()
    return !status || status === 'accepted'
  })
  const acceptedTeamIds = new Set(acceptedTeams.map(teamIdFromParticipant).filter((id): id is string => Boolean(id)))
  const participantRiders = sources.participantRiders.filter((row) => acceptedTeamIds.size === 0 || acceptedTeamIds.has(text(row.team_id) ?? ''))
  const participantByRiderId = new Map(participantRiders.map((row) => [row.rider_id, row] as const))
  const riderRows = sources.riderInputRows.filter((row) => text(row.rider_id) && text(row.team_id) && (acceptedTeamIds.size === 0 || acceptedTeamIds.has(row.team_id)))
  if (riderRows.length < 2) throw new Error(`Stage ${stageId} has fewer than two accepted production rider inputs.`)

  const acceptedRiderIds = new Set(participantRiders.map((row) => row.rider_id))
  if (acceptedRiderIds.size > 0) {
    const missing = [...acceptedRiderIds].filter((id) => !riderRows.some((row) => row.rider_id === id))
    if (missing.length > 0) throw new Error(`Production rider-input coverage is incomplete (${riderRows.length}/${acceptedRiderIds.size}).`)
  }

  const commandByRider = new Map(sources.phaseCommandRows.map((row) => [row.rider_id, row] as const))
  const modifierByRider = new Map(phase9Rows(sources.phase9Payload).map((row) => [text(row.rider_id) ?? '', row] as const))
  const planByTeam = new Map(sources.lockedPlanRows.map((row) => [text(row.team_id ?? row.club_id ?? row.participating_club_id) ?? '', row] as const))
  const rowsByTeam = new Map<string, ProductionStageRiderInputRow[]>()
  riderRows.forEach((row) => rowsByTeam.set(row.team_id, [...(rowsByTeam.get(row.team_id) ?? []), row]))

  const teamParticipantById = new Map(acceptedTeams.map((row) => [teamIdFromParticipant(row) ?? '', row] as const))
  const teams: UniversalRaceEngineInput['teams'][number][] = [...rowsByTeam.entries()].map(([teamId, rows]) => {
    const participant = teamParticipantById.get(teamId) ?? {}
    const first = rows[0] ?? ({} as ProductionStageRiderInputRow)
    return {
      participantTeamId: text(participant.id) ?? `${raceId}:${teamId}`,
      teamId,
      clubId: text(participant.club_id) ?? teamId,
      participatingClubId: text(participant.participating_club_id) ?? text(participant.club_id) ?? teamId,
      ownerClubId: text(participant.owner_club_id),
      parentClubId: text(participant.parent_club_id),
      raceTeamEntryId: text(participant.race_team_entry_id),
      clubType: text(participant.club_type),
      acceptedRiderIds: rows.map((row) => row.rider_id),
      snapshot: {
        teamName: text(first.team_name ?? participant.team_name_snapshot ?? participant.team_name ?? participant.name),
        countryCode: text(participant.country_code ?? participant.country_code_snapshot),
        clubTier: text(participant.club_tier),
        worldTier: text(participant.world_tier),
        logoUrl: text(participant.logo_url_snapshot ?? participant.logo_url),
        jerseyUrl: text(participant.jersey_url_snapshot ?? participant.jersey_url),
        metadata: { source: 'accepted_production_participant_team' },
      },
    }
  })

  const riders: UniversalRaceEngineInput['riders'][number][] = riderRows.map((row) => {
    const participant = participantByRiderId.get(row.rider_id) ?? ({} as ProductionParticipantRiderRow)
    const modifier = modifierByRider.get(row.rider_id)
    const snapshots = [row.bonus_snapshot_json, row.rider_stage_snapshot_json, row.rider_snapshot_json, row.availability_snapshot_json]
    const fatigueBeforeStage = percent(row.fatigue_before_stage ?? row.fatigue, 0)
    const availabilityStatus = normalizeAvailability(row.availability_status)
    const preparationApplied = modifier ? modifier.preparation_applied !== false : false
    const hasEquipment = modifier ? Object.keys(object(modifier.equipment_selection)).length > 0 : false
    const hasPhase9 = Boolean(modifier && (preparationApplied || hasEquipment || Math.abs(numberValue(modifier.equipment_engine_stage_bonus_pct ?? modifier.equipment_performance_bonus_points, 0)) > 0))
    return {
      participantRiderId: text(participant.id) ?? `${raceId}:${row.rider_id}`,
      riderId: row.rider_id,
      teamId: row.team_id,
      participatingClubId: text(participant.participating_club_id) ?? text(participant.club_id) ?? row.team_id,
      sprint: percent(row.sprint), climbing: percent(row.climbing), timeTrial: percent(row.time_trial), flat: percent(row.flat),
      endurance: percent(row.endurance), recovery: percent(row.recovery), resistance: percent(row.resistance), raceIQ: percent(row.race_iq),
      teamwork: percent(row.teamwork), overall: percent(row.overall), morale: percent(row.morale),
      fatigueBeforeStage,
      raceSharpness: percent(nestedNumber(snapshots, ['race_sharpness', 'raceSharpness'], 50)),
      startStamina: percent(row.start_stamina, clamp(100 - fatigueBeforeStage * 0.45, 1, 100)),
      recentFormScore: clamp(nestedNumber(snapshots, ['recent_form_score', 'recentFormScore', 'form_score'], 0), -15, 30),
      seasonResultPoints: Math.max(0, nestedNumber(snapshots, ['season_result_points', 'seasonResultPoints', 'ranking_points'], 0)),
      roleSnapshot: text(participant.role_snapshot ?? row.role_code),
      availabilityStatus,
      unavailableUntil: text(row.unavailable_until),
      unavailableReason: text(row.unavailable_reason),
      startStatus: availabilityStatus === 'injured' || availabilityStatus === 'sick' ? 'dns' : 'starter',
      healthSnapshot: Object.keys(object(row.availability_snapshot_json)).length > 0 ? object(row.availability_snapshot_json) : object(row.rider_snapshot_json),
      healthCase: null,
      previousStage: null,
      preparationModifiers: hasPhase9 && modifier ? {
        inStageEnergyCostMultiplier: clamp(preparationApplied ? numberValue(modifier.in_stage_energy_cost_multiplier, 1) : 1, 0.75, 1.35),
        postStageFatigueMultiplier: clamp((preparationApplied ? numberValue(modifier.post_stage_fatigue_multiplier, 1) : 1) * (1 - clamp(numberValue(modifier.equipment_fatigue_reduction_pct, 0), 0, 10) / 100), 0.7, 1.4),
        postStageRecoveryBonusPoints: clamp(preparationApplied ? numberValue(modifier.post_stage_recovery_bonus_points, 0) : 0, 0, 4),
        performanceBonusPoints: 0,
        equipmentStagePerformancePct: clamp(numberValue(modifier.equipment_engine_stage_bonus_pct ?? modifier.equipment_performance_bonus_points, 0), -20, 20),
        supplyStagePerformancePct: clamp(numberValue(modifier.supply_stage_performance_pct, 0), -20, 20),
        incidentRiskMultiplier: clamp(preparationApplied ? numberValue(modifier.health_incident_risk_multiplier, 1) : 1, 0.7, 1.4),
        healthIncidentRiskMultiplier: clamp(preparationApplied ? numberValue(modifier.health_incident_risk_multiplier, 1) : 1, 0.25, 1.5),
        mechanicalIncidentRiskMultiplier: clamp(numberValue(modifier.mechanical_incident_risk_multiplier, 1), 0.78, 1.5),
        mechanicalTimeLossMultiplier: clamp(numberValue(modifier.mechanical_time_loss_multiplier, 1), 0.82, 1),
        equipmentConditionPercent: clamp(numberValue(modifier.equipment_condition_factor, 1) * 100, 0, 100),
      } : null,
      snapshot: {
        displayName: text(row.rider_name ?? participant.display_name ?? participant.rider_name_snapshot) ?? row.rider_id,
        firstName: text(participant.first_name), lastName: text(participant.last_name),
        countryCode: text(participant.country_code ?? participant.country_code_snapshot),
        startNumber: optionalNumber(participant.display_start_number ?? participant.start_number),
        metadata: { source: 'race_engine_get_stage_rider_inputs_v1', phase9ProductionModel: text(sources.phase9Payload?.modelVersion ?? sources.phase9Payload?.model_version) },
      },
    }
  })

  const stagePlans: UniversalRaceEngineInput['stagePlans'][number][] = [...rowsByTeam.entries()].map(([teamId, rows]) => {
    const plan = planByTeam.get(teamId) ?? {}
    const commands = rows.map((row) => commandByRider.get(row.rider_id)).filter(Boolean) as ProductionStagePhaseCommandRow[]
    return {
      teamId,
      teamTactic: normalizeTeamTactic(commands[0]?.team_plan ?? object(plan.team_tactic_json).plan ?? plan.team_strategy),
      status: 'locked', locked: true, defaulted: Object.keys(plan).length === 0,
      riders: rows.map((row) => {
        const command = commandByRider.get(row.rider_id)
        const modifier = modifierByRider.get(row.rider_id)
        return {
          riderId: row.rider_id,
          stageRole: normalizeRole(command?.role_code ?? row.stage_role ?? row.role_code),
          commands: {
            phase1: normalizePhase1To3Command(command?.phase_1_command),
            phase2: normalizePhase1To3Command(command?.phase_2_command),
            phase3: normalizePhase1To3Command(command?.phase_3_command),
            phase4: normalizePhase4Command(command?.phase_4_command),
          },
          equipmentSelection: Object.keys(object(modifier?.equipment_selection)).length > 0 ? object(modifier?.equipment_selection) : null,
          supplySelection: Object.keys(object(modifier?.supply_selection)).length > 0 ? object(modifier?.supply_selection) : null,
        }
      }),
      metadata: { source: 'locked_stage_plan_and_phase_command_adapters', raceStagePlanId: text(plan.id), immutableSnapshotHash: text(object(plan.engine_stage_payload_json).immutable_snapshot_hash ?? object(plan.engine_stage_payload_json).snapshot_hash) },
    }
  })

  const distanceKm = Math.max(1, numberValue(profile.distance_km ?? stage.distance_km, 1))
  const stageFormat = normalizeStageFormat(stage)
  const terrainType = normalizeTerrainType(stage, profile, stageFormat)
  const finishType = normalizeFinishType(stage, profile, stageFormat, terrainType)
  const weather = object(profile.stage_weather ?? profile.weather_snapshot ?? stage.weather_snapshot)

  return {
    engine: { engineKey: PPM_UNIVERSAL_RACE_ENGINE_KEY, engineVersion: PPM_UNIVERSAL_RACE_ENGINE_VERSION, deterministicSeed: sources.deterministicSeed },
    race: { raceId, raceType: booleanValue(race.is_stage_race) || text(race.race_type)?.toLowerCase() === 'stage_race' ? 'stage_race' : 'one_day', stageCount: Math.max(1, integerValue(race.stage_count, 1)) },
    stage: {
      raceId, stageId, stageNumber: Math.max(1, integerValue(stage.stage_number, 1)), stageFormat, terrainType,
      profileType: text(profile.profile_type) ?? text(stage.profile_type), finishType,
      sprintZoneKm: normalizeSprintZoneKm(stage, stageFormat, finishType),
      distanceKm, elevationGainM: Math.max(0, numberValue(profile.elevation_gain_m ?? stage.elevation_gain_m, 0)),
      summitFinish: booleanValue(stage.is_summit_finish), terrainPercentages: buildTerrainPercentages(stage, profile, terrainType),
      profilePoints: buildProfilePoints(profile, distanceKm), timeTrialRules: null,
    },
    points: buildStagePoints(stageId, distanceKm, sources.stagePoints), teams, riders, stagePlans,
    weather: {
      condition: text(weather.condition ?? weather.condition_label),
      temperatureC: optionalNumber(weather.avg_temp_c ?? weather.average_temp_c ?? weather.temperature_c ?? weather.temp_c),
      windKmh: optionalNumber(weather.avg_wind_kmh ?? weather.wind_kmh),
      precipitationMm: optionalNumber(weather.precipitation_mm ?? weather.rain_mm),
      rainProbabilityPct: optionalNumber(weather.rain_probability_pct ?? weather.rain_probability),
      crosswindRisk: text(weather.crosswind_risk), descentRisk: text(weather.descent_risk), surfaceRisk: text(weather.surface_risk),
      cancelled: booleanValue(stage.weather_cancelled), cancellationReason: text(stage.weather_cancellation_reason), source: text(weather.source), snapshot: weather as JsonRecord,
    },
    preparation: phase9Preparation(sources.phase9Payload),
    incidentModel: { enabled: true },
    preStageLeaders: normalizePreStageLeaders(sources.preStageLeaders),
  }
}
