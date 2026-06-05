/**
 * RacePreparation.tsx
 * Main dashboard page for Race Preparation.
 *
 * Tabs:
 * 1. Accepted Races
 * 2. Race Plan
 * 3. Stage Plans
 *
 * Write flow:
 * Button → Supabase Edge Function → SQL RPC → Database
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import RaceDetailPage from './RaceDetailPage'
import {
  getRiderName,
  loadAcceptedRacePreparations,
  loadExistingRacePreparationDraft,
  loadRacePreparationContext,
  loadRacePreparationSelectableData,
  loadRaceStageProfileDetail,
  quoteRacePreparation,
  resolveCurrentClubId,
  saveRacePreparationDraft,
  submitRacePreparation,
} from './race-preparation/racePreparationApi'
import type {
  AcceptedRacePreparationRow,
  EquipmentSetupPresetOption,
  JsonRecord,
  RacePrepAssetKey,
  RacePreparationPayload,
  RacePreparationQuote,
  RacePreparationSelectableData,
  RacePreparationTab,
  RacePreparationTarget,
  UUID,
} from './race-preparation/racePreparationTypes'

const assetLabels: Record<RacePrepAssetKey, string> = {
  team_bus: 'Team Bus',
  equipment_van: 'Equipment Van',
  mobile_workshop: 'Mobile Workshop',
  medical_van: 'Medical Van',
  team_car_1: 'Team Car 1',
  team_car_2: 'Team Car 2',
  team_car_3: 'Team Car 3',
}

function getAssetInventoryKey(assetKey: RacePrepAssetKey): string {
  if (
    assetKey === 'team_car_1' ||
    assetKey === 'team_car_2' ||
    assetKey === 'team_car_3'
  ) {
    return 'team_car'
  }

  return assetKey
}

function createEmptySelectedAssets(): Record<RacePrepAssetKey, UUID | ''> {
  return {
    team_bus: '',
    equipment_van: '',
    mobile_workshop: '',
    medical_van: '',
    team_car_1: '',
    team_car_2: '',
    team_car_3: '',
  }
}

function isAssetSelectedInAnotherSlot(
  selectedAssets: Record<RacePrepAssetKey, UUID | ''>,
  currentAssetKey: RacePrepAssetKey,
  assetId: UUID,
): boolean {
  return Object.entries(selectedAssets).some(([key, value]) => {
    return key !== currentAssetKey && value === assetId
  })
}

const staffRoleLabels: Record<string, string> = {
  sport_director: 'Sport Director',
  team_doctor: 'Team Doctor',
  physio: 'Physio',
  mechanic: 'Mechanic',
}

const raceAssetKeys = Object.keys(assetLabels) as RacePrepAssetKey[]

const monthLabels = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const fullMonthLabels = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function firstNonEmptyRecord(...values: unknown[]): JsonRecord {
  for (const value of values) {
    const record = asRecord(value)

    if (Object.keys(record).length > 0) {
      return record
    }
  }

  return {}
}

function toArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function getText(obj: unknown, key: string) {
  return String(asRecord(obj)[key] ?? '')
}

function getNumber(obj: unknown, key: string) {
  const n = Number(asRecord(obj)[key] ?? 0)
  return Number.isFinite(n) ? n : 0
}

function formatMoney(value: unknown) {
  const n = Number(value ?? 0)
  return `$${n.toLocaleString()}`
}

function parseDateParts(value: unknown) {
  if (!value) return null

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (!year || !month || !day) return null

  return {
    year,
    month,
    day,
    season: year - 1999,
  }
}

function parseGameDateTime(value: unknown): number | null {
  const parts = parseDateParts(value)
  if (!parts) return null

  return Date.UTC(parts.year, parts.month - 1, parts.day)
}

function formatGameDate(value: unknown) {
  const parts = parseDateParts(value)
  if (!parts) return '—'

  return `S${parts.season} · ${monthLabels[parts.month - 1]} ${String(
    parts.day,
  ).padStart(2, '0')}`
}

function formatFullGameDate(value: unknown) {
  const parts = parseDateParts(value)
  if (!parts) return '—'

  return `Season ${parts.season} - ${
    fullMonthLabels[parts.month - 1]
  } ${String(parts.day).padStart(2, '0')}`
}

function formatFullStageDateTime(stage: JsonRecord) {
  const dateLabel = formatFullGameDate(stage.stage_date)
  const timeLabel = getStageStartTime(stage)

  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel
}

function formatCompactStageDateTime(stage: JsonRecord) {
  const parts = parseDateParts(stage.stage_date)
  const timeLabel = getStageStartTime(stage)

  if (!parts) return timeLabel ? `— · ${timeLabel}` : '—'

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))

  const weekday = date.toLocaleDateString(undefined, {
    weekday: 'short',
    timeZone: 'UTC',
  })

  const monthLabel = monthLabels[parts.month - 1] ?? `M${parts.month}`

  const label = `S${parts.season} · ${weekday} · ${monthLabel} ${String(
    parts.day,
  ).padStart(2, '0')}`

  return timeLabel ? `${label} · ${timeLabel}` : label
}

function formatGameDateRange(start: unknown, end: unknown) {
  const startParts = parseDateParts(start)
  const endParts = parseDateParts(end)

  if (!startParts && !endParts) return '—'
  if (startParts && !endParts) return formatGameDate(start)
  if (!startParts && endParts) return formatGameDate(end)

  if (
    startParts!.season === endParts!.season &&
    startParts!.month === endParts!.month
  ) {
    return `S${startParts!.season} · ${monthLabels[startParts!.month - 1]} ${String(
      startParts!.day,
    ).padStart(2, '0')} – ${String(endParts!.day).padStart(2, '0')}`
  }

  if (startParts!.season === endParts!.season) {
    return `S${startParts!.season} · ${
      monthLabels[startParts!.month - 1]
    } ${String(startParts!.day).padStart(2, '0')} – ${
      monthLabels[endParts!.month - 1]
    } ${String(endParts!.day).padStart(2, '0')}`
  }

  return `${formatGameDate(start)} – ${formatGameDate(end)}`
}

function getRacePagePath(raceId: UUID) {
  return `/dashboard/races/${raceId}?raceId=${raceId}`
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

function normalizeRacePreparationTab(value: string | null): RacePreparationTab {
  switch (value) {
    case 'racePlan':
    case 'racePackage':
      return 'racePackage'
    case 'stagePlans':
      return 'stagePlans'
    case 'acceptedRaces':
      return 'acceptedRaces'
    default:
      return 'acceptedRaces'
  }
}

function buildSelectedRacePlanRiders(
  selectedRiderIds: UUID[],
  selectableData: RacePreparationSelectableData | null,
): JsonRecord[] {
  if (!selectableData || selectedRiderIds.length === 0) return []

  const selectedIdSet = new Set(selectedRiderIds)

  return selectableData.riders
    .filter((option) => selectedIdSet.has(option.rider_id))
    .map((option) => {
      const rider = asRecord(option.rider)

      return {
        ...rider,
        id: option.rider_id,
        rider_id: option.rider_id,
        club_rider_id: option.club_rider_id,
        full_name: getRiderName(option.rider),
        role_label: option.assigned_role ?? rider.role_label ?? rider.specialty ?? 'Rider',
      }
    })
}

function normalizeCountryCode(code?: string | null): string | null {
  if (!code) return null

  const normalized = code.trim().toUpperCase()

  if (normalized === 'UK') return 'GB'
  if (!/^[A-Z]{2}$/.test(normalized)) return null

  return normalized
}

function getFlagImageUrl(code?: string | null): string | null {
  const normalized = normalizeCountryCode(code)
  if (!normalized) return null

  return `https://flagcdn.com/w40/${normalized.toLowerCase()}.png`
}

function CountryFlag({ code }: { code?: string | null }) {
  const flagUrl = getFlagImageUrl(code)
  const normalized = normalizeCountryCode(code)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [normalized])

  if (!flagUrl || !normalized || hasError) {
    return (
      <span
        className="inline-block h-4 w-6 shrink-0 rounded-sm border border-slate-200 bg-slate-100 align-middle"
        title={normalized ?? 'Unknown country'}
        aria-label={normalized ?? 'Unknown country'}
      />
    )
  }

  return (
    <img
      src={flagUrl}
      alt={normalized}
      title={normalized}
      className="inline-block h-4 w-6 shrink-0 rounded-sm border border-slate-200 object-cover align-middle"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}


const riderSkillLabels: Record<string, string> = {
  flat: 'Flat',
  hill: 'Hill',
  hills: 'Hills',
  mountain: 'Mountain',
  climbing: 'Climbing',
  sprint: 'Sprint',
  time_trial: 'Time Trial',
  timetrial: 'Time Trial',
  cobble: 'Cobble',
  cobbles: 'Cobbles',
  endurance: 'Endurance',
  stamina: 'Stamina',
  recovery: 'Recovery',
  acceleration: 'Acceleration',
  descending: 'Descending',
  technique: 'Technique',
  teamwork: 'Teamwork',
  race_intelligence: 'Race IQ',
  intelligence: 'Race IQ',
}

const preferredRiderSkillKeys = [
  'mountain',
  'climbing',
  'hill',
  'hills',
  'flat',
  'sprint',
  'time_trial',
  'timetrial',
  'cobble',
  'cobbles',
  'endurance',
  'stamina',
  'recovery',
  'acceleration',
  'descending',
  'technique',
  'teamwork',
  'race_intelligence',
  'intelligence',
]

function getRiderCountryCode(rider: JsonRecord): string | null {
  return (
    getOptionalText(rider, 'country_code') ??
    getOptionalText(rider, 'nationality_code') ??
    getOptionalText(rider, 'country_iso2') ??
    getOptionalText(rider, 'nation_code') ??
    null
  )
}

function getOptionalText(obj: unknown, key: string): string | null {
  const value = asRecord(obj)[key]

  if (value === null || value === undefined || value === '') {
    return null
  }

  return String(value)
}

function getRiderAgeLabel(
  rider: JsonRecord,
  currentGameDate?: string,
): string | null {
  const directAge = Number(
    rider.age ?? rider.rider_age ?? rider.current_age ?? 0,
  )

  if (Number.isFinite(directAge) && directAge > 0) {
    return `${Math.floor(directAge)} years`
  }

  const birthDate = String(
    rider.date_of_birth ??
      rider.birth_date ??
      rider.dob ??
      '',
  )

  const birthParts = parseDateParts(birthDate)
  const currentParts = parseDateParts(currentGameDate)

  if (!birthParts || !currentParts) {
    return null
  }

  let age = currentParts.year - birthParts.year

  if (
    currentParts.month < birthParts.month ||
    (currentParts.month === birthParts.month &&
      currentParts.day < birthParts.day)
  ) {
    age -= 1
  }

  return age > 0 ? `${age} years` : null
}

function getTopRiderSkills(rider: JsonRecord): {
  key: string
  label: string
  value: number
}[] {
  const rows = preferredRiderSkillKeys.flatMap((key) => {
    const value = Number(rider[key] ?? rider[`${key}_skill`] ?? NaN)

    if (!Number.isFinite(value)) {
      return []
    }

    return [
      {
        key,
        label: riderSkillLabels[key] ?? titleFromSnake(key),
        value: Math.round(value),
      },
    ]
  })

  return rows
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
}

function getRaceRouteLine(race: unknown, stageCount?: number): string {
  const record = asRecord(race)

  const startCity = String(
    record.start_city ??
      record.host_city ??
      record.city ??
      record.location_city ??
      '',
  ).trim()

  const finishCity = String(
    record.finish_city ??
      record.end_city ??
      record.host_city ??
      record.city ??
      record.location_city ??
      '',
  ).trim()

  const route =
    startCity && finishCity && startCity !== finishCity
      ? `${startCity} → ${finishCity}`
      : startCity || finishCity || 'Route details pending'

  const stages = Number(stageCount ?? record.stage_count ?? 0)

  if (stages > 1) {
    return `${route} · ${stages} stages`
  }

  return `${route} · One Day Race`
}

function getRaceLifecycleLabel(status?: string | null) {
  switch (status) {
    case 'completed':
      return 'Race finished'
    case 'active':
      return 'Race active'
    case 'scheduled':
      return 'Scheduled'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status ? titleFromSnake(status) : 'Scheduled'
  }
}

function statusClass(status?: string) {
  switch (status) {
    case 'race_plan_open':
    case 'draft':
      return 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200'
    case 'submitted':
    case 'accepted':
      return 'bg-emerald-100 text-emerald-800'
    case 'locked':
      return 'bg-slate-200 text-slate-800'
    case 'not_created':
      return 'bg-slate-100 text-slate-700'
    case 'missed_startlist':
    case 'declined':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function getRacePlanStatusLabel(status?: string) {
  switch (status) {
    case 'draft':
    case 'race_plan_open':
      return 'Race Plan Open'
    case 'submitted':
      return 'Race Plan Submitted'
    case 'locked':
    case 'sent_to_engine':
      return 'Race Active'
    case 'not_created':
      return 'Race Plan Not Open'
    default:
      return status ? titleFromSnake(status) : 'Race Plan Not Open'
  }
}

function getRacePlanUiStatus({
  raceStatus,
  prepStatus,
  isPackageTooEarly,
  isPackageDeadlinePassed,
  packageSubmitted,
}: {
  raceStatus: string
  prepStatus: string
  isPackageTooEarly: boolean
  isPackageDeadlinePassed: boolean
  packageSubmitted: boolean
}) {
  if (packageSubmitted || isPackageDeadlinePassed) {
    return 'submitted'
  }

  if (isPackageTooEarly) {
    return 'not_created'
  }

  if (
    raceStatus === 'draft' ||
    prepStatus === 'draft' ||
    raceStatus === 'not_created'
  ) {
    return 'race_plan_open'
  }

  return raceStatus || prepStatus || 'race_plan_open'
}

function titleFromSnake(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}



function isRacePackageSubmitted(status?: string | null) {
  return (
    status === 'submitted' ||
    status === 'locked' ||
    status === 'sent_to_engine'
  )
}

function getAcceptedRacePreparationState(
  row: AcceptedRacePreparationRow,
  currentGameDate?: string,
) {
  const raceStatus = String(row.race.status ?? '').toLowerCase()
  const packageStatus = row.race_package_status
  const currentTime = parseGameDateTime(currentGameDate)
  const opensTime = parseGameDateTime(row.setup_window_opens_on)
  const deadlineTime = parseGameDateTime(row.rider_submission_deadline_on)

  if (raceStatus === 'completed' || raceStatus === 'archived') {
    return {
      label: 'Race Finished',
      className: 'bg-slate-100 text-slate-700',
      stagePlansEnabled: false,
    }
  }

  if (raceStatus === 'active') {
    return {
      label: 'Race Active',
      className: 'bg-emerald-100 text-emerald-700',
      stagePlansEnabled: isRacePackageSubmitted(packageStatus),
    }
  }

  if (packageStatus === 'submitted') {
    return {
      label: 'Stage Plans Open',
      className: 'bg-blue-100 text-blue-700',
      stagePlansEnabled: true,
    }
  }

  if (packageStatus === 'locked' || packageStatus === 'sent_to_engine') {
    return {
      label: 'All Set',
      className: 'bg-emerald-100 text-emerald-700',
      stagePlansEnabled: true,
    }
  }

  if (packageStatus === 'draft') {
    if (
      currentTime !== null &&
      deadlineTime !== null &&
      currentTime > deadlineTime
    ) {
      return {
        label: 'Stage Plans Open',
        className: 'bg-blue-100 text-blue-700',
        stagePlansEnabled: true,
      }
    }

    return {
      label: 'Race Plan Open',
      className: statusClass('race_plan_open'),
      stagePlansEnabled: false,
    }
  }

  if (
    currentTime !== null &&
    opensTime !== null &&
    deadlineTime !== null &&
    currentTime >= opensTime &&
    currentTime <= deadlineTime
  ) {
    return {
      label: 'Race Plan Open',
      className: statusClass('race_plan_open'),
      stagePlansEnabled: false,
    }
  }

  if (
    currentTime !== null &&
    opensTime !== null &&
    currentTime < opensTime
  ) {
    return {
      label: 'Race Plan Not Open',
      className: 'bg-slate-100 text-slate-700',
      stagePlansEnabled: false,
    }
  }

  if (
    currentTime !== null &&
    deadlineTime !== null &&
    currentTime > deadlineTime
  ) {
    return {
      label: 'Stage Plans Open',
      className: 'bg-blue-100 text-blue-700',
      stagePlansEnabled: true,
    }
  }

  return {
    label: 'Scheduled',
    className: 'bg-slate-100 text-slate-700',
    stagePlansEnabled: false,
  }
}

export default function RacePreparationPage(): JSX.Element {
  const [searchParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState<RacePreparationTab>(() =>
    normalizeRacePreparationTab(searchParams.get('tab')),
  )

  const [clubId, setClubId] = useState<UUID | null>(null)
  const [selectedRaceId, setSelectedRaceId] = useState<UUID | null>(null)
  const [acceptedRaces, setAcceptedRaces] = useState<
    AcceptedRacePreparationRow[]
  >([])
  const [target, setTarget] = useState<RacePreparationTarget | null>(null)
  const [selectableData, setSelectableData] =
    useState<RacePreparationSelectableData | null>(null)

  const [selectedRiderIds, setSelectedRiderIds] = useState<UUID[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<UUID[]>([])
  const [selectedAssets, setSelectedAssets] = useState<
    Record<RacePrepAssetKey, UUID | ''>
  >(() => createEmptySelectedAssets())
  const [quote, setQuote] = useState<RacePreparationQuote | null>(null)
  const [quoteRefreshing, setQuoteRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [racePreviewId, setRacePreviewId] = useState<UUID | null>(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  const race = target?.race ?? null
  const entryRules = target?.entry_rules ?? null
  const preparation = target?.preparation ?? null
  const raceId = selectedRaceId ?? (getText(race, 'id') || null)
  const raceStatus = target?.race_package_status ?? 'not_created'
  const prepStatus = getText(preparation, 'status')
  const savedCostBreakdown = asRecord(preparation?.cost_breakdown_json)
  const liveCostBreakdown = asRecord(quote?.cost_breakdown)

  const costBreakdown =
    Object.keys(liveCostBreakdown).length > 0
      ? liveCostBreakdown
      : savedCostBreakdown

  const validationSnapshot = asRecord(preparation?.validation_snapshot_json)
  const savedQuote = asRecord(validationSnapshot.quote)

  const liveBonusPreview = asRecord(quote?.bonus_preview)
  const savedBonusPreviewFromRoot = asRecord(validationSnapshot.bonus_preview)
  const savedBonusPreviewFromQuote = asRecord(savedQuote.bonus_preview)

  const bonusPreview = firstNonEmptyRecord(
    liveBonusPreview,
    savedBonusPreviewFromRoot,
    savedBonusPreviewFromQuote,
  )

  const standardizedBonus = firstNonEmptyRecord(
    quote?.standardized_bonus,
    liveBonusPreview.standardized_bonus,
    validationSnapshot.standardized_bonus,
    savedQuote.standardized_bonus,
    bonusPreview.groups ? bonusPreview : {},
  )

  const selectedRacePlanRiders = useMemo(
    () => buildSelectedRacePlanRiders(selectedRiderIds, selectableData),
    [selectedRiderIds, selectableData],
  )

  const selectedStaffByRole = useMemo(() => {
    const result: Record<string, UUID> = {}

    ;(selectableData?.staff ?? []).forEach((staff) => {
      if (selectedStaffIds.includes(staff.id)) {
        result[staff.role_type] = staff.id
      }
    })

    return result
  }, [selectableData?.staff, selectedStaffIds])

  const defaultEquipmentSetupId: UUID | null = null

  const payload: RacePreparationPayload | null = useMemo(() => {
    if (!raceId || !clubId) return null

    const assetAssignments = raceAssetKeys.flatMap((assetKey) => {
      const assetId = selectedAssets[assetKey]
      if (!assetId) return []

      return [
        {
          asset_key: getAssetInventoryKey(assetKey),
          asset_slot_key: assetKey,
          asset_id: assetId,
        },
      ]
    })

    return {
      race_id: raceId,
      club_id: clubId,
      rider_ids: selectedRiderIds,
      staff_ids: selectedStaffIds,
      asset_assignments: assetAssignments,
      supply_reservations: {},
      default_equipment_setup_id: defaultEquipmentSetupId,
    }
  }, [
    clubId,
    defaultEquipmentSetupId,
    raceId,
    selectedAssets,
    selectedRiderIds,
    selectedStaffIds,
  ])

  const currentGameDateTime = parseGameDateTime(target?.current_game_date)
  const packageOpensTime = parseGameDateTime(target?.setup_window_opens_on)
  const riderDeadlineTime = parseGameDateTime(
    target?.rider_submission_deadline_on,
  )

  const isPackageWindowOpen =
    currentGameDateTime !== null &&
    packageOpensTime !== null &&
    riderDeadlineTime !== null &&
    currentGameDateTime >= packageOpensTime &&
    currentGameDateTime <= riderDeadlineTime

  const isPackageTooEarly =
    currentGameDateTime !== null &&
    packageOpensTime !== null &&
    currentGameDateTime < packageOpensTime

  const isPackageDeadlinePassed =
    currentGameDateTime !== null &&
    riderDeadlineTime !== null &&
    currentGameDateTime > riderDeadlineTime

  const canEdit =
    isPackageWindowOpen &&
    (raceStatus === 'not_created' ||
      raceStatus === 'draft' ||
      prepStatus === 'draft')

  const packageSubmitted =
    raceStatus === 'submitted' ||
    raceStatus === 'locked' ||
    raceStatus === 'sent_to_engine' ||
    prepStatus === 'submitted' ||
    prepStatus === 'locked' ||
    prepStatus === 'sent_to_engine'

  const stagePlansOpen = packageSubmitted || isPackageDeadlinePassed

  const racePlanUiStatus = getRacePlanUiStatus({
    raceStatus,
    prepStatus,
    isPackageTooEarly,
    isPackageDeadlinePassed,
    packageSubmitted,
  })

  const minRiders = getNumber(entryRules, 'min_riders_per_team')
  const maxRiders = getNumber(entryRules, 'max_riders_per_team')

  const selectedRiderCount = selectedRiderIds.length

  const riderSelectionTooFew =
    minRiders > 0 && selectedRiderCount < minRiders

  const riderSelectionTooMany =
    maxRiders > 0 && selectedRiderCount > maxRiders

  const riderSelectionValid =
    !riderSelectionTooFew && !riderSelectionTooMany

  const canSaveRacePlan = canEdit && !riderSelectionTooMany
  const canSubmitRacePlan = canEdit && riderSelectionValid

  useEffect(() => {
    if (!payload || !canEdit) return

    const timer = window.setTimeout(() => {
      setQuoteRefreshing(true)

      quoteRacePreparation(payload)
        .then((result) => {
          console.log('Race Plan live quote payload', payload)
          console.log('Race Plan live quote result', result)
          console.log('Race Plan standardized bonus', asRecord(result).standardized_bonus)
          setQuote(result)
        })
        .catch((error) => {
          console.error('Failed to refresh Race Plan quote', error)
        })
        .finally(() => {
          setQuoteRefreshing(false)
        })
    }, 500)

    return () => window.clearTimeout(timer)
  }, [payload, canEdit])

  useEffect(() => {
    if (!loading && activeTab === 'stagePlans' && !stagePlansOpen) {
      setActiveTab('racePackage')
    }
  }, [activeTab, loading, stagePlansOpen])

  async function applyContext(context: RacePreparationTarget) {
    setTarget(context)
    setQuote(null)

    const contextRaceId = getText(context.race, 'id')
    setSelectedRaceId(contextRaceId || null)

    const prepId = context.preparation?.id
      ? String(context.preparation.id)
      : null

    if (prepId) {
      const draft = await loadExistingRacePreparationDraft(prepId)
      setSelectedRiderIds(draft.riderIds)
      setSelectedStaffIds(draft.staffIds)
      setSelectedAssets({
        ...createEmptySelectedAssets(),
        ...draft.assetAssignments,
      })
    } else {
      setSelectedRiderIds([])
      setSelectedStaffIds([])
      setSelectedAssets(createEmptySelectedAssets())
    }
  }

  async function loadPage(preferredRaceId?: UUID | null) {
    setLoading(true)
    setErrorMessage(null)
    setMessage(null)
    setQuote(null)

    try {
      const resolvedClubId = await resolveCurrentClubId()
      setClubId(resolvedClubId)

      const [acceptedResult, selectableResult] = await Promise.all([
        loadAcceptedRacePreparations(resolvedClubId),
        loadRacePreparationSelectableData(resolvedClubId),
      ])

      setAcceptedRaces(acceptedResult)
      setSelectableData(selectableResult)

      const raceToLoad =
        preferredRaceId ??
        selectedRaceId ??
        acceptedResult[0]?.race_id ??
        null

      if (!raceToLoad) {
        setTarget({
          has_target: false,
          message: 'No accepted races found for this club.',
        })
        return
      }

      const context = await loadRacePreparationContext(resolvedClubId, raceToLoad)
      await applyContext(context)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load page.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function selectRace(raceIdToSelect: UUID, nextTab: RacePreparationTab) {
    if (!clubId) return

    setActionLoading(true)
    setErrorMessage(null)
    setMessage(null)

    try {
      const context = await loadRacePreparationContext(clubId, raceIdToSelect)
      await applyContext(context)
      setActiveTab(nextTab)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load selected race.',
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function refreshSelectedRace() {
    if (!clubId || !raceId) return

    const [acceptedResult, context] = await Promise.all([
      loadAcceptedRacePreparations(clubId),
      loadRacePreparationContext(clubId, raceId),
    ])

    setAcceptedRaces(acceptedResult)
    await applyContext(context)
  }

  useEffect(() => {
    const tabFromUrl = normalizeRacePreparationTab(searchParams.get('tab'))
    const raceIdFromUrl = searchParams.get('raceId')

    setActiveTab(tabFromUrl)

    void loadPage(isUuid(raceIdFromUrl) ? raceIdFromUrl : null)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleQuote() {
    if (!payload) return

    setActionLoading(true)
    setErrorMessage(null)
    setMessage(null)

    try {
      const result = await quoteRacePreparation(payload)
      console.log('Race quote result', result)
      console.log('Standardized bonus', asRecord(result).standardized_bonus)
      setQuote(result)
      setMessage('Race Plan quote refreshed.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to quote race plan.',
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSaveDraft() {
    if (!payload) return

    if (riderSelectionTooMany) {
      setErrorMessage(
        `Remove ${selectedRiderCount - maxRiders} rider${
          selectedRiderCount - maxRiders === 1 ? '' : 's'
        } before saving.`,
      )
      return
    }

    setActionLoading(true)
    setErrorMessage(null)
    setMessage(null)

    try {
      await saveRacePreparationDraft(payload)
      setMessage('Race Plan saved.')
      await refreshSelectedRace()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to save race plan.',
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSubmit() {
    if (!riderSelectionValid) {
      setErrorMessage(
        `Select ${minRiders}–${maxRiders} riders before submitting the Race Plan.`,
      )
      return
    }

    if (!raceId || !clubId || !payload) return

    setActionLoading(true)
    setErrorMessage(null)
    setMessage(null)

    try {
      if (canEdit) {
        await saveRacePreparationDraft(payload)
      }

      const result = await submitRacePreparation({
        race_id: raceId,
        club_id: clubId,
      })

      setMessage(
        String(result.message ?? 'Race Plan submitted successfully.'),
      )

      await refreshSelectedRace()
      setActiveTab('stagePlans')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to submit race plan.',
      )
    } finally {
      setActionLoading(false)
    }
  }

  function requestSubmitRacePlan() {
    if (!riderSelectionValid) {
      setErrorMessage(
        `Select ${minRiders}–${maxRiders} riders before submitting the Race Plan.`,
      )
      return
    }

    if (!canEdit) return

    if (!isPackageDeadlinePassed && !packageSubmitted) {
      setShowSubmitConfirm(true)
      return
    }

    void handleSubmit()
  }

  function toggleRider(riderId: UUID) {
    if (!canEdit) return

    setSelectedRiderIds((current) => {
      if (current.includes(riderId)) {
        setErrorMessage(null)
        return current.filter((id) => id !== riderId)
      }

      if (maxRiders > 0 && current.length >= maxRiders) {
        setErrorMessage(
          `Maximum ${maxRiders} riders can be selected for this race.`,
        )
        return current
      }

      setErrorMessage(null)
      return [...current, riderId]
    })
  }

  function setStaffForRole(roleType: string, staffId: UUID | '') {
    if (!canEdit) return

    const staffInRole = new Set(
      (selectableData?.staff ?? [])
        .filter((staff) => staff.role_type === roleType)
        .map((staff) => staff.id),
    )

    setSelectedStaffIds((current) => {
      const withoutThisRole = current.filter((id) => !staffInRole.has(id))
      return staffId ? [...withoutThisRole, staffId] : withoutThisRole
    })
  }


  function updateSelectedAsset(assetKey: RacePrepAssetKey, assetId: UUID | '') {
    if (!canEdit) return

    if (
      assetId &&
      isAssetSelectedInAnotherSlot(selectedAssets, assetKey, assetId)
    ) {
      setErrorMessage('This asset is already selected in another Race Plan slot.')
      return
    }

    setErrorMessage(null)

    setSelectedAssets((current) => ({
      ...current,
      [assetKey]: assetId,
    }))
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          Loading Race Preparation...
        </div>
      </div>
    )
  }

  if (errorMessage && !target) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          {errorMessage}
        </div>
      </div>
    )
  }

  const raceClassCode =
    getText(entryRules, 'race_class_code') ||
    getText(race, 'race_class_code') ||
    getText(race, 'category')

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          Race Preparation
        </h1>
        <p className="text-sm text-slate-600">
          Accepted races are listed first. Race Plan handles whole-race
          startlist, travel, staff, assets and costs. Stage Plans handle
          stage-by-stage tactics after the race plan is submitted.
        </p>
      </header>

      <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">
        <TabButton
          label="Accepted Races"
          active={activeTab === 'acceptedRaces'}
          onClick={() => setActiveTab('acceptedRaces')}
        />
        <TabButton
          label="Race Plan"
          active={activeTab === 'racePackage'}
          onClick={() => setActiveTab('racePackage')}
        />
        <TabButton
          label="Stage Plans"
          active={activeTab === 'stagePlans'}
          disabled={!stagePlansOpen}
          onClick={() => setActiveTab('stagePlans')}
        />
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {activeTab === 'acceptedRaces' && (
        <AcceptedRacesTab
          acceptedRaces={acceptedRaces}
          selectedRaceId={raceId}
          currentGameDate={target?.current_game_date}
          actionLoading={actionLoading}
          onPrepareRace={(id) => selectRace(id, 'racePackage')}
          onOpenStages={(id) => selectRace(id, 'stagePlans')}
        />
      )}

      {activeTab === 'racePackage' && (
        <>
          {!target?.has_target ? (
            <EmptyCard message="No accepted race selected." />
          ) : (
            <>
              <RaceHeaderCard
                race={race}
                raceClassCode={raceClassCode}
                minRiders={minRiders}
                maxRiders={maxRiders}
                raceStatus={racePlanUiStatus}
                currentGameDate={target.current_game_date}
                packageOpensOn={target.setup_window_opens_on}
                riderDeadlineOn={target.rider_submission_deadline_on}
                stageCount={target.stages?.length ?? 1}
              />

              {isPackageTooEarly && (
                <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
                  Race Plan is not open yet. It opens on{' '}
                  {formatFullGameDate(target.setup_window_opens_on)}.
                </div>
              )}

              {isPackageDeadlinePassed && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  Rider submission deadline has passed. This Race Plan can no
                  longer be edited.
                </div>
              )}

              <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
                <div className="space-y-6">
                  <RacePackageCard title="1. Riders">
                    <div
                      className={`mb-3 text-sm ${
                        riderSelectionTooFew || riderSelectionTooMany
                          ? 'text-red-700'
                          : 'text-slate-600'
                      }`}
                    >
                      Selected riders: {selectedRiderCount}
                      {minRiders || maxRiders
                        ? ` · Required: ${minRiders || '—'}–${
                            maxRiders || '—'
                          }`
                        : ''}

                      {riderSelectionTooMany && (
                        <div className="mt-1 font-medium">
                          Remove {selectedRiderCount - maxRiders} rider
                          {selectedRiderCount - maxRiders === 1 ? '' : 's'} before saving.
                        </div>
                      )}

                      {riderSelectionTooFew && (
                        <div className="mt-1 font-medium">
                          Select at least {minRiders} riders before submitting.
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {(selectableData?.riders ?? []).map((option) => {
                        const selected = selectedRiderIds.includes(
                          option.rider_id,
                        )
                        return (
                          <RiderSelectionCard
                            key={option.rider_id}
                            option={option}
                            selected={selected}
                            canEdit={canEdit}
                            currentGameDate={target?.current_game_date}
                            onToggle={() => toggleRider(option.rider_id)}
                          />
                        )
                      })}
                    </div>
                  </RacePackageCard>

                  <RacePackageCard title="2. Race Staff">
                    <div className="mb-3 text-sm text-slate-600">
                      Only Sport Director, Team Doctor, Physio, and Mechanic are
                      available for Race Preparation.
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {Object.entries(staffRoleLabels).map(
                        ([roleType, label]) => {
                          const options = (selectableData?.staff ?? []).filter(
                            (staff) => staff.role_type === roleType,
                          )

                          return (
                            <label key={roleType} className="block">
                              <span className="text-sm font-medium text-slate-700">
                                {label}
                              </span>
                              <select
                                disabled={!canEdit}
                                value={selectedStaffByRole[roleType] ?? ''}
                                onChange={(event) =>
                                  setStaffForRole(roleType, event.target.value)
                                }
                                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
                              >
                                <option value="">
                                  No {label} selected
                                </option>
                                {options.map((staff) => (
                                  <option key={staff.id} value={staff.id}>
                                    {staff.staff_name} · EXP{' '}
                                    {staff.experience ?? 0} · EFF{' '}
                                    {staff.efficiency ?? 0}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )
                        },
                      )}
                    </div>
                  </RacePackageCard>

                  <RacePackageCard title="3. Race Assets">
                    <div className="grid gap-4 md:grid-cols-2">
                      {raceAssetKeys.map((assetKey) => (
                        <label key={assetKey} className="block">
                          <span className="text-sm font-medium text-slate-700">
                            {assetLabels[assetKey]}
                          </span>
                          <select
                            disabled={!canEdit}
                            value={selectedAssets[assetKey]}
                            onChange={(event) =>
                              updateSelectedAsset(
                                assetKey,
                                event.target.value as UUID | '',
                              )
                            }
                            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
                          >
                            <option value="">No asset selected</option>
                            {(
                              selectableData?.assets[
                                getAssetInventoryKey(assetKey)
                              ] ?? []
                            ).map((asset) => (
                              <option
                                key={asset.id}
                                value={asset.id}
                                disabled={isAssetSelectedInAnotherSlot(
                                  selectedAssets,
                                  assetKey,
                                  asset.id,
                                )}
                              >
                                {asset.display_name} · Lv{' '}
                                {asset.asset_level ?? 1} ·{' '}
                                {Number(
                                  asset.condition_percent ?? 0,
                                ).toFixed(0)}% condition
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </RacePackageCard>

                </div>

                <aside className="space-y-6">
                  <RacePackageCard title="Cost Preview">
                    <div className="space-y-2 text-sm">
                      <CostLine
                        label="Participation"
                        value={costBreakdown.participation_cost_cash}
                      />
                      <CostLine
                        label="Rider travel"
                        value={costBreakdown.rider_travel_cost_cash}
                      />
                      <CostLine
                        label="Staff travel"
                        value={costBreakdown.staff_travel_cost_cash}
                      />
                      <CostLine
                        label="Asset transport"
                        value={costBreakdown.asset_transport_cost_cash}
                      />
                      <CostLine
                        label="Team Policies & Operations"
                        value={costBreakdown.operations_cost_cash}
                      />
                      <div className="border-t pt-3">
                        <CostLine
                          label="Total"
                          value={costBreakdown.total_cost_cash}
                          strong
                        />
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      This is a preview only. Saving the Race Plan does not
                      charge money or lock assets. Payment and locks happen
                      only after confirmed submission or the rider deadline.
                      {quoteRefreshing ? <span> Updating preview…</span> : null}
                    </div>

                    <div className="mt-5 flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={actionLoading || !payload}
                        onClick={handleQuote}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Refresh Quote
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading || !payload || !canSaveRacePlan}
                        onClick={handleSaveDraft}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Save Race Plan
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading || !payload || !canSubmitRacePlan}
                        onClick={requestSubmitRacePlan}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Submit Race Plan
                      </button>
                    </div>
                  </RacePackageCard>

                  <RacePackageCard title="Validation">
                    {quote?.errors?.length ? (
                      <div className="space-y-2">
                        {quote.errors.map((error) => (
                          <div
                            key={error}
                            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
                          >
                            {error}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-600">
                        Refresh quote to check validation.
                      </div>
                    )}

                    {quote?.warnings?.length ? (
                      <div className="mt-4 space-y-2">
                        {quote.warnings.map((warning) => (
                          <div
                            key={warning}
                            className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
                          >
                            {warning}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </RacePackageCard>

                  <RacePlanBonusPreview
                    standardizedBonus={standardizedBonus}
                    exactBonusPreview={bonusPreview}
                  />
                </aside>
              </section>
            </>
          )}
        </>
      )}

      {activeTab === 'stagePlans' && (
        <StagePlansTab
          target={target}
          packageSubmitted={stagePlansOpen}
          raceId={raceId}
          selectedRiders={selectedRacePlanRiders}
          equipmentPresetOptions={selectableData?.equipmentPresets ?? []}
          selectedStageIdFromUrl={searchParams.get('stageId')}
          onOpenRacePreview={setRacePreviewId}
        />
      )}

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-950">
              Submit Race Plan now?
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              The rider deadline is{' '}
              <strong>
                {formatGameDate(target?.rider_submission_deadline_on)}
              </strong>
              . If you submit the Race Plan now, riders, race staff and race
              assets will be locked for this race. Stage Plans will open
              immediately after submission.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSubmitConfirm(false)
                  void handleSubmit()
                }}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Yes, Submit Race Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {racePreviewId && (
        <RacePreviewModal
          raceId={racePreviewId}
          onClose={() => setRacePreviewId(null)}
        />
      )}
    </div>
  )
}

function AcceptedRacesTab({
  acceptedRaces,
  selectedRaceId,
  currentGameDate,
  actionLoading,
  onPrepareRace,
  onOpenStages,
}: {
  acceptedRaces: AcceptedRacePreparationRow[]
  selectedRaceId: UUID | null
  currentGameDate?: string
  actionLoading: boolean
  onPrepareRace: (raceId: UUID) => void
  onOpenStages: (raceId: UUID) => void
}) {
  if (acceptedRaces.length === 0) {
    return <EmptyCard message="No accepted races found for this club." />
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Accepted Races
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Confirmed participations. The status shows what can be done now for
          Race Plan and Stage Plans.
        </p>
      </div>

      <div className="space-y-3">
        {acceptedRaces.map((row) => {
          const selected = selectedRaceId === row.race_id
          const race = row.race
          const prepState = getAcceptedRacePreparationState(
            row,
            currentGameDate,
          )

          const raceClass =
            String(
              row.entry_rules?.race_class_code ??
                race.race_class_code ??
                race.category ??
                '—',
            ) || '—'

          const raceTypeLabel =
            row.stage_count > 1 ? 'Stage Race' : 'One Day'

          const startParts = parseDateParts(race.start_date)
          const endParts = parseDateParts(race.end_date)

          const startDay = startParts
            ? `${String(startParts.day).padStart(2, '0')} ${
                monthLabels[startParts.month - 1]
              }`
            : '—'

          const endDay = endParts
            ? `${String(endParts.day).padStart(2, '0')} ${
                monthLabels[endParts.month - 1]
              }`
            : '—'

          return (
            <div
              key={row.race_team_entry_id}
              className={`rounded-2xl border p-4 transition ${
                selected
                  ? 'border-yellow-300 bg-yellow-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="grid gap-4 md:grid-cols-[80px_1fr_auto] md:items-center">
                <div className="flex items-center gap-4">
                  <div className="w-16 text-right text-sm font-semibold leading-tight text-slate-950">
                    <div>{startDay}</div>
                    {race.start_date !== race.end_date && (
                      <div>{endDay}</div>
                    )}
                  </div>

                  <div className="h-14 w-px bg-emerald-400" />
                </div>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => onPrepareRace(row.race_id)}
                  className="min-w-0 text-left disabled:opacity-60"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <CountryFlag code={String(race.country_code ?? '')} />

                    <div className="truncate text-base font-semibold text-slate-900">
                      {race.name}
                    </div>

                    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                      {raceClass}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        row.stage_count > 1
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {raceTypeLabel}
                    </span>
                  </div>

                  <div className="mt-1 truncate text-xs text-slate-500">
                    {getRaceRouteLine(race, row.stage_count)}
                  </div>
                </button>

                <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${prepState.className}`}
                  >
                    {prepState.label}
                  </span>

                  <button
                    type="button"
                    disabled={actionLoading || !prepState.stagePlansEnabled}
                    onClick={() => onOpenStages(row.race_id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      prepState.stagePlansEnabled
                        ? 'bg-yellow-400 text-slate-950 hover:bg-yellow-300'
                        : 'cursor-not-allowed bg-slate-100 text-slate-400'
                    }`}
                    title={
                      prepState.stagePlansEnabled
                        ? 'Open Stage Plans'
                        : 'Stage Plans open after the rider deadline or confirmed early submission'
                    }
                  >
                    Stage Plans
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RaceHeaderCard({
  race,
  raceClassCode,
  minRiders,
  maxRiders,
  raceStatus,
  currentGameDate,
  packageOpensOn,
  riderDeadlineOn,
  stageCount,
}: {
  race: unknown
  raceClassCode: string
  minRiders: number
  maxRiders: number
  raceStatus: string
  currentGameDate?: string
  packageOpensOn?: string
  riderDeadlineOn?: string
  stageCount: number
}) {
  const raceId = getText(race, 'id')

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Selected race
          </div>

          <div className="mt-1 flex items-center gap-2">
            <CountryFlag code={getText(race, 'country_code')} />
            <h2 className="text-xl font-semibold text-slate-900">
              {getText(race, 'name') || 'Unnamed race'}
            </h2>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <InfoChip
              label="Race dates"
              value={formatGameDateRange(
                getText(race, 'start_date'),
                getText(race, 'end_date'),
              )}
            />
            <InfoChip label="Class" value={raceClassCode || '—'} />
            <InfoChip
              label="Riders"
              value={`${minRiders || '—'}–${maxRiders || '—'}`}
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
              raceStatus,
            )}`}
          >
            {getRacePlanStatusLabel(raceStatus)}
          </span>

          <InfoChip
            label="Current game date"
            value={formatFullGameDate(currentGameDate)}
            alignRight
          />

          {raceId && (
            <Link
              to={getRacePagePath(raceId)}
              className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Open Race Page
            </Link>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <InfoBox
          label="Race Plan opens"
          value={formatFullGameDate(packageOpensOn)}
        />
        <InfoBox
          label="Rider deadline"
          value={formatFullGameDate(riderDeadlineOn)}
        />
        <InfoBox label="Stages" value={String(stageCount)} />
      </div>
    </section>
  )
}



type BonusBreakdownRow = {
  sourceType: string
  sourceLabel: string
  effectKey: string
  effectLabel: string
  rawValueText: string
  contributionPercent: number
  contributionLabel: string
}

const standardizedBonusDescriptions: Record<string, string> = {
  fatigue_control:
    'Reduces race fatigue pressure, travel fatigue, and fatigue floor effects.',
  recovery_support:
    'Improves daily recovery, recovery duration, and post-stage recovery.',
  health_protection:
    'Reduces injury risk, illness risk, and minor health problems.',
  mechanical_reliability:
    'Reduces mechanical problems, mechanical time loss, and equipment-related race issues.',
  race_support:
    'Improves feeding, team-car coverage, race logistics, and tactical support.',
}

const standardizedEffectKeyMap: Record<string, string[]> = {
  fatigue_control: [
    'tour_fatigue_reduction_pct',
    'one_day_fatigue_reduction_pct',
    'short_tour_fatigue_reduction_pct',
    'long_tour_fatigue_reduction_pct',
    'race_fatigue_protection_pct',
    'race_fatigue_reduction_pct',
    'fatigue_floor_reduction',
    'travel_comfort_pct',
  ],

  recovery_support: [
    'recovery_duration',
    'daily_recovery_bonus',
    'post_stage_recovery_pct',
    'post_stage_recovery_bonus_pct',
    'post_stage_recovery_support',
    'recovery_comfort_bonus_pct',
    'recovery_bonus',
  ],

  health_protection: [
    'injury_illness_risk',
    'minor_injury_risk_reduction_pct',
    'medical_response_pct',
    'medical_response_bonus_pct',
    'hydration_support_pct',
    'hydration_support_bonus_pct',
    'heat_hydration_support_pct',
  ],

  mechanical_reliability: [
    'mechanical_time_loss_reduction_pct',
    'mechanical_response_pct',
    'mechanical_response_bonus_pct',
    'pre_stage_readiness_pct',
    'pre_stage_equipment_readiness_pct',
    'spare_bike_response_pct',
    'spare_bike_response_bonus_pct',
    'wheel_change_support_pct',
    'equipment_condition_loss_reduction_pct',
    'repair_speed_pct',
    'repair_cost_reduction_pct',
    'mechanic_response_pct',
    'mechanic_response_during_races',
  ],

  race_support: [
    'race_support_coverage_pct',
    'race_support_quality_pct',
    'feeding_support_pct',
    'feeding_support_bonus_pct',
    'tactical_communication_pct',
    'tactical_support_pct',
    'incident_response_pct',
    'incident_support_pct',
    'crash_incident_response_pct',
    'race_day_logistics_pct',
    'logistics_bonus',
    'travel_morale_bonus',
  ],
}

const negativeRawMeansPositiveContribution = new Set([
  'tour_fatigue_reduction_pct',
  'one_day_fatigue_reduction_pct',
  'short_tour_fatigue_reduction_pct',
  'long_tour_fatigue_reduction_pct',
  'race_fatigue_protection_pct',
  'race_fatigue_reduction_pct',
  'fatigue_floor_reduction',
  'recovery_duration',
  'injury_illness_risk',
  'minor_injury_risk_reduction_pct',
  'mechanical_time_loss_reduction_pct',
  'equipment_condition_loss_reduction_pct',
  'repair_cost_reduction_pct',
])

function RacePlanBonusPreview({
  standardizedBonus,
  exactBonusPreview,
}: {
  standardizedBonus: JsonRecord
  exactBonusPreview: JsonRecord
}) {
  const groups = toArray<JsonRecord>(standardizedBonus.groups)

  const breakdownByBonusKey = useMemo(
    () => buildStandardizedBreakdownMap(exactBonusPreview),
    [exactBonusPreview],
  )

  return (
    <RacePackageCard title="Race Plan Bonus Preview">
      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Standardized Race Bonus Percentages
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Race staff, race assets, and team policies are converted into these
            standardized race-engine percentage bonuses. Hover or click a card
            to see the source breakdown.
          </p>
        </div>

        {groups.length > 0 ? (
          <div className="grid gap-2">
            {groups.map((group) => {
              const bonusKey = String(group.bonus_key ?? group.key ?? '')
              const displayName = String(
                group.display_name ?? titleFromSnake(bonusKey),
              )

              const breakdown = getBreakdownForStandardizedGroup(
                group,
                breakdownByBonusKey,
              )

              return (
                <StandardizedBonusCard
                  key={bonusKey || displayName}
                  group={group}
                  bonusKey={bonusKey}
                  displayName={displayName}
                  breakdown={breakdown}
                />
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            No standardized race bonuses available yet. Refresh the quote after
            selecting race staff and race assets.
          </div>
        )}
      </div>
    </RacePackageCard>
  )
}

function StandardizedBonusCard({
  group,
  bonusKey,
  displayName,
  breakdown,
}: {
  group: JsonRecord
  bonusKey: string
  displayName: string
  breakdown: BonusBreakdownRow[]
}) {
  const [open, setOpen] = useState(false)
  const percent = Number(group.percent ?? group.points ?? 0)

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/30 focus:outline-none focus:ring-2 focus:ring-emerald-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-900">
                {displayName}
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                details
              </span>
            </div>

            <div className="mt-1 text-xs leading-5 text-slate-500">
              {String(
                group.description ??
                  standardizedBonusDescriptions[bonusKey] ??
                  'Standardized race-engine support bonus.',
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-sm font-bold text-emerald-700">
              +{formatBonusPercent(percent)}%
            </div>
          </div>
        </div>
      </button>

      {open ? (
        <BonusBreakdownPopover
          title={displayName}
          percent={percent}
          breakdown={breakdown}
        />
      ) : null}
    </div>
  )
}

function BonusBreakdownPopover({
  title,
  percent,
  breakdown,
}: {
  title: string
  percent: number
  breakdown: BonusBreakdownRow[]
}) {
  const contributionTotal = breakdown.reduce(
    (sum, row) => sum + row.contributionPercent,
    0,
  )

  return (
    <div className="absolute right-0 top-full z-40 mt-2 w-[380px] max-w-[calc(100vw-3rem)] rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {title} breakdown
          </div>
          <div className="mt-1 text-slate-500">
            Helpful effects are converted into positive standardized
            contribution percentages.
          </div>
        </div>

        <div className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
          +{formatBonusPercent(percent)}%
        </div>
      </div>

      {breakdown.length > 0 ? (
        <div className="space-y-2">
          {breakdown.map((row, index) => (
            <div
              key={`${row.sourceLabel}-${row.effectKey}-${index}`}
              className="rounded-xl bg-slate-50 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">
                    {row.sourceLabel}
                  </div>
                  <div className="mt-1 text-slate-600">
                    {row.effectLabel}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Raw effect: {row.rawValueText}
                  </div>
                </div>

                <div className="shrink-0 font-bold text-emerald-700">
                  {row.contributionLabel}
                </div>
              </div>
            </div>
          ))}

          <div className="border-t border-slate-200 pt-2">
            <div className="flex justify-between font-semibold text-slate-900">
              <span>Source contribution</span>
              <span>+{formatBonusPercent(contributionTotal)}%</span>
            </div>
            <div className="mt-1 flex justify-between font-semibold text-emerald-700">
              <span>Standardized total</span>
              <span>+{formatBonusPercent(percent)}%</span>
            </div>
            <div className="mt-2 text-[11px] leading-5 text-slate-500">
              If these two numbers differ later, the race engine cap or
              standardization rule has limited the final bonus.
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-50 p-3 text-slate-500">
          No detailed source rows are available for this bonus yet. Team Policy
          rows appear only when the current policy setup gives a non-zero bonus.
        </div>
      )}
    </div>
  )
}

function buildStandardizedBreakdownMap(
  exactBonusPreview: JsonRecord,
): Record<string, BonusBreakdownRow[]> {
  const result: Record<string, BonusBreakdownRow[]> = {}

  Object.keys(standardizedEffectKeyMap).forEach((key) => {
    result[key] = []
  })

  const sourceGroups = [
    ...toArray<JsonRecord>(exactBonusPreview.staff),
    ...toArray<JsonRecord>(exactBonusPreview.assets),
    ...toArray<JsonRecord>(exactBonusPreview.policies),
  ]

  sourceGroups.forEach((sourceGroup) => {
    const sourceType = String(sourceGroup.source_type ?? '')
    const sourceLabel = String(
      sourceGroup.source_label ?? sourceGroup.source_key ?? 'Bonus source',
    )

    toArray<JsonRecord>(sourceGroup.effects).forEach((effect) => {
      const effectKey = String(effect.effect_key ?? '')
      const effectLabel = String(effect.label ?? effectKey)
      const rawValueText = String(effect.value ?? '')

      if (!effectKey || !effectLabel || !rawValueText) return

      const matchingBonusKeys = getStandardizedBonusKeysForEffect(effectKey)

      matchingBonusKeys.forEach((bonusKey) => {
        const contributionPercent =
          getStandardizedContributionPercent(effectKey, rawValueText)

        if (contributionPercent <= 0) return

        result[bonusKey] = [
          ...(result[bonusKey] ?? []),
          {
            sourceType,
            sourceLabel,
            effectKey,
            effectLabel: getContributionEffectLabel(effectKey, effectLabel),
            rawValueText,
            contributionPercent,
            contributionLabel: `+${formatBonusPercent(
              contributionPercent,
            )}%`,
          },
        ]
      })
    })
  })

  return result
}

function getStandardizedBonusKeysForEffect(effectKey: string): string[] {
  return Object.entries(standardizedEffectKeyMap)
    .filter(([, effectKeys]) => effectKeys.includes(effectKey))
    .map(([bonusKey]) => bonusKey)
}

function getStandardizedContributionPercent(
  effectKey: string,
  rawValueText: string,
): number {
  const rawValue = parseSignedNumericValue(rawValueText)

  if (!Number.isFinite(rawValue) || rawValue === 0) {
    return 0
  }

  if (negativeRawMeansPositiveContribution.has(effectKey)) {
    return Math.abs(rawValue)
  }

  return Math.max(0, rawValue)
}

function parseSignedNumericValue(value: string): number {
  const normalized = value.replace('%', '').replace('+', '').trim()
  const numeric = Number(normalized)

  return Number.isFinite(numeric) ? numeric : 0
}

function getContributionEffectLabel(effectKey: string, fallback: string): string {
  switch (effectKey) {
    case 'recovery_duration':
      return 'Recovery duration support'
    case 'daily_recovery_bonus':
      return 'Daily recovery support'
    case 'fatigue_floor_reduction':
      return 'Fatigue floor control'
    case 'injury_illness_risk':
      return 'Injury / illness protection'
    case 'tour_fatigue_reduction_pct':
      return 'Tour fatigue control'
    case 'mechanical_time_loss_reduction_pct':
      return 'Mechanical time-loss protection'
    case 'minor_injury_risk_reduction_pct':
      return 'Minor-injury protection'
    case 'race_fatigue_protection_pct':
      return 'Race fatigue control'
    default:
      return fallback
  }
}

function getBreakdownForStandardizedGroup(
  group: JsonRecord,
  fallbackBreakdownByBonusKey: Record<string, BonusBreakdownRow[]>,
): BonusBreakdownRow[] {
  const directBreakdown = toArray<JsonRecord>(group.breakdown)
    .map((row) => normalizeBreakdownRow(row))
    .filter(Boolean) as BonusBreakdownRow[]

  if (directBreakdown.length > 0) {
    return directBreakdown
  }

  const bonusKey = String(group.bonus_key ?? group.key ?? '')

  return fallbackBreakdownByBonusKey[bonusKey] ?? []
}

function normalizeBreakdownRow(row: JsonRecord): BonusBreakdownRow | null {
  const effectKey = String(row.effect_key ?? row.key ?? '')
  const effectLabel = String(row.effect_label ?? row.label ?? effectKey)
  const rawValueText = String(row.raw_value ?? row.rawValue ?? row.value ?? '')
  const contributionRaw = String(
    row.contribution_percent ??
      row.contributionPercent ??
      row.percent ??
      row.points ??
      '',
  )

  const contributionPercent = parseSignedNumericValue(contributionRaw)

  if (!effectLabel || !Number.isFinite(contributionPercent)) {
    return null
  }

  return {
    sourceType: String(row.source_type ?? ''),
    sourceLabel: String(row.source_label ?? row.source ?? 'Bonus source'),
    effectKey,
    effectLabel,
    rawValueText: rawValueText || contributionRaw,
    contributionPercent: Math.abs(contributionPercent),
    contributionLabel: `+${formatBonusPercent(
      Math.abs(contributionPercent),
    )}%`,
  }
}

function formatBonusPercent(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)
}

function StagePlansTab({
  target,
  packageSubmitted,
  raceId,
  selectedRiders,
  equipmentPresetOptions,
  selectedStageIdFromUrl,
  onOpenRacePreview,
}: {
  target: RacePreparationTarget | null
  packageSubmitted: boolean
  raceId: UUID | null
  selectedRiders: JsonRecord[]
  equipmentPresetOptions: EquipmentSetupPresetOption[]
  selectedStageIdFromUrl?: string | null
  onOpenRacePreview: (raceId: UUID) => void
}) {
  const stages = target?.stages ?? []
  const [selectedStageIndex, setSelectedStageIndex] = useState(0)

  const selectedStage = stages[selectedStageIndex] ?? stages[0] ?? null

  useEffect(() => {
    if (!selectedStageIdFromUrl) return

    const index = stages.findIndex(
      (stage) => String(stage.id) === selectedStageIdFromUrl,
    )

    if (index >= 0) {
      setSelectedStageIndex(index)
    }
  }, [selectedStageIdFromUrl, stages])

  const [equipmentByRider, setEquipmentByRider] = useState<
    Record<string, string>
  >({})
  const [suppliesByRider, setSuppliesByRider] = useState<
    Record<
      string,
      {
        bidons: number
        gels: number
        nutrition_packs: number
        rain_jacket: boolean
      }
    >
  >({})
  const [teamTactic, setTeamTactic] = useState({
    plan: 'balanced',
    notes: '',
  })

  useEffect(() => {
    if (!selectedStage) return

    setEquipmentByRider((prev) => {
      let changed = false
      const next = { ...prev }

      selectedRiders.forEach((rider) => {
        const riderId = String(rider.id ?? '')
        if (!riderId || next[riderId]) return

        next[riderId] = equipmentPresetOptions[0]?.id ?? ''
        changed = true
      })

      return changed ? next : prev
    })

    setSuppliesByRider((prev) => {
      let changed = false
      const next = { ...prev }

      selectedRiders.forEach((rider) => {
        const riderId = String(rider.id ?? '')
        if (!riderId || next[riderId]) return

        next[riderId] = {
          bidons: 2,
          gels: 2,
          nutrition_packs: 1,
          rain_jacket: false,
        }
        changed = true
      })

      return changed ? next : prev
    })
  }, [selectedStage, selectedRiders, equipmentPresetOptions])

  if (!target?.has_target) {
    return <EmptyCard message="No accepted race selected." />
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Stage Plans
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Select a stage below to review its profile, then configure
              equipment, stage supplies and tactics for that stage.
            </p>
          </div>

          {raceId && (
            <button
              type="button"
              onClick={() => onOpenRacePreview(raceId)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open Race Page
            </button>
          )}
        </div>

        {selectedStage && <SelectedStagePlanProfileCard stage={selectedStage} />}
      </section>

      {!packageSubmitted && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
          Submit the Race Plan first. Stage Plans become configurable after the
          rider deadline or after confirmed early submission.
        </div>
      )}

      <StageCardsScroller
        stages={stages}
        selectedStageIndex={selectedStageIndex}
        onSelectStage={setSelectedStageIndex}
      />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <StageRiderEquipmentCard
          riders={selectedRiders}
          equipmentPresetOptions={equipmentPresetOptions}
          equipmentByRider={equipmentByRider}
          onChange={(riderId, presetId) =>
            setEquipmentByRider((prev) => ({
              ...prev,
              [riderId]: presetId,
            }))
          }
          disabled={!packageSubmitted}
        />

        <StageTeamTacticCard
          value={teamTactic}
          onChange={setTeamTactic}
          disabled={!packageSubmitted}
        />
      </section>

      <StageRiderSuppliesCard
        riders={selectedRiders}
        suppliesByRider={suppliesByRider}
        onChange={(riderId, patch) =>
          setSuppliesByRider((prev) => ({
            ...prev,
            [riderId]: {
              bidons: 0,
              gels: 0,
              nutrition_packs: 0,
              rain_jacket: false,
              ...prev[riderId],
              ...patch,
            },
          }))
        }
        disabled={!packageSubmitted}
      />
    </div>
  )
}

function getStageDisplayName(stage: JsonRecord, fallbackNumber: string) {
  return String(
    stage.stage_name ??
      stage.stage_title ??
      stage.name ??
      stage.route_label ??
      `Stage ${fallbackNumber}`,
  )
}

function getStageRoute(stage: JsonRecord) {
  const routeLabel = String(stage.route_label ?? '').trim()

  if (routeLabel) return routeLabel

  const start = String(stage.start_city ?? '').trim()
  const finish = String(stage.finish_city ?? '').trim()

  if (start && finish && start !== finish) return `${start} → ${finish}`
  if (start && finish && start === finish) return `${start} circuit`

  return start || finish || 'Route details pending'
}

function getStageStartTime(stage: JsonRecord) {
  const directLabel = String(stage.planned_start_time_label ?? '').trim()

  if (directLabel) return directLabel

  const hour = Number(stage.planned_start_hour_number)
  const minute = Number(stage.planned_start_minute)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return ''

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function getStageProfileLabel(stage: JsonRecord) {
  const value = String(
    stage.profile_type ??
      stage.terrain_type ??
      stage.stage_type ??
      '',
  ).trim()

  if (!value) return 'Profile pending'

  return titleFromSnake(value)
}

function getStageDistance(stage: JsonRecord) {
  const distance = Number(stage.distance_km)

  if (!Number.isFinite(distance) || distance <= 0) return ''

  return `${distance.toFixed(distance % 1 === 0 ? 0 : 1)} km`
}

function getStageFinishLabel(stage: JsonRecord) {
  const finishType = String(stage.finish_type ?? '').trim()
  const summit = Boolean(stage.is_summit_finish)

  if (summit) return 'Summit finish'
  if (finishType) return titleFromSnake(finishType)

  return 'Finish details pending'
}

function SelectedStagePlanProfileCard({ stage }: { stage: JsonRecord }) {
  const [profile, setProfile] = useState<JsonRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const stageId = String(stage.id ?? '')
  const stageNumber = String(stage.stage_number ?? '—')

  useEffect(() => {
    if (!stageId) {
      setProfile(null)
      return
    }

    let cancelled = false

    async function loadProfile() {
      setLoading(true)
      setErrorMessage(null)

      try {
        const result = await loadRaceStageProfileDetail(stageId)

        if (!cancelled) {
          setProfile(result)
        }
      } catch (error) {
        if (!cancelled) {
          setProfile(null)
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to load stage profile.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [stageId])

  const profileData = profile?.has_profile ? profile : null

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-5 xl:grid-cols-[0.58fr_1.42fr]">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Selected stage profile
          </div>

          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            Stage {stageNumber}: {getStageDisplayName(stage, stageNumber)}
          </h3>

          <div className="mt-4 grid gap-2">
            <CompactStageInfo
              label="Date"
              value={formatFullStageDateTime(stage)}
            />
            <CompactStageInfo label="Route" value={getStageRoute(stage)} />
            <CompactStageInfo
              label="Profile"
              value={
                profileData?.profile_type
                  ? titleFromSnake(String(profileData.profile_type))
                  : getStageProfileLabel(stage)
              }
            />
            <CompactStageInfo
              label="Distance"
              value={
                profileData?.distance_km
                  ? `${Number(profileData.distance_km).toFixed(
                      Number(profileData.distance_km) % 1 === 0 ? 0 : 1,
                    )} km`
                  : getStageDistance(stage) || '—'
              }
            />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4">
          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
              Loading stage profile…
            </div>
          ) : errorMessage ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : profileData ? (
            <StagePlanProfileChart profile={profileData} stage={stage} />
          ) : (
            <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
              Stage profile data is not available from the backend yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CompactStageInfo({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">
        {value}
      </div>
    </div>
  )
}

type StagePlanProfilePoint = {
  km: number
  elevation_m: number
}

type StagePlanProfileMarker = {
  km: number
  type: string
  label: string
}

function toFiniteNumberValue(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeProfilePoints(profile: JsonRecord, stage: JsonRecord) {
  const direct = Array.isArray(profile.profile_points)
    ? profile.profile_points
    : []

  const metadata = asRecord(stage.metadata)
  const routeProfile = asRecord(metadata.route_profile_v1)
  const fallback = Array.isArray(routeProfile.profile_points)
    ? routeProfile.profile_points
    : []

  const source = direct.length > 0 ? direct : fallback

  return source
    .map((raw): StagePlanProfilePoint | null => {
      const point = asRecord(raw)
      const km = toFiniteNumberValue(point.km)
      const elevation = toFiniteNumberValue(point.elevation_m)

      if (km === null || elevation === null) return null

      return {
        km,
        elevation_m: elevation,
      }
    })
    .filter((point): point is StagePlanProfilePoint => point !== null)
    .sort((a, b) => a.km - b.km)
}

function normalizeProfileMarkers(
  profile: JsonRecord,
  stage: JsonRecord,
  distanceKm: number,
) {
  const direct = Array.isArray(profile.route_markers)
    ? profile.route_markers
    : []

  const stagePoints = Array.isArray(stage.points) ? stage.points : []

  const fromProfile = direct
    .map((raw): StagePlanProfileMarker | null => {
      const marker = asRecord(raw)
      const km = toFiniteNumberValue(marker.km)

      if (km === null) return null

      return {
        km,
        type: String(marker.type ?? marker.point_type ?? ''),
        label: getStagePlanMarkerLabel(marker),
      }
    })
    .filter((marker): marker is StagePlanProfileMarker => marker !== null)

  const fromStagePoints = stagePoints
    .map((raw): StagePlanProfileMarker | null => {
      const point = asRecord(raw)
      const km = toFiniteNumberValue(point.km_from_start)

      if (km === null) return null

      return {
        km,
        type: String(point.point_type ?? ''),
        label: getStagePlanMarkerLabel(point),
      }
    })
    .filter((marker): marker is StagePlanProfileMarker => marker !== null)

  const merged = fromProfile.length > 0 ? fromProfile : fromStagePoints

  const hasStart = merged.some((marker) => marker.km <= 0.5)
  const hasFinish = merged.some(
    (marker) => Math.abs(marker.km - distanceKm) <= 0.5,
  )

  return [
    ...(hasStart
      ? []
      : [{ km: 0, type: 'START', label: 'Start' } as StagePlanProfileMarker]),
    ...merged,
    ...(hasFinish
      ? []
      : [
          {
            km: distanceKm,
            type: 'FINISH',
            label: 'Finish',
          } as StagePlanProfileMarker,
        ]),
  ].sort((a, b) => a.km - b.km)
}

function getStagePlanMarkerLabel(marker: JsonRecord) {
  const type = String(marker.type ?? marker.point_type ?? '').toUpperCase()
  const label = String(marker.chart_label ?? marker.label ?? '').trim()

  if (label) return label
  if (type === 'START') return 'Start'
  if (type === 'FINISH') return 'Finish'
  if (type === 'INTERMEDIATE_SPRINT') return 'Sprint'
  if (type === 'BONUS_SPRINT') return 'Bonus'
  if (type === 'KOM') {
    const category = String(marker.category ?? marker.kom_category ?? '').trim()
    return category ? `Cat ${category}` : 'KOM'
  }

  return type ? titleFromSnake(type.toLowerCase()) : 'Point'
}

function getMarkerColor(type: string) {
  const normalized = type.toUpperCase()

  if (normalized === 'START') return '#64748b'
  if (normalized === 'FINISH') return '#2563eb'
  if (normalized === 'KOM') return '#ef4444'
  if (
    normalized === 'INTERMEDIATE_SPRINT' ||
    normalized === 'BONUS_SPRINT' ||
    normalized === 'SPRINT'
  ) {
    return '#22c55e'
  }

  return '#475569'
}

function StagePlanProfileChart({
  profile,
  stage,
}: {
  profile: JsonRecord
  stage: JsonRecord
}) {
  const points = normalizeProfilePoints(profile, stage)
  const distanceKm =
    toFiniteNumberValue(profile.distance_km) ??
    toFiniteNumberValue(stage.distance_km) ??
    Math.max(...points.map((point) => point.km), 1)

  if (points.length < 2) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
        Stage profile points are missing.
      </div>
    )
  }

  const width = 920
  const height = 360
  const padding = {
    top: 38,
    right: 24,
    bottom: 54,
    left: 58,
  }

  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom

  const maxElevationRaw = Math.max(...points.map((point) => point.elevation_m))
  const maxElevation = Math.max(
    500,
    Math.ceil((maxElevationRaw * 1.12) / 100) * 100,
  )

  const xForKm = (km: number) =>
    padding.left + (Math.max(0, Math.min(distanceKm, km)) / distanceKm) * innerWidth

  const yForElevation = (elevation: number) =>
    padding.top + innerHeight - (Math.max(0, elevation) / maxElevation) * innerHeight

  const coordinates = points.map((point) => ({
    x: xForKm(point.km),
    y: yForElevation(point.elevation_m),
    ...point,
  }))

  const linePath = coordinates.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`

    const previous = coordinates[index - 1]
    const controlX = (previous.x + point.x) / 2

    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`
  }, '')

  const areaPath = `${linePath} L ${
    coordinates[coordinates.length - 1].x
  } ${height - padding.bottom} L ${coordinates[0].x} ${
    height - padding.bottom
  } Z`

  const markers = normalizeProfileMarkers(profile, stage, distanceKm)
  const elevationTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
    Math.round((maxElevation * ratio) / 100) * 100,
  )

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[360px] w-full"
        role="img"
        aria-label="Stage profile chart"
      >
        <rect width={width} height={height} fill="#ffffff" />

        {elevationTicks.map((tick) => {
          const y = yForElevation(tick)

          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill="#64748b"
              >
                {tick} m
              </text>
            </g>
          )
        })}

        <path d={areaPath} fill="#fde68a" opacity="0.9" />
        <path
          d={linePath}
          fill="none"
          stroke="#334155"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {markers.map((marker, index) => {
          const x = xForKm(marker.km)
          const color = getMarkerColor(marker.type)

          return (
            <g key={`${marker.type}-${marker.km}-${index}`}>
              <line
                x1={x}
                x2={x}
                y1={padding.top}
                y2={height - padding.bottom}
                stroke={color}
                strokeWidth="2"
                strokeDasharray="4 4"
                opacity="0.75"
              />

              <rect
                x={x - 34}
                y={14}
                width="68"
                height="22"
                rx="11"
                fill={color}
              />

              <text
                x={x}
                y={29}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#ffffff"
              >
                {marker.label}
              </text>

              <text
                x={x}
                y={height - 18}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill="#334155"
              >
                {marker.km.toFixed(marker.km % 1 === 0 ? 0 : 1)} km
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function StageCardsScroller({
  stages,
  selectedStageIndex,
  onSelectStage,
}: {
  stages: JsonRecord[]
  selectedStageIndex: number
  onSelectStage: (index: number) => void
}) {
  const stageSliderRef = React.useRef<HTMLDivElement | null>(null)

  function scrollStages(direction: 'left' | 'right'): void {
    const node = stageSliderRef.current
    if (!node) return

    node.scrollBy({
      left: direction === 'left' ? -320 : 320,
      behavior: 'smooth',
    })
  }

  function renderStageCard(stage: JsonRecord, compact = false) {
    const index = stages.findIndex(
      (item) => String(item.id) === String(stage.id),
    )
    const active = index === selectedStageIndex
    const stageNumber = String(stage.stage_number ?? index + 1)

    return (
      <button
        key={String(stage.id ?? stageNumber)}
        type="button"
        onClick={() => onSelectStage(index)}
        className={[
          compact
            ? 'min-h-[92px] min-w-[220px] snap-start rounded-2xl border px-4 py-3 text-left transition'
            : 'min-h-[92px] rounded-2xl border px-4 py-3 text-left transition',
          active
            ? 'border-yellow-200 bg-yellow-50 text-slate-950 shadow-sm'
            : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
        ].join(' ')}
      >
        <div className="text-sm font-medium text-slate-500">
          {formatCompactStageDateTime(stage)}
        </div>

        <div className="mt-1 truncate text-base font-semibold">
          Stage {stageNumber}
        </div>

        <div className="mt-1 truncate text-xs opacity-80">
          {getStageRoute(stage)}
        </div>

        <div className="mt-1 text-xs opacity-75">
          {getStageProfileLabel(stage)} · {getStageDistance(stage) || '—'}
        </div>
      </button>
    )
  }

  if (stages.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        No stages found for this race.
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Stages
        </div>

        {stages.length > 5 ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => scrollStages('left')}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ←
            </button>

            <button
              type="button"
              onClick={() => scrollStages('right')}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              →
            </button>
          </div>
        ) : null}
      </div>

      {stages.length <= 5 ? (
        <div
          className={[
            'grid gap-2',
            stages.length <= 1
              ? 'grid-cols-1'
              : stages.length === 2
                ? 'grid-cols-1 md:grid-cols-2'
                : stages.length === 3
                  ? 'grid-cols-1 md:grid-cols-3'
                  : stages.length === 4
                    ? 'grid-cols-1 md:grid-cols-4'
                    : 'grid-cols-1 md:grid-cols-5',
          ].join(' ')}
        >
          {stages.map((stage) => renderStageCard(stage))}
        </div>
      ) : (
        <div
          ref={stageSliderRef}
          className="flex snap-x gap-2 overflow-x-auto scroll-smooth pb-1"
        >
          {stages.map((stage) => renderStageCard(stage, true))}
        </div>
      )}
    </div>
  )
}

function StageRiderEquipmentCard({
  riders,
  equipmentPresetOptions,
  equipmentByRider,
  onChange,
  disabled,
}: {
  riders: JsonRecord[]
  equipmentPresetOptions: EquipmentSetupPresetOption[]
  equipmentByRider: Record<string, string>
  onChange: (riderId: string, presetId: string) => void
  disabled: boolean
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        1. Rider Equipment Packages
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Choose one equipment package for each rider for this stage.
      </p>

      <div className="mt-4 space-y-3">
        {riders.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No riders found from the submitted Race Plan yet.
          </div>
        )}

        {riders.map((rider) => {
          const riderId = String(rider.id ?? '')
          return (
            <div
              key={riderId}
              className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_220px]"
            >
              <div className="min-w-0">
                <div className="relative inline-flex max-w-full items-center gap-2">
                  <div className="group relative min-w-0">
                    <span className="cursor-help truncate font-medium text-slate-900">
                      {getRiderDisplayName(rider)}
                    </span>

                    <RiderHoverCard rider={rider} />
                  </div>

                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {getRiderRoleLabel(rider)}
                  </span>
                </div>

                <RiderRaceScoreLine rider={rider} />
              </div>

              <select
                value={equipmentByRider[riderId] ?? ''}
                onChange={(event) => onChange(riderId, event.target.value)}
                disabled={disabled || equipmentPresetOptions.length === 0}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              >
                {equipmentPresetOptions.length === 0 ? (
                  <option value="">No equipment setup presets found</option>
                ) : (
                  equipmentPresetOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StageRiderSuppliesCard({
  riders,
  suppliesByRider,
  onChange,
  disabled,
}: {
  riders: JsonRecord[]
  suppliesByRider: Record<
    string,
    {
      bidons: number
      gels: number
      nutrition_packs: number
      rain_jacket: boolean
    }
  >
  onChange: (
    riderId: string,
    patch: Partial<{
      bidons: number
      gels: number
      nutrition_packs: number
      rain_jacket: boolean
    }>,
  ) => void
  disabled: boolean
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        2. Stage Supplies
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Additional race supplies for each rider on this stage.
      </p>

      <div className="mt-4 space-y-3">
        {riders.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No riders found from the submitted Race Plan yet.
          </div>
        )}

        {riders.map((rider) => {
          const riderId = String(rider.id ?? '')
          const value = suppliesByRider[riderId] ?? {
            bidons: 0,
            gels: 0,
            nutrition_packs: 0,
            rain_jacket: false,
          }

          return (
            <div
              key={riderId}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="mb-3 font-medium text-slate-900">
                {getRiderDisplayName(rider)}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <NumberField
                  label="Bidons"
                  value={value.bidons}
                  disabled={disabled}
                  onChange={(next) => onChange(riderId, { bidons: next })}
                />
                <NumberField
                  label="Energy Gels"
                  value={value.gels}
                  disabled={disabled}
                  onChange={(next) => onChange(riderId, { gels: next })}
                />
                <NumberField
                  label="Nutrition Packs"
                  value={value.nutrition_packs}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange(riderId, { nutrition_packs: next })
                  }
                />

                <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={value.rain_jacket}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(riderId, {
                        rain_jacket: event.target.checked,
                      })
                    }
                  />
                  Rain Jacket
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StageTeamTacticCard({
  value,
  onChange,
  disabled,
}: {
  value: { plan: string; notes: string }
  onChange: (next: { plan: string; notes: string }) => void
  disabled: boolean
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        3. Team Tactic
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        General stage tactic for the team. Rider-level tactics can come later.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Tactic plan
          </label>
          <select
            value={value.plan}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                plan: event.target.value,
              })
            }
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          >
            <option value="balanced">Balanced</option>
            <option value="aggressive">Aggressive</option>
            <option value="sprint_control">Sprint Control</option>
            <option value="breakaway">Breakaway Support</option>
            <option value="gc_protection">GC Protection</option>
            <option value="climber_support">Climber Support</option>
            <option value="time_trial_focus">Time Trial Focus</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Tactical notes
          </label>
          <textarea
            value={value.notes}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                notes: event.target.value,
              })
            }
            rows={8}
            placeholder="Add the team plan for this stage..."
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          />
        </div>
      </div>
    </section>
  )
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  disabled: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        type="number"
        min={0}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
      />
    </div>
  )
}


function getRiderDisplayName(rider: JsonRecord) {
  const fullName = String(rider.full_name ?? rider.name ?? '').trim()
  if (fullName) return fullName

  const firstName = String(rider.first_name ?? '').trim()
  const lastName = String(rider.last_name ?? '').trim()
  const combinedName = `${firstName} ${lastName}`.trim()

  return combinedName || 'Unnamed rider'
}

function getRiderRoleLabel(rider: JsonRecord): string {
  return String(
    rider.role_label ??
      rider.assigned_role ??
      rider.specialty ??
      rider.rider_type ??
      'Rider',
  )
}

function getRiderAge(rider: JsonRecord): string {
  const directAge = Number(rider.age)

  if (Number.isFinite(directAge) && directAge > 0) {
    return String(Math.floor(directAge))
  }

  const birthDate = String(rider.birth_date ?? '').trim()
  const yearMatch = birthDate.match(/^(\d{4})-/)

  if (!yearMatch) return '—'

  const birthYear = Number(yearMatch[1])
  if (!Number.isFinite(birthYear)) return '—'

  // Game dates use Season 1 = year 2000, so this is only a fallback.
  const estimatedAge = 2000 - birthYear
  return estimatedAge > 0 ? String(estimatedAge) : '—'
}

function getRiderOverall(rider: JsonRecord): string {
  const value =
    rider.overall ??
    rider.overall_rating ??
    rider.rating ??
    rider.ovr ??
    rider.current_ability

  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue.toFixed(0) : '—'
}

function getRiderSkillEntries(rider: JsonRecord) {
  const skills = [
    ['Flat', rider.flat],
    ['Hills', rider.hills ?? rider.hilly],
    ['Mountain', rider.mountain ?? rider.climbing],
    ['Sprint', rider.sprint],
    ['Time Trial', rider.time_trial ?? rider.tt],
    ['Stamina', rider.stamina],
    ['Recovery', rider.recovery],
    ['Downhill', rider.downhill],
    ['Cobbles', rider.cobbles],
  ]

  return skills
    .map(([label, value]) => ({
      label: String(label),
      value: Number(value),
    }))
    .filter((skill) => Number.isFinite(skill.value))
    .sort((a, b) => b.value - a.value)
}

function RiderHoverCard({ rider }: { rider: JsonRecord }) {
  const skills = getRiderSkillEntries(rider)
  const topSkillNames = new Set(skills.slice(0, 3).map((skill) => skill.label))

  return (
    <div className="pointer-events-none absolute left-0 top-full z-40 mt-2 hidden w-72 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl group-hover:block">
      <div className="font-semibold text-slate-900">
        {getRiderDisplayName(rider)}
      </div>

      <div className="mt-1 text-xs text-slate-500">
        Age {getRiderAge(rider)} · Overall {getRiderOverall(rider)} ·{' '}
        {getRiderRoleLabel(rider)}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {skills.length > 0 ? (
          skills.slice(0, 8).map((skill) => {
            const isTopSkill = topSkillNames.has(skill.label)

            return (
              <div
                key={skill.label}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1"
              >
                <span
                  className={
                    isTopSkill
                      ? 'font-semibold text-slate-900'
                      : 'text-slate-500'
                  }
                >
                  {skill.label}
                </span>
                <span
                  className={
                    isTopSkill
                      ? 'font-bold text-slate-900'
                      : 'font-medium text-slate-700'
                  }
                >
                  {skill.value.toFixed(0)}
                </span>
              </div>
            )
          })
        ) : (
          <div className="col-span-2 text-slate-500">
            Rider skill details are not available yet.
          </div>
        )}
      </div>
    </div>
  )
}

function getRiderRaceScore(rider: JsonRecord) {
  const position =
    rider.gc_position ??
    rider.general_position ??
    rider.race_position ??
    rider.standing_position ??
    rider.tour_position ??
    null

  const time =
    rider.gc_time_gap ??
    rider.general_time_gap ??
    rider.time_gap ??
    rider.race_time_gap ??
    null

  const points =
    rider.points ??
    rider.points_score ??
    rider.race_points ??
    rider.classification_points ??
    0

  const sprintPoints =
    rider.sprint_points ??
    rider.green_points ??
    rider.points_classification_points ??
    0

  const mountainPoints =
    rider.mountain_points ??
    rider.kom_points ??
    rider.climbing_points ??
    rider.mountain_classification_points ??
    0

  return {
    position:
      position === null || position === undefined || position === ''
        ? '—'
        : String(position),
    time:
      time === null || time === undefined || time === ''
        ? '—'
        : String(time),
    points: Number.isFinite(Number(points)) ? Number(points) : 0,
    sprintPoints: Number.isFinite(Number(sprintPoints))
      ? Number(sprintPoints)
      : 0,
    mountainPoints: Number.isFinite(Number(mountainPoints))
      ? Number(mountainPoints)
      : 0,
  }
}

function RiderRaceScoreLine({ rider }: { rider: JsonRecord }) {
  const score = getRiderRaceScore(rider)

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span>
        GC:{' '}
        <strong className="font-semibold text-slate-700">
          {score.position}
        </strong>
      </span>

      <span className="text-slate-300">|</span>

      <span>
        Time:{' '}
        <strong className="font-semibold text-slate-700">
          {score.time}
        </strong>
      </span>

      <span className="text-slate-300">|</span>

      <span>
        Points:{' '}
        <strong className="font-semibold text-slate-700">
          {score.points}
        </strong>
      </span>

      <span className="text-slate-300">|</span>

      <span>
        Sprint:{' '}
        <strong className="font-semibold text-slate-700">
          {score.sprintPoints}
        </strong>
      </span>

      <span className="text-slate-300">|</span>

      <span>
        KOM:{' '}
        <strong className="font-semibold text-slate-700">
          {score.mountainPoints}
        </strong>
      </span>
    </div>
  )
}

function TabButton({
  label,
  active,
  disabled = false,
  onClick,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-6 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'bg-yellow-400 text-slate-950'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  )
}

function InfoChip({
  label,
  value,
  alignRight = false,
}: {
  label: string
  value: string
  alignRight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm ${
        alignRight ? 'text-right' : ''
      }`}
    >
      <span className="text-xs text-slate-500">{label}: </span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}

function RacePackageCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

function RiderSelectionCard({
  option,
  selected,
  canEdit,
  currentGameDate,
  onToggle,
}: {
  option: RacePreparationSelectableData['riders'][number]
  selected: boolean
  canEdit: boolean
  currentGameDate?: string
  onToggle: () => void
}) {
  const [open, setOpen] = useState(false)
  const rider = asRecord(option.rider)

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        disabled={!canEdit}
        onClick={onToggle}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`w-full rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
          selected
            ? 'border-blue-400 bg-blue-50'
            : 'border-slate-200 bg-white hover:bg-slate-50'
        }`}
      >
        <div className="font-semibold text-slate-900">
          {getRiderName(option.rider)}
        </div>

        <div className="mt-1 text-xs text-slate-500">
          Role: {String(option.assigned_role ?? '—')}
        </div>

        <div className="mt-2 text-xs text-slate-500">
          Fatigue: {String(rider.fatigue ?? '—')} · Availability:{' '}
          {String(rider.availability_status ?? 'fit')}
        </div>
      </button>

      {open ? (
        <RiderInfoPopover
          option={option}
          currentGameDate={currentGameDate}
        />
      ) : null}
    </div>
  )
}

function RiderInfoPopover({
  option,
  currentGameDate,
}: {
  option: RacePreparationSelectableData['riders'][number]
  currentGameDate?: string
}) {
  const rider = asRecord(option.rider)
  const countryCode = getRiderCountryCode(rider)
  const ageLabel = getRiderAgeLabel(rider, currentGameDate)
  const topSkills = getTopRiderSkills(rider)

  return (
    <div className="absolute left-0 top-full z-40 mt-2 w-[360px] max-w-[calc(100vw-3rem)] rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-xl">
      <div className="flex items-start gap-3">
        <CountryFlag code={countryCode} />

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">
            {getRiderName(option.rider)}
          </div>

          <div className="mt-1 text-slate-500">
            {String(option.assigned_role ?? 'Rider')}
            {ageLabel ? ` · ${ageLabel}` : ''}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <RiderPopupMetric
          label="Fatigue"
          value={String(rider.fatigue ?? '—')}
        />
        <RiderPopupMetric
          label="Fitness"
          value={String(
            rider.fitness ??
              rider.fitness_level ??
              rider.form ??
              rider.condition ??
              '—',
          )}
        />
        <RiderPopupMetric
          label="Availability"
          value={String(rider.availability_status ?? 'fit')}
        />
      </div>

      <div className="mt-4">
        <div className="mb-2 font-semibold text-slate-900">
          Key skills
        </div>

        {topSkills.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {topSkills.map((skill) => (
              <div
                key={skill.key}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
              >
                <span className="text-slate-600">{skill.label}</span>
                <span className="font-bold text-slate-900">
                  {skill.value}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 p-3 text-slate-500">
            No detailed skill data available.
          </div>
        )}
      </div>
    </div>
  )
}

function RiderPopupMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 truncate font-semibold text-slate-900">
        {value}
      </div>
    </div>
  )
}

function CostLine({
  label,
  value,
  strong = false,
}: {
  label: string
  value: unknown
  strong?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        strong ? 'text-base font-bold text-slate-900' : 'text-slate-700'
      }`}
    >
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  )
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border bg-white p-6 text-sm text-slate-600 shadow-sm">
      {message}
    </div>
  )
}


function RacePreviewModal({
  raceId,
  onClose,
}: {
  raceId: UUID
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 p-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="font-semibold text-slate-900">Race Page Preview</div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <RaceDetailPage raceIdOverride={raceId} onBack={onClose} />
        </div>
      </div>
    </div>
  )
}
