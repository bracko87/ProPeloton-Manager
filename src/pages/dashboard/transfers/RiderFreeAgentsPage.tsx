import React from 'react'

type RiderRoleFilter = 'all' | string
type RiderMarketSort =
  | 'active'
  | 'expires'
  | 'overall_desc'
  | 'overall_asc'
  | 'price_desc'
  | 'price_asc'
  | 'name_asc'
  | 'name_desc'
  | 'age_asc'
  | 'age_desc'

type FreeAgentMarketRow = {
  id: string
  rider_id: string
  source_type: string
  source_club_id: string | null
  desired_tier: string
  expected_salary_weekly: number
  min_acceptable_salary_weekly: number
  preferred_duration_seasons: number
  available_from_game_date: string | null
  expires_on_game_date: string | null
  status: string
  rider: {
    id: string
    display_name: string
    country_code: string | null
    role: string | null
    overall: number | null
    potential: number | null
    market_value: number | null
    salary: number | null
    contract_expires_at: string | null
    availability_status: string | null
  } | null
  source_club: {
    id: string
    name: string | null
  } | null
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
  rider: {
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
  age_years: number | null
  seller_label: string
  amount_value: number | null
  amount_label: string
  expires_on_game_date: string | null
  is_user_active: boolean
  is_own_item: boolean
  raw: FreeAgentMarketRow
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Number(value).toLocaleString('de-DE')}`
}

function safeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode || countryCode.length !== 2) return 'rs'
  return countryCode.toLowerCase()
}

function getCountryFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

function getCountryName(countryCode: string | null | undefined) {
  const code = safeCountryCode(countryCode).toUpperCase()

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

function tryParseDate(value: string | null | undefined) {
  if (!value) return null
  const direct = new Date(value)
  if (!Number.isNaN(direct.getTime())) return direct

  const asMidnight = new Date(`${value}T00:00:00`)
  if (!Number.isNaN(asMidnight.getTime())) return asMidnight

  return null
}

function getExpiryCountdownLabel(value: string | null | undefined, nowMs: number) {
  if (!value) return 'No expiry'

  const parsed = tryParseDate(value)
  if (!parsed) return value

  const diffMs = parsed.getTime() - nowMs
  if (diffMs <= 0) return 'Expired'

  const totalMinutes = Math.floor(diffMs / (1000 * 60))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${minutes}m left`
}

function MarketActionButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="rounded-md bg-yellow-400 px-3 py-2 text-xs font-semibold text-black transition hover:bg-yellow-300"
    >
      {label}
    </button>
  )
}

function MarketListRow({
  item,
  nowMs,
  isSelected,
  onSelect,
  onQuickAction,
}: {
  item: FreeAgentMarketItem
  nowMs: number
  isSelected: boolean
  onSelect: () => void
  onQuickAction: () => void
}) {
  const countdown = getExpiryCountdownLabel(item.expires_on_game_date, nowMs)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-left transition ${
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
            <img
              src={getCountryFlagUrl(safeCountryCode(item.country_code))}
              alt={getCountryName(item.country_code)}
              className="h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover"
            />

            <span className="truncate text-sm font-semibold text-gray-900">{item.display_name}</span>

            {item.is_user_active ? (
              <span className="rounded-full bg-yellow-300 px-2 py-0.5 text-[11px] font-bold uppercase text-black">
                Active Offer
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>{item.role || '—'}</span>
            <span>OVR {item.overall ?? '—'}</span>
            <span>POT {item.potential ?? '—'}</span>
            <span>Age {item.age_years ?? '—'}</span>
            <span>{item.seller_label}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>{item.amount_label}</span>
            <span>Visible: {countdown}</span>
            <span>Expiry: {item.expires_on_game_date || '—'}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold text-gray-900">Free Agent</div>
            <div className="text-xs text-gray-500">
              {item.amount_value != null ? formatCurrency(item.amount_value) : '—'}
            </div>
          </div>

          <MarketActionButton label="Contract Negotiate" onClick={onQuickAction} />
        </div>
      </div>
    </button>
  )
}

type RiderFreeAgentsPageProps = {
  riderLoading: boolean
  nowMs: number
  marketSearch: string
  setMarketSearch: (value: string) => void
  marketRoleFilter: RiderRoleFilter
  setMarketRoleFilter: (value: RiderRoleFilter) => void
  riderRoleOptions: string[]
  marketSort: RiderMarketSort
  setMarketSort: (value: RiderMarketSort) => void
  marketOnlyActive: boolean
  setMarketOnlyActive: (value: boolean) => void
  paginatedUnifiedMarketRows: FreeAgentMarketItem[]
  selectedFreeAgentId: string | null
  onSelectMarketItem: (item: FreeAgentMarketItem) => void
  onQuickActionMarketItem: (item: FreeAgentMarketItem) => void
  marketPageStart: number
  marketPageEnd: number
  totalMarketRows: number
  marketPage: number
  marketTotalPages: number
  onPrevMarketPage: () => void
  onNextMarketPage: () => void
  selectedFreeAgent: FreeAgentMarketRow | null
  riderActionLoading: boolean
  onStartFreeAgentNegotiation: (agent: FreeAgentMarketRow) => void
  myFreeAgentNegotiations: FreeAgentNegotiationRow[]
}

export default function RiderFreeAgentsPage({
  riderLoading,
  nowMs,
  marketSearch,
  setMarketSearch,
  marketRoleFilter,
  setMarketRoleFilter,
  riderRoleOptions,
  marketSort,
  setMarketSort,
  marketOnlyActive,
  setMarketOnlyActive,
  paginatedUnifiedMarketRows,
  selectedFreeAgentId,
  onSelectMarketItem,
  onQuickActionMarketItem,
  marketPageStart,
  marketPageEnd,
  totalMarketRows,
  marketPage,
  marketTotalPages,
  onPrevMarketPage,
  onNextMarketPage,
  selectedFreeAgent,
  riderActionLoading,
  onStartFreeAgentNegotiation,
  myFreeAgentNegotiations,
}: RiderFreeAgentsPageProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h4 className="font-semibold text-gray-900">Free Agents</h4>
            <div className="mt-1 text-sm text-gray-500">
              Full-width free-agent market. Active user negotiations stay pinned on top and highlighted.
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
                placeholder="Search rider, role, seller..."
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
                {riderRoleOptions.map((role) => (
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
                <option value="expires">Expiry</option>
                <option value="overall_desc">OVR High-Low</option>
                <option value="overall_asc">OVR Low-High</option>
                <option value="price_desc">Price High-Low</option>
                <option value="price_asc">Price Low-High</option>
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
              Loading rider market...
            </div>
          ) : paginatedUnifiedMarketRows.length === 0 ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
              No riders found for the current filters.
            </div>
          ) : (
            paginatedUnifiedMarketRows.map((item) => (
              <MarketListRow
                key={item.key}
                item={item}
                nowMs={nowMs}
                isSelected={item.free_agent_id === selectedFreeAgentId}
                onSelect={() => onSelectMarketItem(item)}
                onQuickAction={() => onQuickActionMarketItem(item)}
              />
            ))
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            Showing {marketPageStart}-{marketPageEnd} of {totalMarketRows} riders • 30 per page
          </div>

          {totalMarketRows > 30 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrevMarketPage}
                disabled={marketPage === 1}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  marketPage === 1
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Previous
              </button>

              <div className="px-2 text-sm text-gray-600">
                Page {marketPage} / {marketTotalPages}
              </div>

              <button
                type="button"
                onClick={onNextMarketPage}
                disabled={marketPage === marketTotalPages}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  marketPage === marketTotalPages
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">Selected Free Agent</h4>

          {!selectedFreeAgent ? (
            <div className="mt-3 text-sm text-gray-500">
              Select a free agent from the market list above.
            </div>
          ) : (
            <>
              <div className="mt-3">
                <div className="font-semibold text-gray-900">
                  {selectedFreeAgent.rider?.display_name || 'Unknown rider'}
                </div>
                <div className="text-sm text-gray-500">
                  {selectedFreeAgent.rider?.role || '—'} • OVR {selectedFreeAgent.rider?.overall ?? '—'} •
                  POT {selectedFreeAgent.rider?.potential ?? '—'}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Expected Salary</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(selectedFreeAgent.expected_salary_weekly)}/week
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Min Acceptable</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(selectedFreeAgent.min_acceptable_salary_weekly)}/week
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Preferred Duration</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {selectedFreeAgent.preferred_duration_seasons} season(s)
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Visible For</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {getExpiryCountdownLabel(selectedFreeAgent.expires_on_game_date, nowMs)}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  Desired tier: {selectedFreeAgent.desired_tier}
                </div>

                <button
                  type="button"
                  onClick={() => onStartFreeAgentNegotiation(selectedFreeAgent)}
                  disabled={riderActionLoading}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    riderActionLoading
                      ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                      : 'bg-yellow-400 text-black hover:bg-yellow-300'
                  }`}
                >
                  {riderActionLoading ? 'Processing...' : 'Contract Negotiate'}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">Free Agent Negotiations</h4>
          <div className="mt-3 space-y-2">
            {myFreeAgentNegotiations.length === 0 ? (
              <div className="text-sm text-gray-500">No free-agent negotiations yet.</div>
            ) : (
              myFreeAgentNegotiations.map((negotiation) => (
                <div
                  key={negotiation.id}
                  className={`rounded-lg border p-3 ${
                    negotiation.status === 'open'
                      ? 'border-yellow-300 bg-yellow-50'
                      : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">
                    {negotiation.rider?.display_name || 'Unknown rider'}
                  </div>
                  <div className="text-xs text-gray-500">
                    Status {negotiation.status} • Expected{' '}
                    {formatCurrency(negotiation.expected_salary_weekly)} • Min{' '}
                    {formatCurrency(negotiation.min_acceptable_salary_weekly)}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Offer {formatCurrency(negotiation.offer_salary_weekly)} • Duration{' '}
                    {negotiation.offer_duration_seasons ?? negotiation.preferred_duration_seasons}
                    {negotiation.locked_until ? ` • Locked until ${negotiation.locked_until}` : ''}
                    {negotiation.closed_reason ? ` • ${negotiation.closed_reason}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
