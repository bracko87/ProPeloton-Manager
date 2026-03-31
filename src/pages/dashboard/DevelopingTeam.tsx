import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import RiderProfilePage from '../../features/squad/components/RiderProfilePage'

import type {
  ClubRosterRow,
  DevelopingTeamStatus,
  RiderAvailabilityStatus,
} from '../../features/squad/types'

import {
  getAgeFromBirthDate,
  normalizeGameDateValue,
  getContractExpiryUi,
} from '../../features/squad/utils/dates'

const DEFAULT_RIDER_IMAGE_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Others/Default%20Profile.png'

const DEVELOPING_TEAM_MAX = 8
const FIRST_SQUAD_MAX = 18

type SquadListView = 'general' | 'financial' | 'skills' | 'form'

const SQUAD_LIST_VIEW_OPTIONS: Array<{ value: SquadListView; label: string }> = [
  { value: 'general', label: 'General View' },
  { value: 'financial', label: 'Financial View' },
  { value: 'skills', label: 'Skills View' },
  { value: 'form', label: 'Form & Development' },
]

type DevelopingRosterRow = ClubRosterRow & {
  birth_date?: string | null
  first_name?: string | null
  last_name?: string | null
  full_name?: string
  market_value?: number | null
  salary?: number | null
  contract_expires_at?: string | null
  contract_expires_season?: number | null
  sprint?: number | null
  climbing?: number | null
  time_trial?: number | null
  flat?: number | null
  endurance?: number | null
  recovery?: number | null
  resistance?: number | null
  race_iq?: number | null
  teamwork?: number | null
  morale?: number | null
  potential?: number | null
  fatigue?: number | null
  availability_status?: RiderAvailabilityStatus | null
}

function getCountryName(countryCode?: string) {
  const code = countryCode?.trim().toUpperCase()

  if (!code) return 'Unknown'

  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

function getFlagImageUrl(countryCode?: string) {
  const code = countryCode?.trim().toLowerCase()

  if (!code || !/^[a-z]{2}$/.test(code)) return null

  return `https://flagcdn.com/24x18/${code}.png`
}

function buildRiderFullName(
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null
) {
  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim()
  return fullName || fallback || 'Unknown Rider'
}

function getBestRiderSkillValue(rider: {
  sprint?: number | null
  climbing?: number | null
  timeTrial?: number | null
  flat?: number | null
  endurance?: number | null
  recovery?: number | null
}) {
  const values = [
    rider.sprint,
    rider.climbing,
    rider.timeTrial,
    rider.flat,
    rider.endurance,
    rider.recovery,
  ].filter((value): value is number => typeof value === 'number')

  return values.length > 0 ? Math.max(...values) : null
}

function CountryFlag({
  countryCode,
  className = 'h-4 w-5 rounded-sm object-cover',
}: {
  countryCode?: string
  className?: string
}) {
  const src = getFlagImageUrl(countryCode)
  const countryName = getCountryName(countryCode)
  const [hasError, setHasError] = useState(false)

  if (!src || hasError) {
    return <div className={`${className} bg-gray-200`} />
  }

  return (
    <img
      src={src}
      alt={`${countryName} flag`}
      title={countryName}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

function formatCompactMoney(n?: number | null) {
  if (n == null) return '—'

  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''

  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000
    const formatted =
      millions >= 10 ? Math.round(millions).toString() : millions.toFixed(1).replace('.0', '')
    return `${sign}$${formatted}M`
  }

  if (abs >= 1_000) {
    return `${sign}$${Math.floor(abs / 1_000)}K`
  }

  return `${sign}$${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(abs)}`
}

function formatWeeklySalary(n?: number | null) {
  if (n == null) return '—'
  return `${formatCompactMoney(n)}/week`
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized

  const int = Number.parseInt(value, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getMoraleUi(morale?: number | null): {
  label: string
  color: string
} {
  const value = Math.max(0, Math.min(100, morale ?? 0))

  if (value <= 19) return { label: 'Bad', color: '#DC2626' }
  if (value <= 39) return { label: 'Low', color: '#F97316' }
  if (value <= 59) return { label: 'Okay', color: '#EAB308' }
  if (value <= 79) return { label: 'Good', color: '#84CC16' }

  return { label: 'Great', color: '#16A34A' }
}

function getFatigueUi(fatigue?: number | null): {
  label: string
  color: string
} {
  const value = Math.max(0, Math.min(100, fatigue ?? 0))

  if (value <= 19) return { label: 'Fresh', color: '#16A34A' }
  if (value <= 39) return { label: 'Normal', color: '#84CC16' }
  if (value <= 59) return { label: 'Tired', color: '#EAB308' }

  return { label: 'Very Tired', color: '#F97316' }
}

function getPotentialUi(potential?: number | null): {
  label: string
  color: string
} {
  const value = Math.max(0, Math.min(100, potential ?? 0))

  if (value <= 19) return { label: 'Limited', color: '#6B7280' }
  if (value <= 39) return { label: 'Average', color: '#0F766E' }
  if (value <= 59) return { label: 'Promising', color: '#0284C7' }
  if (value <= 79) return { label: 'High', color: '#7C3AED' }

  return { label: 'Elite', color: '#16A34A' }
}

function getDefaultRiderAvailabilityStatus(): RiderAvailabilityStatus {
  return 'fit'
}

function getRiderStatusUi(status?: RiderAvailabilityStatus | null): {
  label: string
  icon: string
  color: string
  bgColor: string
  borderColor: string
} {
  const safeStatus = status ?? getDefaultRiderAvailabilityStatus()

  if (safeStatus === 'injured') {
    const color = '#DC2626'
    return {
      label: 'Injured',
      icon: '✚',
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.2),
    }
  }

  if (safeStatus === 'not_fully_fit') {
    const color = '#C2410C'
    return {
      label: 'Not fully fit',
      icon: '♥',
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.2),
    }
  }

  if (safeStatus === 'sick') {
    const color = '#7C3AED'
    return {
      label: 'Sick',
      icon: '✚',
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.2),
    }
  }

  const color = '#16A34A'
  return {
    label: 'Fit',
    icon: '♥',
    color,
    bgColor: hexToRgba(color, 0.1),
    borderColor: hexToRgba(color, 0.2),
  }
}

function RiderStatusBadge({
  status,
  className = '',
  compact = false,
}: {
  status?: RiderAvailabilityStatus | null
  className?: string
  compact?: boolean
}) {
  const ui = getRiderStatusUi(status)

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-medium ${
        compact ? 'gap-1.5 px-2.5 py-1 text-xs' : 'gap-2 px-3 py-1 text-sm'
      } ${className}`}
      title={`Status: ${ui.label}`}
      style={{
        color: ui.color,
        backgroundColor: ui.bgColor,
        borderColor: ui.borderColor,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: ui.color,
          lineHeight: 1,
          fontSize: compact ? '0.8rem' : '0.9rem',
        }}
      >
        {ui.icon}
      </span>
      <span>{ui.label}</span>
    </span>
  )
}

function InlineStatusText({
  label,
  color,
  className = '',
}: {
  label: string
  color?: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center text-sm font-medium ${className}`}
      style={color ? { color } : undefined}
    >
      {label}
    </span>
  )
}

function getDevelopingTeamMoveState({
  hasFirstSquad,
  movementWindowOpen,
  firstSquadRiderCount,
}: {
  hasFirstSquad: boolean
  movementWindowOpen: boolean
  firstSquadRiderCount: number
}) {
  if (!hasFirstSquad) {
    return {
      enabled: false,
      reason: 'First Squad is unavailable.',
    }
  }

  if (!movementWindowOpen) {
    return {
      enabled: false,
      reason: 'Movement window is closed.',
    }
  }

  if (firstSquadRiderCount >= FIRST_SQUAD_MAX) {
    return {
      enabled: false,
      reason: `First Squad is full (${FIRST_SQUAD_MAX}/${FIRST_SQUAD_MAX}).`,
    }
  }

  return {
    enabled: true,
    reason: 'Move to First Squad',
  }
}

function getDevelopingTeamAgeWarning(age?: number | null, movementWindowOpen?: boolean) {
  if (age === null || age === undefined || age < 24) return null

  if (movementWindowOpen) {
    return {
      label: 'Action required now',
      className:
        'inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700',
    }
  }

  return {
    label: 'Must move next window',
    className:
      'inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700',
  }
}

function CompactValueTile({
  label,
  value,
  subvalue,
}: {
  label: string
  value: string
  subvalue?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/90 p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-slate-900">
        {value}
      </div>
      {subvalue ? <div className="mt-2 text-xs leading-relaxed text-slate-500">{subvalue}</div> : null}
    </div>
  )
}

function TopNav({
  isDevelopingTeamUnlocked,
}: {
  isDevelopingTeamUnlocked: boolean
}) {
  const location = useLocation()
  const isActive = (path: string) => location.pathname === path

  return (
    <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 className="mb-2 text-xl font-semibold">Squad</h2>
        <div className="text-sm text-gray-500">
          Manage your Developing Team roster and movement windows.
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
        <a
          href="#/dashboard/squad"
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            isActive('/dashboard/squad')
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          First Squad
        </a>

        {isDevelopingTeamUnlocked ? (
          <a
            href="#/dashboard/developing-team"
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              isActive('/dashboard/developing-team')
                ? 'bg-yellow-400 text-black'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Developing Team
          </a>
        ) : (
          <span
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-gray-400"
            title="Unlock Developing Team in Preferences first."
            aria-disabled="true"
          >
            <span>Developing Team</span>
            <span aria-hidden="true">🔒</span>
          </span>
        )}

        <a
          href="#/dashboard/staff"
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            isActive('/dashboard/staff')
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Staff
        </a>
      </div>
    </div>
  )
}

export default function DevelopingTeamPage() {
  const [rows, setRows] = useState<DevelopingRosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [gameDate, setGameDate] = useState<string | null>(null)
  const [developingTeamStatus, setDevelopingTeamStatus] = useState<DevelopingTeamStatus | null>(
    null
  )
  const [firstSquadRiderCount, setFirstSquadRiderCount] = useState(0)
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null)
  const [movingRiderId, setMovingRiderId] = useState<string | null>(null)
  const [moveActionMessage, setMoveActionMessage] = useState<string | null>(null)
  const [listView, setListView] = useState<SquadListView>('general')

  const navigate = useNavigate()

  const riders = useMemo(
    () =>
      rows.map((r, idx) => ({
        rowNo: idx + 1,
        id: r.rider_id,
        name: buildRiderFullName(r.first_name, r.last_name, r.full_name ?? r.display_name),
        countryCode: r.country_code,
        role: r.assigned_role,
        age: getAgeFromBirthDate(r.birth_date ?? null, gameDate ?? null) ?? r.age_years,
        overall: r.overall,
        fatigue: r.fatigue ?? 0,
        status:
          (r.availability_status ?? getDefaultRiderAvailabilityStatus()) as RiderAvailabilityStatus,
        marketValue: r.market_value ?? null,
        salary: r.salary ?? null,
        contractExpiresAt: r.contract_expires_at ?? null,
        contractExpiresSeason: r.contract_expires_season ?? null,
        sprint: r.sprint ?? null,
        climbing: r.climbing ?? null,
        timeTrial: r.time_trial ?? null,
        flat: r.flat ?? null,
        endurance: r.endurance ?? null,
        recovery: r.recovery ?? null,
        morale: r.morale ?? null,
        potential: r.potential ?? null,
      })),
    [rows, gameDate]
  )

  const loadDevelopingTeamPageData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setStatusError(null)

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr

      const userId = authData.user?.id
      if (!userId) throw new Error('Not authenticated.')

      const { data: currentGameDate, error: gameDateErr } = await supabase.rpc(
        'get_current_game_date'
      )
      if (gameDateErr) throw gameDateErr
      setGameDate(normalizeGameDateValue(currentGameDate))

      const { data: devStatusData, error: devStatusErr } = await supabase.rpc(
        'get_developing_team_status'
      )

      if (devStatusErr) {
        console.error('get_developing_team_status failed:', devStatusErr)
        setDevelopingTeamStatus(null)
        setStatusError(devStatusErr.message ?? 'Could not load Developing Team status.')
        setRows([])
        setFirstSquadRiderCount(0)
        return
      }

      const normalizedDevStatus = Array.isArray(devStatusData) ? devStatusData[0] : devStatusData
      const status = (normalizedDevStatus ?? null) as DevelopingTeamStatus | null
      setDevelopingTeamStatus(status)

      const mainClubId = status?.main_club_id
      if (mainClubId) {
        const { data: mainRoster, error: mainRosterErr } = await supabase
          .from('club_roster')
          .select('rider_id')
          .eq('club_id', mainClubId)

        if (mainRosterErr) throw mainRosterErr
        setFirstSquadRiderCount((mainRoster ?? []).length)
      } else {
        setFirstSquadRiderCount(0)
      }

      if (!status?.is_purchased || !status.developing_club_id) {
        setRows([])
        return
      }

      const { data: roster, error: rosterErr } = await supabase
        .from('club_roster')
        .select(
          'club_id, rider_id, display_name, country_code, assigned_role, age_years, overall, availability_status, fatigue'
        )
        .eq('club_id', status.developing_club_id)
        .order('overall', { ascending: false })

      if (rosterErr) throw rosterErr

      const rosterRows = (roster ?? []) as DevelopingRosterRow[]
      const riderIds = rosterRows.map((row) => row.rider_id)

      let riderMetaMap = new Map<
        string,
        {
          id: string
          first_name: string | null
          last_name: string | null
          display_name: string | null
          birth_date: string | null
          salary: number | null
          contract_expires_at: string | null
          contract_expires_season: number | null
          market_value: number | null
          sprint: number | null
          climbing: number | null
          time_trial: number | null
          flat: number | null
          endurance: number | null
          recovery: number | null
          resistance: number | null
          race_iq: number | null
          teamwork: number | null
          morale: number | null
          potential: number | null
          fatigue: number | null
          availability_status: RiderAvailabilityStatus | null
        }
      >()

      if (riderIds.length > 0) {
        const { data: riderMetaRows, error: riderMetaErr } = await supabase
          .from('riders')
          .select(
            `
            id,
            first_name,
            last_name,
            display_name,
            birth_date,
            salary,
            contract_expires_at,
            contract_expires_season,
            market_value,
            sprint,
            climbing,
            time_trial,
            flat,
            endurance,
            recovery,
            resistance,
            race_iq,
            teamwork,
            morale,
            potential,
            fatigue,
            availability_status
          `
          )
          .in('id', riderIds)

        if (riderMetaErr) throw riderMetaErr

        riderMetaMap = new Map(
          (
            riderMetaRows as Array<{
              id: string
              first_name: string | null
              last_name: string | null
              display_name: string | null
              birth_date: string | null
              salary: number | null
              contract_expires_at: string | null
              contract_expires_season: number | null
              market_value: number | null
              sprint: number | null
              climbing: number | null
              time_trial: number | null
              flat: number | null
              endurance: number | null
              recovery: number | null
              resistance: number | null
              race_iq: number | null
              teamwork: number | null
              morale: number | null
              potential: number | null
              fatigue: number | null
              availability_status: RiderAvailabilityStatus | null
            }>
          ).map((row) => [row.id, row])
        )
      }

      const mergedRows: DevelopingRosterRow[] = rosterRows.map((row) => {
        const riderMeta = riderMetaMap.get(row.rider_id)
        const fullName = buildRiderFullName(
          riderMeta?.first_name,
          riderMeta?.last_name,
          riderMeta?.display_name ?? row.display_name
        )

        return {
          ...row,
          display_name: fullName,
          full_name: fullName,
          first_name: riderMeta?.first_name ?? null,
          last_name: riderMeta?.last_name ?? null,
          birth_date: riderMeta?.birth_date ?? null,
          market_value: riderMeta?.market_value ?? null,
          salary: riderMeta?.salary ?? null,
          contract_expires_at: riderMeta?.contract_expires_at ?? null,
          contract_expires_season: riderMeta?.contract_expires_season ?? null,
          sprint: riderMeta?.sprint ?? null,
          climbing: riderMeta?.climbing ?? null,
          time_trial: riderMeta?.time_trial ?? null,
          flat: riderMeta?.flat ?? null,
          endurance: riderMeta?.endurance ?? null,
          recovery: riderMeta?.recovery ?? null,
          resistance: riderMeta?.resistance ?? null,
          race_iq: riderMeta?.race_iq ?? null,
          teamwork: riderMeta?.teamwork ?? null,
          morale: riderMeta?.morale ?? null,
          potential: riderMeta?.potential ?? null,
          fatigue: row.fatigue ?? riderMeta?.fatigue ?? null,
          availability_status:
            row.availability_status ?? riderMeta?.availability_status ?? null,
        }
      })

      setRows(mergedRows)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load Developing Team.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDevelopingTeamPageData()
  }, [loadDevelopingTeamPageData])

  useEffect(() => {
    if (!loading && !error && developingTeamStatus && !developingTeamStatus.is_purchased) {
      navigate('/dashboard/squad', { replace: true })
    }
  }, [loading, error, developingTeamStatus, navigate])

  function openRiderProfile(riderId: string) {
    setSelectedRiderId(riderId)
  }

  async function handleMoveToFirstSquad(riderId: string) {
    if (movingRiderId) return

    if (!developingTeamStatus?.main_club_id) {
      setMoveActionMessage('First Squad is unavailable.')
      return
    }

    if (!developingTeamStatus.movement_window_open) {
      setMoveActionMessage(
        `Movement window is closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}.`
      )
      return
    }

    if (firstSquadRiderCount >= FIRST_SQUAD_MAX) {
      setMoveActionMessage(`First Squad is full (${FIRST_SQUAD_MAX}/${FIRST_SQUAD_MAX}).`)
      return
    }

    setMovingRiderId(riderId)
    setMoveActionMessage(null)

    try {
      const { error } = await supabase.rpc('move_rider_between_main_and_developing', {
        p_rider_id: riderId,
        p_target_club_id: developingTeamStatus.main_club_id,
      })

      if (error) throw error

      setMoveActionMessage('Rider moved to the First Squad.')
      await loadDevelopingTeamPageData()
    } catch (e: any) {
      console.error('move_rider_between_main_and_developing failed:', e)
      setMoveActionMessage(e?.message ?? 'Could not move rider to the First Squad.')
    } finally {
      setMovingRiderId(null)
    }
  }

  function closeProfile() {
    setSelectedRiderId(null)
  }

  const hasDevelopingTeam = developingTeamStatus?.is_purchased ?? false
  const movementWindowOpen = developingTeamStatus?.movement_window_open ?? false

  const movementWindowSummary = developingTeamStatus
    ? developingTeamStatus.movement_window_open
      ? `Movement window open now: ${developingTeamStatus.current_window_label ?? 'Current window'}`
      : `Movement window closed. Next window: ${developingTeamStatus.next_window_label ?? 'Unknown'}`
    : 'Movement window information unavailable.'

  const squadTableClassName = [
    'w-full text-sm',
    listView === 'skills' ? 'table-fixed' : '',
    listView === 'financial'
      ? 'min-w-[980px]'
      : listView === 'form'
        ? 'min-w-[1020px]'
        : listView === 'general'
          ? 'min-w-[900px]'
          : '',
  ]
    .filter(Boolean)
    .join(' ')

  const squadTableColSpan =
    listView === 'skills'
      ? 11
      : listView === 'financial'
        ? 8
        : listView === 'form'
          ? 9
          : 9

  const currentViewLabel =
    SQUAD_LIST_VIEW_OPTIONS.find((option) => option.value === listView)?.label ?? 'General View'

  if (!loading && !error && developingTeamStatus && !developingTeamStatus.is_purchased) {
    return null
  }

  if (selectedRiderId) {
    return (
      <div className="w-full">
        <TopNav isDevelopingTeamUnlocked={hasDevelopingTeam} />

        <RiderProfilePage
          riderId={selectedRiderId}
          gameDate={gameDate}
          currentTeamType="developing"
          onBack={closeProfile}
          onRosterChanged={loadDevelopingTeamPageData}
          onCompareRider={({ riderId }) => {
            navigate(`/dashboard/compare-riders?left=${riderId}`)
          }}
        />
      </div>
    )
  }

  return (
    <div className="w-full">
      <TopNav isDevelopingTeamUnlocked={hasDevelopingTeam} />

      {loading && (
        <div className="rounded-lg bg-white p-4 text-sm text-gray-600 shadow">
          Loading Developing Team…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm font-medium text-red-600">Could not load Developing Team</div>
          <div className="mt-1 text-sm text-gray-600">{error}</div>
        </div>
      )}

      {!loading && !error && hasDevelopingTeam && (
        <>
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {movementWindowSummary}
          </div>

          {statusError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {statusError}
            </div>
          )}

          {moveActionMessage && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {moveActionMessage}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
            <div className="text-base font-semibold text-gray-800">
              {developingTeamStatus?.developing_club_name ?? 'Developing Team'}
            </div>
            <div className="text-sm text-gray-500">
              Riders:{' '}
              <span className="font-medium text-gray-700">
                {riders.length}/{DEVELOPING_TEAM_MAX}
              </span>
            </div>
          </div>

          <div className="w-full rounded-lg bg-white p-4 shadow">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-base font-semibold text-gray-800">Developing Team</div>
                <div className="mt-1 text-sm text-gray-500">
                  {currentViewLabel} · Riders{' '}
                  <span className="font-medium text-gray-700">
                    {riders.length}/{DEVELOPING_TEAM_MAX}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm text-gray-500">
                  First Squad:{' '}
                  <span className="font-medium text-gray-700">
                    {firstSquadRiderCount}/{FIRST_SQUAD_MAX}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="developing-team-list-view"
                    className="text-sm font-medium text-gray-600"
                  >
                    View
                  </label>
                  <select
                    id="developing-team-list-view"
                    value={listView}
                    onChange={(e) => setListView(e.target.value as SquadListView)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-yellow-400"
                  >
                    {SQUAD_LIST_VIEW_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className={squadTableClassName}>
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className={`p-2 ${listView === 'skills' ? 'w-[42px]' : ''}`}>#</th>
                    <th className={`p-2 ${listView === 'skills' ? 'w-[190px]' : ''}`}>Name</th>
                    <th className={`p-2 ${listView === 'skills' ? 'w-[110px]' : ''}`}>Country</th>
                    <th className={`p-2 ${listView === 'skills' ? 'w-[130px]' : ''}`}>Role</th>

                    {listView === 'general' && (
                      <>
                        <th className="p-2">Age</th>
                        <th className="p-2">Overall</th>
                        <th className="p-2 w-[160px]">Status</th>
                        <th className="p-2 w-[90px] text-center">Move</th>
                      </>
                    )}

                    {listView === 'financial' && (
                      <>
                        <th className="p-2">Value</th>
                        <th className="p-2">Wage</th>
                        <th className="p-2">Contract Expires</th>
                      </>
                    )}

                    {listView === 'skills' && (
                      <>
                        <th className="p-2 w-[64px] text-center">SP</th>
                        <th className="p-2 w-[64px] text-center">CL</th>
                        <th className="p-2 w-[64px] text-center">TT</th>
                        <th className="p-2 w-[64px] text-center">FL</th>
                        <th className="p-2 w-[64px] text-center">EN</th>
                        <th className="p-2 w-[64px] text-center">RC</th>
                      </>
                    )}

                    {listView === 'form' && (
                      <>
                        <th className="p-2">Potential</th>
                        <th className="p-2">Morale</th>
                        <th className="p-2">Fatigue</th>
                        <th className="p-2">Health</th>
                      </>
                    )}

                    <th
                      className={`p-2 text-right ${
                        listView === 'skills' ? 'w-[72px]' : 'w-[90px]'
                      }`}
                    >
                      View
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {riders.map((r) => {
                    const moveState = getDevelopingTeamMoveState({
                      hasFirstSquad: !!developingTeamStatus?.main_club_id,
                      movementWindowOpen,
                      firstSquadRiderCount,
                    })

                    const isBusy = movingRiderId === r.id

                    const ageWarning =
                      listView === 'general'
                        ? getDevelopingTeamAgeWarning(r.age ?? null, movementWindowOpen)
                        : null

                    const contractExpiryUi = getContractExpiryUi(
                      r.contractExpiresAt,
                      gameDate ?? null,
                      r.contractExpiresSeason
                    )

                    const bestSkillValue = getBestRiderSkillValue(r)
                    const financialContractDisplay =
                      contractExpiryUi.sublabel || contractExpiryUi.label || '—'

                    const potentialUi = getPotentialUi(r.potential)
                    const moraleUi = getMoraleUi(r.morale)
                    const fatigueUi = getFatigueUi(r.fatigue)
                    const healthUi = getRiderStatusUi(r.status)

                    const renderSkillCell = (value?: number | null) => {
                      const isBest =
                        value != null && bestSkillValue != null && value === bestSkillValue

                      return (
                        <td
                          className={`p-2 text-center ${
                            isBest ? 'font-bold text-gray-900' : 'font-medium text-gray-700'
                          }`}
                        >
                          {value ?? '—'}
                        </td>
                      )
                    }

                    return (
                      <tr key={r.id} className="border-t align-top">
                        <td className="p-2">{r.rowNo}</td>

                        <td
                          className={`p-2 ${
                            listView === 'skills'
                              ? 'truncate whitespace-nowrap'
                              : 'whitespace-nowrap'
                          }`}
                          title={r.name}
                        >
                          <div className="font-medium text-gray-800">{r.name}</div>
                          {ageWarning ? (
                            <div className="mt-2">
                              <span className={ageWarning.className}>{ageWarning.label}</span>
                            </div>
                          ) : null}
                        </td>

                        <td className="p-2">
                          <div
                            className={`flex items-center gap-2 ${
                              listView === 'skills' ? 'whitespace-nowrap' : ''
                            }`}
                            title={getCountryName(r.countryCode)}
                          >
                            <CountryFlag countryCode={r.countryCode} />
                            <span className="text-gray-700">{r.countryCode}</span>
                          </div>
                        </td>

                        <td
                          className={`p-2 ${listView === 'skills' ? 'truncate' : ''}`}
                          title={r.role}
                        >
                          {r.role}
                        </td>

                        {listView === 'general' && (
                          <>
                            <td className="p-2">{r.age ?? '—'}</td>
                            <td className="p-2">{r.overall}%</td>
                            <td className="p-2">
                              <RiderStatusBadge status={r.status} compact />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                disabled={!moveState.enabled || isBusy}
                                title={moveState.reason}
                                onClick={() => {
                                  if (!moveState.enabled || isBusy) return
                                  void handleMoveToFirstSquad(r.id)
                                }}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm transition ${
                                  moveState.enabled && !isBusy
                                    ? 'border-yellow-400 bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                    : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                }`}
                              >
                                {isBusy ? '…' : '⇄'}
                              </button>
                            </td>
                          </>
                        )}

                        {listView === 'financial' && (
                          <>
                            <td className="p-2">
                              <div className="text-gray-800">
                                {r.marketValue == null ? '—' : formatCompactMoney(r.marketValue)}
                              </div>
                            </td>

                            <td className="p-2">
                              <div className="text-gray-800">
                                {r.salary == null ? '—' : formatWeeklySalary(r.salary)}
                              </div>
                            </td>

                            <td className="p-2">
                              <div className="whitespace-nowrap text-gray-800">
                                {financialContractDisplay}
                              </div>
                            </td>
                          </>
                        )}

                        {listView === 'skills' && (
                          <>
                            {renderSkillCell(r.sprint)}
                            {renderSkillCell(r.climbing)}
                            {renderSkillCell(r.timeTrial)}
                            {renderSkillCell(r.flat)}
                            {renderSkillCell(r.endurance)}
                            {renderSkillCell(r.recovery)}
                          </>
                        )}

                        {listView === 'form' && (
                          <>
                            <td className="p-2">
                              {r.potential == null ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <InlineStatusText label={potentialUi.label} color={potentialUi.color} />
                              )}
                            </td>

                            <td className="p-2">
                              {r.morale == null ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <InlineStatusText label={moraleUi.label} color={moraleUi.color} />
                              )}
                            </td>

                            <td className="p-2">
                              <InlineStatusText label={fatigueUi.label} color={fatigueUi.color} />
                            </td>

                            <td className="p-2">
                              <InlineStatusText label={healthUi.label} color={healthUi.color} />
                            </td>
                          </>
                        )}

                        <td className="p-2 text-right">
                          <button
                            type="button"
                            onClick={() => openRiderProfile(r.id)}
                            className="text-sm font-medium text-yellow-600 hover:text-yellow-700"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {riders.length === 0 && (
                    <tr className="border-t">
                      <td className="p-2 text-gray-500" colSpan={squadTableColSpan}>
                        No riders found for the Developing Team yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <CompactValueTile
              label="Eligible U23 Riders"
              value={`${riders.filter((r) => r.age !== null && r.age <= 23).length}`}
            />
            <CompactValueTile
              label="Aged-out Riders"
              value={`${riders.filter((r) => r.age !== null && r.age >= 24).length}`}
              subvalue={
                movementWindowOpen
                  ? 'Need action during current window'
                  : 'Need action by next window'
              }
            />
            <CompactValueTile
              label="Average Overall"
              value={`${
                riders.length
                  ? Math.round(
                      riders.reduce((sum, rider) => sum + rider.overall, 0) / riders.length
                    )
                  : 0
              }`}
            />
            <CompactValueTile
              label="Movement Window"
              value={movementWindowOpen ? 'Open' : 'Closed'}
              subvalue={
                movementWindowOpen
                  ? developingTeamStatus?.current_window_label ?? 'Current window'
                  : developingTeamStatus?.next_window_label ?? 'Unknown'
              }
            />
          </div>
        </>
      )}
    </div>
  )
}