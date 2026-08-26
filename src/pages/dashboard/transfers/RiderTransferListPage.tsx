import React, { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import TransferHistoryPanel from './TransferHistoryPanel'
import RiderShortlistButton from './RiderShortlistButton'

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
  overall_label?: string | null
  potential_label?: string | null
  is_scouted?: boolean
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
  created_at?: string | null
}

type TransferOfferRow = {
  id: string
  listing_id: string
  rider_id: string
  seller_club_id: string
  buyer_club_id: string
  seller_club_name?: string | null
  buyer_club_name?: string | null
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
  buyer_club_name?: string | null
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
  completed_at?: string | null
  from_club_id: string | null
  from_club_name: string | null
  to_club_id: string | null
  to_club_name: string | null
}

type TransferActivityChip = {
  label: string
  value: string
  emphasized?: boolean
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
  actionKind?: 'review_offer' | 'open_negotiation' | 'withdraw_offer'
  clubIdToOpen?: string | null
  buyerClubId?: string | null
  buyerClubName?: string
  buyer_club_name?: string | null
  payload_json?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  notes_json?: Record<string, unknown> | null
  riderIsOwnedByUser?: boolean
  sortTime: number
  detailChips?: TransferActivityChip[]
  offerIdToReview?: string | null
  negotiationIdToOpen?: string | null
  withdrawOfferId?: string | null
  cancelNegotiationId?: string | null
  cancelNegotiationLabel?: string
  cancelNegotiationDisabled?: boolean
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
  raw: MarketListingRow
}

const ACTIVITY_ITEMS_PER_PAGE = 5

function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
}

function safeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {}
}

function resolveBuyerClubName(item: any, unknownClubLabel: string): string {
  const payload = readRecord(item?.payload_json)
  const metadata = readRecord(item?.metadata)
  const notesJson = readRecord(item?.notes_json)

  return (
    readText(item?.buyerClubName) ??
    readText(item?.buyer_club_name) ??
    readText(payload?.buyer_club_name) ??
    readText(payload?.buyerClubName) ??
    readText(metadata?.buyer_club_name) ??
    readText(metadata?.buyerClubName) ??
    readText(notesJson?.buyer_club_name) ??
    readText(notesJson?.buyerClubName) ??
    unknownClubLabel
  )
}

function getOutgoingBuyerClubInfo(
  item: any,
  clubNameMap: Record<string, string>,
  unknownClubLabel: string
) {
  const metadata = readRecord(item?.metadata)
  const notesJson = readRecord(item?.notes_json)
  const payloadJson = readRecord(item?.payload_json)

  const clubId =
    readText(item?.buyer_club_id) ??
    readText(metadata?.buyer_club_id) ??
    readText(notesJson?.buyer_club_id) ??
    readText(payloadJson?.buyer_club_id) ??
    readText(item?.to_club_id) ??
    null

  const clubName =
    readText(item?.buyer_club_name) ??
    (clubId ? readText(clubNameMap[clubId]) : null) ??
    readText(metadata?.buyer_club_name) ??
    readText(notesJson?.buyer_club_name) ??
    readText(payloadJson?.buyer_club_name) ??
    readText(item?.to_club_name) ??
    null

  return {
    clubId,
    clubName: clubName ?? unknownClubLabel,
  }
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

function parseSortTime(value: string | null | undefined) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function tryParseDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getCurrentGameDateFromState(gameState: GameStateRow | null | undefined) {
  if (!gameState) return null

  const gameYear = 1999 + Math.max(1, gameState.season_number || 1)

  const gameDate = new Date(
    Date.UTC(
      gameYear,
      Math.max(0, (gameState.month_number || 1) - 1),
      Math.max(1, gameState.day_number || 1),
      Math.max(0, gameState.hour_number || 0),
      Math.max(0, gameState.minute_number || 0),
      0
    )
  )

  return Number.isNaN(gameDate.getTime()) ? null : gameDate
}

function getGameDateEndTimestamp(gameDate: string | null | undefined) {
  if (!gameDate) return null

  const parsed = new Date(`${gameDate}T23:59:59Z`)
  if (Number.isNaN(parsed.getTime())) return null

  return parsed.getTime()
}

function isRecentCompletedHistoryInGameTime(
  completedGameDate: string | null | undefined,
  gameState: GameStateRow | null | undefined
) {
  const currentGameDate = getCurrentGameDateFromState(gameState)
  const completedTimestamp = getGameDateEndTimestamp(completedGameDate)

  if (!currentGameDate || completedTimestamp == null) return false

  return currentGameDate.getTime() - completedTimestamp < 24 * 60 * 60 * 1000
}

function getToneClasses(tone: ActivityTone) {
  if (tone === 'active') {
    return 'border-yellow-300 bg-white'
  }
  if (tone === 'positive') {
    return 'border-green-300 bg-green-50'
  }
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

function getCountryName(
  countryCode: string | null | undefined,
  displayLocale: string
) {
  const code = safeCountryCode(countryCode).toUpperCase()

  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined') {
      const regionNames = new Intl.DisplayNames([displayLocale], { type: 'region' })
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
  noExpiryLabel: string,
  expiredLabel: string,
  fallbackLabel?: string | null
) {
  if (!expiresOnGameDate) return noExpiryLabel

  const currentGameDate = getCurrentGameDateFromState(gameState)

  if (!currentGameDate) {
    const safeFallback = fallbackLabel?.trim()
    if (safeFallback === 'Expired') return expiredLabel
    if (safeFallback === 'No expiry') return noExpiryLabel
    return safeFallback && safeFallback.length > 0 ? safeFallback : noExpiryLabel
  }

  const expiryDate = new Date(`${expiresOnGameDate}T23:59:59Z`)
  const diffMs = expiryDate.getTime() - currentGameDate.getTime()

  if (diffMs <= 0) return expiredLabel

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

function getPreferredRiderName(
  value: {
    full_name?: string | null
    display_name?: string | null
    rider_id?: string | null
  },
  unknownRiderLabel: string
) {
  if (value.full_name?.trim()) return value.full_name.trim()
  if (value.display_name?.trim() && !looksLikeUuid(value.display_name)) {
    return value.display_name.trim()
  }
  if (value.rider_id && !looksLikeUuid(value.rider_id)) return value.rider_id
  return unknownRiderLabel
}

function resolveActivityRiderName(item: any, unknownRiderLabel: string) {
  const payload = readRecord(item?.payload_json)
  const metadata = readRecord(item?.metadata)
  const notesJson = readRecord(item?.notes_json)

  return (
    readText(item?.full_name) ??
    readText(item?.display_name) ??
    readText(item?.rider_name) ??
    readText(payload?.rider_name) ??
    readText(payload?.display_name) ??
    readText(metadata?.rider_name) ??
    readText(metadata?.display_name) ??
    readText(notesJson?.rider_name) ??
    readText(notesJson?.display_name) ??
    (item?.rider_id && !looksLikeUuid(item.rider_id) ? item.rider_id : null) ??
    unknownRiderLabel
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

function InlineTextButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="truncate text-left font-medium text-black no-underline hover:text-gray-700"
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

function MarketListRow({
  item,
  gameState,
  isSelected,
  onSelect,
  onQuickAction,
  clubId,
}: {
  item: TransferMarketItem
  gameState: GameStateRow | null
  isSelected: boolean
  onSelect: () => void
  onQuickAction: () => void
  clubId: string
}) {
  const { t, i18n } = useTranslation('transfers')

  const displayLocale =
    i18n.resolvedLanguage?.startsWith('sr')
      ? 'sr-Latn-RS'
      : i18n.resolvedLanguage || 'en'

  const unknownRiderLabel = t('common.unknownRider')
  const noExpiryLabel = t('common.noExpiry')
  const expiredLabel = t('common.expired')

  const riderName = getPreferredRiderName(
    {
      full_name: item.raw.full_name,
      display_name: item.display_name || item.raw.display_name,
      rider_id: item.rider_id,
    },
    unknownRiderLabel
  )

  const countdown = getGameCountdownLabel(
    item.expires_on_game_date,
    gameState,
    noExpiryLabel,
    expiredLabel,
    item.raw.time_left_label
  )

  const listingExpired = countdown === expiredLabel

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
              alt={getCountryName(item.country_code, displayLocale)}
              className="h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover"
            />

            <span className="truncate text-sm font-semibold text-gray-900">{riderName}</span>

            {item.is_scouted ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                {t('common.scouted')}
              </span>
            ) : null}

            {item.is_user_active ? (
              <span className="rounded-full bg-yellow-300 px-2 py-0.5 text-[11px] font-bold uppercase text-black">
                {t('transferList.activeOffer')}
              </span>
            ) : null}

            {item.is_own_item ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                {t('transferList.own')}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <InfoPair label={`${t('common.role')}:`} value={item.role || '—'} />
            <InfoPair label={`${t('transferList.overallShort')}:`} value={item.overall_label ?? '—'} />
            {item.is_scouted ? (
              <InfoPair label={`${t('transferList.potentialShort')}:`} value={item.potential_label ?? '—'} />
            ) : null}
            <InfoPair label={`${t('common.age')}:`} value={item.age_years ?? '—'} />
            <InfoPair label={`${t('activity.seller')}:`} value={stripLabelPrefix(item.seller_label)} />
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
                {t('transferList.timeLeft')}:
              </span>{' '}
              <span>{countdown}</span>
            </div>

            <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs">
              <span className="font-bold text-black">{t('history.transfer')}:</span>{' '}
              <span className="font-bold text-black">{formatTransferAmount(item.amount_value)}</span>
            </div>

            {!item.is_own_item ? (
              <RiderShortlistButton
                clubId={clubId}
                riderId={item.rider_id}
                riderName={riderName}
                sourceType="transfer_list"
                sourceId={item.listing_id}
              />
            ) : null}

            <MarketActionButton
              label={
                item.is_user_active
                  ? t('transferList.offerActive')
                  : t('transferList.makeOffer')
              }
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
  clubId: string
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
  onSaveCurrentSearch: () => void
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
  onOpenRiderProfile: (riderId: string, isOwnedByUser?: boolean) => void
  ownedRiderIds: Set<string>

  mySentOffers: TransferOfferRow[]
  mySellerNegotiations: TransferNegotiationRow[]
  myBuyerNegotiations: TransferNegotiationRow[]
  transferHistory: TransferHistoryRow[]
  myActiveTransferListings?: MarketListingRow[]

  activityMode: ActivityFilterMode
  setActivityMode: (value: ActivityFilterMode) => void
  onOpenOfferReview: (offerId: string) => void
  onOpenNegotiation: (negotiationId: string) => void
  onWithdrawNegotiation: (negotiationId: string) => void
  onCancelNegotiation: (negotiationId: string) => void
}

export default function RiderTransferListPage(props: RiderTransferListPageProps) {
  const { t } = useTranslation('transfers')

  const {
    clubId,
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
    onSaveCurrentSearch,
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
    onWithdrawSentOffer,
    onOpenTeamPage,
    onOpenRiderProfile,
    ownedRiderIds,
    mySentOffers,
    mySellerNegotiations,
    myBuyerNegotiations,
    transferHistory,
    myActiveTransferListings = [],
    activityMode,
    setActivityMode,
    onOpenOfferReview,
    onOpenNegotiation,
    onWithdrawNegotiation,
  } = props

  const unknownRiderLabel = t('common.unknownRider')
  const unknownClubLabel = t('common.unknownClub')
  const noExpiryLabel = t('common.noExpiry')
  const expiredLabel = t('common.expired')

  const safeActiveTransferListings = Array.isArray(myActiveTransferListings)
    ? myActiveTransferListings
    : []

  const sellerNegotiationOfferIds = useMemo(
    () => new Set((mySellerNegotiations || []).map((row) => row.offer_id)),
    [mySellerNegotiations]
  )

  const buyerNegotiationByOfferId = useMemo(
    () => new Map((myBuyerNegotiations || []).map((row) => [row.offer_id, row])),
    [myBuyerNegotiations]
  )

  const incomingActivityItems = useMemo(() => {
    const items: TransferActivityItem[] = []

    for (const offer of mySentOffers || []) {
      const status = normalizeStatus(offer.status)
      const riderName = resolveActivityRiderName(offer, unknownRiderLabel)
      const sellerName = safeText(
        offer.seller_club_name || clubNameMap[offer.seller_club_id],
        unknownClubLabel
      )

      const linkedNegotiation = buyerNegotiationByOfferId.get(offer.id)
      const linkedNegotiationStatus = normalizeStatus(linkedNegotiation?.status)
      const linkedNegotiationIsActive =
        !!linkedNegotiation &&
        !['accepted', 'completed', 'declined', 'rejected', 'expired'].includes(
          linkedNegotiationStatus
        )

      if (status === 'completed') continue

      let tone: ActivityTone = 'active'
      let statusLabel = t('activity.offerSubmitted')
      let secondaryLine = t('activity.waitingSeller')
      let actionLabel: string | undefined
      let actionDisabled = true
      let actionKind: TransferActivityItem['actionKind'] = undefined
      let negotiationIdToOpen: string | null = null
      let withdrawOfferId: string | null = null

      let cancelNegotiationId: string | null = null
      let cancelNegotiationLabel: string | undefined
      let cancelNegotiationDisabled = true

      if (status === 'open') {
        tone = 'active'
        statusLabel = t('activity.offerSubmitted')
        secondaryLine = t('activity.waitingSeller')
        actionLabel = t('activity.cancelOffer')
        actionDisabled = false
        actionKind = 'withdraw_offer'
        withdrawOfferId = offer.id
      } else if (status === 'club_accepted' || status === 'accepted') {
        tone = linkedNegotiationIsActive ? 'active' : 'positive'
        statusLabel = t('activity.offerAccepted')
        secondaryLine = t('activity.sellerAccepted', { seller: sellerName })
        actionLabel = t('activity.startNegotiation')
        actionDisabled = !linkedNegotiation || !linkedNegotiationIsActive
        actionKind = 'open_negotiation'
        negotiationIdToOpen = linkedNegotiation?.id ?? null

        cancelNegotiationId = linkedNegotiation?.id ?? null
        cancelNegotiationLabel = t('activity.cancelTransfer')
        cancelNegotiationDisabled = !linkedNegotiation || !linkedNegotiationIsActive
      } else if (status === 'rejected') {
        tone = 'negative'
        statusLabel = t('activity.rejected')
        secondaryLine = t('activity.sellerRejected', { seller: sellerName })
      } else if (status === 'rider_declined') {
        tone = 'negative'
        statusLabel = t('activity.riderRefused')
        secondaryLine = t('activity.riderRefusedText', { rider: riderName })
      } else if (status === 'expired') {
        tone = 'negative'
        statusLabel = expiredLabel
        secondaryLine = offer.auto_block_reason
          ? t('activity.processExpiredReason', {
              reason: offer.auto_block_reason.replace(/_/g, ' '),
            })
          : t('activity.processExpired')
      } else if (status === 'withdrawn' || status === 'cancelled') {
        tone = 'negative'
        statusLabel = t('activity.cancelled')
        secondaryLine = t('activity.offerInactive')
      }

      items.push({
        id: `incoming-offer-${offer.id}`,
        mode: 'incoming',
        tone,
        riderId: offer.rider_id,
        riderName,
        riderIsOwnedByUser: false,
        statusLabel,
        primaryLine: t('activity.incomingTransfer', { rider: riderName }),
        secondaryLine,
        actionLabel,
        actionDisabled,
        actionKind,
        negotiationIdToOpen,
        cancelNegotiationId,
        cancelNegotiationLabel,
        cancelNegotiationDisabled,
        withdrawOfferId,
        clubIdToOpen: offer.seller_club_id,
        sortTime: parseSortTime(linkedNegotiation?.updated_at || offer.updated_at || offer.created_at),
        detailChips: [
          {
            label: t('activity.seller'),
            value: sellerName,
          },
          {
            label: t('activity.offerValue'),
            value: formatMoney(offer.offered_price),
            emphasized: true,
          },
          ...((linkedNegotiation?.expires_on_game_date || offer.expires_on_game_date)
            ? [
                {
                  label: t('activity.expires'),
                  value: getGameCountdownLabel(
                    linkedNegotiation?.expires_on_game_date ?? offer.expires_on_game_date,
                    gameState,
                    noExpiryLabel,
                    expiredLabel
                  ),
                  emphasized: true,
                } satisfies TransferActivityChip,
              ]
            : []),
        ],
      })
    }

    for (const historyRow of transferHistory || []) {
      if (historyRow.direction !== 'arrival') continue
      if (!isRecentCompletedHistoryInGameTime(historyRow.game_date, gameState)) continue

      const riderName = safeText(historyRow.rider_name, unknownRiderLabel)

      items.push({
        id: `incoming-history-${historyRow.id}`,
        mode: 'incoming',
        tone: 'positive',
        riderId: historyRow.rider_id,
        riderName,
        riderIsOwnedByUser: false,
        statusLabel: t('activity.completed'),
        primaryLine: t('activity.incomingTransfer', { rider: riderName }),
        secondaryLine: t('activity.transferCompleted'),
        clubIdToOpen: historyRow.from_club_id,
        sortTime: parseSortTime(historyRow.game_date),
        detailChips: [
          {
            label: t('activity.from'),
            value: safeText(historyRow.from_club_name, unknownClubLabel),
          },
          {
            label: t('activity.fee'),
            value: formatMoney(historyRow.amount),
            emphasized: true,
          },
          ...(historyRow.game_date
            ? [
                {
                  label: t('activity.completed'),
                  value: historyRow.game_date,
                } satisfies TransferActivityChip,
              ]
            : []),
        ],
      })
    }

    return sortActivityItems(items)
  }, [
    mySentOffers,
    myBuyerNegotiations,
    transferHistory,
    clubNameMap,
    gameState,
    buyerNegotiationByOfferId,
    unknownRiderLabel,
    unknownClubLabel,
    noExpiryLabel,
    expiredLabel,
    t,
  ])

  const outgoingListingActivityItems = useMemo(() => {
    return safeActiveTransferListings.map((listing) => {
      const riderName = resolveActivityRiderName(listing, unknownRiderLabel)

      return {
        id: `listing-${listing.listing_id}`,
        mode: 'outgoing' as const,
        riderId: listing.rider_id,
        riderName,
        riderIsOwnedByUser: true,
        tone: 'active' as const,
        statusLabel: t('transferList.listed'),
        primaryLine: t('activity.outgoingTransfer', { rider: riderName }),
        secondaryLine: t('transferList.riderPublished'),
        sortTime:
          tryParseDate(listing.listed_on_game_date)?.getTime() ??
          tryParseDate(listing.created_at)?.getTime() ??
          0,
        detailChips: [
          {
            label: t('transferList.askingPrice'),
            value: formatTransferAmount(listing.asking_price),
            emphasized: true,
          },
          {
            label: t('transferList.visibleUntil'),
            value: listing.expires_on_game_date || '—',
          },
          {
            label: t('transferList.timeLeft'),
            value: getGameCountdownLabel(
              listing.expires_on_game_date,
              gameState,
              noExpiryLabel,
              expiredLabel
            ),
            emphasized: true,
          },
        ],
      } satisfies TransferActivityItem
    })
  }, [
    safeActiveTransferListings,
    gameState,
    unknownRiderLabel,
    noExpiryLabel,
    expiredLabel,
    t,
  ])

  const outgoingOfferActivityItems = useMemo(() => {
    const items: TransferActivityItem[] = []

    for (const offer of myReceivedOffers || []) {
      const status = normalizeStatus(offer.status)
      const riderName = resolveActivityRiderName(offer, unknownRiderLabel)
      const buyerClub = getOutgoingBuyerClubInfo(offer, clubNameMap, unknownClubLabel)

      if (sellerNegotiationOfferIds.has(offer.id)) {
        continue
      }

      let tone: ActivityTone = 'active'
      let statusLabel = t('activity.offerReceived')
      let secondaryLine = t('activity.buyerSubmitted')
      let actionLabel: string | undefined
      let actionDisabled = true
      let actionKind: TransferActivityItem['actionKind'] = undefined

      if (status === 'open') {
        tone = 'active'
        statusLabel = t('activity.offerReceived')
        secondaryLine = t('activity.buyerSubmitted')
        actionLabel = t('activity.checkOffer')
        actionDisabled = false
        actionKind = 'review_offer'
      } else if (status === 'rejected') {
        tone = 'negative'
        statusLabel = t('activity.rejectedByYou')
        secondaryLine = t('activity.youRejected', {
          buyer: buyerClub.clubName,
          rider: riderName,
        })
      } else if (status === 'expired') {
        tone = 'negative'
        statusLabel = expiredLabel
        secondaryLine = offer.auto_block_reason
          ? t('activity.offerExpiredReason', {
              reason: offer.auto_block_reason.replace(/_/g, ' '),
            })
          : t('activity.offerExpired')
      } else if (status === 'withdrawn' || status === 'cancelled') {
        tone = 'negative'
        statusLabel = t('activity.withdrawn')
        secondaryLine = t('activity.buyerCancelled', { buyer: buyerClub.clubName })
      } else {
        tone = 'active'
        statusLabel = status.replace(/_/g, ' ')
        secondaryLine = t('activity.buyerSubmitted')
      }

      items.push({
        id: `outgoing-offer-${offer.id}`,
        mode: 'outgoing',
        tone,
        riderId: offer.rider_id,
        riderName,
        riderIsOwnedByUser: true,
        statusLabel,
        primaryLine: t('activity.outgoingTransfer', { rider: riderName }),
        secondaryLine,
        actionLabel,
        actionDisabled,
        actionKind,
        offerIdToReview: offer.id,
        buyerClubId: buyerClub.clubId,
        buyerClubName: buyerClub.clubName,
        buyer_club_name: offer.buyer_club_name ?? null,
        metadata: offer.metadata ?? null,
        notes_json: null,
        payload_json: readRecord((offer as any)?.payload_json),
        sortTime: parseSortTime(offer.updated_at || offer.created_at),
        detailChips: [
          {
            label: t('activity.offerValue'),
            value: formatMoney(offer.offered_price),
            emphasized: true,
          },
          ...(offer.expires_on_game_date
            ? [
                {
                  label: t('activity.expires'),
                  value: getGameCountdownLabel(
                    offer.expires_on_game_date,
                    gameState,
                    noExpiryLabel,
                    expiredLabel
                  ),
                  emphasized: true,
                } satisfies TransferActivityChip,
              ]
            : []),
        ],
      })
    }

    return items
  }, [
    myReceivedOffers,
    sellerNegotiationOfferIds,
    clubNameMap,
    gameState,
    unknownRiderLabel,
    unknownClubLabel,
    noExpiryLabel,
    expiredLabel,
    t,
  ])

  const outgoingNegotiationActivityItems = useMemo(() => {
    const items: TransferActivityItem[] = []

    for (const negotiation of mySellerNegotiations || []) {
      const status = normalizeStatus(negotiation.status)

      if (status === 'accepted' || status === 'completed') {
        continue
      }

      const riderName = resolveActivityRiderName(negotiation, unknownRiderLabel)
      const buyerClub = getOutgoingBuyerClubInfo(
        negotiation,
        clubNameMap,
        unknownClubLabel
      )
      const latestSalary = formatMoney(
        negotiation.offer_salary_weekly ?? negotiation.expected_salary_weekly
      )
      const latestDuration = t('common.seasonGeneric', {
        count:
          negotiation.offer_duration_seasons ?? negotiation.preferred_duration_seasons,
      })

      let tone: ActivityTone = 'active'
      let statusLabel = t('activity.negotiationActive')
      let secondaryLine = t('activity.contractTalks')

      if (status === 'open') {
        tone = 'active'
        statusLabel = t('activity.negotiationActive')
        secondaryLine = t('activity.contractTalks')
      } else if (status === 'declined') {
        tone = 'negative'
        statusLabel = t('activity.riderRefused')
        secondaryLine = negotiation.closed_reason
          ? negotiation.closed_reason.replace(/_/g, ' ')
          : t('activity.riderRefusedText', { rider: riderName })
      } else if (status === 'expired') {
        tone = 'negative'
        statusLabel = expiredLabel
        secondaryLine = t('negotiation.expiredBeforeAgreement')
      }

      items.push({
        id: `outgoing-negotiation-${negotiation.id}`,
        mode: 'outgoing',
        tone,
        riderId: negotiation.rider_id,
        riderName,
        riderIsOwnedByUser: true,
        statusLabel,
        primaryLine: t('activity.outgoingTransfer', { rider: riderName }),
        secondaryLine,
        negotiationIdToOpen: negotiation.id,
        buyerClubId: buyerClub.clubId,
        buyerClubName: buyerClub.clubName,
        buyer_club_name: negotiation.buyer_club_name ?? null,
        metadata: null,
        notes_json: negotiation.notes_json ?? null,
        payload_json: readRecord((negotiation as any)?.payload_json),
        sortTime: parseSortTime(negotiation.updated_at || negotiation.opened_on_game_date),
        detailChips: [
          {
            label: t('activity.latestSalary'),
            value: `${latestSalary}${t('common.weekly')}`,
            emphasized: true,
          },
          {
            label: t('activity.duration'),
            value: latestDuration,
          },
          ...(negotiation.expires_on_game_date
            ? [
                {
                  label: t('activity.expires'),
                  value: getGameCountdownLabel(
                    negotiation.expires_on_game_date,
                    gameState,
                    noExpiryLabel,
                    expiredLabel
                  ),
                  emphasized: true,
                } satisfies TransferActivityChip,
              ]
            : []),
        ],
      })
    }

    for (const historyRow of transferHistory || []) {
      if (historyRow.direction !== 'departure') continue
      if (!isRecentCompletedHistoryInGameTime(historyRow.game_date, gameState)) continue

      const riderName = safeText(historyRow.rider_name, unknownRiderLabel)

      items.push({
        id: `outgoing-history-${historyRow.id}`,
        mode: 'outgoing',
        tone: 'positive',
        riderId: historyRow.rider_id,
        riderName,
        riderIsOwnedByUser: true,
        statusLabel: t('activity.completed'),
        primaryLine: t('activity.outgoingTransfer', { rider: riderName }),
        secondaryLine: t('activity.transferCompleted'),
        buyerClubId: historyRow.to_club_id,
        buyerClubName: safeText(historyRow.to_club_name, unknownClubLabel),
        buyer_club_name: historyRow.to_club_name,
        metadata: null,
        notes_json: null,
        payload_json: null,
        sortTime: parseSortTime(historyRow.game_date),
        detailChips: [
          {
            label: t('activity.fee'),
            value: formatMoney(historyRow.amount),
            emphasized: true,
          },
          ...(historyRow.game_date
            ? [
                {
                  label: t('activity.completed'),
                  value: historyRow.game_date,
                } satisfies TransferActivityChip,
              ]
            : []),
        ],
      })
    }

    return items
  }, [
    mySellerNegotiations,
    transferHistory,
    clubNameMap,
    gameState,
    unknownRiderLabel,
    unknownClubLabel,
    noExpiryLabel,
    expiredLabel,
    t,
  ])

  const outgoingActivityItems = useMemo(() => {
    const items = [
      ...outgoingListingActivityItems,
      ...outgoingOfferActivityItems,
      ...outgoingNegotiationActivityItems,
    ]

    return sortActivityItems(items)
  }, [
    outgoingListingActivityItems,
    outgoingOfferActivityItems,
    outgoingNegotiationActivityItems,
  ])

  const visibleTransferActivityItems = useMemo(
    () => (activityMode === 'incoming' ? incomingActivityItems : outgoingActivityItems),
    [activityMode, incomingActivityItems, outgoingActivityItems]
  )

  const [activityPage, setActivityPage] = useState(1)

  useEffect(() => {
    setActivityPage(1)
  }, [activityMode, visibleTransferActivityItems.length])

  const activityTotalPages = Math.max(
    1,
    Math.ceil(visibleTransferActivityItems.length / ACTIVITY_ITEMS_PER_PAGE)
  )

  const paginatedTransferActivityItems = useMemo(() => {
    const startIndex = (activityPage - 1) * ACTIVITY_ITEMS_PER_PAGE
    return visibleTransferActivityItems.slice(
      startIndex,
      startIndex + ACTIVITY_ITEMS_PER_PAGE
    )
  }, [visibleTransferActivityItems, activityPage])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h4 className="font-semibold text-gray-900">{t('transferList.title')}</h4>
            <div className="mt-1 text-sm text-gray-500">
              {t('transferList.subtitle')}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="xl:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('common.search')}
              </label>
              <input
                type="text"
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder={t('transferList.searchPlaceholder')}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('common.role')}
              </label>
              <select
                value={marketRoleFilter}
                onChange={(e) => setMarketRoleFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value="all">{t('common.allRoles')}</option>
                {riderRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                {t('common.sort')}
              </label>
              <select
                value={marketSort}
                onChange={(e) => setMarketSort(e.target.value as RiderMarketSort)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value="active">{t('sort.activeFirst')}</option>
                <option value="scouted">{t('sort.scoutedFirst')}</option>
                <option value="expires">{t('sort.expiresSoonest')}</option>
                <option value="overall_desc">{t('sort.overallHighLow')}</option>
                <option value="overall_asc">{t('sort.overallLowHigh')}</option>
                <option value="price_desc">{t('sort.priceHighLow')}</option>
                <option value="price_asc">{t('sort.priceLowHigh')}</option>
                <option value="name_asc">{t('sort.nameAZ')}</option>
                <option value="name_desc">{t('sort.nameZA')}</option>
                <option value="age_asc">{t('sort.ageLowHigh')}</option>
                <option value="age_desc">{t('sort.ageHighLow')}</option>
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
                {t('common.onlyMyActive')}
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={marketHideOwn}
                  onChange={(e) => setMarketHideOwn(e.target.checked)}
                  className="rounded border-gray-300"
                />
                {t('common.hideOwn')}
              </label>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={onSaveCurrentSearch}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('common.saveSearch')}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {riderLoading ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
              {t('transferList.loading')}
            </div>
          ) : paginatedUnifiedMarketRows.length === 0 ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
              {t('transferList.empty')}
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
                clubId={clubId}
              />
            ))
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            {t('transferList.showing', {
              start: marketPageStart,
              end: marketPageEnd,
              total: totalMarketRows,
            })}
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
                {t('common.previous')}
              </button>

              <div className="px-2 text-sm text-gray-600">
                {t('common.page', { page: marketPage, pages: marketTotalPages })}
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
                {t('common.next')}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t('activity.title')}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {t('activity.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {t('activity.view')}
            </label>
            <select
              value={activityMode}
              onChange={(e) => setActivityMode(e.target.value as ActivityFilterMode)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="incoming">{t('activity.incoming')}</option>
              <option value="outgoing">{t('activity.outgoing')}</option>
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {paginatedTransferActivityItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
              {t('activity.empty')}
            </div>
          ) : (
            paginatedTransferActivityItems.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border px-4 py-4 ${getToneClasses(item.tone)}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.riderId ? (
                        <InlineTextButton
                          label={item.riderName}
                          onClick={() =>
                            onOpenRiderProfile(item.riderId!, item.riderIsOwnedByUser)
                          }
                        />
                      ) : (
                        <span className="text-base font-semibold text-gray-900">
                          {item.riderName}
                        </span>
                      )}

                      <span
                        className={`inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm ${getActivityStatusClasses(
                          item.tone
                        )}`}
                      >
                        {item.statusLabel}
                      </span>
                    </div>

                    <div className="mt-1 text-sm font-semibold text-gray-800">{item.primaryLine}</div>

                    {item.secondaryLine ? (
                      <div className="mt-1 text-sm text-gray-700">{item.secondaryLine}</div>
                    ) : null}

                    {item.mode === 'outgoing' ? (
                      <div className="mt-1 text-sm text-gray-700">
                        {t('activity.buyer', {
                          buyer: resolveBuyerClubName(item, unknownClubLabel),
                        })}
                      </div>
                    ) : null}

                    {item.mode === 'outgoing' ||
                    (item.detailChips && item.detailChips.length > 0) ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {item.mode === 'outgoing' ? (
                          <span className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700">
                            {t('activity.buyer', {
                              buyer: resolveBuyerClubName(item, unknownClubLabel),
                            })}
                          </span>
                        ) : null}

                        {item.detailChips?.map((chip, index) => (
                          <ActivityDetailChip
                            key={`${item.id}-chip-${index}`}
                            label={chip.label}
                            value={chip.value}
                            emphasized={chip.emphasized}
                          />
                        ))}
                      </div>
                    ) : item.dateLine ? (
                      <div className="mt-1 text-xs text-gray-600">{item.dateLine}</div>
                    ) : null}
                  </div>

                  <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 lg:self-center">
                    {item.riderId ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenRiderProfile(item.riderId!, item.riderIsOwnedByUser)
                        }
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {t('activity.openRider')}
                      </button>
                    ) : null}

                    {item.actionLabel ? (
                      <button
                        type="button"
                        disabled={item.actionDisabled}
                        onClick={() => {
                          if (item.actionKind === 'open_negotiation' && item.negotiationIdToOpen) {
                            onOpenNegotiation(item.negotiationIdToOpen)
                            return
                          }

                          if (item.actionKind === 'review_offer' && item.offerIdToReview) {
                            onOpenOfferReview(item.offerIdToReview)
                            return
                          }

                          if (item.actionKind === 'withdraw_offer' && item.withdrawOfferId) {
                            onWithdrawSentOffer(item.withdrawOfferId)
                          }
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                          item.actionDisabled
                            ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                            : 'bg-yellow-400 text-black hover:bg-yellow-300'
                        }`}
                      >
                        {item.actionLabel}
                      </button>
                    ) : null}

                    {item.cancelNegotiationLabel && item.cancelNegotiationId ? (
                      <button
                        type="button"
                        disabled={item.cancelNegotiationDisabled}
                        onClick={() => {
                          if (item.cancelNegotiationId) {
                            onWithdrawNegotiation(item.cancelNegotiationId)
                          }
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                          item.cancelNegotiationDisabled
                            ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                            : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        {item.cancelNegotiationLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            {t('activity.showing', {
              start:
                paginatedTransferActivityItems.length === 0
                  ? 0
                  : (activityPage - 1) * ACTIVITY_ITEMS_PER_PAGE + 1,
              end: Math.min(
                activityPage * ACTIVITY_ITEMS_PER_PAGE,
                visibleTransferActivityItems.length
              ),
              total: visibleTransferActivityItems.length,
            })}
          </div>

          {visibleTransferActivityItems.length > ACTIVITY_ITEMS_PER_PAGE ? (
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
                {t('common.previous')}
              </button>

              <div className="px-2 text-sm text-gray-600">
                {t('common.page', { page: activityPage, pages: activityTotalPages })}
              </div>

              <button
                type="button"
                onClick={() => setActivityPage((prev) => Math.min(activityTotalPages, prev + 1))}
                disabled={activityPage === activityTotalPages}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  activityPage === activityTotalPages
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('common.next')}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <TransferHistoryPanel
        transferHistory={transferHistory}
        ownedRiderIds={ownedRiderIds}
        onOpenRiderProfile={(riderId, isOwnedByUser) =>
          onOpenRiderProfile(riderId, isOwnedByUser)
        }
        onOpenClubProfile={(clubId) => onOpenTeamPage(clubId)}
      />

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 shadow">
        <h4 className="font-semibold text-gray-900">{t('transferHelp.title')}</h4>

        <div className="mt-3 space-y-3 text-sm text-gray-700">
          <p>{t('transferHelp.sendOffer')}</p>

          <p>
            <Trans
              t={t}
              i18nKey="transferHelp.belowAsking"
              components={{
                strong: <span className="font-semibold text-gray-900" />,
              }}
            />
          </p>

          <p>
            <Trans
              t={t}
              i18nKey="transferHelp.atOrAboveAsking"
              components={{
                strong: <span className="font-semibold text-gray-900" />,
              }}
            />
          </p>

          <p>{t('transferHelp.afterAcceptance')}</p>

          <p>{t('transferHelp.riderNegotiation')}</p>

          <p>{t('transferHelp.rejectedExpired')}</p>
        </div>
      </div>
    </div>
  )
}
