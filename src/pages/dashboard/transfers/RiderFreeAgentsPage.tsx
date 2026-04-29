import React, { useEffect, useMemo, useState } from 'react'
import TransferHistoryPanel, { type TransferHistoryRow } from './TransferHistoryPanel'

const FREE_AGENT_ACTIVITY_ITEMS_PER_PAGE = 5

function getCurrentGameDateFromState(gameState: GameStateRow | null | undefined) {
  if (!gameState) return null

  const gameYear = 1999 + Math.max(1, gameState.season_number || 1)

  const gameDate = new Date(
    Date.UTC(
      gameYear,
      Math.max(0, (gameState.month_number || 1) - 1),
      Math.max(1, gameState.day_number || 1),
      Math.max(0, gameState.hour_number || 0),
      Math.max(0, gameState.minute_number || 0)
    )
  )

  return Number.isNaN(gameDate.getTime()) ? null : gameDate
}

function getGameDateExpiryTimestamp(expiresOnGameDate: string | null | undefined) {
  if (!expiresOnGameDate) return null

  const expiryDate = new Date(`${expiresOnGameDate}T23:59:59Z`)
  if (Number.isNaN(expiryDate.getTime())) return null

  return expiryDate.getTime()
}

function isFreeAgentNegotiationEffectivelyExpired(
  expiresOnGameDate: string | null | undefined,
  gameState: GameStateRow | null | undefined
) {
  const currentGameDate = getCurrentGameDateFromState(gameState)
  const expiryTimestamp = getGameDateExpiryTimestamp(expiresOnGameDate)

  if (!currentGameDate || expiryTimestamp == null) return false

  return currentGameDate.getTime() > expiryTimestamp
}

type RiderRoleFilter = 'all' | string
type RiderMarketSort =
  | 'active'
  | 'expires'
  | 'scouted'
  | 'overall_desc'
  | 'overall_asc'
  | 'price_desc'
  | 'price_asc'
  | 'name_asc'
  | 'name_desc'
  | 'age_asc'
  | 'age_desc'

type GameStateRow = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number
  minute_number: number
}

type FreeAgentMarketRow = {
  id?: string
  free_agent_id: string
  rider_id: string
  status: string
  expected_salary_weekly: number | null
  expires_on_game_date: string | null
  full_name: string | null
  display_name: string | null
  country_code: string | null
  role: string | null
  overall: number | null
  potential: number | null
  age_years: number | null
  overall_label?: string | null
  potential_label?: string | null
  is_scouted?: boolean
}

type FreeAgentNegotiationRow = {
  id: string
  free_agent_id: string
  rider_id: string
  club_id: string
  status: string
  current_salary_weekly: number | null
  expected_salary_weekly: number
  min_acceptable_salary_weekly: number
  preferred_duration_seasons: number
  offer_salary_weekly: number | null
  offer_duration_seasons: number | null
  attempt_count: number
  max_attempts: number
  locked_until: string | null
  opened_on_game_date: string
  closed_reason: string | null
  created_at?: string | null
  updated_at?: string | null
  expires_on_game_date?: string | null
  full_name?: string | null
  display_name?: string | null
  rider?: {
    id: string
    display_name: string
    country_code: string | null
    role: string | null
    overall: number | null
    potential: number | null
  } | null
}

type FreeAgentMarketItem = {
  kind: 'free_agent'
  key: string
  rider_id: string
  free_agent_id: string
  display_name: string
  country_code: string | null
  role: string | null
  overall: number | null
  potential: number | null
  overall_label?: string | null
  potential_label?: string | null
  is_scouted?: boolean
  age_years: number | null
  seller_label: string
  amount_value: number | null
  amount_label: string
  expires_on_game_date: string | null
  is_user_active: boolean
  is_own_item: boolean
  raw: FreeAgentMarketRow
}

type ActivityTone = 'active' | 'positive' | 'negative'

type TransferActivityChip = {
  label: string
  value: string
  emphasized?: boolean
}

type FreeAgentActivityItem = {
  id: string
  negotiationId: string
  riderId: string | null
  riderName: string
  tone: ActivityTone
  statusLabel: string
  primaryLine: string
  secondaryLine?: string
  sortTime: number
  detailChips: TransferActivityChip[]
  status: string
  expires_on_game_date: string | null
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
}

function safeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode || countryCode.length !== 2) return null
  return countryCode.toLowerCase()
}

function getCountryFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

function getCountryName(countryCode: string | null | undefined) {
  const safeCode = safeCountryCode(countryCode)
  if (!safeCode) return 'Unknown country'

  const code = safeCode.toUpperCase()

  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined') {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
      return regionNames.of(code) || code
    }
  } catch {
    return code
  }

  return code
}

function getGameCountdownLabel(
  expiresOnGameDate: string | null | undefined,
  gameState: GameStateRow | null
) {
  if (!expiresOnGameDate || !gameState) return 'No expiry'

  const currentGameDate = new Date(
    Date.UTC(
      2000,
      Math.max(0, gameState.month_number - 1),
      gameState.day_number,
      gameState.hour_number,
      gameState.minute_number,
      0
    )
  )

  const expiryDate = new Date(`${expiresOnGameDate}T23:59:59Z`)
  const diffMs = expiryDate.getTime() - currentGameDate.getTime()

  if (diffMs <= 0) return 'Expired'

  const totalSeconds = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${days}d ${hours}h ${minutes}m ${seconds}s`
}

function getPreferredRiderName(value: {
  full_name?: string | null
  display_name?: string | null
  rider_id?: string | null
}) {
  return value.full_name?.trim() || value.display_name?.trim() || value.rider_id || 'Unknown rider'
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

const TERMINAL_FREE_AGENT_NEGOTIATION_STATUSES = new Set([
  'accepted',
  'completed',
  'declined',
  'rejected',
  'expired',
  'withdrawn',
  'cancelled',
])

function canOpenFreeAgentNegotiation(status: string | null | undefined) {
  return !TERMINAL_FREE_AGENT_NEGOTIATION_STATUSES.has(normalizeStatus(status))
}

function getToneClasses(tone: ActivityTone) {
  if (tone === 'active') return 'border-yellow-300 bg-white'
  if (tone === 'positive') return 'border-green-300 bg-green-50'
  return 'border-red-300 bg-red-50'
}

function getActivityStatusClasses(tone: ActivityTone) {
  if (tone === 'positive') {
    return 'border-green-200 bg-white text-green-700'
  }
  if (tone === 'negative') {
    return 'border-red-200 bg-white text-red-700'
  }
  return 'border-gray-300 bg-white text-gray-700'
}

function ActivityDetailChip({
  label,
  value,
  emphasized = false,
}: TransferActivityChip) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-3 py-1.5 text-xs ${
        emphasized
          ? 'border-gray-300 bg-white text-gray-700 shadow-sm'
          : 'border-gray-200 bg-white/90 text-gray-700'
      }`}
    >
      <span className="font-semibold text-gray-900">{label}:</span>
      <span
        className={`ml-1 ${emphasized ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}
      >
        {value}
      </span>
    </span>
  )
}

function InfoPair({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <span className="whitespace-nowrap text-xs text-gray-600">
      <span className="font-semibold text-gray-900">{label}</span>{' '}
      <span className="font-normal text-gray-600">{value}</span>
    </span>
  )
}

function MarketActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
        disabled
          ? 'cursor-not-allowed bg-gray-200 text-gray-500'
          : 'bg-yellow-400 text-black hover:bg-yellow-300'
      }`}
    >
      {label}
    </button>
  )
}

function MarketListRow({
  item,
  gameState,
  isSelected,
  onSelect,
  onQuickAction,
  onOpenRiderProfile,
}: {
  item: FreeAgentMarketItem
  gameState: GameStateRow | null
  isSelected: boolean
  onSelect: () => void
  onQuickAction: () => void
  onOpenRiderProfile: () => void
}) {
  const riderName = getPreferredRiderName(item.raw)
  const countdown = getGameCountdownLabel(item.expires_on_game_date, gameState)
  const isExpired = countdown === 'Expired'
  const flagCode = safeCountryCode(item.country_code)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        onSelect()
        onOpenRiderProfile()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
          onOpenRiderProfile()
        }
      }}
      className={`w-full cursor-pointer rounded-xl border p-4 text-left transition ${
        item.is_user_active
          ? 'border-yellow-300 bg-yellow-50'
          : isSelected
            ? 'border-gray-300 bg-gray-50'
            : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {flagCode ? (
              <img
                src={getCountryFlagUrl(flagCode)}
                alt={getCountryName(item.country_code)}
                className="h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover"
              />
            ) : (
              <div className="h-4 w-6 shrink-0 rounded-sm bg-gray-100" aria-hidden="true" />
            )}

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onSelect()
                onOpenRiderProfile()
              }}
              className="truncate text-sm font-semibold text-gray-900 hover:underline"
            >
              {riderName}
            </button>

            {item.is_scouted ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                Scouted
              </span>
            ) : null}

            {item.is_user_active ? (
              <span className="rounded-full bg-yellow-300 px-2 py-0.5 text-[11px] font-bold uppercase text-black">
                Active Negotiation
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <InfoPair label="Role:" value={item.role || '—'} />
            <InfoPair label="OVR:" value={item.overall_label ?? '—'} />
            {item.is_scouted ? (
              <InfoPair label="POT:" value={item.potential_label ?? '—'} />
            ) : null}
            <InfoPair label="Age:" value={item.age_years ?? '—'} />
            <InfoPair label="Type:" value="Free Agent" />
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <div
              className={`rounded-md px-3 py-2 text-xs ${
                isExpired ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
              }`}
            >
              <span className={`font-semibold ${isExpired ? 'text-red-900' : 'text-blue-900'}`}>
                Time left:
              </span>{' '}
              <span>{countdown}</span>
            </div>

            <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <span className="font-semibold text-gray-900">Salary:</span>{' '}
              <span>{formatCurrency(item.amount_value)}/week</span>
            </div>

            <MarketActionButton
              label="Contract Negotiate"
              onClick={onQuickAction}
              disabled={isExpired}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

type RiderFreeAgentsPageProps = {
  riderLoading: boolean
  gameState: GameStateRow | null
  marketSearch?: string
  setMarketSearch: (value: string) => void
  marketRoleFilter: RiderRoleFilter
  setMarketRoleFilter: (value: RiderRoleFilter) => void
  riderRoleOptions?: string[]
  marketSort: RiderMarketSort
  setMarketSort: (value: RiderMarketSort) => void
  marketOnlyActive: boolean
  setMarketOnlyActive: (value: boolean) => void
  paginatedUnifiedMarketRows?: FreeAgentMarketItem[]
  selectedFreeAgentId: string | null
  onSelectMarketItem: (item: FreeAgentMarketItem) => void
  onQuickActionMarketItem: (item: FreeAgentMarketItem) => void
  onOpenRiderProfile: (item: FreeAgentMarketItem) => void
  onOpenHistoryRiderProfile?: (riderId: string) => void
  marketPageStart: number
  marketPageEnd: number
  totalMarketRows: number
  marketPage: number
  marketTotalPages: number
  onFirstMarketPage: () => void
  onPrevMarketPage: () => void
  onNextMarketPage: () => void
  onLastMarketPage: () => void
  selectedFreeAgent: FreeAgentMarketRow | null
  riderActionLoading: boolean
  onStartFreeAgentNegotiation: (agent: FreeAgentMarketRow) => void
  onOpenNegotiation?: (negotiationId: string) => void
  onCancelNegotiation?: (negotiationId: string) => void
  myFreeAgentNegotiations?: FreeAgentNegotiationRow[]
  transferHistory?: TransferHistoryRow[]
  currentClubRiderIds?: Set<string>
  onOpenOwnedRiderProfile?: (riderId: string) => void
  onOpenExternalRiderProfile?: (riderId: string) => void
  onOpenClubProfile?: (clubId: string) => void
}

export default function RiderFreeAgentsPage({
  riderLoading,
  gameState,
  marketSearch = '',
  setMarketSearch,
  marketRoleFilter,
  setMarketRoleFilter,
  riderRoleOptions = [],
  marketSort,
  setMarketSort,
  marketOnlyActive,
  setMarketOnlyActive,
  paginatedUnifiedMarketRows = [],
  selectedFreeAgentId,
  onSelectMarketItem,
  onQuickActionMarketItem,
  onOpenRiderProfile,
  onOpenHistoryRiderProfile = () => {},
  marketPageStart,
  marketPageEnd,
  totalMarketRows,
  marketPage,
  marketTotalPages,
  onFirstMarketPage,
  onPrevMarketPage,
  onNextMarketPage,
  onLastMarketPage,
  selectedFreeAgent,
  riderActionLoading,
  onStartFreeAgentNegotiation,
  onOpenNegotiation = () => {},
  onCancelNegotiation = () => {},
  myFreeAgentNegotiations = [],
  transferHistory = [],
  currentClubRiderIds = new Set<string>(),
  onOpenOwnedRiderProfile = () => {},
  onOpenExternalRiderProfile = () => {},
  onOpenClubProfile = () => {},
}: RiderFreeAgentsPageProps) {
  const safeMarketRows = Array.isArray(paginatedUnifiedMarketRows)
    ? paginatedUnifiedMarketRows
    : []

  const safeNegotiations = Array.isArray(myFreeAgentNegotiations)
    ? myFreeAgentNegotiations
    : []

  const safeTransferHistory = Array.isArray(transferHistory)
    ? transferHistory
    : []

  const safeRoleOptions = Array.isArray(riderRoleOptions) ? riderRoleOptions : []
  const safeOwnedRiderIds =
    currentClubRiderIds instanceof Set ? currentClubRiderIds : new Set<string>()

  void selectedFreeAgent
  void riderActionLoading
  void onStartFreeAgentNegotiation
  void onOpenHistoryRiderProfile

  function handleOpenActivityRider(riderId: string | null) {
    if (!riderId) return

    if (safeOwnedRiderIds.has(riderId)) {
      onOpenOwnedRiderProfile(riderId)
      return
    }

    onOpenExternalRiderProfile(riderId)
  }

  const freeAgentActivityItems = useMemo(() => {
    const items: FreeAgentActivityItem[] = []

    for (const negotiation of safeNegotiations) {
      const riderName =
        negotiation.full_name?.trim() ||
        negotiation.display_name?.trim() ||
        negotiation.rider?.display_name?.trim() ||
        negotiation.rider_id ||
        'Unknown rider'

      const status = normalizeStatus(negotiation.status)

      let tone: 'active' | 'positive' | 'negative' = 'active'
      let statusLabel = 'Negotiation active'
      let secondaryLine = 'Contract talks are in progress.'

      if (status === 'accepted' || status === 'completed') {
        tone = 'positive'
        statusLabel = 'Completed'
        secondaryLine = 'Free-agent signing completed successfully.'
      } else if (status === 'declined' || status === 'rejected' || status === 'expired') {
        tone = 'negative'
        statusLabel = status === 'expired' ? 'Expired' : 'Declined'
        secondaryLine =
          negotiation.closed_reason?.trim() || 'Negotiation ended without agreement.'
      }

      items.push({
        id: negotiation.id,
        negotiationId: negotiation.id,
        riderId: negotiation.rider_id,
        riderName,
        tone,
        statusLabel,
        primaryLine: `Free agent negotiation • ${riderName}`,
        secondaryLine,
        sortTime:
          new Date(
            (negotiation as any).updated_at ||
              (negotiation as any).created_at ||
              negotiation.opened_on_game_date
          ).getTime() || 0,
        detailChips: [
          {
            label: 'Min salary',
            value: `${formatCurrency(negotiation.min_acceptable_salary_weekly)}/week`,
            emphasized: true,
          },
          {
            label: 'Latest offer',
            value: `${formatCurrency(
              negotiation.offer_salary_weekly ?? negotiation.expected_salary_weekly
            )}/week`,
            emphasized: true,
          },
          {
            label: 'Duration',
            value: `${negotiation.offer_duration_seasons ?? negotiation.preferred_duration_seasons} season(s)`,
          },
          ...(negotiation.expires_on_game_date
            ? [
                {
                  label: 'Expires',
                  value: getGameCountdownLabel(negotiation.expires_on_game_date, gameState),
                  emphasized: true,
                },
              ]
            : []),
        ],
        status: negotiation.status,
        expires_on_game_date: negotiation.expires_on_game_date ?? null,
      })
    }

    return items.sort((a, b) => b.sortTime - a.sortTime)
  }, [safeNegotiations, gameState])

  const [activityPage, setActivityPage] = useState(1)

  useEffect(() => {
    setActivityPage(1)
  }, [freeAgentActivityItems])

  const activityTotalPages = Math.max(
    1,
    Math.ceil(freeAgentActivityItems.length / FREE_AGENT_ACTIVITY_ITEMS_PER_PAGE)
  )

  const paginatedFreeAgentActivityItems = useMemo(() => {
    const startIndex = (activityPage - 1) * FREE_AGENT_ACTIVITY_ITEMS_PER_PAGE
    return freeAgentActivityItems.slice(
      startIndex,
      startIndex + FREE_AGENT_ACTIVITY_ITEMS_PER_PAGE
    )
  }, [freeAgentActivityItems, activityPage])

  const negotiationActionButtonClassName =
    'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium'

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h4 className="font-semibold text-gray-900">Free Agents</h4>
            <div className="mt-1 text-sm text-gray-500">
              Full-width free-agent market. Active user negotiations stay pinned on top and
              highlighted.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Search
              </label>
              <input
                type="text"
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder="Search rider, role..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Role
              </label>
              <select
                value={marketRoleFilter}
                onChange={(e) => setMarketRoleFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value="all">All Roles</option>
                {safeRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Sort
              </label>
              <select
                value={marketSort}
                onChange={(e) => setMarketSort(e.target.value as RiderMarketSort)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value="active">Active First</option>
                <option value="scouted">Scouted First</option>
                <option value="expires">Expires Soonest</option>
                <option value="overall_desc">Overall High-Low</option>
                <option value="overall_asc">Overall Low-High</option>
                <option value="price_desc">Salary High-Low</option>
                <option value="price_asc">Salary Low-High</option>
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
                <option value="age_asc">Age Low-High</option>
                <option value="age_desc">Age High-Low</option>
              </select>
            </div>

            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={marketOnlyActive}
                  onChange={(e) => setMarketOnlyActive(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Only my active
              </label>

              <div className="h-6" />
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {riderLoading ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
              Loading free agents...
            </div>
          ) : safeMarketRows.length === 0 ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
              No riders found for the current filters.
            </div>
          ) : (
            safeMarketRows.map((item) => (
              <MarketListRow
                key={item.key}
                item={item}
                gameState={gameState}
                isSelected={item.free_agent_id === selectedFreeAgentId}
                onSelect={() => onSelectMarketItem(item)}
                onQuickAction={() => onQuickActionMarketItem(item)}
                onOpenRiderProfile={() => onOpenRiderProfile(item)}
              />
            ))
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            Showing {marketPageStart}-{marketPageEnd} of {totalMarketRows} riders • 30 per page
          </div>

          {totalMarketRows > 30 ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onFirstMarketPage}
                disabled={marketPage <= 1}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                First
              </button>

              <button
                type="button"
                onClick={onPrevMarketPage}
                disabled={marketPage <= 1}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              <div className="text-sm text-gray-600">
                Page {marketPage} / {marketTotalPages}
              </div>

              <button
                type="button"
                onClick={onNextMarketPage}
                disabled={marketPage >= marketTotalPages}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>

              <button
                type="button"
                onClick={onLastMarketPage}
                disabled={marketPage >= marketTotalPages}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Last
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Free Agent Negotiations</h3>
          <p className="mt-1 text-sm text-gray-500">
            All current and recently updated free-agent negotiations from the last 24 hours.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {freeAgentActivityItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
              No free-agent negotiation activity in the last 24 hours.
            </div>
          ) : (
            paginatedFreeAgentActivityItems.map((item) => {
              const normalizedStatus = normalizeStatus(item.status)
              const isExpired = isFreeAgentNegotiationEffectivelyExpired(
                item.expires_on_game_date,
                gameState
              )

              const canCancelNegotiation = !isExpired && normalizedStatus === 'open'
              const uiStatus = isExpired ? 'expired' : normalizedStatus

              const displayTone: ActivityTone =
                uiStatus === 'accepted' || uiStatus === 'completed'
                  ? 'positive'
                  : uiStatus === 'declined' ||
                      uiStatus === 'rejected' ||
                      uiStatus === 'withdrawn' ||
                      uiStatus === 'expired'
                    ? 'negative'
                    : 'active'

              const statusLabel =
                uiStatus === 'open'
                  ? 'Negotiation active'
                  : uiStatus === 'rejected' || uiStatus === 'declined'
                    ? 'Declined'
                    : uiStatus === 'withdrawn'
                      ? 'Withdrawn'
                      : uiStatus === 'accepted' || uiStatus === 'completed'
                        ? 'Completed'
                        : uiStatus === 'expired'
                          ? 'Expired'
                          : 'Negotiation'

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border px-4 py-4 ${getToneClasses(displayTone)}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-gray-900">{item.riderName}</span>

                        <span
                          className={`inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm ${getActivityStatusClasses(
                            displayTone
                          )}`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <div className="mt-1 text-sm font-semibold text-gray-800">
                        {item.primaryLine}
                      </div>

                      {item.secondaryLine ? (
                        <div className="mt-1 text-sm text-gray-700">{item.secondaryLine}</div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {item.detailChips.map((chip, index) => (
                          <ActivityDetailChip
                            key={`${item.id}-chip-${index}`}
                            label={chip.label}
                            value={chip.value}
                            emphasized={chip.emphasized}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 lg:self-center">
                      {item.riderId ? (
                        <button
                          type="button"
                          onClick={() => handleOpenActivityRider(item.riderId)}
                          className={`${negotiationActionButtonClassName} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                        >
                          Open rider
                        </button>
                      ) : null}

                      {canCancelNegotiation ? (
                        <button
                          type="button"
                          onClick={() => onCancelNegotiation(item.id)}
                          className={`${negotiationActionButtonClassName} border border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
                        >
                          Cancel negotiation
                        </button>
                      ) : null}

                      {canOpenFreeAgentNegotiation(uiStatus) ? (
                        <button
                          type="button"
                          onClick={() => onOpenNegotiation(item.id)}
                          className={`${negotiationActionButtonClassName} bg-yellow-400 text-black hover:bg-yellow-300`}
                        >
                          Open negotiation
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            Showing{' '}
            {paginatedFreeAgentActivityItems.length === 0
              ? 0
              : (activityPage - 1) * FREE_AGENT_ACTIVITY_ITEMS_PER_PAGE + 1}
            -
            {Math.min(
              activityPage * FREE_AGENT_ACTIVITY_ITEMS_PER_PAGE,
              freeAgentActivityItems.length
            )}{' '}
            of {freeAgentActivityItems.length} negotiation items
          </div>

          {freeAgentActivityItems.length > FREE_AGENT_ACTIVITY_ITEMS_PER_PAGE ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActivityPage((prev) => Math.max(1, prev - 1))}
                disabled={activityPage === 1}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  activityPage === 1
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Previous
              </button>

              <div className="px-2 text-sm text-gray-600">
                Page {activityPage} / {activityTotalPages}
              </div>

              <button
                type="button"
                onClick={() =>
                  setActivityPage((prev) => Math.min(activityTotalPages, prev + 1))
                }
                disabled={activityPage === activityTotalPages}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  activityPage === activityTotalPages
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <TransferHistoryPanel
        transferHistory={safeTransferHistory}
        currentClubRiderIds={safeOwnedRiderIds}
        onOpenOwnedRiderProfile={onOpenOwnedRiderProfile}
        onOpenExternalRiderProfile={onOpenExternalRiderProfile}
        onOpenClubProfile={onOpenClubProfile}
      />
    </div>
  )
}