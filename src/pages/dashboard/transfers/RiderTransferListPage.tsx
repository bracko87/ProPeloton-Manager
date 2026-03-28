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

type OwnedRiderRow = {
  rider_id: string
  display_name: string
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
}

type TransferListingRow = {
  id: string
  rider_id: string
  seller_club_id: string
  asking_price: number
  min_allowed_price: number
  max_allowed_price: number
  listed_on_game_date: string | null
  expires_on_game_date: string | null
  status: string
  auto_price_clamped: boolean
  created_at: string
  updated_at: string
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
  return `$${Number(value).toLocaleString('de-DE')}`
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
  nowMs,
  isSelected,
  onSelect,
  onQuickAction,
}: {
  item: TransferMarketItem
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

            {item.is_own_item ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                Own
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
            <span>Expiry: {formatDate(item.expires_on_game_date)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold text-gray-900">Transfer</div>
            <div className="text-xs text-gray-500">
              {item.amount_value != null ? formatCurrency(item.amount_value) : '—'}
            </div>
          </div>

          <MarketActionButton
            label="Make Offer"
            onClick={onQuickAction}
            disabled={item.is_own_item}
          />
        </div>
      </div>
    </button>
  )
}

type RiderTransferListPageProps = {
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
  riderActionLoading: boolean
  onListRider: () => void
  selectedMarketListing: MarketListingRow | null
  clubId: string | null
  offerPrice: string
  setOfferPrice: (value: string) => void
  onSubmitOffer: () => void
  myListings: TransferListingRow[]
  onCancelListing: (listingId: string) => void
  myReceivedOffers: TransferOfferRow[]
  clubNameMap: Record<string, string>
  onRejectOffer: (offerId: string) => void
  onAcceptOffer: (offerId: string) => void
  mySentOffers: TransferOfferRow[]
  myBuyerNegotiations: TransferNegotiationRow[]
  getNegotiationDraft: (
    negotiation: TransferNegotiationRow
  ) => { salary: string; duration: string }
  updateNegotiationDraft: (
    negotiationId: string,
    patch: Partial<{ salary: string; duration: string }>
  ) => void
  onSubmitNegotiation: (negotiation: TransferNegotiationRow) => void
  mySellerNegotiations: TransferNegotiationRow[]
}

export default function RiderTransferListPage({
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
  mySentOffers,
  myBuyerNegotiations,
  getNegotiationDraft,
  updateNegotiationDraft,
  onSubmitNegotiation,
  mySellerNegotiations,
}: RiderTransferListPageProps) {
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
                nowMs={nowMs}
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">List My Rider</h4>

          <div className="mt-4 max-h-[320px] space-y-2 overflow-auto pr-1">
            {ownRiders.length === 0 ? (
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                No riders found for your club.
              </div>
            ) : (
              ownRiders.map((rider) => {
                const selected = rider.rider_id === selectedOwnedRiderId

                return (
                  <button
                    key={rider.rider_id}
                    type="button"
                    onClick={() => onSelectOwnedRider(rider.rider_id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selected
                        ? 'border-yellow-300 bg-yellow-50'
                        : 'border-gray-100 bg-white hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900">{rider.display_name}</div>
                        <div className="text-xs text-gray-500">
                          {rider.role || '—'} • OVR {rider.overall ?? '—'} • POT{' '}
                          {rider.potential ?? '—'}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold text-gray-700">
                        {formatCurrency(rider.market_value)}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {selectedOwnedRider ? (
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">
                {selectedOwnedRider.display_name}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Asking Price
                  </label>
                  <input
                    type="number"
                    value={listAskingPrice}
                    onChange={(e) => setListAskingPrice(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Listing Duration (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={listDurationDays}
                    onChange={(e) => setListDurationDays(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  Market value: {formatCurrency(selectedOwnedRider.market_value)}
                </div>

                <button
                  type="button"
                  onClick={onListRider}
                  disabled={riderActionLoading}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    riderActionLoading
                      ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                      : 'bg-yellow-400 text-black hover:bg-yellow-300'
                  }`}
                >
                  {riderActionLoading ? 'Processing...' : 'List Rider'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">Selected Listing</h4>

          {!selectedMarketListing ? (
            <div className="mt-3 text-sm text-gray-500">
              Select a listed rider from the market list above.
            </div>
          ) : (
            <>
              <div className="mt-3">
                <div className="font-semibold text-gray-900">
                  {selectedMarketListing.display_name}
                </div>
                <div className="text-sm text-gray-500">
                  {selectedMarketListing.role || '—'} • Age {selectedMarketListing.age_years ?? '—'} •
                  OVR {selectedMarketListing.overall ?? '—'} • POT {selectedMarketListing.potential ?? '—'}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Asking Price</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(selectedMarketListing.asking_price)}
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Market Value</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(selectedMarketListing.market_value)}
                  </div>
                </div>
              </div>

              {selectedMarketListing.seller_club_id === clubId ? (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  This is your own listing.
                </div>
              ) : (
                <div className="mt-4">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Offer Price
                  </label>
                  <input
                    type="number"
                    value={offerPrice}
                    onChange={(e) => setOfferPrice(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-500">
                      Listing visible for{' '}
                      {getExpiryCountdownLabel(selectedMarketListing.expires_on_game_date, nowMs)}
                    </div>

                    <button
                      type="button"
                      onClick={onSubmitOffer}
                      disabled={riderActionLoading}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                        riderActionLoading
                          ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                          : 'bg-yellow-400 text-black hover:bg-yellow-300'
                      }`}
                    >
                      {riderActionLoading ? 'Processing...' : 'Make Offer'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
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
              myListings.map((listing) => (
                <div key={listing.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">
                        Rider ID: {listing.rider_id}
                      </div>
                      <div className="text-xs text-gray-500">
                        Status: {listing.status} • Asking: {formatCurrency(listing.asking_price)} •
                        Expires {formatDate(listing.expires_on_game_date)}
                      </div>
                    </div>

                    {listing.status === 'listed' ? (
                      <button
                        type="button"
                        onClick={() => onCancelListing(listing.id)}
                        disabled={riderActionLoading}
                        className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">Offers Received</h4>
          <div className="mt-3 space-y-2">
            {myReceivedOffers.length === 0 ? (
              <div className="text-sm text-gray-500">No visible incoming offers.</div>
            ) : (
              myReceivedOffers.map((offer) => (
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">My Sent Offers</h4>
          <div className="mt-3 space-y-2">
            {mySentOffers.length === 0 ? (
              <div className="text-sm text-gray-500">No visible outgoing offers.</div>
            ) : (
              mySentOffers.map((offer) => (
                <div
                  key={offer.id}
                  className={`rounded-lg border p-3 ${
                    offer.status === 'open'
                      ? 'border-yellow-300 bg-yellow-50'
                      : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">
                    To seller {clubNameMap[offer.seller_club_id] || offer.seller_club_id}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatCurrency(offer.offered_price)} • Status {offer.status}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Expires {formatDate(offer.expires_on_game_date)}
                    {offer.auto_block_reason ? ` • ${offer.auto_block_reason}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">Buyer Negotiations</h4>
          <div className="mt-3 space-y-3">
            {myBuyerNegotiations.length === 0 ? (
              <div className="text-sm text-gray-500">
                No rider negotiations for your buyer club yet.
              </div>
            ) : (
              myBuyerNegotiations.map((negotiation) => {
                const draft = getNegotiationDraft(negotiation)
                const isOpen = negotiation.status === 'open'

                return (
                  <div
                    key={negotiation.id}
                    className={`rounded-lg border p-3 ${
                      isOpen ? 'border-yellow-300 bg-yellow-50' : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900">
                          Rider ID {negotiation.rider_id}
                        </div>
                        <div className="text-xs text-gray-500">
                          Status {negotiation.status} • Expected{' '}
                          {formatCurrency(negotiation.expected_salary_weekly)} • Min{' '}
                          {formatCurrency(negotiation.min_acceptable_salary_weekly)}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          Preferred duration {negotiation.preferred_duration_seasons} season(s) •
                          Expires {formatDate(negotiation.expires_on_game_date)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                          Salary / week
                        </label>
                        <input
                          type="number"
                          value={draft.salary}
                          onChange={(e) =>
                            updateNegotiationDraft(negotiation.id, {
                              salary: e.target.value,
                            })
                          }
                          disabled={!isOpen}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                          Duration (seasons)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={draft.duration}
                          onChange={(e) =>
                            updateNegotiationDraft(negotiation.id, {
                              duration: e.target.value,
                            })
                          }
                          disabled={!isOpen}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-500">
                        Attempts {negotiation.attempt_count}/{negotiation.max_attempts}
                        {negotiation.locked_until ? ` • Locked until ${negotiation.locked_until}` : ''}
                        {negotiation.closed_reason ? ` • ${negotiation.closed_reason}` : ''}
                      </div>

                      {isOpen ? (
                        <button
                          type="button"
                          onClick={() => onSubmitNegotiation(negotiation)}
                          disabled={riderActionLoading}
                          className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-300"
                        >
                          Submit Terms
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })
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
