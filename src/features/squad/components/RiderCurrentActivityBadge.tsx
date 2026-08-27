import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { supabase } from '../../../lib/supabase'
import { formatShortGameDate } from '../utils/dates'

export type RiderCurrentActivityKind = 'race' | 'training_camp' | 'free'

export type RiderCurrentActivity = {
  kind: RiderCurrentActivityKind
  name?: string | null
  stageNumber?: number | null
  locationLabel?: string | null
  endDate?: string | null
}

type CurrentActivityState = {
  activitiesByRiderId: Record<string, RiderCurrentActivity>
  loading: boolean
  error: string | null
}

type RaceParticipantRow = {
  rider_id: string
  race_id: string
  team_id?: string | null
}

type CurrentRaceRow = {
  id: string
  name: string
  start_date: string
  end_date: string
  status?: string | null
  is_stage_race?: boolean | null
}

type RaceStageRow = {
  id: string
  race_id: string
  stage_number: number
  stage_date: string
  name?: string | null
}

type RaceStageResultRow = {
  race_id: string
  rider_id: string
  stage_id: string
  status?: string | null
}

type TrainingCampCommitmentRow = {
  rider_id: string
  source_id: string
  start_date: string
  end_date: string
}

type TrainingCampBookingRow = {
  id: string
  camp_name?: string | null
  city_snapshot?: string | null
  country_code_snapshot?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
}

const FREE_ACTIVITY: RiderCurrentActivity = {
  kind: 'free',
}

const NON_CONTINUING_RACE_STATUSES = new Set([
  'dns',
  'did_not_start',
  'did-not-start',
  'dnf',
  'did_not_finish',
  'did-not-finish',
  'otl',
  'out_of_time_limit',
  'out-of-time-limit',
  'dq',
  'dsq',
  'disqualified',
  'withdrawn',
  'retired',
  'abandoned',
  'out',
])

function normalizeRaceStatus(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function getRacePriority(status?: string | null): number {
  switch (normalizeRaceStatus(status)) {
    case 'active':
      return 30
    case 'scheduled':
      return 20
    case 'completed':
      return 10
    default:
      return 0
  }
}

function isRaceCurrentOnDate(race: CurrentRaceRow, gameDate: string): boolean {
  if (!race.start_date || !race.end_date) return false
  if (race.start_date > gameDate || race.end_date < gameDate) return false

  const status = normalizeRaceStatus(race.status)
  return status !== 'cancelled' && status !== 'archived'
}

function formatCampLocation(row?: TrainingCampBookingRow | null): string | null {
  if (!row) return null

  return [row.city_snapshot, row.country_code_snapshot]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(', ') || null
}

async function loadTrainingCampActivities(
  riderIds: string[],
  gameDate: string,
): Promise<Record<string, RiderCurrentActivity>> {
  const { data: commitmentData, error: commitmentError } = await supabase
    .from('rider_commitment_windows')
    .select('rider_id,source_id,start_date,end_date')
    .in('rider_id', riderIds)
    .eq('source_type', 'training_camp')
    .eq('status', 'active')
    .lte('start_date', gameDate)
    .gte('end_date', gameDate)

  if (commitmentError) {
    throw commitmentError
  }

  const commitments = (commitmentData ?? []) as TrainingCampCommitmentRow[]
  if (commitments.length === 0) return {}

  const bookingIds = Array.from(
    new Set(
      commitments
        .map((row) => row.source_id)
        .filter((value): value is string => Boolean(value)),
    ),
  )

  let bookingById = new Map<string, TrainingCampBookingRow>()

  if (bookingIds.length > 0) {
    const { data: bookingData, error: bookingError } = await supabase
      .from('training_camp_bookings')
      .select(
        'id,camp_name,city_snapshot,country_code_snapshot,start_date,end_date,status',
      )
      .in('id', bookingIds)

    if (bookingError) {
      console.warn('Failed to load current training camp details:', bookingError)
    } else {
      bookingById = new Map(
        ((bookingData ?? []) as TrainingCampBookingRow[]).map((row) => [row.id, row]),
      )
    }
  }

  const result: Record<string, RiderCurrentActivity> = {}

  for (const commitment of commitments) {
    const booking = bookingById.get(commitment.source_id)

    result[commitment.rider_id] = {
      kind: 'training_camp',
      name: booking?.camp_name?.trim() || null,
      locationLabel: formatCampLocation(booking),
      endDate: booking?.end_date ?? commitment.end_date,
    }
  }

  return result
}

async function loadRaceActivities(
  riderIds: string[],
  gameDate: string,
): Promise<Record<string, RiderCurrentActivity>> {
  const { data: participantData, error: participantError } = await supabase
    .from('race_participant_riders_v1')
    .select('rider_id,race_id,team_id')
    .in('rider_id', riderIds)

  if (participantError) {
    throw participantError
  }

  const participantRows = (participantData ?? []) as RaceParticipantRow[]
  if (participantRows.length === 0) return {}

  const raceIds = Array.from(
    new Set(participantRows.map((row) => row.race_id).filter(Boolean)),
  )

  if (raceIds.length === 0) return {}

  const { data: raceData, error: raceError } = await supabase
    .from('races')
    .select('id,name,start_date,end_date,status,is_stage_race')
    .in('id', raceIds)
    .lte('start_date', gameDate)
    .gte('end_date', gameDate)

  if (raceError) {
    throw raceError
  }

  const currentRaces = ((raceData ?? []) as CurrentRaceRow[])
    .filter((race) => isRaceCurrentOnDate(race, gameDate))
    .sort((left, right) => {
      const priorityDifference = getRacePriority(right.status) - getRacePriority(left.status)
      if (priorityDifference !== 0) return priorityDifference
      return String(left.end_date).localeCompare(String(right.end_date))
    })

  if (currentRaces.length === 0) return {}

  const currentRaceIds = currentRaces.map((race) => race.id)

  const [stagesResult, resultsResult] = await Promise.all([
    supabase
      .from('race_stages')
      .select('id,race_id,stage_number,stage_date,name')
      .in('race_id', currentRaceIds)
      .lte('stage_date', gameDate),
    supabase
      .from('race_stage_results')
      .select('race_id,rider_id,stage_id,status')
      .in('race_id', currentRaceIds)
      .in('rider_id', riderIds),
  ])

  if (stagesResult.error) {
    throw stagesResult.error
  }

  if (resultsResult.error) {
    throw resultsResult.error
  }

  const stageRows = (stagesResult.data ?? []) as RaceStageRow[]
  const stageResults = (resultsResult.data ?? []) as RaceStageResultRow[]

  const stageById = new Map(stageRows.map((row) => [row.id, row]))
  const todayStageByRaceId = new Map<string, RaceStageRow>()

  for (const stage of stageRows) {
    if (stage.stage_date !== gameDate) continue

    const existing = todayStageByRaceId.get(stage.race_id)
    if (!existing || stage.stage_number < existing.stage_number) {
      todayStageByRaceId.set(stage.race_id, stage)
    }
  }

  const latestResultByRiderRace = new Map<
    string,
    { stageNumber: number; status: string }
  >()

  for (const row of stageResults) {
    const stage = stageById.get(row.stage_id)
    if (!stage) continue

    const key = `${row.rider_id}:${row.race_id}`
    const existing = latestResultByRiderRace.get(key)

    if (!existing || stage.stage_number >= existing.stageNumber) {
      latestResultByRiderRace.set(key, {
        stageNumber: stage.stage_number,
        status: normalizeRaceStatus(row.status),
      })
    }
  }

  const raceById = new Map(currentRaces.map((race) => [race.id, race]))
  const result: Record<string, RiderCurrentActivity> = {}

  for (const participant of participantRows) {
    if (result[participant.rider_id]) continue

    const race = raceById.get(participant.race_id)
    if (!race) continue

    const latestResult = latestResultByRiderRace.get(
      `${participant.rider_id}:${participant.race_id}`,
    )

    if (
      latestResult &&
      NON_CONTINUING_RACE_STATUSES.has(latestResult.status)
    ) {
      continue
    }

    const todayStage = todayStageByRaceId.get(race.id)

    result[participant.rider_id] = {
      kind: 'race',
      name: race.name,
      stageNumber:
        race.is_stage_race && todayStage?.stage_number
          ? todayStage.stage_number
          : null,
      endDate: race.end_date,
    }
  }

  return result
}

export function useRiderCurrentActivities(
  riderIds: string[],
  gameDate: string | null,
): CurrentActivityState {
  const { t } = useTranslation('squad')
  const riderKey = useMemo(
    () =>
      Array.from(new Set(riderIds.filter(Boolean)))
        .sort()
        .join('|'),
    [riderIds.join('|')],
  )

  const [state, setState] = useState<CurrentActivityState>({
    activitiesByRiderId: {},
    loading: false,
    error: null,
  })

  useEffect(() => {
    const normalizedRiderIds = riderKey ? riderKey.split('|') : []

    if (!gameDate || normalizedRiderIds.length === 0) {
      setState({
        activitiesByRiderId: {},
        loading: false,
        error: null,
      })
      return
    }

    let cancelled = false

    const freeByRiderId = Object.fromEntries(
      normalizedRiderIds.map((riderId) => [riderId, FREE_ACTIVITY]),
    ) as Record<string, RiderCurrentActivity>

    setState({
      activitiesByRiderId: freeByRiderId,
      loading: true,
      error: null,
    })

    void (async () => {
      const [campResult, raceResult] = await Promise.allSettled([
        loadTrainingCampActivities(normalizedRiderIds, gameDate),
        loadRaceActivities(normalizedRiderIds, gameDate),
      ])

      if (cancelled) return

      const nextActivities: Record<string, RiderCurrentActivity> = {
        ...freeByRiderId,
      }

      let hasError = false

      if (campResult.status === 'fulfilled') {
        Object.assign(nextActivities, campResult.value)
      } else {
        console.warn('Failed to load rider training-camp activity:', campResult.reason)
        hasError = true
      }

      /*
       * Race wins only if an invalid overlap somehow exists. Booking/race
       * validation should normally prevent a rider being in both places.
       */
      if (raceResult.status === 'fulfilled') {
        Object.assign(nextActivities, raceResult.value)
      } else {
        console.warn('Failed to load rider race activity:', raceResult.reason)
        hasError = true
      }

      setState({
        activitiesByRiderId: nextActivities,
        loading: false,
        error: hasError ? t('roster.loadFailed') : null,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [riderKey, gameDate, t])

  return state
}

export function RiderCurrentActivityBadge({
  activity,
  loading = false,
  error = null,
}: {
  activity?: RiderCurrentActivity
  loading?: boolean
  error?: string | null
}) {
  const { t } = useTranslation('squad')

  if (loading) {
    return (
      <span className="inline-flex min-w-[76px] items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400">
        …
      </span>
    )
  }

  const resolved = activity ?? FREE_ACTIVITY
  const activityLabel =
    resolved.kind === 'race'
      ? t('activity.race')
      : resolved.kind === 'training_camp'
        ? t('activity.trainingCamp')
        : t('activity.free')

  /*
   * If one source failed, never pretend an unresolved "Free" rider is
   * definitely free. Known race/camp activities can still be shown safely.
   */
  if (error && resolved.kind === 'free') {
    return (
      <span
        title={error}
        className="inline-flex min-w-[76px] cursor-help items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400"
      >
        —
      </span>
    )
  }

  const ui =
    resolved.kind === 'race'
      ? {
          className:
            'border-blue-200 bg-blue-50 text-blue-700',
          dotClassName: 'bg-blue-500',
        }
      : resolved.kind === 'training_camp'
        ? {
            className:
              'border-amber-200 bg-amber-50 text-amber-800',
            dotClassName: 'bg-amber-500',
          }
        : {
            className:
              'border-slate-200 bg-slate-50 text-slate-600',
            dotClassName: 'bg-slate-400',
          }

  const stageLabel = resolved.stageNumber
    ? t('activity.stage', { number: resolved.stageNumber })
    : null

  const tooltipParts =
    resolved.kind === 'free'
      ? []
      : [
          resolved.name || activityLabel,
          stageLabel,
          resolved.locationLabel,
          resolved.endDate
            ? t('activity.until', { date: formatShortGameDate(resolved.endDate) })
            : null,
        ].filter((value): value is string => Boolean(value))

  return (
    <span
      title={tooltipParts.length > 0 ? tooltipParts.join(' · ') : undefined}
      className={`inline-flex min-w-[76px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${
        resolved.kind === 'free' ? '' : 'cursor-help'
      } ${ui.className}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${ui.dotClassName}`}
      />
      <span>{activityLabel}</span>
    </span>
  )
}
