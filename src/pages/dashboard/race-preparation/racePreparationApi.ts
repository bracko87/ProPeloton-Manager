/**
 * racePreparationApi.ts
 * Data access layer for Race Preparation.
 *
 * SELECT reads can use Supabase directly.
 * Writes must use Edge Functions:
 * UI Button → Edge Function → SQL RPC → Database.
 */

import { supabase } from '../../../lib/supabase'
import type {
  AcceptedRacePreparationRow,
  AssetOption,
  ClubRiderOption,
  EquipmentSetupPresetOption,
  ExistingRacePreparationDraft,
  JsonRecord,
  RacePrepAssetKey,
  RacePreparationPayload,
  RacePreparationQuote as BaseRacePreparationQuote,
  RacePreparationRace,
  RacePreparationSelectableData,
  RacePreparationSubmitResult,
  RacePreparationTarget,
  RaceSupplyKey,
  RaceSupplyOption,
  StaffOption,
  UUID,
} from './racePreparationTypes'

export type RacePreparationQuote = BaseRacePreparationQuote & {
  bonus_preview?: JsonRecord | null
}

export const RACE_STAFF_ROLES = [
  'sport_director',
  'team_doctor',
  'physio',
  'mechanic',
] as const

export const RACE_SUPPLY_KEYS: RaceSupplyKey[] = [
  'bidons_water_bottles',
  'energy_gels',
  'nutrition_packs',
  'race_jersey_complete',
  'rain_jackets',
]

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toDateOnly(value: unknown): string | null {
  if (!value) return null
  const text = String(value)
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

function addCanonicalDays(value: unknown, days: number): string | null {
  const dateOnly = toDateOnly(value)
  if (!dateOnly) return null

  const [year, month, day] = dateOnly.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)

  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')

  return `${y}-${m}-${d}`
}

function makeGameRuleDate(
  seasonNumber: unknown,
  monthNumber: unknown,
  dayNumber: unknown,
): string | null {
  const season = toNumber(seasonNumber, 0)
  const month = toNumber(monthNumber, 0)
  const day = toNumber(dayNumber, 0)

  if (!season || !month || !day) return null

  const year = 1999 + season
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0',
  )}`
}

function resolveDeadlineFromRules(
  race: JsonRecord,
  entryRules?: JsonRecord | null,
): string | null {
  const rules = entryRules ?? {}

  return (
    toDateOnly(rules.rider_submission_deadline) ??
    makeGameRuleDate(
      rules.rider_submission_deadline_season_number,
      rules.rider_submission_deadline_month_number,
      rules.rider_submission_deadline_day_number,
    ) ??
    addCanonicalDays(race.start_date, -3)
  )
}

function resolveSetupWindowOpen(race: JsonRecord): string | null {
  return addCanonicalDays(race.start_date, -15)
}

export function getRiderName(rider?: JsonRecord | null): string {
  if (!rider) return 'Unknown rider'

  const firstName = String(rider.first_name ?? rider.firstname ?? '').trim()
  const lastName = String(rider.last_name ?? rider.lastname ?? '').trim()
  const fullName = `${firstName} ${lastName}`.trim()

  return fullName || String(rider.name ?? rider.rider_name ?? 'Unknown rider')
}

async function loadCurrentGameDate(): Promise<string | undefined> {
  const { data, error } = await supabase.rpc('get_current_game_date_date')

  if (error) {
    console.warn('Failed to load current game date:', error.message)
    return undefined
  }

  return data ? String(data) : undefined
}

export async function resolveCurrentClubId(): Promise<UUID> {
  const { data: userResult, error: userError } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }

  const userId = userResult.user?.id

  if (!userId) {
    throw new Error('User is not authenticated.')
  }

  const ownedClub = await supabase
    .from('clubs')
    .select('id')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (ownedClub.error) {
    throw ownedClub.error
  }

  if (ownedClub.data?.id) {
    return String(ownedClub.data.id)
  }

  const membershipClub = await supabase
    .from('club_memberships')
    .select('club_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (membershipClub.error) {
    throw membershipClub.error
  }

  if (membershipClub.data?.club_id) {
    return String(membershipClub.data.club_id)
  }

  throw new Error('No club found for current user.')
}

async function invokeRacePrepFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  })

  if (error) {
    throw error
  }

  const result = asRecord(data)

  if (!result.success) {
    throw new Error(String(result.error ?? `${functionName} failed.`))
  }

  return result.data as T
}

export function getRacePreparationTarget(clubId: UUID) {
  return invokeRacePrepFunction<RacePreparationTarget>(
    'get-race-preparation-target',
    {
      club_id: clubId,
    },
  )
}

export async function quoteRacePreparation(
  payload: RacePreparationPayload,
): Promise<RacePreparationQuote> {
  const { data, error } = await supabase.rpc(
    'quote_race_preparation_with_bonus_v1',
    {
      p_race_id: payload.race_id,
      p_club_id: payload.club_id,
      p_rider_ids: payload.rider_ids ?? [],
      p_staff_ids: payload.staff_ids ?? [],
      p_asset_assignments: payload.asset_assignments ?? [],
      p_supply_reservations: payload.supply_reservations ?? {},
      p_default_equipment_setup_id:
        payload.default_equipment_setup_id ?? null,
    },
  )

  if (error) {
    throw error
  }

  return data as RacePreparationQuote
}

export function saveRacePreparationDraft(payload: RacePreparationPayload) {
  return invokeRacePrepFunction<Record<string, unknown>>(
    'save-race-preparation-draft',
    payload,
  )
}

export function submitRacePreparation(params: {
  race_id: UUID
  club_id: UUID
  idempotency_key?: string
}) {
  return invokeRacePrepFunction<RacePreparationSubmitResult>(
    'submit-race-preparation',
    params,
  )
}

export async function loadAcceptedRacePreparations(
  clubId: UUID,
): Promise<AcceptedRacePreparationRow[]> {
  const { data: entriesData, error: entriesError } = await supabase
    .from('race_team_entries')
    .select('id, race_id, club_id, status')
    .eq('club_id', clubId)
    .eq('status', 'accepted')

  if (entriesError) {
    throw entriesError
  }

  const entries = toArray<JsonRecord>(entriesData)
  const raceIds = entries.map((entry) => String(entry.race_id)).filter(Boolean)

  if (raceIds.length === 0) {
    return []
  }

  const [racesResult, rulesResult, preparationsResult, stagesResult] =
    await Promise.all([
      supabase.from('races').select('*').in('id', raceIds),
      supabase.from('race_entry_rules').select('*').in('race_id', raceIds),
      supabase
        .from('race_preparations')
        .select('*')
        .eq('club_id', clubId)
        .in('race_id', raceIds),
      supabase
        .from('race_stages')
        .select('id, race_id, stage_number, stage_date')
        .in('race_id', raceIds),
    ])

  if (racesResult.error) throw racesResult.error
  if (rulesResult.error) throw rulesResult.error
  if (preparationsResult.error) throw preparationsResult.error
  if (stagesResult.error) throw stagesResult.error

  const raceMap = new Map<string, RacePreparationRace>()
  const rulesMap = new Map<string, JsonRecord>()
  const prepMap = new Map<string, JsonRecord>()
  const stageCountMap = new Map<string, number>()

  toArray<RacePreparationRace>(racesResult.data).forEach((race) => {
    raceMap.set(String(race.id), race)
  })

  toArray<JsonRecord>(rulesResult.data).forEach((rules) => {
    if (rules.race_id) {
      rulesMap.set(String(rules.race_id), rules)
    }
  })

  toArray<JsonRecord>(preparationsResult.data).forEach((prep) => {
    if (prep.race_id) {
      prepMap.set(String(prep.race_id), prep)
    }
  })

  toArray<JsonRecord>(stagesResult.data).forEach((stage) => {
    const raceId = String(stage.race_id)
    stageCountMap.set(raceId, (stageCountMap.get(raceId) ?? 0) + 1)
  })

  return entries
    .map((entry) => {
      const raceId = String(entry.race_id)
      const race = raceMap.get(raceId)

      if (!race) return null

      const raceRecord = race as JsonRecord
      const entryRules = rulesMap.get(raceId) ?? null
      const preparation = prepMap.get(raceId) ?? null
      const setupWindow = resolveSetupWindowOpen(raceRecord)
      const deadline = resolveDeadlineFromRules(raceRecord, entryRules)
      const stageCount =
        stageCountMap.get(raceId) ??
        toNumber(race.stage_count, 0) ??
        0

      return {
        race_team_entry_id: String(entry.id),
        race_id: raceId,
        club_id: clubId,
        entry_status: String(entry.status),
        race,
        entry_rules: entryRules,
        preparation,
        stage_count: stageCount || 1,
        setup_window_opens_on: setupWindow,
        rider_submission_deadline_on: deadline,
        race_package_status: preparation
          ? String(preparation.status ?? 'draft')
          : 'not_created',
        startlist_status: preparation
          ? String(preparation.startlist_status ?? 'draft')
          : 'not_created',
      }
    })
    .filter(Boolean)
    .sort((a, b) =>
      String(a!.race.start_date ?? '').localeCompare(
        String(b!.race.start_date ?? ''),
      ),
    ) as AcceptedRacePreparationRow[]
}

export async function loadRacePreparationContext(
  clubId: UUID,
  raceId: UUID,
): Promise<RacePreparationTarget> {
  const [
    currentGameDate,
    raceResult,
    entryResult,
    rulesResult,
    preparationResult,
    stagesResult,
  ] = await Promise.all([
    loadCurrentGameDate(),
    supabase.from('races').select('*').eq('id', raceId).maybeSingle(),
    supabase
      .from('race_team_entries')
      .select('*')
      .eq('race_id', raceId)
      .eq('club_id', clubId)
      .maybeSingle(),
    supabase
      .from('race_entry_rules')
      .select('*')
      .eq('race_id', raceId)
      .maybeSingle(),
    supabase
      .from('race_preparations')
      .select('*')
      .eq('race_id', raceId)
      .eq('club_id', clubId)
      .maybeSingle(),
    supabase
      .from('race_stages')
      .select('*')
      .eq('race_id', raceId)
      .order('stage_number', { ascending: true }),
  ])

  if (raceResult.error) throw raceResult.error
  if (entryResult.error) throw entryResult.error
  if (rulesResult.error) throw rulesResult.error
  if (preparationResult.error) throw preparationResult.error
  if (stagesResult.error) throw stagesResult.error

  const race = asRecord(raceResult.data)
  const entry = asRecord(entryResult.data)
  const entryRules = asRecord(rulesResult.data)
  const preparation = preparationResult.data
    ? asRecord(preparationResult.data)
    : null

  const setupWindow = resolveSetupWindowOpen(race)
  const deadline = resolveDeadlineFromRules(race, entryRules)

  let stagePlans: JsonRecord[] = []

  if (preparation?.id) {
    const stagePlansResult = await supabase
      .from('race_stage_plans')
      .select('*')
      .eq('race_preparation_id', String(preparation.id))
      .order('stage_number', { ascending: true })

    if (stagePlansResult.error) throw stagePlansResult.error

    stagePlans = toArray<JsonRecord>(stagePlansResult.data)
  }

  return {
    has_target: Boolean(race.id),
    current_game_date: currentGameDate,
    race: race as RacePreparationRace,
    entry,
    entry_rules: entryRules,
    preparation,
    stages: toArray<JsonRecord>(stagesResult.data),
    stage_plans: stagePlans,
    setup_window_opens_on: setupWindow ?? undefined,
    rider_submission_deadline_on: deadline ?? undefined,
    race_package_status: preparation
      ? String(preparation.status ?? 'draft')
      : 'not_created',
    startlist_status: preparation
      ? String(preparation.startlist_status ?? 'draft')
      : 'not_created',
  }
}

export async function loadRacePreparationSelectableData(
  clubId: UUID,
): Promise<RacePreparationSelectableData> {
  const [riders, staff, assets, supplies, equipmentPresets] = await Promise.all([
    loadClubRiders(clubId),
    loadRaceStaff(clubId),
    loadRaceAssets(clubId),
    loadRaceSupplies(clubId),
    loadEquipmentSetupPresets(clubId),
  ])

  return {
    riders,
    staff,
    assets,
    supplies,
    equipmentPresets,
  }
}

async function loadClubRiders(clubId: UUID): Promise<ClubRiderOption[]> {
  const { data: clubRiders, error: clubRidersError } = await supabase
    .from('club_riders')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: true })

  if (clubRidersError) {
    throw clubRidersError
  }

  const clubRiderRows = toArray<JsonRecord>(clubRiders)
  const riderIds = clubRiderRows
    .map((row) => row.rider_id)
    .filter(Boolean)
    .map(String)

  if (riderIds.length === 0) {
    return []
  }

  const { data: riders, error: ridersError } = await supabase
    .from('riders')
    .select('*')
    .in('id', riderIds)

  if (ridersError) {
    throw ridersError
  }

  const riderMap = new Map<string, JsonRecord>()

  toArray<JsonRecord>(riders).forEach((rider) => {
    if (rider.id) {
      riderMap.set(String(rider.id), rider)
    }
  })

  return clubRiderRows.map((row) => ({
    club_rider_id: String(row.id),
    rider_id: String(row.rider_id),
    assigned_role: row.assigned_role ? String(row.assigned_role) : null,
    rider: riderMap.get(String(row.rider_id)),
  }))
}

async function loadRaceStaff(clubId: UUID): Promise<StaffOption[]> {
  const { data, error } = await supabase
    .from('club_staff')
    .select('*')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .in('role_type', [...RACE_STAFF_ROLES])
    .order('role_type', { ascending: true })
    .order('staff_name', { ascending: true })

  if (error) {
    throw error
  }

  return toArray<JsonRecord>(data).map((row) => ({
    id: String(row.id),
    role_type: String(row.role_type),
    staff_name: String(row.staff_name ?? 'Unnamed staff'),
    expertise: toNumber(row.expertise),
    experience: toNumber(row.experience),
    leadership: toNumber(row.leadership),
    efficiency: toNumber(row.efficiency),
    salary_weekly: toNumber(row.salary_weekly),
  }))
}

async function loadRaceAssets(
  clubId: UUID,
): Promise<Record<string, AssetOption[]>> {
  const [teamBuses, equipmentVans, mobileWorkshops, medicalVans, teamCars] =
    await Promise.all([
      loadTeamBusAssets(clubId),
      loadEquipmentVanAssets(clubId),
      loadMobileWorkshopAssets(clubId),
      loadMedicalVanAssets(clubId),
      loadTeamCars(clubId),
    ])

  return {
    team_bus: teamBuses,
    equipment_van: equipmentVans,
    mobile_workshop: mobileWorkshops,
    medical_van: medicalVans,
    team_car: teamCars,
  }
}

function normalizeAssetRows(
  rows: unknown,
  assetKey: string,
): AssetOption[] {
  return toArray<JsonRecord>(rows).map((row) => ({
    id: String(row.id),
    asset_key: assetKey,
    display_name: String(row.display_name ?? assetKey),
    asset_level: toNumber(row.asset_level),
    condition_percent: toNumber(row.condition_percent),
    support_value: toNumber(row.support_value),
    status: String(row.status ?? ''),
  }))
}

async function loadTeamBusAssets(clubId: UUID): Promise<AssetOption[]> {
  const { data, error } = await supabase
    .from('club_team_buses')
    .select(
      'id, asset_level, display_name, support_value, condition_percent, status, assignment_locked',
    )
    .eq('club_id', clubId)
    .eq('status', 'available')
    .eq('assignment_locked', false)
    .gte('condition_percent', 30)
    .order('asset_level', { ascending: false })
    .order('display_name', { ascending: true })

  if (error) throw error
  return normalizeAssetRows(data, 'team_bus')
}

async function loadEquipmentVanAssets(clubId: UUID): Promise<AssetOption[]> {
  const { data, error } = await supabase
    .from('club_equipment_vans')
    .select(
      'id, asset_level, display_name, support_value, condition_percent, status, assignment_locked',
    )
    .eq('club_id', clubId)
    .eq('status', 'available')
    .eq('assignment_locked', false)
    .gte('condition_percent', 30)
    .order('asset_level', { ascending: false })
    .order('display_name', { ascending: true })

  if (error) throw error
  return normalizeAssetRows(data, 'equipment_van')
}

async function loadMobileWorkshopAssets(clubId: UUID): Promise<AssetOption[]> {
  const { data, error } = await supabase
    .from('club_mobile_workshops')
    .select(
      'id, asset_level, display_name, support_value, condition_percent, status, assignment_locked',
    )
    .eq('club_id', clubId)
    .eq('status', 'available')
    .eq('assignment_locked', false)
    .gte('condition_percent', 30)
    .order('asset_level', { ascending: false })
    .order('display_name', { ascending: true })

  if (error) throw error
  return normalizeAssetRows(data, 'mobile_workshop')
}

async function loadMedicalVanAssets(clubId: UUID): Promise<AssetOption[]> {
  const { data, error } = await supabase
    .from('club_medical_vans')
    .select(
      'id, asset_level, display_name, support_value, condition_percent, status, assignment_locked',
    )
    .eq('club_id', clubId)
    .eq('status', 'available')
    .eq('assignment_locked', false)
    .gte('condition_percent', 30)
    .order('asset_level', { ascending: false })
    .order('display_name', { ascending: true })

  if (error) throw error
  return normalizeAssetRows(data, 'medical_van')
}

async function loadTeamCars(clubId: UUID): Promise<AssetOption[]> {
  const { data, error } = await supabase
    .from('club_team_cars')
    .select(
      'id, display_name, asset_key, asset_level, support_value, condition_percent, status, assignment_locked, metadata, garage_slot',
    )
    .eq('club_id', clubId)
    .eq('status', 'available')
    .eq('assignment_locked', false)
    .gte('condition_percent', 30)
    .order('garage_slot', { ascending: true })

  if (error) throw error

  return toArray<JsonRecord>(data).map((row) => ({
    id: String(row.id),
    display_name: String(row.display_name ?? 'Team Car'),
    asset_key: 'team_car',
    asset_level: toNumber(row.asset_level, 1),
    support_value: toNumber(row.support_value),
    condition_percent: toNumber(row.condition_percent),
    status: String(row.status ?? ''),
    assignment_locked: Boolean(row.assignment_locked),
    metadata: asRecord(row.metadata),
  }))
}

async function loadRaceSupplies(clubId: UUID): Promise<RaceSupplyOption[]> {
  const { data, error } = await supabase
    .from('club_race_supplies')
    .select('id, supply_key, display_name, quantity_available')
    .eq('club_id', clubId)
    .in('supply_key', RACE_SUPPLY_KEYS)
    .order('supply_key', { ascending: true })

  if (error) {
    throw error
  }

  return toArray<JsonRecord>(data).map((row) => ({
    id: String(row.id),
    supply_key: String(row.supply_key) as RaceSupplyKey,
    display_name: String(row.display_name ?? row.supply_key),
    quantity_available: toNumber(row.quantity_available),
  }))
}

async function loadEquipmentSetupPresets(
  clubId: UUID,
): Promise<EquipmentSetupPresetOption[]> {
  const { data, error } = await supabase
    .from('club_equipment_setup_presets')
    .select('id, setup_slot, setup_name')
    .eq('club_id', clubId)
    .order('setup_slot', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return toArray<JsonRecord>(data).map((row, index) => {
    const setupSlot =
      row.setup_slot === null || row.setup_slot === undefined
        ? index + 1
        : toNumber(row.setup_slot, index + 1)

    const setupName = String(
      row.setup_name ?? `Equipment Setup ${setupSlot}`,
    ).trim()

    return {
      id: String(row.id),
      setup_slot: setupSlot,
      setup_name: setupName,
      label: setupName,
    }
  })
}

export async function loadExistingRacePreparationDraft(
  racePreparationId: UUID,
): Promise<ExistingRacePreparationDraft> {
  const [riders, staff, assets, supplies] = await Promise.all([
    supabase
      .from('race_preparation_riders')
      .select('rider_id, start_number')
      .eq('race_preparation_id', racePreparationId)
      .order('start_number', { ascending: true }),

    supabase
      .from('race_preparation_staff')
      .select('staff_id, role_type')
      .eq('race_preparation_id', racePreparationId)
      .order('role_type', { ascending: true }),

    supabase
      .from('race_preparation_assets')
      .select('asset_key, asset_slot_key, asset_id')
      .eq('race_preparation_id', racePreparationId),

    supabase
      .from('race_preparation_supplies')
      .select('supply_key, quantity_reserved')
      .eq('race_preparation_id', racePreparationId),
  ])

  if (riders.error) throw riders.error
  if (staff.error) throw staff.error
  if (assets.error) throw assets.error
  if (supplies.error) throw supplies.error

  const assetAssignments: Record<RacePrepAssetKey, UUID | ''> = {
    team_bus: '',
    equipment_van: '',
    mobile_workshop: '',
    medical_van: '',
    team_car_1: '',
    team_car_2: '',
    team_car_3: '',
  }

  toArray<JsonRecord>(assets.data).forEach((row) => {
    const slotKey = String(
      row.asset_slot_key ?? row.asset_key ?? '',
    ) as RacePrepAssetKey

    if (slotKey in assetAssignments) {
      assetAssignments[slotKey] = String(row.asset_id)
    }
  })

  const supplyReservations: Record<string, number> = {}

  toArray<JsonRecord>(supplies.data).forEach((row) => {
    supplyReservations[String(row.supply_key)] = toNumber(row.quantity_reserved)
  })

  return {
    riderIds: toArray<JsonRecord>(riders.data).map((row) =>
      String(row.rider_id),
    ),
    staffIds: toArray<JsonRecord>(staff.data).map((row) =>
      String(row.staff_id),
    ),
    assetAssignments,
    supplyReservations,
  }
}

export async function loadRaceStageProfileDetail(
  stageId: UUID,
): Promise<JsonRecord | null> {
  const { data, error } = await supabase.rpc(
    'get_race_stage_profile_detail_v1',
    {
      p_stage_id: stageId,
    },
  )

  if (error) {
    throw error
  }

  return asRecord(data)
}