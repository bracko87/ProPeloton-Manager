import React, { useMemo, useState } from 'react'

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

type ActivityFilterMode = 'incoming' | 'outgoing'
type ActivityTone = 'active' | 'positive' | 'negative'

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
  full_name?: string | null
  display_name?: string | null
}

type TransferHistoryRow = {
  id: string
  rider_id: string | null
  rider_name: string | null
  direction: 'arrival' | 'departure'
  amount: number | null
  game_date: string | null
  from_club_id: string | null
  from_club_name: string | null
  to_club_id: string | null
  to_club_name: string | null
}

type TransferActivityItem = {
  id: string
  mode: ActivityFilterMode
  tone: ActivityTone
  riderId: string | null
  riderName: string
  statusLabel: string
  primaryLine: string
  secondaryLine?: string
  dateLine?: string
  actionLabel?: string
  actionDisabled?: boolean
  clubIdToOpen?: string | null
  sortTime: number
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

function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
}

function safeText(value: string | null | undefined, fallback = 'Unknown') {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

function parseSortTime(value: string | null | undefined) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function getToneClasses(tone: ActivityTone) {
  if (tone === 'active') {
    return 'border-yellow-300 bg-yellow-50'
  }
  if (tone === 'positive') {
    return 'border-green-300 bg-green-50'
  }
  return 'border-red-300 bg-red-50'
}

function toneRank(tone: ActivityTone) {
  if (tone === 'active') return 0
  if (tone === 'positive') return 1
  return 2
}

function sortActivityItems(items: TransferActivityItem[]) {
  return [...items].sort((a, b) => {
    const toneDiff = toneRank(a.tone) - toneRank(b.tone)
    if (toneDiff !== 0) return toneDiff
    return b.sortTime - a.sortTime
  })
}

function formatTransferAmount(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  const roundedToThousand = Math.round(Number(value) / 1000) * 1000
  return `$${roundedToThousand.toLocaleString('en-US')}`
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

export default function RiderTransferListPage(props: RiderTransferListPageProps) {
  const {
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
    myReceivedOffers,
    clubNameMap,
    onOpenTeamPage,
    onOpenRiderProfile,
    mySentOffers,
    mySellerNegotiations,
    transferHistory,
  } = props

  const [activityMode, setActivityMode] = useState<ActivityFilterMode>('incoming')

  const transferActivityItems = useMemo(() => {
    const items: TransferActivityItem[] = []

    const sellerNegotiationOfferIds = new Set(
      (mySellerNegotiations || []).map((row) => row.offer_id)
    )

    for (const offer of mySentOffers || []) {
      const status = normalizeStatus(offer.status)
      const riderName = safeText(offer.full_name || offer.display_name, 'Unknown rider')
      const sellerName = safeText(
        offer.seller_club_name || clubNameMap[offer.seller_club_id],
        'Unknown club'
      )

      if (status === 'completed') continue

      let tone: ActivityTone = 'active'
      let statusLabel = 'Offer submitted'
      let secondaryLine = `Seller: ${sellerName} • Offer value: ${formatMoney(offer.offered_price)}`
      let actionLabel: string | undefined
      let actionDisabled = true

      if (status === 'club_accepted' || status === 'accepted') {
        tone = 'active'
        statusLabel = 'Offer accepted'
        secondaryLine = `${sellerName} accepted your club terms. You can start rider contract negotiation.`
        actionLabel = 'Start negotiation'
        actionDisabled = true
      } else if (status === 'rejected') {
        tone = 'negative'
        statusLabel = 'Rejected'
        secondaryLine = `${sellerName} rejected your offer.`
      } else if (status === 'rider_declined') {
        tone = 'negative'
        statusLabel = 'Rider refused contract'
        secondaryLine = `${riderName} refused the contract terms.`
      } else if (status === 'expired') {
        tone = 'negative'
        statusLabel = 'Expired'
        secondaryLine = offer.auto_block_reason
          ? `Transfer process expired (${offer.auto_block_reason.replace(/_/g, ' ')}).`
          : 'Transfer process expired.'
      } else if (status === 'withdrawn' || status === 'cancelled') {
        tone = 'negative'
        statusLabel = 'Cancelled'
        secondaryLine = 'This offer is no longer active.'
      }

      items.push({
        id: `incoming-offer-${offer.id}`,
        mode: 'incoming',
        tone,
        riderId: offer.rider_id,
        riderName,
        statusLabel,
        primaryLine: `Incoming transfer • ${riderName}`,
        secondaryLine,
        dateLine: offer.expires_on_game_date ? `Expires ${offer.expires_on_game_date}` : undefined,
        actionLabel,
        actionDisabled,
        clubIdToOpen: offer.seller_club_id,
        sortTime: parseSortTime(offer.updated_at || offer.created_at),
      })
    }

    for (const historyRow of transferHistory || []) {
      if (historyRow.direction !== 'arrival') continue

      items.push({
        id: `incoming-history-${historyRow.id}`,
        mode: 'incoming',
        tone: 'positive',
        riderId: historyRow.rider_id,
        riderName: safeText(historyRow.rider_name, 'Unknown rider'),
        statusLabel: 'Completed',
        primaryLine: `Incoming transfer • ${safeText(historyRow.rider_name, 'Unknown rider')}`,
        secondaryLine: `Arrived from ${safeText(historyRow.from_club_name, 'Unknown club')} • Fee: ${formatMoney(historyRow.amount)}`,
        dateLine: historyRow.game_date ? `Completed ${historyRow.game_date}` : undefined,
        clubIdToOpen: historyRow.from_club_id,
        sortTime: parseSortTime(historyRow.game_date),
      })
    }

    for (const offer of myReceivedOffers || []) {
      const status = normalizeStatus(offer.status)
      const riderName = safeText(offer.full_name || offer.display_name, 'Unknown rider')
      const buyerName = safeText(clubNameMap[offer.buyer_club_id], 'Unknown club')

      if (sellerNegotiationOfferIds.has(offer.id)) {
        continue
      }

      let tone: ActivityTone = 'active'
      let statusLabel = 'Offer received'
      let secondaryLine = `Buyer: ${buyerName} • Offer value: ${formatMoney(offer.offered_price)}`
      let actionLabel: string | undefined = 'Check offer'
      let actionDisabled = true

      if (status === 'open') {
        tone = 'active'
        statusLabel = 'Offer received'
        secondaryLine = `Buyer: ${buyerName} • Offer value: ${formatMoney(offer.offered_price)}`
      } else if (status === 'rejected') {
        tone = 'negative'
        statusLabel = 'Rejected by you'
        secondaryLine = `You rejected ${buyerName}'s offer for ${riderName}.`
        actionLabel = undefined
      } else if (status === 'expired') {
        tone = 'negative'
        statusLabel = 'Expired'
        secondaryLine = offer.auto_block_reason
          ? `Offer expired (${offer.auto_block_reason.replace(/_/g, ' ')}).`
          : 'Offer expired before completion.'
        actionLabel = undefined
      } else if (status === 'withdrawn' || status === 'cancelled') {
        tone = 'negative'
        statusLabel = 'Withdrawn'
        secondaryLine = `${buyerName} cancelled this offer.`
        actionLabel = undefined
      } else {
        tone = 'active'
        statusLabel = status.replace(/_/g, ' ')
        secondaryLine = `Buyer: ${buyerName} • Offer value: ${formatMoney(offer.offered_price)}`
      }

      items.push({
        id: `outgoing-offer-${offer.id}`,
        mode: 'outgoing',
        tone,
        riderId: offer.rider_id,
        riderName,
        statusLabel,
        primaryLine: `Outgoing transfer • ${riderName}`,
        secondaryLine,
        dateLine: offer.expires_on_game_date ? `Expires ${offer.expires_on_game_date}` : undefined,
        actionLabel,
        actionDisabled,
        clubIdToOpen: offer.buyer_club_id,
        sortTime: parseSortTime(offer.updated_at || offer.created_at),
      })
    }

    for (const negotiation of mySellerNegotiations || []) {
      const status = normalizeStatus(negotiation.status)
      const riderName = safeText(negotiation.full_name || negotiation.display_name, 'Unknown rider')
      const buyerName = safeText(clubNameMap[negotiation.buyer_club_id], 'Unknown club')

      let tone: ActivityTone = 'active'
      let statusLabel = 'Negotiation active'
      let secondaryLine = `Buyer: ${buyerName}`
      let actionLabel: string | undefined = 'Check offer'
      let actionDisabled = true

      if (status === 'open') {
        tone = 'active'
        statusLabel = 'Negotiation active'
        secondaryLine = `Buyer: ${buyerName} • Latest contract: ${formatMoney(
          negotiation.offer_salary_weekly ?? negotiation.expected_salary_weekly
        )}/week • ${negotiation.offer_duration_seasons ?? negotiation.preferred_duration_seasons} season(s)`
      } else if (status === 'declined') {
        tone = 'negative'
        statusLabel = 'Rider refused contract'
        secondaryLine = negotiation.closed_reason
          ? `Closed reason: ${negotiation.closed_reason.replace(/_/g, ' ')}`
          : 'The rider refused the proposed contract.'
        actionLabel = undefined
      } else if (status === 'expired') {
        tone = 'negative'
        statusLabel = 'Negotiation expired'
        secondaryLine = 'The negotiation expired before agreement.'
        actionLabel = undefined
      } else if (status === 'accepted') {
        tone = 'positive'
        statusLabel = 'Accepted'
        secondaryLine = 'Contract terms were accepted.'
        actionLabel = undefined
      }

      items.push({
        id: `outgoing-negotiation-${negotiation.id}`,
        mode: 'outgoing',
        tone,
        riderId: negotiation.rider_id,
        riderName,
        statusLabel,
        primaryLine: `Outgoing transfer • ${riderName}`,
        secondaryLine,
        dateLine: negotiation.expires_on_game_date
          ? `Negotiation expires ${negotiation.expires_on_game_date}`
          : undefined,
        actionLabel,
        actionDisabled,
        clubIdToOpen: negotiation.buyer_club_id,
        sortTime: parseSortTime(negotiation.updated_at || negotiation.opened_on_game_date),
      })
    }

    for (const historyRow of transferHistory || []) {
      if (historyRow.direction !== 'departure') continue

      items.push({
        id: `outgoing-history-${historyRow.id}`,
        mode: 'outgoing',
        tone: 'positive',
        riderId: historyRow.rider_id,
        riderName: safeText(historyRow.rider_name, 'Unknown rider'),
        statusLabel: 'Completed',
        primaryLine: `Outgoing transfer • ${safeText(historyRow.rider_name, 'Unknown rider')}`,
        secondaryLine: `Transferred to ${safeText(historyRow.to_club_name, 'Unknown club')} • Fee: ${formatMoney(historyRow.amount)}`,
        dateLine: historyRow.game_date ? `Completed ${historyRow.game_date}` : undefined,
        clubIdToOpen: historyRow.to_club_id,
        sortTime: parseSortTime(historyRow.game_date),
      })
    }

    return sortActivityItems(items)
  }, [mySentOffers, myReceivedOffers, mySellerNegotiations, transferHistory, clubNameMap])

  const visibleTransferActivityItems = useMemo(
    () => transferActivityItems.filter((item) => item.mode === activityMode),
    [transferActivityItems, activityMode]
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

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Transfer Activity</h3>
            <p className="mt-1 text-sm text-gray-500">
              All current and completed transfer activity for your club.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
              View
            </label>
            <select
              value={activityMode}
              onChange={(e) => setActivityMode(e.target.value as ActivityFilterMode)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="incoming">Incoming</option>
              <option value="outgoing">Outgoing</option>
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {visibleTransferActivityItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
              No transfer activity in this view yet.
            </div>
          ) : (
            visibleTransferActivityItems.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border px-4 py-4 ${getToneClasses(item.tone)}`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-gray-900">{item.riderName}</span>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {item.statusLabel}
                      </span>
                    </div>

                    <div className="mt-1 text-sm font-medium text-gray-800">{item.primaryLine}</div>

                    {item.secondaryLine ? (
                      <div className="mt-1 text-sm text-gray-700">{item.secondaryLine}</div>
                    ) : null}

                    {item.dateLine ? (
                      <div className="mt-1 text-xs text-gray-600">{item.dateLine}</div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {item.riderId ? (
                        <button
                          type="button"
                          onClick={() => onOpenRiderProfile(item.riderId!)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Open rider
                        </button>
                      ) : null}

                      {item.clubIdToOpen ? (
                        <button
                          type="button"
                          onClick={() => onOpenTeamPage(item.clubIdToOpen!)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Open club
                        </button>
                      ) : null}

                      {item.actionLabel ? (
                        <button
                          type="button"
                          disabled={item.actionDisabled}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                            item.actionDisabled
                              ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                              : 'bg-yellow-400 text-black hover:bg-yellow-300'
                          }`}
                        >
                          {item.actionLabel}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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