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
  BlockedRacePreparationResource,
  ClubRiderOption,
  EquipmentSetupPresetOption,
  ExistingRacePreparationDraft,
  JsonRecord,
  RacePrepAssetKey,
  RacePreparationPayload,
  RacePreparationQuote as BaseRacePreparationQuote,
  RacePreparationRace,
  RacePreparationSelectableData,
  RacePreparationSquadOption,
  RacePreparationSubmitResult,
  RacePreparationTarget,
  RaceStagePlanSavePayload,
  RaceStagePlanSaveResult,
  RaceSupplyKey,
  RaceSupplyOption,
  StaffOption,
  UUID,
} from './racePreparationTypes'

export type RacePreparationQuote = BaseRacePreparationQuote & {
  bonus_preview?: JsonRecord | null
  standardized_bonus?: JsonRecord | null
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

export const DEFAULT_EQUIPMENT_SETUP_PRESET_ID = '__default_race_setup__'

const ACCEPTED_RACE_FINISHED_GRACE_DAYS = 3

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

function shouldHideFinishedAcceptedRace(
  race: JsonRecord,
  currentGameDate?: string | null,
): boolean {
  const currentDate = toDateOnly(currentGameDate)
  const raceEndDate = toDateOnly(race.end_date ?? race.start_date)

  if (!currentDate || !raceEndDate) return false

  const hideAfterDate = addCanonicalDays(
    raceEndDate,
    ACCEPTED_RACE_FINISHED_GRACE_DAYS,
  )

  if (!hideAfterDate) return false

  return currentDate > hideAfterDate
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

async function loadCurrentGameTimestamp(): Promise<string | undefined> {
  const { data, error } = await supabase.rpc('get_current_game_timestamp')

  if (error) {
    console.warn('Failed to load current game timestamp:', error.message)
    return undefined
  }

  return data ? String(data) : undefined
}

export async function resolveCurrentClubId(): Promise<UUID> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;

  if (!user) {
    throw new Error(
      "User is not authenticated.",
    );
  }

  const { data, error } = await supabase
    .from("clubs")
    .select(
      "id, club_type, parent_club_id",
    )
    .eq("owner_user_id", user.id)
    .is("parent_club_id", null)
    .or(
      "club_type.eq.main,club_type.is.null",
    )
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data?.id) {
    throw new Error(
      "Main club was not found for this user.",
    );
  }

  localStorage.setItem(
    "ppm-active-club",
    String(data.id),
  );

  return String(data.id);
}

export async function loadRacePreparationSquadOptions(
  clubId: UUID,
): Promise<RacePreparationSquadOption[]> {
  const { data, error } = await supabase.rpc(
    'get_race_preparation_squad_options_v1',
    {
      p_club_id: clubId,
    },
  )

  if (error) {
    throw error
  }

  const result = asRecord(data)

  return toArray<JsonRecord>(result.options).map((row) => ({
    id: String(row.id),

    name: String(
      row.name ?? 'Unnamed squad',
    ),

    club_type: String(
      row.club_type ?? 'main',
    ),

    parent_club_id: row.parent_club_id
      ? String(row.parent_club_id)
      : null,

    country_code: row.country_code
      ? String(row.country_code)
      : null,

    logo_url: row.logo_url
      ? String(row.logo_url)
      : null,

    is_default: Boolean(
      row.is_default,
    ),

    label: String(
      row.label ??
        (
          String(row.id) === clubId
            ? 'First Squad'
            : 'Developing Team'
        ),
    ),
  }))
}




function stringifyUnknownError(value: unknown): string {
  if (value instanceof Error && value.message.trim()) {
    return value.message.trim()
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  const record = asRecord(value)

  const candidates = [
    record.error,
    record.message,
    record.details,
    record.hint,
    asRecord(record.data).error,
    asRecord(record.data).message,
    asRecord(record.data).details,
  ]

  const message = candidates
    .map((candidate) => String(candidate ?? '').trim())
    .find(Boolean)

  if (message) return message

  if (Object.keys(record).length > 0) {
    try {
      return JSON.stringify(record)
    } catch {
      return 'Unknown object error.'
    }
  }

  return String(value ?? 'Unknown error.')
}

async function readEdgeFunctionErrorMessage(
  error: unknown,
  fallbackMessage: string,
): Promise<string> {
  const errorRecord = asRecord(error)

  const context = errorRecord.context
  const contextRecord = asRecord(context)

  const maybeText =
    typeof contextRecord.text === 'function'
      ? (contextRecord.text as () => Promise<string>)
      : null

  if (maybeText) {
    try {
      const text = await maybeText.call(context)

      if (text.trim()) {
        try {
          const parsed = JSON.parse(text)
          const parsedMessage = stringifyUnknownError(parsed)

          if (parsedMessage && parsedMessage !== '{}') {
            return parsedMessage
          }
        } catch {
          return text.trim()
        }
      }
    } catch {
      // Ignore body parsing errors and fall back below.
    }
  }

  return stringifyUnknownError(error) || fallbackMessage
}

async function invokeRacePrepFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  })

  if (error) {
    throw new Error(
      await readEdgeFunctionErrorMessage(
        error,
        `${functionName} failed with a non-2xx status code.`,
      ),
    )
  }

  const result = asRecord(data)

  if (!result.success) {
    throw new Error(
      stringifyUnknownError(result.error ?? result) || `${functionName} failed.`,
    )
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

export function saveRaceStagePlan(payload: RaceStagePlanSavePayload) {
  return invokeRacePrepFunction<RaceStagePlanSaveResult>(
    'save-race-stage-plan',
    payload,
  )
}

export async function askSportDirectorForStagePlan({
  racePreparationId,
  stageId,
  clubId,
}: {
  racePreparationId: UUID
  stageId: UUID
  clubId: UUID
}): Promise<JsonRecord> {
  const { data, error } = await supabase.rpc(
    'generate_stage_plan_sport_director_suggestion_v1',
    {
      p_race_preparation_id: racePreparationId,
      p_stage_id: stageId,
      p_club_id: clubId,
    },
  )

  if (error) {
    throw error
  }

  return asRecord(data)
}


export async function loadBlockedRacePreparationResources({
  clubId,
  raceId,
  racePreparationId,
}: {
  clubId: UUID
  raceId: UUID
  racePreparationId?: UUID | null
}): Promise<BlockedRacePreparationResource[]> {
  const { data, error } = await supabase.rpc(
    'get_race_preparation_blocked_resources_v1',
    {
      p_club_id: clubId,
      p_race_id: raceId,
      p_exclude_race_preparation_id: racePreparationId ?? null,
    },
  )

  if (error) {
    throw error
  }

  return (data ?? []) as BlockedRacePreparationResource[]
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

  const currentGameDate = await loadCurrentGameDate()

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
    if (shouldHideFinishedAcceptedRace(race as JsonRecord, currentGameDate)) {
      return
    }

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
    currentGameTimestamp,
    raceResult,
    entryResult,
    rulesResult,
    preparationResult,
    stagesResult,
  ] = await Promise.all([
    loadCurrentGameDate(),
    loadCurrentGameTimestamp(),
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
    current_game_timestamp: currentGameTimestamp,
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
  raceId?: UUID | null,
  racePreparationId?: UUID | null,
  riderClubId?: UUID | null,
): Promise<RacePreparationSelectableData> {
  /*
   * Riders come from the selected competing squad.
   *
   * Staff, assets, supplies and equipment remain attached to
   * the main club.
   */
  const effectiveRiderClubId =
    riderClubId ?? clubId;

  const blockedResourcesPromise = raceId
    ? loadBlockedRacePreparationResources({
        clubId,
        raceId,
        racePreparationId,
      })
    : Promise.resolve(
        [] as BlockedRacePreparationResource[],
      );

  const [
    riders,
    staff,
    assets,
    supplies,
    equipmentPresets,
    blockedResources,
  ] = await Promise.all([
    loadClubRiders(
      effectiveRiderClubId,
    ),

    loadRaceStaff(clubId),
    loadRaceAssets(clubId),
    loadRaceSupplies(clubId),
    loadEquipmentSetupPresets(clubId),

    blockedResourcesPromise,
  ]);

  return {
    riders,
    staff,
    assets,
    supplies,
    equipmentPresets,
    blockedResources,
  };
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

function isRacePrepSelectableAsset(row: JsonRecord): boolean {
  const status = String(row.status ?? '')
  const assignmentType = String(row.current_assignment_type ?? '')

  return (
    status === 'available' ||
    (status === 'assigned' && assignmentType === 'race_preparation')
  )
}

function normalizeAssetRows(
  rows: unknown,
  assetKey: string,
): AssetOption[] {
  return toArray<JsonRecord>(rows)
    .filter(isRacePrepSelectableAsset)
    .map((row) => ({
      id: String(row.id),
      asset_key: assetKey,
      display_name: String(row.display_name ?? assetKey),
      asset_level: toNumber(row.asset_level),
      condition_percent: toNumber(row.condition_percent),
      support_value: toNumber(row.support_value),
      status: String(row.status ?? ''),
      assignment_locked: Boolean(row.assignment_locked),
      current_assignment_type: row.current_assignment_type
        ? String(row.current_assignment_type)
        : null,
      current_assignment_id: row.current_assignment_id
        ? String(row.current_assignment_id)
        : null,
      current_assignment_label: row.current_assignment_label
        ? String(row.current_assignment_label)
        : null,
      assignment_start_game_date: row.assignment_start_game_date
        ? String(row.assignment_start_game_date)
        : null,
      assignment_end_game_date: row.assignment_end_game_date
        ? String(row.assignment_end_game_date)
        : null,
    }))
}

async function loadTeamBusAssets(clubId: UUID): Promise<AssetOption[]> {
  const { data, error } = await supabase
    .from('club_team_buses')
    .select(
      'id, asset_level, display_name, support_value, condition_percent, status, assignment_locked, current_assignment_type, current_assignment_id, current_assignment_label, assignment_start_game_date, assignment_end_game_date',
    )
    .eq('club_id', clubId)
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
      'id, asset_level, display_name, support_value, condition_percent, status, assignment_locked, current_assignment_type, current_assignment_id, current_assignment_label, assignment_start_game_date, assignment_end_game_date',
    )
    .eq('club_id', clubId)
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
      'id, asset_level, display_name, support_value, condition_percent, status, assignment_locked, current_assignment_type, current_assignment_id, current_assignment_label, assignment_start_game_date, assignment_end_game_date',
    )
    .eq('club_id', clubId)
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
      'id, asset_level, display_name, support_value, condition_percent, status, assignment_locked, current_assignment_type, current_assignment_id, current_assignment_label, assignment_start_game_date, assignment_end_game_date',
    )
    .eq('club_id', clubId)
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
      'id, display_name, asset_key, asset_level, support_value, condition_percent, status, assignment_locked, current_assignment_type, current_assignment_id, current_assignment_label, assignment_start_game_date, assignment_end_game_date, metadata, garage_slot',
    )
    .eq('club_id', clubId)
    .gte('condition_percent', 30)
    .order('garage_slot', { ascending: true })

  if (error) throw error

  return toArray<JsonRecord>(data)
    .filter(isRacePrepSelectableAsset)
    .map((row) => ({
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


function getSetupSelectedCatalogItemIds(
  row: JsonRecord,
  bonusPreview: JsonRecord,
): Record<string, string> {
  const result: Record<string, string> = {}
  const direct = asRecord(row.selected_catalog_item_ids)

  Object.entries(direct).forEach(([category, value]) => {
    const text = String(value ?? '').trim()
    if (category && text && text !== 'null') {
      result[category] = text
    }
  })

  const selectedItems = toArray<JsonRecord>(
    row.selected_items ?? bonusPreview.selected_items,
  )

  selectedItems.forEach((item) => {
    const category = String(item.equipment_category ?? '').trim()
    const catalogItemId = String(item.catalog_item_id ?? '').trim()

    if (category && catalogItemId && catalogItemId !== 'null') {
      result[category] = catalogItemId
    }
  })

  return result
}

function getSetupOptionForCatalogItem({
  setupOptions,
  equipmentCategory,
  catalogItemId,
}: {
  setupOptions: JsonRecord[]
  equipmentCategory: string
  catalogItemId: string
}): JsonRecord | null {
  const optionGroup = setupOptions.find(
    (group) => String(group.equipment_category) === equipmentCategory,
  )

  const options = toArray<JsonRecord>(asRecord(optionGroup).options)

  return (
    options.find((option) => String(option.catalog_item_id) === catalogItemId) ??
    null
  )
}

function buildSetupCapacityFromOptions({
  row,
  bonusPreview,
  setupOptions,
}: {
  row: JsonRecord
  bonusPreview: JsonRecord
  setupOptions: JsonRecord[]
}): JsonRecord | null {
  const directCapacity = asRecord(
    row.setup_capacity ?? row.capacity ?? row.equipment_capacity,
  )

  if (Object.keys(directCapacity).length > 0) {
    return directCapacity
  }

  const selectedCatalogItemIds = getSetupSelectedCatalogItemIds(row, bonusPreview)

  const itemCaps = Object.entries(selectedCatalogItemIds).flatMap(
    ([equipmentCategory, catalogItemId]) => {
      const option = getSetupOptionForCatalogItem({
        setupOptions,
        equipmentCategory,
        catalogItemId,
      })

      if (!option) return []

      const available = toNumber(
        option.available_count ??
          option.quantity_available ??
          option.available_quantity ??
          option.available ??
          option.usable_count ??
          option.owned_count,
        -1,
      )

      if (available < 0) return []

      const owned = toNumber(
        option.owned_count ?? option.total_owned ?? option.total_count,
        available,
      )

      const label = String(
        option.display_name ?? option.label ?? option.name ?? equipmentCategory,
      )

      return [
        {
          equipment_category: equipmentCategory,
          catalog_item_id: catalogItemId,
          label,
          available_count: available,
          owned_count: owned,
        },
      ]
    },
  )

  if (itemCaps.length === 0) {
    return null
  }

  const maxAssignments = Math.min(
    ...itemCaps.map((item) => toNumber(item.available_count)),
  )

  const limitingItem =
    itemCaps.find((item) => toNumber(item.available_count) === maxAssignments) ??
    itemCaps[0]

  return {
    max_assignments: maxAssignments,
    limiting_item_label: String(limitingItem.label ?? ''),
    limiting_equipment_category: String(limitingItem.equipment_category ?? ''),
    item_caps: itemCaps,
  }
}



function getDefaultSetupSelectedCatalogIds(
  categories: JsonRecord[],
): Record<string, string> {
  const result: Record<string, string> = {}

  categories.forEach((category) => {
    const equipmentCategory = String(category.equipment_category ?? '').trim()
    const selectedCatalogItemId = String(
      category.selected_catalog_item_id ??
        category.recommended_catalog_item_id ??
        '',
    ).trim()

    if (
      equipmentCategory &&
      selectedCatalogItemId &&
      selectedCatalogItemId !== 'null'
    ) {
      result[equipmentCategory] = selectedCatalogItemId
    }
  })

  return result
}

function getDefaultSetupSelectedItems(
  categories: JsonRecord[],
): JsonRecord[] {
  return categories.flatMap((category) => {
    const equipmentCategory = String(category.equipment_category ?? '').trim()
    const categoryLabel = String(category.label ?? equipmentCategory)
    const selectedCatalogItemId = String(
      category.selected_catalog_item_id ??
        category.recommended_catalog_item_id ??
        '',
    ).trim()

    if (!equipmentCategory || !selectedCatalogItemId) return []

    const options = toArray<JsonRecord>(category.options)
    const selectedOption = options.find(
      (option) => String(option.catalog_item_id) === selectedCatalogItemId,
    )

    if (!selectedOption) return []

    return [
      {
        ...selectedOption,
        equipment_category: equipmentCategory,
        category_label: categoryLabel,
        catalog_item_id: selectedCatalogItemId,
      },
    ]
  })
}

function buildDefaultSetupCapacityFromCategories(
  categories: JsonRecord[],
): JsonRecord | null {
  const itemCaps = getDefaultSetupSelectedItems(categories).flatMap((item) => {
    const available = toNumber(
      item.available_count ??
        item.quantity_available ??
        item.available_quantity ??
        item.available ??
        item.usable_count ??
        item.owned_count,
      -1,
    )

    if (available < 0) return []

    const owned = toNumber(
      item.owned_count ?? item.total_owned ?? item.total_count,
      available,
    )

    return [
      {
        equipment_category: String(item.equipment_category ?? ''),
        catalog_item_id: String(item.catalog_item_id ?? ''),
        label: String(item.display_name ?? item.label ?? item.name ?? 'Equipment'),
        available_count: available,
        owned_count: owned,
      },
    ]
  })

  if (itemCaps.length === 0) {
    return null
  }

  const maxAssignments = Math.min(
    ...itemCaps.map((item) => toNumber(item.available_count)),
  )

  const limitingItem =
    itemCaps.find((item) => toNumber(item.available_count) === maxAssignments) ??
    itemCaps[0]

  return {
    max_assignments: maxAssignments,
    limiting_item_label: String(limitingItem.label ?? ''),
    limiting_equipment_category: String(limitingItem.equipment_category ?? ''),
    item_caps: itemCaps,
  }
}

async function loadDefaultEquipmentSetupPreset(
  clubId: UUID,
): Promise<EquipmentSetupPresetOption | null> {
  try {
    const [{ data: setupData, error: setupError }, bonusResult] =
      await Promise.all([
        supabase.rpc('equipment_get_default_setup_options', {
          p_club_id: clubId,
        }),
        supabase
          .rpc('equipment_get_default_setup_bonus_preview', {
            p_club_id: clubId,
          })
          .then((result) => result)
          .catch((error) => ({ data: null, error })),
      ])

    if (setupError) {
      console.warn('Failed to load Default Race Setup options:', setupError.message)
      return null
    }

    const root = asRecord(setupData)
    const categories = toArray<JsonRecord>(root.categories)
    const selectedCatalogItemIds = getDefaultSetupSelectedCatalogIds(categories)

    if (Object.keys(selectedCatalogItemIds).length === 0) {
      return null
    }

    const bonusPreview = asRecord(bonusResult.data)
    const setupCapacity = buildDefaultSetupCapacityFromCategories(categories)
    const maxAssignments = setupCapacity
      ? toNumber(
          setupCapacity.max_assignments ??
            setupCapacity.maxAssignments ??
            setupCapacity.capacity,
          -1,
        )
      : -1

    return {
      id: DEFAULT_EQUIPMENT_SETUP_PRESET_ID,
      setup_slot: 99,
      setup_name: 'Default',
      label: 'Default',
      bonus_preview: Object.keys(bonusPreview).length > 0 ? bonusPreview : null,
      selected_catalog_item_ids: selectedCatalogItemIds,
      selected_items:
        Object.keys(bonusPreview).length > 0
          ? bonusPreview.selected_items
          : getDefaultSetupSelectedItems(categories),
      weighted_bonuses: asRecord(bonusPreview.weighted_bonuses),
      raw_weighted_bonuses: asRecord(bonusPreview.raw_weighted_bonuses),
      caps: asRecord(bonusPreview.caps),
      bonus_model: asRecord(bonusPreview.bonus_model),
      setup_capacity: setupCapacity,
      max_assignments: maxAssignments >= 0 ? maxAssignments : null,
      limiting_item_label: setupCapacity
        ? String(setupCapacity.limiting_item_label ?? '')
        : null,
      limiting_equipment_category: setupCapacity
        ? String(setupCapacity.limiting_equipment_category ?? '')
        : null,
      is_default_setup: true,
      is_virtual_default: true,
    }
  } catch (error) {
    console.warn('Failed to load Default Race Setup preset:', error)
    return null
  }
}


async function loadEquipmentSetupPresets(
  clubId: UUID,
): Promise<EquipmentSetupPresetOption[]> {
  const fallbackToPresetTable = async (): Promise<EquipmentSetupPresetOption[]> => {
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
        bonus_preview: null,
      }
    })
  }

  try {
    const { data, error } = await supabase.rpc('equipment_get_setup_presets', {
      p_club_id: clubId,
    })

    if (error) {
      console.warn('Failed to load equipment setup preset previews:', error.message)
      return fallbackToPresetTable()
    }

    const root = asRecord(data)
    const setupOptions = toArray<JsonRecord>(root.options)
    const presetsSource = Array.isArray(root.presets)
      ? root.presets
      : Array.isArray(root.options)
        ? root.options
        : Array.isArray(data)
          ? data
          : []

    const presets = toArray<JsonRecord>(presetsSource).map((row, index) => {
      const setupSlot =
        row.setup_slot === null || row.setup_slot === undefined
          ? index + 1
          : toNumber(row.setup_slot, index + 1)

      const setupName = String(
        row.setup_name ?? row.name ?? row.label ?? `Equipment Setup ${setupSlot}`,
      ).trim()

      const bonusPreview = asRecord(row.bonus_preview)
      const setupCapacity = buildSetupCapacityFromOptions({
        row,
        bonusPreview,
        setupOptions,
      })
      const maxAssignments = setupCapacity
        ? toNumber(
            setupCapacity.max_assignments ??
              setupCapacity.maxAssignments ??
              setupCapacity.capacity,
            -1,
          )
        : -1

      return {
        id: String(row.id ?? row.preset_id),
        setup_slot: setupSlot,
        setup_name: setupName,
        label: setupName,
        bonus_preview:
          Object.keys(bonusPreview).length > 0 ? bonusPreview : null,
        selected_catalog_item_ids:
          Object.keys(asRecord(row.selected_catalog_item_ids)).length > 0
            ? asRecord(row.selected_catalog_item_ids)
            : getSetupSelectedCatalogItemIds(row, bonusPreview),
        selected_items: row.selected_items ?? bonusPreview.selected_items,
        weighted_bonuses: asRecord(
          row.weighted_bonuses ?? bonusPreview.weighted_bonuses,
        ),
        raw_weighted_bonuses: asRecord(
          row.raw_weighted_bonuses ?? bonusPreview.raw_weighted_bonuses,
        ),
        caps: asRecord(row.caps ?? bonusPreview.caps),
        bonus_model: asRecord(row.bonus_model ?? bonusPreview.bonus_model),
        setup_capacity: setupCapacity,
        max_assignments: maxAssignments >= 0 ? maxAssignments : null,
        limiting_item_label: setupCapacity
          ? String(setupCapacity.limiting_item_label ?? '')
          : null,
        limiting_equipment_category: setupCapacity
          ? String(setupCapacity.limiting_equipment_category ?? '')
          : null,
      }
    }).filter((preset) => preset.id && preset.id !== 'undefined')

    const defaultSetupPreset = await loadDefaultEquipmentSetupPreset(clubId)
    const presetsWithDefault = defaultSetupPreset
      ? [...presets, defaultSetupPreset]
      : presets

    return presetsWithDefault.length > 0
      ? presetsWithDefault
      : fallbackToPresetTable()
  } catch (error) {
    console.warn('Failed to load equipment setup presets with preview:', error)

    const [fallbackPresets, defaultSetupPreset] = await Promise.all([
      fallbackToPresetTable(),
      loadDefaultEquipmentSetupPreset(clubId),
    ])

    return defaultSetupPreset
      ? [...fallbackPresets, defaultSetupPreset]
      : fallbackPresets
  }
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