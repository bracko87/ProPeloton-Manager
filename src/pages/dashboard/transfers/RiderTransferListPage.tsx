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

type GameStateRow = {
  season_number: number
  month_number: number
  day_number: number
  hour_number: number
  minute_number: number
}

type OwnedRiderRow = {
  rider_id: string
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  display_name: string
  country_code?: string | null
  role: string | null
  age_years: number | null
  overall: number | null
  potential: number | null
  market_value: number | null
  salary: number | null
  contract_expires_at: string | null
  availability_status: string | null
}

type MarketListingRow = {
  listing_id: string
  rider_id: string
  seller_club_id: string
  seller_club_name: string | null
  first_name?: string | null
  last_name?: string | null
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

type TransferListingRow = {
  listing_id?: string
  id?: string
  rider_id: string
  seller_club_id?: string
  asking_price: number
  min_allowed_price: number
  max_allowed_price: number
  listed_on_game_date: string | null
  expires_on_game_date: string | null
  status: string
  auto_price_clamped?: boolean
  created_at?: string
  updated_at?: string
  status_changed_at_game_ts?: string | null

  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  display_name?: string | null
  country_code?: string | null
  role?: string | null
  age_years?: number | null
  overall?: number | null
  potential?: number | null
  seller_club_name?: string | null
}

type TransferOfferRow = {
  id: string
  listing_id: string
  rider_id: string
  seller_club_id: string
  buyer_club_id: string
  offered_price: number
  offered_on_game_date: string | null
  expires_on_game_date: string | null
  status: string
  auto_block_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
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

function looksLikeShortInitialName(value: string | null | undefined) {
  if (!value) return false
  const normalized = value.trim()
  return /^[A-Z]\.\s+[A-Za-zÀ-ÿ' -]+$/u.test(normalized)
}

function cleanNameCandidate(value: string | null | undefined) {
  const normalized = value?.trim()
  if (!normalized) return null
  if (looksLikeUuid(normalized)) return null
  return normalized
}

function pickBetterName(
  currentValue: string | null,
  nextValue: string | null
) {
  if (!nextValue) return currentValue
  if (!currentValue) return nextValue

  const currentIsShort = looksLikeShortInitialName(currentValue)
  const nextIsShort = looksLikeShortInitialName(nextValue)

  if (currentIsShort && !nextIsShort) return nextValue
  if (!currentIsShort && nextIsShort) return currentValue

  return nextValue.length > currentValue.length ? nextValue : currentValue
}

function getPreferredRiderName(value: {
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  display_name?: string | null
  rider_id?: string | null
}) {
  const combinedName = cleanNameCandidate(
    [value.first_name?.trim(), value.last_name?.trim()].filter(Boolean).join(' ')
  )

  const fullName = cleanNameCandidate(value.full_name)
  const displayName = cleanNameCandidate(value.display_name)

  let bestName: string | null = null
  bestName = pickBetterName(bestName, combinedName)
  bestName = pickBetterName(bestName, displayName)
  bestName = pickBetterName(bestName, fullName)

  if (bestName) return bestName

  if (value.rider_id && !looksLikeUuid(value.rider_id)) {
    return value.rider_id
  }

  return 'Unknown rider'
}

function getListingRowId(listing: TransferListingRow) {
  return listing.listing_id ?? listing.id ?? listing.rider_id
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
}: {
  item: TransferMarketItem
  gameState: GameStateRow | null
  isSelected: boolean
  onSelect: () => void
  onQuickAction: () => void
}) {
  const riderName = getPreferredRiderName(item.raw)

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

            <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <span className="font-semibold text-gray-900">Transfer:</span>{' '}
              <span>{formatTransferAmount(item.amount_value)}</span>
            </div>

            <MarketActionButton
              label="Make Offer"
              onClick={onQuickAction}
              disabled={item.is_own_item || listingExpired}
            />
          </div>
        </div>
      </div>
    </button>
  )
}

type RiderTransferListPageProps = {
  riderLoading: boolean
  nowMs: number
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

  ownRiders: OwnedRiderRow[]
  selectedOwnedRiderId: string | null
  onSelectOwnedRider: (riderId: string) => void
  selectedOwnedRider: OwnedRiderRow | null
  listAskingPrice: string
  setListAskingPrice: (value: string) => void
  listDurationDays: string
  setListDurationDays: (value: string) => void
  onListRider: () => void

  selectedMarketListing: MarketListingRow | null
  clubId: string | null
  offerPrice: string
  setOfferPrice: (value: string) => void
  onSubmitOffer: () => void

  riderActionLoading: boolean
  myListings: TransferListingRow[]
  onCancelListing: (listingId: string) => void
  myReceivedOffers: TransferOfferRow[]
  clubNameMap: Record<string, string>
  onRejectOffer: (offerId: string) => void
  onAcceptOffer: (offerId: string) => void
  mySellerNegotiations: TransferNegotiationRow[]
}

export default function RiderTransferListPage({
  riderLoading,
  nowMs,
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
  ownRiders,
  selectedOwnedRiderId,
  onSelectOwnedRider,
  selectedOwnedRider,
  listAskingPrice,
  setListAskingPrice,
  listDurationDays,
  setListDurationDays,
  riderActionLoading,
  onListRider,
  selectedMarketListing,
  clubId,
  offerPrice,
  setOfferPrice,
  onSubmitOffer,
  myListings,
  onCancelListing,
  myReceivedOffers,
  clubNameMap,
  onRejectOffer,
  onAcceptOffer,
  mySellerNegotiations,
}: RiderTransferListPageProps) {
  void nowMs
  void ownRiders
  void selectedOwnedRiderId
  void onSelectOwnedRider
  void selectedOwnedRider
  void listAskingPrice
  void setListAskingPrice
  void listDurationDays
  void setListDurationDays
  void onListRider
  void selectedMarketListing
  void clubId
  void offerPrice
  void setOfferPrice
  void onSubmitOffer

  const visibleReceivedOffers = myReceivedOffers.filter(
    (offer) => offer.status === 'open' || offer.status === 'accepted'
  )

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
          <h4 className="font-semibold text-gray-900">My Listings</h4>
          <div className="mt-3 space-y-2">
            {myListings.length === 0 ? (
              <div className="text-sm text-gray-500">
                No transfer listings created by your club yet.
              </div>
            ) : (
              myListings.map((listing) => {
                const listingRowId = getListingRowId(listing)
                const riderName = getPreferredRiderName(listing)

                return (
                  <div key={listingRowId} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <img
                            src={getCountryFlagUrl(safeCountryCode(listing.country_code))}
                            alt={getCountryName(listing.country_code)}
                            className="h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover"
                          />
                          <div className="truncate font-medium text-gray-900">{riderName}</div>
                        </div>

                        <div className="text-sm text-gray-600">
                          Role: {listing.role ?? '—'} · OVR: {listing.overall ?? '—'} · POT:{' '}
                          {listing.potential ?? '—'} · Age: {listing.age_years ?? '—'}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          Status: {listing.status} • Asking: {formatTransferAmount(listing.asking_price)} •
                          Expires {formatDate(listing.expires_on_game_date)}
                        </div>
                      </div>

                      {listing.status === 'listed' ? (
                        <button
                          type="button"
                          onClick={() => onCancelListing(listingRowId)}
                          disabled={riderActionLoading}
                          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">Offers Received</h4>
          <div className="mt-3 space-y-2">
            {visibleReceivedOffers.length === 0 ? (
              <div className="text-sm text-gray-500">No visible incoming offers.</div>
            ) : (
              visibleReceivedOffers.map((offer) => (
                <div key={offer.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">
                        {clubNameMap[offer.buyer_club_id] || offer.buyer_club_id}
                      </div>
                      <div className="text-xs text-gray-500">
                        Offer {formatCurrency(offer.offered_price)} • Status {offer.status}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        Expires {formatDate(offer.expires_on_game_date)}
                        {offer.auto_block_reason ? ` • ${offer.auto_block_reason}` : ''}
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
              ))
            )}
          </div>
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
            mySellerNegotiations.map((negotiation) => (
              <div key={negotiation.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-sm font-semibold text-gray-900">
                  Buyer {clubNameMap[negotiation.buyer_club_id] || negotiation.buyer_club_id}
                </div>
                <div className="text-xs text-gray-500">
                  Status {negotiation.status} • Expected{' '}
                  {formatCurrency(negotiation.expected_salary_weekly)} • Last offer{' '}
                  {formatCurrency(negotiation.offer_salary_weekly)}
                </div>
                <div className="text-[11px] text-gray-400">
                  Duration {negotiation.offer_duration_seasons ?? '—'} • Expires{' '}
                  {formatDate(negotiation.expires_on_game_date)}
                  {negotiation.closed_reason ? ` • ${negotiation.closed_reason}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}