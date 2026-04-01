import React, { useEffect, useState } from 'react'
import TransferHistoryPanel, { type TransferHistoryRow } from './TransferHistoryPanel'

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

type GameStateRow = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number
  minute_number: number
}

type MarketListingRow = {
  listing_id: string
  rider_id: string
  seller_club_id: string
  seller_club_name: string | null
  full_name?: string | null
  display_name: string
  country_code: string | null
  role: string | null
  age_years: number | null
  overall: number | null
  potential: number | null
  market_value: number | null
  asking_price: number
  salary: number | null
  contract_expires_at: string | null
  availability_status: string | null
  listed_on_game_date: string | null
  expires_on_game_date: string | null
  auto_price_clamped: boolean
  time_left_label?: string | null
  status?: string | null
}

type TransferOfferRow = {
  id: string
  listing_id: string
  rider_id: string
  seller_club_id: string
  buyer_club_id: string
  seller_club_name?: string | null
  offered_price: number
  offered_on_game_date: string | null
  expires_on_game_date: string | null
  status: string
  auto_block_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string

  full_name?: string | null
  display_name?: string | null
  country_code?: string | null
  role?: string | null
  overall?: number | null
  potential?: number | null
  age_years?: number | null
}

type TransferNegotiationRow = {
  id: string
  offer_id: string
  listing_id: string
  rider_id: string
  seller_club_id: string
  buyer_club_id: string
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
  expires_on_game_date: string
  closed_reason: string | null
  notes_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type TransferMarketItem = {
  kind: 'transfer'
  key: string
  rider_id: string
  listing_id: string
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
  raw: MarketListingRow
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
}

function formatTransferAmount(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  const roundedToThousand = Math.round(Number(value) / 1000) * 1000
  return `$${roundedToThousand.toLocaleString('en-US')}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return value
}

function formatOfferStatusLabel(status: string | null | undefined) {
  const normalized = (status || '').toLowerCase()

  switch (normalized) {
    case 'open':
      return 'Open'
    case 'club_accepted':
      return 'Club accepted'
    case 'accepted':
      return 'Accepted'
    case 'completed':
      return 'Completed'
    case 'rejected':
      return 'Rejected'
    case 'declined':
      return 'Declined'
    case 'withdrawn':
      return 'Cancelled'
    case 'expired':
      return 'Expired'
    case 'auto_blocked':
      return 'Blocked'
    case 'rider_declined':
      return 'Rider declined'
    default:
      return status || '—'
  }
}

function formatNegotiationStatusLabel(status: string | null | undefined) {
  const normalized = (status || '').toLowerCase()

  switch (normalized) {
    case 'open':
      return 'Open'
    case 'pending':
      return 'Pending'
    case 'countered':
      return 'Countered'
    case 'accepted':
      return 'Accepted'
    case 'completed':
      return 'Completed'
    case 'declined':
      return 'Declined'
    case 'rejected':
      return 'Rejected'
    case 'expired':
      return 'Expired'
    default:
      return status || '—'
  }
}

function formatNegotiationReason(reason: string | null | undefined) {
  const normalized = (reason || '').toLowerCase()

  switch (normalized) {
    case 'salary_or_duration_not_competitive':
      return 'Salary or contract duration not competitive'
    case 'negotiation_expired':
      return 'Negotiation expired'
    case 'salary_too_low':
      return 'Salary too low'
    case 'contract_too_short':
      return 'Contract too short'
    case 'contract_too_long':
      return 'Contract too long'
    case 'club_tier_too_low':
      return 'Club tier too low'
    case 'not_interested':
      return 'Rider not interested'
    case 'competitive_level_mismatch':
      return 'Competitive level mismatch'
    default:
      return reason || '—'
  }
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

function getGameCountdownLabel(
  expiresOnGameDate: string | null | undefined,
  gameState: GameStateRow | null,
  fallbackLabel?: string | null
) {
  if (!expiresOnGameDate) return 'No expiry'

  if (!gameState) {
    const safeFallback = fallbackLabel?.trim()
    return safeFallback && safeFallback.length > 0 ? safeFallback : 'No expiry'
  }

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

function stripLabelPrefix(value: string) {
  const colonIndex = value.indexOf(':')
  if (colonIndex === -1) return value
  return value.slice(colonIndex + 1).trim()
}

function looksLikeUuid(value: string | null | undefined) {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  )
}

function getPreferredRiderName(value: {
  full_name?: string | null
  display_name?: string | null
  rider_id?: string | null
}) {
  if (value.full_name?.trim()) return value.full_name.trim()
  if (value.display_name?.trim() && !looksLikeUuid(value.display_name)) {
    return value.display_name.trim()
  }
  if (value.rider_id && !looksLikeUuid(value.rider_id)) return value.rider_id
  return 'Unknown rider'
}

function getNegotiationCardClass(status: string | null | undefined) {
  const normalized = (status || '').toLowerCase()

  if (['completed', 'accepted', 'signed', 'success'].includes(normalized)) {
    return 'rounded-lg border border-green-200 bg-green-50 p-3'
  }

  if (['rejected', 'failed', 'cancelled', 'expired', 'declined'].includes(normalized)) {
    return 'rounded-lg border border-red-200 bg-red-50 p-3'
  }

  return 'rounded-lg border border-gray-100 bg-gray-50 p-3'
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

function InlineTextButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        disabled
          ? 'cursor-default font-normal text-gray-500 no-underline'
          : 'font-normal text-black no-underline hover:text-gray-700'
      }
    >
      {label}
    </button>
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
}: {
  item: TransferMarketItem
  gameState: GameStateRow | null
  isSelected: boolean
  onSelect: () => void
  onQuickAction: () => void
}) {
  const riderName = getPreferredRiderName({
    full_name: item.raw.full_name,
    display_name: item.display_name || item.raw.display_name,
    rider_id: item.rider_id,
  })

  const countdown = getGameCountdownLabel(
    item.expires_on_game_date,
    gameState,
    item.raw.time_left_label
  )

  const listingExpired = countdown === 'Expired'

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

            <span className="truncate text-sm font-semibold text-gray-900">{riderName}</span>

            {item.is_user_active ? (
              <span className="rounded-full bg-yellow-300 px-2 py-0.5 text-[11px] font-bold uppercase text-black">
                Active Offer
              </span>
            ) : null}

            {item.is_own_item ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                Own
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <InfoPair label="Role:" value={item.role || '—'} />
            <InfoPair label="OVR:" value={item.overall ?? '—'} />
            <InfoPair label="POT:" value={item.potential ?? '—'} />
            <InfoPair label="Age:" value={item.age_years ?? '—'} />
            <InfoPair label="Seller:" value={stripLabelPrefix(item.seller_label)} />
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <div
              className={`rounded-md px-3 py-2 text-xs ${
                listingExpired ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
              }`}
            >
              <span className={`font-semibold ${listingExpired ? 'text-red-900' : 'text-blue-900'}`}>
                Time left:
              </span>{' '}
              <span>{countdown}</span>
            </div>

            <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs">
              <span className="font-bold text-black">Transfer:</span>{' '}
              <span className="font-bold text-black">{formatTransferAmount(item.amount_value)}</span>
            </div>

            <MarketActionButton
              label={item.is_user_active ? 'Offer Active' : 'Make Offer'}
              onClick={onQuickAction}
              disabled={item.is_own_item || listingExpired || item.is_user_active}
            />
          </div>
        </div>
      </div>
    </button>
  )
}

const BOX_PAGE_SIZE = 5

function getBoxPageCount(total: number) {
  return Math.max(1, Math.ceil(total / BOX_PAGE_SIZE))
}

function getBoxRows<T>(rows: T[], page: number) {
  const startIndex = (page - 1) * BOX_PAGE_SIZE
  return rows.slice(startIndex, startIndex + BOX_PAGE_SIZE)
}

function PanelPagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
      <div className="text-xs text-gray-500">
        Page {page} / {totalPages}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page === 1}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            page === 1
              ? 'cursor-not-allowed bg-gray-200 text-gray-500'
              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Previous
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={page === totalPages}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            page === totalPages
              ? 'cursor-not-allowed bg-gray-200 text-gray-500'
              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Next
        </button>
      </div>
    </div>
  )
}

type RiderTransferListPageProps = {
  riderLoading: boolean
  gameState: GameStateRow | null
  marketSearch: string
  setMarketSearch: (value: string) => void
  marketRoleFilter: RiderRoleFilter
  setMarketRoleFilter: (value: RiderRoleFilter) => void
  riderRoleOptions: string[]
  marketSort: RiderMarketSort
  setMarketSort: (value: RiderMarketSort) => void
  marketOnlyActive: boolean
  setMarketOnlyActive: (value: boolean) => void
  marketHideOwn: boolean
  setMarketHideOwn: (value: boolean) => void
  paginatedUnifiedMarketRows: TransferMarketItem[]
  selectedMarketListingId: string | null
  onSelectMarketItem: (item: TransferMarketItem) => void
  onQuickActionMarketItem: (item: TransferMarketItem) => void
  marketPageStart: number
  marketPageEnd: number
  totalMarketRows: number
  marketPage: number
  marketTotalPages: number
  onPrevMarketPage: () => void
  onNextMarketPage: () => void

  riderActionLoading: boolean
  myReceivedOffers: TransferOfferRow[]
  clubNameMap: Record<string, string>
  onRejectOffer: (offerId: string) => void
  onAcceptOffer: (offerId: string) => void
  onWithdrawSentOffer: (offerId: string) => void
  onOpenTeamPage: (clubId: string) => void
  onOpenRiderProfile: (riderId: string) => void

  mySentOffers: TransferOfferRow[]
  mySellerNegotiations: TransferNegotiationRow[]
  transferHistory: TransferHistoryRow[]
}

export default function RiderTransferListPage({
  riderLoading,
  gameState,
  marketSearch,
  setMarketSearch,
  marketRoleFilter,
  setMarketRoleFilter,
  riderRoleOptions,
  marketSort,
  setMarketSort,
  marketOnlyActive,
  setMarketOnlyActive,
  marketHideOwn,
  setMarketHideOwn,
  paginatedUnifiedMarketRows,
  selectedMarketListingId,
  onSelectMarketItem,
  onQuickActionMarketItem,
  marketPageStart,
  marketPageEnd,
  totalMarketRows,
  marketPage,
  marketTotalPages,
  onPrevMarketPage,
  onNextMarketPage,
  riderActionLoading,
  myReceivedOffers,
  clubNameMap,
  onRejectOffer,
  onAcceptOffer,
  onWithdrawSentOffer,
  onOpenTeamPage,
  onOpenRiderProfile,
  mySentOffers,
  mySellerNegotiations,
  transferHistory,
}: RiderTransferListPageProps) {
  const visibleReceivedOffers = myReceivedOffers.filter(
    (offer) => offer.status === 'open' || offer.status === 'accepted'
  )

  const visibleSentOffers = mySentOffers

  const [receivedOffersPage, setReceivedOffersPage] = useState(1)
  const [myOffersPage, setMyOffersPage] = useState(1)
  const [sellerNegotiationsPage, setSellerNegotiationsPage] = useState(1)

  const receivedOffersTotalPages = getBoxPageCount(visibleReceivedOffers.length)
  const myOffersTotalPages = getBoxPageCount(visibleSentOffers.length)
  const sellerNegotiationsTotalPages = getBoxPageCount(mySellerNegotiations.length)

  useEffect(() => {
    setReceivedOffersPage((prev) => Math.min(prev, receivedOffersTotalPages))
  }, [receivedOffersTotalPages])

  useEffect(() => {
    setMyOffersPage((prev) => Math.min(prev, myOffersTotalPages))
  }, [myOffersTotalPages])

  useEffect(() => {
    setSellerNegotiationsPage((prev) => Math.min(prev, sellerNegotiationsTotalPages))
  }, [sellerNegotiationsTotalPages])

  const pagedReceivedOffers = getBoxRows(visibleReceivedOffers, receivedOffersPage)
  const pagedMyOffers = getBoxRows(visibleSentOffers, myOffersPage)
  const pagedSellerNegotiations = getBoxRows(mySellerNegotiations, sellerNegotiationsPage)

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h4 className="font-semibold text-gray-900">Transfer List Riders</h4>
            <div className="mt-1 text-sm text-gray-500">
              Full-width transfer market. Active user offers stay pinned on top and highlighted.
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

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={marketHideOwn}
                  onChange={(e) => setMarketHideOwn(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Hide own listings
              </label>
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
                gameState={gameState}
                isSelected={item.listing_id === selectedMarketListingId}
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">My Offers</h4>
          <div className="mt-3 space-y-2">
            {visibleSentOffers.length === 0 ? (
              <div className="text-sm text-gray-500">No submitted transfer offers yet.</div>
            ) : (
              pagedMyOffers.map((offer) => {
                const sellerClubName =
                  offer.seller_club_name || clubNameMap[offer.seller_club_id] || 'Unknown team'
                const riderName = getPreferredRiderName(offer)
                const flagCode = safeCountryCode(offer.country_code)

                return (
                  <div
                    key={offer.id}
                    className="rounded-lg border border-green-200 bg-green-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <img
                            src={getCountryFlagUrl(flagCode)}
                            alt={getCountryName(flagCode)}
                            className="h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover"
                          />

                          <button
                            type="button"
                            onClick={() => onOpenRiderProfile(offer.rider_id)}
                            className="truncate text-left font-medium text-black no-underline hover:text-gray-700"
                          >
                            {riderName}
                          </button>
                        </div>

                        <div className="text-sm text-gray-600">
                          Role: {offer.role ?? '—'} · OVR: {offer.overall ?? '—'} · POT:{' '}
                          {offer.potential ?? '—'} · Age: {offer.age_years ?? '—'}
                        </div>

                        <div className="mt-1 text-xs">
                          <span className="font-bold text-black">Team:</span>{' '}
                          <span className="font-bold text-black">{sellerClubName}</span>{' '}
                          <span className="font-bold text-black">• Offer:</span>{' '}
                          <span className="font-bold text-black">
                            {formatTransferAmount(offer.offered_price)}
                          </span>{' '}
                          <span className="font-bold text-black">• Status:</span>{' '}
                          <span className="font-bold text-black">
                            {formatOfferStatusLabel(offer.status)}
                          </span>{' '}
                          <span className="font-bold text-black">• Expires</span>{' '}
                          <span className="font-bold text-red-600">
                            {formatDate(offer.expires_on_game_date)}
                          </span>
                        </div>
                      </div>

                      {offer.status === 'open' ? (
                        <button
                          type="button"
                          onClick={() => onWithdrawSentOffer(offer.id)}
                          disabled={riderActionLoading}
                          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Cancel Offer
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <PanelPagination
            page={myOffersPage}
            totalPages={myOffersTotalPages}
            onPrev={() => setMyOffersPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setMyOffersPage((prev) => Math.min(myOffersTotalPages, prev + 1))}
          />
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">Offers Received</h4>
          <div className="mt-3 space-y-2">
            {visibleReceivedOffers.length === 0 ? (
              <div className="text-sm text-gray-500">No visible incoming offers.</div>
            ) : (
              pagedReceivedOffers.map((offer) => {
                const buyerClubName = clubNameMap[offer.buyer_club_id] || 'Unknown team'
                const riderName = getPreferredRiderName(offer)
                const canOpenTeam = Boolean(clubNameMap[offer.buyer_club_id])

                return (
                  <div
                    key={offer.id}
                    className="rounded-lg border border-blue-200 bg-blue-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-black">
                          <span className="font-semibold">Team:</span>{' '}
                          {canOpenTeam ? (
                            <InlineTextButton
                              label={buyerClubName}
                              onClick={() => onOpenTeamPage(offer.buyer_club_id)}
                            />
                          ) : (
                            <span className="font-normal text-black">{buyerClubName}</span>
                          )}
                        </div>

                        <div className="text-sm text-black">
                          <span className="font-semibold">Rider:</span>{' '}
                          <InlineTextButton
                            label={riderName}
                            onClick={() => onOpenRiderProfile(offer.rider_id)}
                          />
                        </div>

                        <div className="mt-1 text-xs">
                          <span className="font-bold text-black">Offer</span>{' '}
                          <span className="font-bold text-black">
                            {formatTransferAmount(offer.offered_price)}
                          </span>{' '}
                          <span className="font-bold text-black">• Status</span>{' '}
                          <span className="font-bold text-black">
                            {formatOfferStatusLabel(offer.status)}
                          </span>{' '}
                          <span className="font-bold text-black">• Expires</span>{' '}
                          <span className="font-bold text-red-600">
                            {formatDate(offer.expires_on_game_date)}
                          </span>
                          {offer.auto_block_reason ? (
                            <span className="text-gray-500"> • {offer.auto_block_reason}</span>
                          ) : null}
                        </div>
                      </div>

                      {offer.status === 'open' ? (
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onRejectOffer(offer.id)}
                            disabled={riderActionLoading}
                            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => onAcceptOffer(offer.id)}
                            disabled={riderActionLoading}
                            className="rounded-md bg-yellow-400 px-3 py-2 text-sm font-medium text-black hover:bg-yellow-300"
                          >
                            Accept
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <PanelPagination
            page={receivedOffersPage}
            totalPages={receivedOffersTotalPages}
            onPrev={() => setReceivedOffersPage((prev) => Math.max(1, prev - 1))}
            onNext={() =>
              setReceivedOffersPage((prev) => Math.min(receivedOffersTotalPages, prev + 1))
            }
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
        <h4 className="font-semibold text-gray-900">Seller Negotiations</h4>
        <div className="mt-3 space-y-2">
          {mySellerNegotiations.length === 0 ? (
            <div className="text-sm text-gray-500">
              No rider negotiations involving your selling club yet.
            </div>
          ) : (
            pagedSellerNegotiations.map((negotiation) => (
              <div
                key={negotiation.id}
                className={getNegotiationCardClass(negotiation.status)}
              >
                <div className="text-sm font-semibold text-gray-900">
                  Buyer {clubNameMap[negotiation.buyer_club_id] || negotiation.buyer_club_id}
                </div>

                <div className="text-xs text-gray-600">
                  Status {formatNegotiationStatusLabel(negotiation.status)} • Expected{' '}
                  {formatCurrency(negotiation.expected_salary_weekly)} • Minimum acceptable{' '}
                  {formatCurrency(negotiation.min_acceptable_salary_weekly)}
                </div>

                <div className="text-xs text-gray-600">
                  Last offer {formatCurrency(negotiation.offer_salary_weekly)} • Preferred duration{' '}
                  {negotiation.preferred_duration_seasons ?? '—'} • Offered duration{' '}
                  {negotiation.offer_duration_seasons ?? '—'}
                </div>

                <div className="text-[11px] text-gray-500">
                  Attempts {negotiation.attempt_count}/{negotiation.max_attempts} • Expires{' '}
                  {formatDate(negotiation.expires_on_game_date)}
                  {negotiation.closed_reason
                    ? ` • ${formatNegotiationReason(negotiation.closed_reason)}`
                    : ''}
                </div>
              </div>
            ))
          )}
        </div>

        <PanelPagination
          page={sellerNegotiationsPage}
          totalPages={sellerNegotiationsTotalPages}
          onPrev={() => setSellerNegotiationsPage((prev) => Math.max(1, prev - 1))}
          onNext={() =>
            setSellerNegotiationsPage((prev) =>
              Math.min(sellerNegotiationsTotalPages, prev + 1)
            )
          }
        />
      </div>

      <TransferHistoryPanel transferHistory={transferHistory} />

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 shadow">
        <h4 className="font-semibold text-gray-900">How Transfer Offers Work</h4>

        <div className="mt-3 space-y-3 text-sm text-gray-700">
          <p>
            You first send a transfer fee offer to the seller club. The seller club decides whether
            your club is allowed to negotiate with the rider.
          </p>

          <p>
            If your offer is <span className="font-semibold text-gray-900">below the asking price</span>,
            the seller club must manually accept or reject it.
          </p>

          <p>
            If your offer is <span className="font-semibold text-gray-900">equal to or above the asking price</span>,
            club terms are accepted automatically.
          </p>

          <p>
            After seller acceptance, or automatic acceptance, you will receive a notification with a
            link to start contract talks with the rider.
          </p>

          <p>
            During rider negotiation, the rider can accept your terms, ask for better salary, ask
            for a different contract length, or reject the move completely. Rejection reasons should
            be visible in notifications and negotiation details.
          </p>

          <p>
            If the seller club rejects your offer, or does not answer before expiry, you will
            receive a notification that the offer was rejected or expired.
          </p>
        </div>
      </div>
    </div>
  )
}