import React, { useEffect, useMemo } from 'react'

type UnifiedTransferRow = {
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
  raw: {
    asking_price: number
  }
}

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

type RiderTransferListPageProps = {
  riderLoading: boolean
  nowMs: number
  marketSearch: string
  setMarketSearch: React.Dispatch<React.SetStateAction<string>>
  marketRoleFilter: string
  setMarketRoleFilter: React.Dispatch<React.SetStateAction<string>>
  riderRoleOptions: string[]
  marketSort: RiderMarketSort
  setMarketSort: React.Dispatch<React.SetStateAction<RiderMarketSort>>
  marketOnlyActive: boolean
  setMarketOnlyActive: React.Dispatch<React.SetStateAction<boolean>>
  marketHideOwn: boolean
  setMarketHideOwn: React.Dispatch<React.SetStateAction<boolean>>
  paginatedUnifiedMarketRows: UnifiedTransferRow[]
  selectedMarketListingId: string | null
  onSelectMarketItem: (item: UnifiedTransferRow) => void
  onQuickActionMarketItem: (item: UnifiedTransferRow) => void
  marketPageStart: number
  marketPageEnd: number
  totalMarketRows: number
  marketPage: number
  marketTotalPages: number
  onPrevMarketPage: () => void
  onNextMarketPage: () => void

  ownRiders: OwnedRiderRow[]
  selectedOwnedRiderId: string | null
  onSelectOwnedRider: (id: string) => void
  selectedOwnedRider: OwnedRiderRow | null
  listAskingPrice: string
  setListAskingPrice: React.Dispatch<React.SetStateAction<string>>
  listDurationDays: string
  setListDurationDays: React.Dispatch<React.SetStateAction<string>>
  riderActionLoading: boolean
  onListRider: () => void

  selectedMarketListing: UnifiedTransferRow | null
  clubId: string | null
  offerPrice: string
  setOfferPrice: React.Dispatch<React.SetStateAction<string>>
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

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return value
}

function safeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode || countryCode.length !== 2) return 'rs'
  return countryCode.toLowerCase()
}

function normalizeRoleLabel(role: string | null | undefined) {
  if (!role) return 'Rider'
  return role.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function parseExpiryToMs(value: string | null | undefined) {
  if (!value) return null

  const direct = new Date(value)
  if (!Number.isNaN(direct.getTime())) return direct.getTime()

  const endOfDay = new Date(`${value}T23:59:59`)
  if (!Number.isNaN(endOfDay.getTime())) return endOfDay.getTime()

  return null
}

function formatCountdown(targetMs: number | null, nowMs: number) {
  if (!targetMs) return '—'
  const diff = Math.max(0, targetMs - nowMs)

  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${days}d: ${String(hours).padStart(2, '0')}h, ${String(minutes).padStart(
    2,
    '0'
  )}m: ${String(seconds).padStart(2, '0')}s`
}

function sortLabel(sort: RiderMarketSort) {
  switch (sort) {
    case 'active':
      return 'Active First'
    case 'expires':
      return 'Expiring Soon'
    case 'overall_desc':
      return 'OVR High to Low'
    case 'overall_asc':
      return 'OVR Low to High'
    case 'price_desc':
      return 'Price High to Low'
    case 'price_asc':
      return 'Price Low to High'
    case 'name_asc':
      return 'Name A-Z'
    case 'name_desc':
      return 'Name Z-A'
    case 'age_asc':
      return 'Age Low to High'
    case 'age_desc':
      return 'Age High to Low'
    default:
      return 'Active First'
  }
}

function Flag({ countryCode }: { countryCode: string | null }) {
  const code = safeCountryCode(countryCode)
  return <span className={`fi fi-${code} h-4 w-5 rounded-sm shadow-sm`} aria-hidden="true" />
}

function TransferRow({
  item,
  nowMs,
  isSelected,
  onSelect,
  onMakeOffer,
  disabled,
}: {
  item: UnifiedTransferRow
  nowMs: number
  isSelected: boolean
  onSelect: () => void
  onMakeOffer: () => void
  disabled: boolean
}) {
  const expiryMs = parseExpiryToMs(item.expires_on_game_date)
  const countdown = formatCountdown(expiryMs, nowMs)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border bg-white px-4 py-4 text-left transition ${
        isSelected
          ? 'border-yellow-400 ring-2 ring-yellow-200'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-700">
            <div className="flex min-w-0 items-center gap-2">
              <Flag countryCode={item.country_code} />
              <span className="truncate font-bold text-gray-900">{item.display_name}</span>
            </div>

            <span>
              <span className="font-bold text-gray-900">{normalizeRoleLabel(item.role)}</span>
            </span>

            <span>
              <span className="font-bold text-gray-900">OVR</span>{' '}
              <span>{item.overall ?? '—'}</span>
            </span>

            <span>
              <span className="font-bold text-gray-900">Age</span>{' '}
              <span>{item.age_years ?? '—'}</span>
            </span>

            <span className="min-w-0 truncate">
              <span className="font-bold text-gray-900">Seller:</span>{' '}
              <span className="truncate">{item.seller_label.replace(/^Seller:\s*/i, '')}</span>
            </span>
          </div>
        </div>

        <div className="w-[180px] shrink-0 text-center">
          <div className="text-sm font-bold text-gray-900">{countdown}</div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className="font-semibold text-gray-900">Transfer</div>
            <div className="text-sm text-gray-600">{formatCurrency(item.amount_value)}</div>
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onMakeOffer()
            }}
            disabled={disabled}
            className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Make Offer
          </button>
        </div>
      </div>
    </button>
  )
}

export default function RiderTransferListPage(props: RiderTransferListPageProps) {
  const visibleRows = useMemo(() => {
    return props.paginatedUnifiedMarketRows.filter((item) => {
      const expiryMs = parseExpiryToMs(item.expires_on_game_date)
      if (expiryMs == null) return true
      return expiryMs > props.nowMs
    })
  }, [props.paginatedUnifiedMarketRows, props.nowMs])

  useEffect(() => {
    if (!visibleRows.length) return
    const stillSelected = visibleRows.some((row) => row.listing_id === props.selectedMarketListingId)
    if (stillSelected) return
    props.onSelectMarketItem(visibleRows[0])
  }, [visibleRows, props.selectedMarketListingId, props.onSelectMarketItem])

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Transfer List Riders</h3>
            <p className="mt-1 text-sm text-gray-500">
              Full-width transfer market. Active user offers stay pinned on top and highlighted.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Search
              </label>
              <input
                value={props.marketSearch}
                onChange={(event) => props.setMarketSearch(event.target.value)}
                placeholder="Search rider, role, seller..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Role
              </label>
              <select
                value={props.marketRoleFilter}
                onChange={(event) => props.setMarketRoleFilter(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-yellow-400"
              >
                <option value="all">All Roles</option>
                {props.riderRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {normalizeRoleLabel(role)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Sort
              </label>
              <select
                value={props.marketSort}
                onChange={(event) => props.setMarketSort(event.target.value as RiderMarketSort)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-yellow-400"
              >
                <option value="active">{sortLabel('active')}</option>
                <option value="expires">{sortLabel('expires')}</option>
                <option value="overall_desc">{sortLabel('overall_desc')}</option>
                <option value="overall_asc">{sortLabel('overall_asc')}</option>
                <option value="price_desc">{sortLabel('price_desc')}</option>
                <option value="price_asc">{sortLabel('price_asc')}</option>
                <option value="name_asc">{sortLabel('name_asc')}</option>
                <option value="name_desc">{sortLabel('name_desc')}</option>
                <option value="age_asc">{sortLabel('age_asc')}</option>
                <option value="age_desc">{sortLabel('age_desc')}</option>
              </select>
            </div>

            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={props.marketOnlyActive}
                  onChange={(event) => props.setMarketOnlyActive(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Only my active
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={props.marketHideOwn}
                  onChange={(event) => props.setMarketHideOwn(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Hide own listings
              </label>
            </div>
          </div>
        </div>

        {props.riderLoading ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            Loading transfer market...
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            No active transfer offers found.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleRows.map((item) => (
              <TransferRow
                key={item.key}
                item={item}
                nowMs={props.nowMs}
                isSelected={props.selectedMarketListingId === item.listing_id}
                onSelect={() => props.onSelectMarketItem(item)}
                onMakeOffer={() => props.onQuickActionMarketItem(item)}
                disabled={props.riderActionLoading || item.is_own_item}
              />
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-500">
            Showing {props.marketPageStart}-
            {Math.min(props.marketPageEnd, props.totalMarketRows)} of {props.totalMarketRows}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={props.onPrevMarketPage}
              disabled={props.marketPage <= 1}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <div className="px-2 text-sm text-gray-600">
              Page {props.marketPage} / {props.marketTotalPages}
            </div>

            <button
              type="button"
              onClick={props.onNextMarketPage}
              disabled={props.marketPage >= props.marketTotalPages}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">List My Rider</h4>

          <div className="mt-4 max-h-[320px] space-y-2 overflow-auto pr-1">
            {props.ownRiders.length === 0 ? (
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                No riders found for your club.
              </div>
            ) : (
              props.ownRiders.map((rider) => {
                const selected = rider.rider_id === props.selectedOwnedRiderId

                return (
                  <button
                    key={rider.rider_id}
                    type="button"
                    onClick={() => props.onSelectOwnedRider(rider.rider_id)}
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
                          {normalizeRoleLabel(rider.role)} • OVR {rider.overall ?? '—'} • POT{' '}
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

          {props.selectedOwnedRider ? (
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">
                {props.selectedOwnedRider.display_name}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Asking Price
                  </label>
                  <input
                    type="number"
                    value={props.listAskingPrice}
                    onChange={(e) => props.setListAskingPrice(e.target.value)}
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
                    value={props.listDurationDays}
                    onChange={(e) => props.setListDurationDays(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  Market value: {formatCurrency(props.selectedOwnedRider.market_value)}
                </div>

                <button
                  type="button"
                  onClick={props.onListRider}
                  disabled={props.riderActionLoading}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    props.riderActionLoading
                      ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                      : 'bg-yellow-400 text-black hover:bg-yellow-300'
                  }`}
                >
                  {props.riderActionLoading ? 'Processing...' : 'List Rider'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">Selected Listing</h4>

          {!props.selectedMarketListing ? (
            <div className="mt-3 text-sm text-gray-500">
              Select a listed rider from the market list above.
            </div>
          ) : (
            <>
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <Flag countryCode={props.selectedMarketListing.country_code} />
                  <div className="font-semibold text-gray-900">
                    {props.selectedMarketListing.display_name}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {normalizeRoleLabel(props.selectedMarketListing.role)} • Age{' '}
                  {props.selectedMarketListing.age_years ?? '—'} • OVR{' '}
                  {props.selectedMarketListing.overall ?? '—'} • POT{' '}
                  {props.selectedMarketListing.potential ?? '—'}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Asking Price</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(props.selectedMarketListing.raw.asking_price)}
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Seller</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {props.selectedMarketListing.seller_label.replace(/^Seller:\s*/i, '')}
                  </div>
                </div>
              </div>

              {props.selectedMarketListing.is_own_item || props.selectedMarketListing.raw == null ? (
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
                    value={props.offerPrice}
                    onChange={(e) => props.setOfferPrice(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-500">
                      Listing visible for{' '}
                      {formatCountdown(
                        parseExpiryToMs(props.selectedMarketListing.expires_on_game_date),
                        props.nowMs
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={props.onSubmitOffer}
                      disabled={props.riderActionLoading}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                        props.riderActionLoading
                          ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                          : 'bg-yellow-400 text-black hover:bg-yellow-300'
                      }`}
                    >
                      {props.riderActionLoading ? 'Processing...' : 'Make Offer'}
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
            {props.myListings.length === 0 ? (
              <div className="text-sm text-gray-500">
                No transfer listings created by your club yet.
              </div>
            ) : (
              props.myListings.map((listing) => (
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
                        onClick={() => props.onCancelListing(listing.id)}
                        disabled={props.riderActionLoading}
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
            {props.myReceivedOffers.length === 0 ? (
              <div className="text-sm text-gray-500">No visible incoming offers.</div>
            ) : (
              props.myReceivedOffers.map((offer) => (
                <div key={offer.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">
                        {props.clubNameMap[offer.buyer_club_id] || offer.buyer_club_id}
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
                          onClick={() => props.onRejectOffer(offer.id)}
                          disabled={props.riderActionLoading}
                          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onAcceptOffer(offer.id)}
                          disabled={props.riderActionLoading}
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
            {props.mySentOffers.length === 0 ? (
              <div className="text-sm text-gray-500">No visible outgoing offers.</div>
            ) : (
              props.mySentOffers.map((offer) => (
                <div
                  key={offer.id}
                  className={`rounded-lg border p-3 ${
                    offer.status === 'open'
                      ? 'border-yellow-300 bg-yellow-50'
                      : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">
                    To seller {props.clubNameMap[offer.seller_club_id] || offer.seller_club_id}
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
            {props.myBuyerNegotiations.length === 0 ? (
              <div className="text-sm text-gray-500">
                No rider negotiations for your buyer club yet.
              </div>
            ) : (
              props.myBuyerNegotiations.map((negotiation) => {
                const draft = props.getNegotiationDraft(negotiation)
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
                            props.updateNegotiationDraft(negotiation.id, {
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
                            props.updateNegotiationDraft(negotiation.id, {
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
                          onClick={() => props.onSubmitNegotiation(negotiation)}
                          disabled={props.riderActionLoading}
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
          {props.mySellerNegotiations.length === 0 ? (
            <div className="text-sm text-gray-500">
              No rider negotiations involving your selling club yet.
            </div>
          ) : (
            props.mySellerNegotiations.map((negotiation) => (
              <div key={negotiation.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-sm font-semibold text-gray-900">
                  Buyer {props.clubNameMap[negotiation.buyer_club_id] || negotiation.buyer_club_id}
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