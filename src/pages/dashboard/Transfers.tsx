import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import RiderTransferListPage from './transfers/RiderTransferListPage'
import RiderFreeAgentsPage from './transfers/RiderFreeAgentsPage'
import StaffFreeAgentPage from './transfers/StaffFreeAgentPage'

type TransferTab = 'riders' | 'staff'
type RiderMarketSubTab = 'transfer_list' | 'free_agents'

type StaffRole =
  | 'head_coach'
  | 'team_doctor'
  | 'mechanic'
  | 'sport_director'
  | 'scout_analyst'

type StaffSortField = 'salary' | 'skills' | 'name' | 'country'
type SortDirection = 'asc' | 'desc'

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

type ClubRow = {
  id: string
  name: string | null
  club_type: string | null
  parent_club_id: string | null
  deleted_at: string | null
}

type StaffCandidateRow = {
  id: string
  role_type: StaffRole
  specialization: string | null
  staff_name: string
  country_code: string | null
  expertise: number
  experience: number
  potential: number
  leadership: number
  efficiency: number
  loyalty: number
  salary_weekly: number
  is_available: boolean
}

type ClubStaffRow = {
  id: string
  role_type: StaffRole
  staff_name: string
  salary_weekly: number
  contract_expires_at: string | null
  is_active: boolean
}

type MarketListingRow = {
  id?: string
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
  status_changed_at_game_ts?: string | null

  first_name?: string | null
  last_name?: string | null
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

  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  display_name?: string | null
  country_code?: string | null
  role?: string | null
  overall?: number | null
  potential?: number | null
  age_years?: number | null
}

type TransferHistoryRow = {
  id: string
  direction: 'arrival' | 'departure'
  movement_type: 'transfer' | 'free_agent' | 'release' | string
  rider_id: string | null
  rider_name: string
  from_club_id: string | null
  from_club_name: string | null
  to_club_id: string | null
  to_club_name: string | null
  amount: number | null
  game_date: string | null
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
}

type FreeAgentNegotiationRiderInfo = {
  id: string
  display_name: string
  country_code: string | null
  role: string | null
  overall: number | null
  potential: number | null
  birth_date?: string | null
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

  display_name?: string | null
  country_code?: string | null
  role?: string | null
  overall?: number | null
  potential?: number | null
  age_years?: number | null

  rider: FreeAgentNegotiationRiderInfo | null
}

type UnifiedMarketRow =
  | {
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
  | {
      kind: 'free_agent'
      key: string
      rider_id: string
      free_agent_id: string
      full_name: string | null
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

type TransferMarketItem = Extract<UnifiedMarketRow, { kind: 'transfer' }>
type FreeAgentMarketItem = Extract<UnifiedMarketRow, { kind: 'free_agent' }>

const CANDIDATES_PER_PAGE = 10
const RIDERS_PER_PAGE = 30
const ACTIVE_OUTGOING_OFFER_STATUSES = new Set(['open', 'club_accepted', 'accepted'])

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Math.round(Number(value)).toLocaleString('en-US')}`
}

function formatTransferAmount(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  const roundedToThousand = Math.round(Number(value) / 1000) * 1000
  return `$${roundedToThousand.toLocaleString('en-US')}`
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return ''
  return `$${Number(digits).toLocaleString('en-US')}`
}

function parseCurrencyInput(value: string) {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return null
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeOfferStatus(status: unknown) {
  return String(status || '').trim().toLowerCase()
}

function isActiveOutgoingOfferStatus(status: unknown) {
  return ACTIVE_OUTGOING_OFFER_STATUSES.has(normalizeOfferStatus(status))
}

function getErrorMessage(err: any) {
  const candidates = [
    err?.message,
    err?.details,
    err?.hint,
    err?.error_description,
    err?.description,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return 'Unexpected error.'
}

function safeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode || countryCode.length !== 2) return null
  return countryCode.toLowerCase()
}

function getCountryName(countryCode: string | null | undefined) {
  const safeCode = safeCountryCode(countryCode)
  if (!safeCode) return 'Unknown'

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

function roleLabel(role: StaffRole) {
  switch (role) {
    case 'head_coach':
      return 'Head Coach'
    case 'team_doctor':
      return 'Team Doctor'
    case 'mechanic':
      return 'Mechanic'
    case 'sport_director':
      return 'Sport Director'
    case 'scout_analyst':
      return 'Scout / Analyst'
    default:
      return role
  }
}

function resolveMainClub(rows: ClubRow[]) {
  if (!rows.length) return null

  const exactMain = rows.find(
    (club) =>
      club.deleted_at == null &&
      club.parent_club_id == null &&
      club.club_type !== 'developing'
  )

  if (exactMain) return exactMain

  const fallbackNonDeveloping = rows.find(
    (club) => club.deleted_at == null && club.club_type !== 'developing'
  )

  if (fallbackNonDeveloping) return fallbackNonDeveloping

  return rows.find((club) => club.deleted_at == null) || null
}

function getCandidateStats(candidate: StaffCandidateRow) {
  if (candidate.role_type === 'head_coach') {
    return [
      { label: 'Training', value: candidate.expertise },
      { label: 'Recovery Plan', value: candidate.efficiency },
      { label: 'Youth Dev', value: candidate.potential },
    ]
  }

  if (candidate.role_type === 'team_doctor') {
    return [
      { label: 'Recovery', value: candidate.expertise },
      { label: 'Prevention', value: candidate.efficiency },
      { label: 'Diagnosis', value: candidate.experience },
    ]
  }

  if (candidate.role_type === 'mechanic') {
    return [
      { label: 'Setup', value: candidate.expertise },
      { label: 'Reliability', value: candidate.efficiency },
      { label: 'Innovation', value: candidate.potential },
    ]
  }

  if (candidate.role_type === 'sport_director') {
    return [
      { label: 'Tactics', value: candidate.expertise },
      { label: 'Motivation', value: candidate.leadership },
      { label: 'Organization', value: candidate.efficiency },
    ]
  }

  return [
    { label: 'Evaluation', value: candidate.expertise },
    { label: 'Network', value: candidate.experience },
    { label: 'Accuracy', value: candidate.efficiency },
  ]
}

function getCandidateSkillScore(candidate: StaffCandidateRow) {
  const stats = getCandidateStats(candidate)
  if (!stats.length) return 0
  return stats.reduce((sum, stat) => sum + stat.value, 0) / stats.length
}

function tryParseDate(value: string | null | undefined) {
  if (!value) return null
  const direct = new Date(value)
  if (!Number.isNaN(direct.getTime())) return direct

  const asMidnight = new Date(`${value}T00:00:00`)
  if (!Number.isNaN(asMidnight.getTime())) return asMidnight

  return null
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
      Math.max(0, gameState.minute_number || 0)
    )
  )

  if (Number.isNaN(gameDate.getTime())) return null
  return gameDate
}

function calculateAgeYearsFromGameDate(
  birthDate: string | null | undefined,
  currentGameDate: Date | null
) {
  if (!birthDate || !currentGameDate) return null

  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return null

  let age = currentGameDate.getUTCFullYear() - birth.getUTCFullYear()

  const hasHadBirthdayThisYear =
    currentGameDate.getUTCMonth() > birth.getUTCMonth() ||
    (currentGameDate.getUTCMonth() === birth.getUTCMonth() &&
      currentGameDate.getUTCDate() >= birth.getUTCDate())

  if (!hasHadBirthdayThisYear) {
    age -= 1
  }

  return age
}

function looksLikeUuid(value: string | null | undefined) {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  )
}

function buildPreferredRiderName(params: {
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  displayName?: string | null
  fallbackId?: string | null
}) {
  const combined = [params.firstName?.trim(), params.lastName?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim()

  if (combined) return combined
  if (params.fullName?.trim()) return params.fullName.trim()
  if (params.displayName?.trim() && !looksLikeUuid(params.displayName)) {
    return params.displayName.trim()
  }
  if (params.fallbackId && !looksLikeUuid(params.fallbackId)) {
    return params.fallbackId
  }
  return 'Unknown rider'
}

function normalizeFreeAgentNegotiationRow(
  row: any,
  currentGameDate: Date | null
): FreeAgentNegotiationRow {
  const riderSource = Array.isArray(row?.rider) ? row.rider[0] : row?.rider || null

  return {
    id: row.id,
    free_agent_id: row.free_agent_id,
    rider_id: row.rider_id,
    club_id: row.club_id,
    status: row.status,
    current_salary_weekly: row.current_salary_weekly ?? null,
    expected_salary_weekly: row.expected_salary_weekly,
    min_acceptable_salary_weekly: row.min_acceptable_salary_weekly,
    preferred_duration_seasons: row.preferred_duration_seasons,
    offer_salary_weekly: row.offer_salary_weekly ?? null,
    offer_duration_seasons: row.offer_duration_seasons ?? null,
    attempt_count: row.attempt_count,
    max_attempts: row.max_attempts,
    locked_until: row.locked_until || null,
    opened_on_game_date: row.opened_on_game_date,
    closed_reason: row.closed_reason || null,

    display_name: row.display_name || riderSource?.display_name || 'Unknown rider',
    country_code: row.country_code || riderSource?.country_code || null,
    role: row.role || riderSource?.role || null,
    overall: row.overall ?? riderSource?.overall ?? null,
    potential: row.potential ?? riderSource?.potential ?? null,
    age_years:
      row.age_years ?? calculateAgeYearsFromGameDate(riderSource?.birth_date, currentGameDate),

    rider:
      riderSource ||
      (row.display_name ||
      row.country_code ||
      row.role ||
      row.overall != null ||
      row.potential != null
        ? {
            id: row.rider_id,
            display_name: row.display_name || 'Unknown rider',
            country_code: row.country_code || null,
            role: row.role || null,
            overall: row.overall ?? null,
            potential: row.potential ?? null,
            birth_date: row.birth_date ?? null,
          }
        : null),
  }
}

function SegmentedTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-medium transition ${
        active ? 'bg-yellow-400 text-black' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  )
}

function UnderlineSubTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-0 pb-3 text-sm font-medium transition ${
        active
          ? 'border-yellow-400 text-gray-900'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  )
}

export default function TransfersPage() {
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<TransferTab>('riders')
  const [riderMarketSubTab, setRiderMarketSubTab] =
    useState<RiderMarketSubTab>('transfer_list')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [clubName, setClubName] = useState<string | null>(null)
  const [clubNameMap, setClubNameMap] = useState<Record<string, string>>({})

  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all')
  const [sortField, setSortField] = useState<StaffSortField>('salary')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [staffCandidates, setStaffCandidates] = useState<StaffCandidateRow[]>([])
  const [clubStaff, setClubStaff] = useState<ClubStaffRow[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const [hireLoading, setHireLoading] = useState(false)
  const [pageMessage, setPageMessage] = useState<string | null>(null)

  const [riderLoading, setRiderLoading] = useState(false)
  const [marketListings, setMarketListings] = useState<MarketListingRow[]>([])
  const [transferOffers, setTransferOffers] = useState<TransferOfferRow[]>([])
  const [mySentOffersDashboard, setMySentOffersDashboard] = useState<TransferOfferRow[]>([])
  const [myOutgoingOffers, setMyOutgoingOffers] = useState<TransferOfferRow[]>([])
  const [transferNegotiations, setTransferNegotiations] = useState<TransferNegotiationRow[]>([])
  const [transferHistory, setTransferHistory] = useState<TransferHistoryRow[]>([])
  const [freeAgents, setFreeAgents] = useState<FreeAgentMarketRow[]>([])
  const [freeAgentNegotiations, setFreeAgentNegotiations] = useState<
    FreeAgentNegotiationRow[]
  >([])
  const [gameState, setGameState] = useState<GameStateRow | null>(null)

  const [selectedMarketListingId, setSelectedMarketListingId] = useState<string | null>(null)
  const [selectedFreeAgentId, setSelectedFreeAgentId] = useState<string | null>(null)

  const [offerModalListing, setOfferModalListing] = useState<MarketListingRow | null>(null)
  const [offerDraftPrice, setOfferDraftPrice] = useState('')
  const [offerModalMessage, setOfferModalMessage] = useState<string | null>(null)

  const [riderActionLoading, setRiderActionLoading] = useState(false)

  const [marketSearch, setMarketSearch] = useState('')
  const [marketRoleFilter, setMarketRoleFilter] = useState<RiderRoleFilter>('all')
  const [marketOnlyActive, setMarketOnlyActive] = useState(false)
  const [marketHideOwn, setMarketHideOwn] = useState(false)
  const [marketSort, setMarketSort] = useState<RiderMarketSort>('active')
  const [marketPage, setMarketPage] = useState(1)

  useEffect(() => {
    let mounted = true

    async function loadTransfersPage() {
      try {
        setLoading(true)
        setError(null)

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError
        if (!user) throw new Error('User not found.')

        const { data: clubsData, error: clubsError } = await supabase
          .from('clubs')
          .select('id, name, club_type, parent_club_id, deleted_at')
          .eq('owner_user_id', user.id)
          .is('deleted_at', null)

        if (clubsError) throw clubsError

        const resolvedClub = resolveMainClub((clubsData || []) as ClubRow[])
        if (!resolvedClub) throw new Error('Main club not found.')

        if (!mounted) return

        setClubId(resolvedClub.id)
        setClubName(resolvedClub.name || null)

        await loadStaffData(resolvedClub.id, mounted)

        if (!mounted) return
        await loadRiderData(resolvedClub.id, mounted)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load transfers page.'
        if (!mounted) return
        setError(message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadTransfersPage()

    return () => {
      mounted = false
    }
  }, [])

  async function loadStaffData(clubIdValue: string, mounted = true) {
    const [candidatesResult, clubStaffResult] = await Promise.all([
      supabase
        .from('staff_candidates')
        .select(`
          id,
          role_type,
          specialization,
          staff_name,
          country_code,
          expertise,
          experience,
          potential,
          leadership,
          efficiency,
          loyalty,
          salary_weekly,
          is_available
        `)
        .eq('is_available', true)
        .order('role_type', { ascending: true })
        .order('salary_weekly', { ascending: true }),
      supabase
        .from('club_staff')
        .select(`
          id,
          role_type,
          staff_name,
          salary_weekly,
          contract_expires_at,
          is_active
        `)
        .eq('club_id', clubIdValue)
        .eq('is_active', true),
    ])

    if (candidatesResult.error) throw candidatesResult.error
    if (clubStaffResult.error) throw clubStaffResult.error

    if (!mounted) return

    setStaffCandidates((candidatesResult.data || []) as StaffCandidateRow[])
    setClubStaff((clubStaffResult.data || []) as ClubStaffRow[])
  }

  async function fetchClubNameMap(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
    if (!uniqueIds.length) return {}

    const { data, error } = await supabase.from('clubs').select('id, name').in('id', uniqueIds)

    if (error) throw error

    const result: Record<string, string> = {}
    for (const row of data || []) {
      result[row.id] = row.name || row.id
    }
    return result
  }

  function openRiderProfilePage(riderId: string, isOwnedByUser = false) {
    navigate(
      isOwnedByUser ? `/dashboard/my-riders/${riderId}` : `/dashboard/external-riders/${riderId}`
    )
  }

  function openClubProfilePage(targetClubId: string) {
    navigate(`/dashboard/clubs/${targetClubId}`)
  }

  function openOfferModal(listing: MarketListingRow) {
    const resolvedListingId = listing.listing_id || listing.id || ''

    setSelectedMarketListingId(resolvedListingId)
    setOfferDraftPrice(formatTransferAmount(listing.asking_price))
    setOfferModalListing({
      ...listing,
      listing_id: resolvedListingId,
    })
    setOfferModalMessage(null)
    setPageMessage(null)
  }

  async function loadRiderData(clubIdValue: string, mounted = true) {
    setRiderLoading(true)

    try {
      const [
        marketResult,
        offersResult,
        mySentOffersDashboardResult,
        myOutgoingOffersResult,
        sellerNegotiationsResult,
        freeAgentsResult,
        freeAgentNegotiationsResult,
        gameStateResult,
        transferHistoryResult,
      ] = await Promise.all([
        supabase.rpc('get_transfer_market_listings', {
          p_page: 1,
          p_page_size: 300,
        }),
        supabase
          .from('rider_transfer_offers')
          .select(`
            id,
            listing_id,
            rider_id,
            seller_club_id,
            buyer_club_id,
            offered_price,
            offered_on_game_date,
            expires_on_game_date,
            status,
            auto_block_reason,
            metadata,
            created_at,
            updated_at
          `)
          .eq('seller_club_id', clubIdValue)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_my_sent_transfer_offers_dashboard', {}),
        supabase
          .from('rider_transfer_offers')
          .select(`
            id,
            listing_id,
            rider_id,
            seller_club_id,
            buyer_club_id,
            offered_price,
            offered_on_game_date,
            expires_on_game_date,
            status,
            auto_block_reason,
            metadata,
            created_at,
            updated_at
          `)
          .eq('buyer_club_id', clubIdValue)
          .order('created_at', { ascending: false }),
        supabase
          .from('rider_transfer_negotiations')
          .select(`
            id,
            offer_id,
            listing_id,
            rider_id,
            seller_club_id,
            buyer_club_id,
            status,
            current_salary_weekly,
            expected_salary_weekly,
            min_acceptable_salary_weekly,
            preferred_duration_seasons,
            offer_salary_weekly,
            offer_duration_seasons,
            attempt_count,
            max_attempts,
            locked_until,
            opened_on_game_date,
            expires_on_game_date,
            closed_reason,
            notes_json,
            created_at,
            updated_at
          `)
          .eq('seller_club_id', clubIdValue)
          .order('created_at', { ascending: false }),
        supabase
          .from('free_agent_market_view')
          .select(`
            free_agent_id,
            rider_id,
            status,
            expected_salary_weekly,
            expires_on_game_date,
            created_at,
            first_name,
            last_name,
            display_name,
            country_code,
            role,
            overall,
            potential,
            birth_date
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('rider_free_agent_negotiations')
          .select(`
            id,
            free_agent_id,
            rider_id,
            club_id,
            status,
            current_salary_weekly,
            expected_salary_weekly,
            min_acceptable_salary_weekly,
            preferred_duration_seasons,
            offer_salary_weekly,
            offer_duration_seasons,
            attempt_count,
            max_attempts,
            locked_until,
            opened_on_game_date,
            closed_reason,
            rider:riders!rider_free_agent_negotiations_rider_id_fkey(
              id,
              display_name,
              country_code,
              role,
              overall,
              potential,
              birth_date
            )
          `)
          .eq('club_id', clubIdValue)
          .order('created_at', { ascending: false }),
        supabase
          .from('game_state')
          .select('season_number, month_number, day_number, hour_number, minute_number')
          .eq('id', true)
          .single(),
        supabase.rpc('get_my_transfer_history_dashboard', {}),
      ])

      if (marketResult.error) throw marketResult.error
      if (offersResult.error) throw offersResult.error
      if (mySentOffersDashboardResult.error) throw mySentOffersDashboardResult.error
      if (myOutgoingOffersResult.error) throw myOutgoingOffersResult.error
      if (sellerNegotiationsResult.error) throw sellerNegotiationsResult.error
      if (freeAgentsResult.error) throw freeAgentsResult.error
      if (freeAgentNegotiationsResult.error) throw freeAgentNegotiationsResult.error
      if (gameStateResult.error) throw gameStateResult.error
      if (transferHistoryResult.error) throw transferHistoryResult.error

      const marketBase = (marketResult.data || []) as any[]
      const offersBase = (offersResult.data || []) as any[]
      const mySentOffersDashboardBase = (mySentOffersDashboardResult.data || []) as any[]
      const myOutgoingOffersBase = (myOutgoingOffersResult.data || []) as any[]
      const sellerNegotiationsBase = (sellerNegotiationsResult.data || []) as any[]
      const historyRows = (transferHistoryResult.data || []) as TransferHistoryRow[]
      const gameStateData = gameStateResult.data as GameStateRow
      const currentGameDate = getCurrentGameDateFromState(gameStateData)

      const freeAgentsRows: FreeAgentMarketRow[] = ((freeAgentsResult.data || []) as any[]).map(
        (row) => {
          const fullName = buildPreferredRiderName({
            firstName: row.first_name,
            lastName: row.last_name,
            displayName: row.display_name,
            fallbackId: row.rider_id,
          })

          return {
            id: row.free_agent_id,
            free_agent_id: row.free_agent_id,
            rider_id: row.rider_id,
            status: row.status,
            expected_salary_weekly: row.expected_salary_weekly ?? null,
            expires_on_game_date: row.expires_on_game_date ?? null,
            full_name: fullName,
            display_name: fullName,
            country_code: row.country_code ?? null,
            role: row.role ?? null,
            overall: row.overall ?? null,
            potential: row.potential ?? null,
            age_years: calculateAgeYearsFromGameDate(row.birth_date, currentGameDate),
          }
        }
      )

      const freeAgentNegotiationRows = ((freeAgentNegotiationsResult.data || []) as any[]).map(
        (row) => normalizeFreeAgentNegotiationRow(row, currentGameDate)
      )

      const riderIds = Array.from(
        new Set(
          [
            ...marketBase.map((row) => row.rider_id),
            ...offersBase.map((row) => row.rider_id),
            ...mySentOffersDashboardBase.map((row) => row.rider_id),
            ...myOutgoingOffersBase.map((row) => row.rider_id),
            ...sellerNegotiationsBase.map((row) => row.rider_id),
            ...freeAgentsRows.map((row) => row.rider_id),
            ...freeAgentNegotiationRows.map((row) => row.rider_id),
            ...historyRows.map((row) => row.rider_id),
          ].filter(Boolean)
        )
      )

      let riderMap: Record<string, any> = {}

      if (riderIds.length > 0) {
        const { data: riderRows, error: riderRowsError } = await supabase
          .from('riders')
          .select(`
            id,
            first_name,
            last_name,
            display_name,
            country_code,
            role,
            overall,
            potential,
            birth_date
          `)
          .in('id', riderIds)

        if (riderRowsError) throw riderRowsError

        riderMap = Object.fromEntries((riderRows || []).map((row: any) => [row.id, row]))
      }

      const market: MarketListingRow[] = marketBase
        .map((row: any) => {
          const rider = riderMap[row.rider_id]
          const fullName = buildPreferredRiderName({
            firstName: rider?.first_name,
            lastName: rider?.last_name,
            fullName: row.full_name,
            displayName: row.display_name ?? rider?.display_name,
            fallbackId: row.rider_id,
          })

          const resolvedListingId = row.listing_id ?? row.id ?? null
          if (!resolvedListingId) return null

          return {
            ...row,
            id: row.id ?? resolvedListingId,
            listing_id: resolvedListingId,
            first_name: rider?.first_name ?? null,
            last_name: rider?.last_name ?? null,
            full_name: fullName,
            display_name: fullName,
            country_code: row.country_code ?? rider?.country_code ?? null,
            role: row.role ?? rider?.role ?? null,
            overall: row.overall ?? rider?.overall ?? null,
            potential: row.potential ?? rider?.potential ?? null,
            age_years:
              row.age_years ?? calculateAgeYearsFromGameDate(rider?.birth_date, currentGameDate),
          } satisfies MarketListingRow
        })
        .filter((row): row is MarketListingRow => Boolean(row))

      const mapOfferRows = (rows: any[]): TransferOfferRow[] =>
        rows.map((row: any) => {
          const rider = riderMap[row.rider_id]
          const fullName = buildPreferredRiderName({
            firstName: rider?.first_name,
            lastName: rider?.last_name,
            fullName: row.full_name,
            displayName: row.display_name ?? rider?.display_name,
            fallbackId: row.rider_id,
          })

          return {
            ...row,
            first_name: rider?.first_name ?? null,
            last_name: rider?.last_name ?? null,
            full_name: fullName,
            display_name: fullName,
            country_code: rider?.country_code ?? null,
            role: rider?.role ?? null,
            overall: rider?.overall ?? null,
            potential: rider?.potential ?? null,
            age_years: calculateAgeYearsFromGameDate(rider?.birth_date, currentGameDate),
          }
        })

      const offers: TransferOfferRow[] = mapOfferRows(offersBase)
      const mySentOffersDashboardRows: TransferOfferRow[] = mapOfferRows(mySentOffersDashboardBase)
      const myOutgoingOffersRows: TransferOfferRow[] = mapOfferRows(myOutgoingOffersBase)

      const negotiations: TransferNegotiationRow[] = sellerNegotiationsBase.map((row: any) => {
        const rider = riderMap[row.rider_id]
        const fullName = buildPreferredRiderName({
          firstName: rider?.first_name,
          lastName: rider?.last_name,
          fullName: row.full_name,
          displayName: row.display_name ?? rider?.display_name,
          fallbackId: row.rider_id,
        })

        return {
          ...row,
          first_name: rider?.first_name ?? null,
          last_name: rider?.last_name ?? null,
          full_name: fullName,
          display_name: fullName,
          country_code: rider?.country_code ?? null,
          role: rider?.role ?? null,
          overall: rider?.overall ?? null,
          potential: rider?.potential ?? null,
          age_years: calculateAgeYearsFromGameDate(rider?.birth_date, currentGameDate),
        }
      })

      const clubIds = [
        clubIdValue,
        ...market.map((row) => row.seller_club_id),
        ...offers.flatMap((row) => [row.seller_club_id, row.buyer_club_id]),
        ...myOutgoingOffersRows.flatMap((row) => [row.seller_club_id, row.buyer_club_id]),
        ...negotiations.flatMap((row) => [row.seller_club_id, row.buyer_club_id]),
        ...freeAgentNegotiationRows.map((row) => row.club_id),
        ...historyRows.flatMap((row) => [row.from_club_id, row.to_club_id]),
      ]

      const names = await fetchClubNameMap(clubIds)

      if (!mounted) return

      setMarketListings(market)
      setTransferOffers(offers)
      setMySentOffersDashboard(mySentOffersDashboardRows)
      setMyOutgoingOffers(myOutgoingOffersRows)
      setTransferNegotiations(negotiations)
      setTransferHistory(historyRows)
      setFreeAgents(freeAgentsRows)
      setFreeAgentNegotiations(freeAgentNegotiationRows)
      setClubNameMap(names)
      setGameState(gameStateData)

      setSelectedMarketListingId((prev) => {
        if (prev && market.some((row) => row.listing_id === prev)) return prev
        return market.length ? market[0].listing_id : null
      })

      setSelectedFreeAgentId((prev) => {
        if (prev && freeAgentsRows.some((row) => row.free_agent_id === prev)) return prev
        return freeAgentsRows.length ? freeAgentsRows[0].free_agent_id : null
      })
    } finally {
      if (mounted) setRiderLoading(false)
    }
  }

  const filteredCandidates = useMemo(() => {
    if (roleFilter === 'all') return staffCandidates
    return staffCandidates.filter((candidate) => candidate.role_type === roleFilter)
  }, [staffCandidates, roleFilter])

  const sortedCandidates = useMemo(() => {
    const candidates = [...filteredCandidates]

    candidates.sort((a, b) => {
      if (sortField === 'salary') {
        return sortDirection === 'asc'
          ? a.salary_weekly - b.salary_weekly
          : b.salary_weekly - a.salary_weekly
      }

      if (sortField === 'skills') {
        const aScore = getCandidateSkillScore(a)
        const bScore = getCandidateSkillScore(b)
        return sortDirection === 'asc' ? aScore - bScore : bScore - aScore
      }

      if (sortField === 'name') {
        const result = a.staff_name.localeCompare(b.staff_name, undefined, {
          sensitivity: 'base',
        })
        return sortDirection === 'asc' ? result : -result
      }

      const aCountry = getCountryName(a.country_code)
      const bCountry = getCountryName(b.country_code)
      const result = aCountry.localeCompare(bCountry, undefined, {
        sensitivity: 'base',
      })

      return sortDirection === 'asc' ? result : -result
    })

    return candidates
  }, [filteredCandidates, sortField, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedCandidates.length / CANDIDATES_PER_PAGE))

  useEffect(() => {
    setCurrentPage(1)
  }, [roleFilter, sortField, sortDirection])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const paginatedCandidates = useMemo(() => {
    const startIndex = (currentPage - 1) * CANDIDATES_PER_PAGE
    return sortedCandidates.slice(startIndex, startIndex + CANDIDATES_PER_PAGE)
  }, [sortedCandidates, currentPage])

  useEffect(() => {
    if (!paginatedCandidates.length) {
      setSelectedCandidateId(null)
      return
    }

    const stillExistsOnPage = paginatedCandidates.some(
      (candidate) => candidate.id === selectedCandidateId
    )

    if (!stillExistsOnPage) {
      setSelectedCandidateId(paginatedCandidates[0].id)
    }
  }, [paginatedCandidates, selectedCandidateId])

  const selectedCandidate = useMemo(
    () => paginatedCandidates.find((candidate) => candidate.id === selectedCandidateId) || null,
    [paginatedCandidates, selectedCandidateId]
  )

  const occupiedRoleMap = useMemo(() => {
    const map = new Map<StaffRole, ClubStaffRow>()
    for (const row of clubStaff) {
      map.set(row.role_type, row)
    }
    return map
  }, [clubStaff])

  const selectedFreeAgent = useMemo(
    () => freeAgents.find((agent) => agent.free_agent_id === selectedFreeAgentId) || null,
    [freeAgents, selectedFreeAgentId]
  )

  const myReceivedOffers = useMemo(() => {
    if (!clubId) return []
    return transferOffers.filter((offer) => offer.seller_club_id === clubId)
  }, [transferOffers, clubId])

  const mySellerNegotiations = useMemo(() => {
    if (!clubId) return []
    return transferNegotiations.filter((negotiation) => negotiation.seller_club_id === clubId)
  }, [transferNegotiations, clubId])

  const myFreeAgentNegotiations = useMemo(() => {
    if (!clubId) return []
    return freeAgentNegotiations.filter((row) => row.club_id === clubId)
  }, [freeAgentNegotiations, clubId])

  const activeTransferListingIds = useMemo(() => {
    const ids = new Set<string>()

    for (const offer of myOutgoingOffers) {
      if (isActiveOutgoingOfferStatus(offer.status)) {
        ids.add(offer.listing_id)
      }
    }

    return ids
  }, [myOutgoingOffers])

  const activeFreeAgentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const negotiation of myFreeAgentNegotiations) {
      if (negotiation.status === 'open') {
        ids.add(negotiation.free_agent_id)
      }
    }
    return ids
  }, [myFreeAgentNegotiations])

  const riderRoleOptions = useMemo(() => {
    const sourceRoles =
      riderMarketSubTab === 'transfer_list'
        ? marketListings.map((row) => row.role).filter(Boolean)
        : freeAgents.map((row) => row.role).filter(Boolean)

    return Array.from(new Set(sourceRoles as string[])).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  }, [riderMarketSubTab, marketListings, freeAgents])

  const unifiedMarketRows = useMemo(() => {
    if (!clubId) return []

    if (riderMarketSubTab === 'transfer_list') {
      return marketListings.map(
        (listing): UnifiedMarketRow => ({
          kind: 'transfer',
          key: `transfer-${listing.listing_id}`,
          rider_id: listing.rider_id,
          listing_id: listing.listing_id,
          display_name: listing.full_name || listing.display_name || 'Unknown rider',
          country_code: listing.country_code,
          role: listing.role,
          overall: listing.overall,
          potential: listing.potential,
          age_years: listing.age_years,
          seller_label: `Seller: ${
            listing.seller_club_name || clubNameMap[listing.seller_club_id] || 'Unknown club'
          }`,
          amount_value: listing.asking_price,
          amount_label: `Asking price: ${formatCurrency(listing.asking_price)}`,
          expires_on_game_date: listing.expires_on_game_date,
          is_user_active: activeTransferListingIds.has(listing.listing_id),
          is_own_item: listing.seller_club_id === clubId,
          raw: listing,
        })
      )
    }

    return freeAgents.map(
      (agent): UnifiedMarketRow => ({
        kind: 'free_agent',
        key: `free-agent-${agent.free_agent_id}`,
        rider_id: agent.rider_id,
        free_agent_id: agent.free_agent_id,
        full_name: agent.full_name,
        display_name: agent.full_name || agent.display_name || 'Unknown rider',
        country_code: agent.country_code,
        role: agent.role,
        overall: agent.overall,
        potential: agent.potential,
        age_years: agent.age_years,
        seller_label: 'Type: Free Agent',
        amount_value: agent.expected_salary_weekly,
        amount_label: `Expected salary: ${formatCurrency(agent.expected_salary_weekly)}/week`,
        expires_on_game_date: agent.expires_on_game_date,
        is_user_active: activeFreeAgentIds.has(agent.free_agent_id),
        is_own_item: false,
        raw: agent,
      })
    )
  }, [
    riderMarketSubTab,
    marketListings,
    freeAgents,
    clubNameMap,
    activeTransferListingIds,
    activeFreeAgentIds,
    clubId,
  ])

  const filteredUnifiedMarketRows = useMemo(() => {
    const term = marketSearch.trim().toLowerCase()

    return unifiedMarketRows.filter((row) => {
      if (marketRoleFilter !== 'all' && (row.role || '') !== marketRoleFilter) return false
      if (marketOnlyActive && !row.is_user_active) return false
      if (marketHideOwn && row.is_own_item) return false

      if (!term) return true

      const searchable = [row.display_name, row.role || '', row.seller_label, row.country_code || '']
        .join(' ')
        .toLowerCase()

      return searchable.includes(term)
    })
  }, [unifiedMarketRows, marketSearch, marketRoleFilter, marketOnlyActive, marketHideOwn])

  const sortedUnifiedMarketRows = useMemo(() => {
    const rows = [...filteredUnifiedMarketRows]

    rows.sort((a, b) => {
      if (marketSort === 'active') {
        if (a.is_user_active !== b.is_user_active) return a.is_user_active ? -1 : 1
        const aTime = tryParseDate(a.expires_on_game_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
        const bTime = tryParseDate(b.expires_on_game_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
        return aTime - bTime
      }

      if (marketSort === 'expires') {
        const aTime = tryParseDate(a.expires_on_game_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
        const bTime = tryParseDate(b.expires_on_game_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
        return aTime - bTime
      }

      if (marketSort === 'overall_desc') return (b.overall ?? -1) - (a.overall ?? -1)
      if (marketSort === 'overall_asc') return (a.overall ?? 999) - (b.overall ?? 999)
      if (marketSort === 'price_desc') return (b.amount_value ?? -1) - (a.amount_value ?? -1)
      if (marketSort === 'price_asc') {
        return (a.amount_value ?? 999999999) - (b.amount_value ?? 999999999)
      }

      if (marketSort === 'age_desc') return (b.age_years ?? -1) - (a.age_years ?? -1)
      if (marketSort === 'age_asc') return (a.age_years ?? 999) - (b.age_years ?? 999)

      if (marketSort === 'name_desc') {
        return b.display_name.localeCompare(a.display_name, undefined, { sensitivity: 'base' })
      }

      return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' })
    })

    return rows
  }, [filteredUnifiedMarketRows, marketSort])

  const transferMarketRows = useMemo(
    () =>
      sortedUnifiedMarketRows.filter(
        (item): item is TransferMarketItem => item.kind === 'transfer'
      ),
    [sortedUnifiedMarketRows]
  )

  const freeAgentMarketRows = useMemo(
    () =>
      sortedUnifiedMarketRows.filter(
        (item): item is FreeAgentMarketItem => item.kind === 'free_agent'
      ),
    [sortedUnifiedMarketRows]
  )

  const activeMarketRowCount =
    riderMarketSubTab === 'transfer_list'
      ? transferMarketRows.length
      : freeAgentMarketRows.length

  const marketTotalPages = Math.max(1, Math.ceil(activeMarketRowCount / RIDERS_PER_PAGE))

  useEffect(() => {
    setMarketPage(1)
  }, [
    riderMarketSubTab,
    marketSearch,
    marketRoleFilter,
    marketOnlyActive,
    marketHideOwn,
    marketSort,
  ])

  useEffect(() => {
    if (marketPage > marketTotalPages) {
      setMarketPage(marketTotalPages)
    }
  }, [marketPage, marketTotalPages])

  const paginatedTransferMarketRows = useMemo(() => {
    const startIndex = (marketPage - 1) * RIDERS_PER_PAGE
    return transferMarketRows.slice(startIndex, startIndex + RIDERS_PER_PAGE)
  }, [transferMarketRows, marketPage])

  const paginatedFreeAgentMarketRows = useMemo(() => {
    const startIndex = (marketPage - 1) * RIDERS_PER_PAGE
    return freeAgentMarketRows.slice(startIndex, startIndex + RIDERS_PER_PAGE)
  }, [freeAgentMarketRows, marketPage])

  async function reloadStaffMarket(clubIdValue: string) {
    await loadStaffData(clubIdValue, true)
  }

  async function reloadRiders(clubIdValue: string) {
    await loadRiderData(clubIdValue, true)
  }

  async function handleHireCandidate() {
    if (!selectedCandidate || !clubId) return

    const occupiedRole = occupiedRoleMap.get(selectedCandidate.role_type)
    if (occupiedRole) {
      setPageMessage(
        `${roleLabel(selectedCandidate.role_type)} is already filled by ${occupiedRole.staff_name}. Replace flow should be used later.`
      )
      return
    }

    try {
      setHireLoading(true)
      setPageMessage(null)

      const { error: hireError } = await supabase.rpc('hire_staff_candidate', {
        p_candidate_id: selectedCandidate.id,
        p_contract_days: 360,
      })

      if (hireError) throw hireError

      await reloadStaffMarket(clubId)

      setPageMessage(
        `${selectedCandidate.staff_name} has been hired as ${roleLabel(selectedCandidate.role_type)}.`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to hire staff candidate.'
      setPageMessage(message)
    } finally {
      setHireLoading(false)
    }
  }

  async function handleSubmitOffer(
    targetListing: MarketListingRow,
    explicitPrice?: number
  ): Promise<boolean> {
    if (!clubId) return false

    const riderName = targetListing.full_name || targetListing.display_name || 'the rider'
    const sellerName =
      targetListing.seller_club_name ||
      clubNameMap[targetListing.seller_club_id] ||
      'the seller club'

    try {
      setRiderActionLoading(true)
      setPageMessage(null)
      setOfferModalMessage(null)

      const listingId = targetListing.listing_id || targetListing.id || ''
      const offeredPrice = explicitPrice ?? targetListing.asking_price

      if (!listingId) {
        throw new Error('Transfer listing id is missing.')
      }

      if (!Number.isFinite(offeredPrice) || offeredPrice <= 0) {
        throw new Error('Please enter a valid offer amount.')
      }

      const existingActiveOffer = myOutgoingOffers.find(
        (offer) => offer.listing_id === listingId && isActiveOutgoingOfferStatus(offer.status)
      )

      if (existingActiveOffer) {
        const duplicateMessage = `You already have an active offer for ${riderName}.`
        setPageMessage(duplicateMessage)
        setOfferModalMessage(duplicateMessage)
        return false
      }

      const { data, error } = await supabase.rpc('submit_rider_transfer_offer', {
        p_listing_id: listingId,
        p_buyer_club_id: clubId,
        p_offered_price: offeredPrice,
      })

      if (error) {
        console.error('submit_rider_transfer_offer rpc error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          listingId,
          buyerClubId: clubId,
          offeredPrice,
          responseData: data,
        })
        throw error
      }

      const result = Array.isArray(data) ? data[0] : data

      await reloadRiders(clubId)

      if (result?.status === 'club_accepted' || result?.status === 'accepted') {
        const successMessage = `Your offer of ${formatTransferAmount(
          offeredPrice
        )} for ${riderName} was accepted by ${sellerName}. Check your notifications to start contract negotiations.`
        setPageMessage(successMessage)
      } else {
        const successMessage = `Your offer of ${formatTransferAmount(
          offeredPrice
        )} for ${riderName} was sent to ${sellerName}.`
        setPageMessage(successMessage)
      }

      setOfferModalMessage(null)
      return true
    } catch (err: any) {
      console.error('submit_rider_transfer_offer failed:', err)

      const rawMessage = getErrorMessage(err)
      const normalizedMessage =
        rawMessage.includes('An open offer from this club already exists for this listing')
          ? `You already have an active offer for ${riderName}.`
          : rawMessage || 'Failed to submit transfer offer.'

      setPageMessage(normalizedMessage)
      setOfferModalMessage(normalizedMessage)
      return false
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleStartFreeAgentNegotiation(agent: FreeAgentMarketRow) {
    if (!clubId) return

    try {
      setRiderActionLoading(true)
      setPageMessage(null)

      const freeAgentId = agent.free_agent_id
      if (!freeAgentId) {
        throw new Error('Free agent id is missing.')
      }

      const existingOpen = freeAgentNegotiations.find(
        (row) => row.club_id === clubId && row.free_agent_id === freeAgentId && row.status === 'open'
      )

      if (existingOpen) {
        setPageMessage('A contract negotiation for this free agent is already active.')
        return
      }

      const expectedSalary = agent.expected_salary_weekly ?? 0
      if (expectedSalary <= 0) {
        throw new Error('Free agent salary expectation is missing.')
      }

      const insertPayload = {
        free_agent_id: freeAgentId,
        rider_id: agent.rider_id,
        club_id: clubId,
        status: 'open',
        current_salary_weekly: null,
        expected_salary_weekly: expectedSalary,
        min_acceptable_salary_weekly: expectedSalary,
        preferred_duration_seasons: 1,
        offer_salary_weekly: expectedSalary,
        offer_duration_seasons: 1,
      }

      const { error } = await supabase.from('rider_free_agent_negotiations').insert(insertPayload)

      if (error) throw error

      await reloadRiders(clubId)
      setPageMessage('Free-agent contract negotiation opened.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open free-agent negotiation.'
      setPageMessage(message)
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleAcceptOffer(offerId: string) {
    if (!clubId) return

    try {
      setRiderActionLoading(true)
      setPageMessage(null)

      const { error } = await supabase.rpc('accept_rider_transfer_offer', {
        p_offer_id: offerId,
      })

      if (error) throw error

      await reloadRiders(clubId)
      setPageMessage('Club terms accepted. Rider negotiation opened.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to accept offer.'
      setPageMessage(message)
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleRejectOffer(offerId: string) {
    if (!clubId) return

    try {
      setRiderActionLoading(true)
      setPageMessage(null)

      const { error } = await supabase.rpc('reject_rider_transfer_offer', {
        p_offer_id: offerId,
      })

      if (error) throw error

      await reloadRiders(clubId)
      setPageMessage('Offer rejected.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject offer.'
      setPageMessage(message)
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleWithdrawSentOffer(offerId: string) {
    if (!clubId) return

    try {
      setRiderActionLoading(true)
      setPageMessage(null)

      const { error } = await supabase.rpc('withdraw_rider_transfer_offer', {
        p_offer_id: offerId,
      })

      if (error) throw error

      await reloadRiders(clubId)
      setPageMessage('Offer cancelled.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel offer.'
      setPageMessage(message)
    } finally {
      setRiderActionLoading(false)
    }
  }

  const pageStart =
    sortedCandidates.length === 0 ? 0 : (currentPage - 1) * CANDIDATES_PER_PAGE + 1
  const pageEnd = Math.min(currentPage * CANDIDATES_PER_PAGE, sortedCandidates.length)

  const marketPageStart =
    activeMarketRowCount === 0 ? 0 : (marketPage - 1) * RIDERS_PER_PAGE + 1
  const marketPageEnd = Math.min(marketPage * RIDERS_PER_PAGE, activeMarketRowCount)

  if (loading) {
    return (
      <div className="w-full">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Transfers</h2>
            <p className="mt-1 text-sm text-gray-500">
              Riders and staff market, shortlist and negotiations.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow">
          Loading transfers...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Transfers</h2>
            <p className="mt-1 text-sm text-gray-500">
              Riders and staff market, shortlist and negotiations.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Transfers</h2>
          <p className="mt-1 text-sm text-gray-500">
            Riders and staff market, shortlist and negotiations.
          </p>

          {activeTab === 'riders' ? (
            <div
              className="mt-4 border-b border-gray-200"
              aria-label={clubName ? `Rider market tabs for ${clubName}` : 'Rider market tabs'}
            >
              <div className="flex items-center gap-8">
                <UnderlineSubTabButton
                  active={riderMarketSubTab === 'transfer_list'}
                  label="Transfer List"
                  onClick={() => setRiderMarketSubTab('transfer_list')}
                />
                <UnderlineSubTabButton
                  active={riderMarketSubTab === 'free_agents'}
                  label="Free Agents"
                  onClick={() => setRiderMarketSubTab('free_agents')}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
          <SegmentedTabButton
            active={activeTab === 'riders'}
            label="Riders"
            onClick={() => setActiveTab('riders')}
          />
          <SegmentedTabButton
            active={activeTab === 'staff'}
            label="Staff"
            onClick={() => setActiveTab('staff')}
          />
        </div>
      </div>

      {pageMessage ? (
        <div className="mb-5 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          {pageMessage}
        </div>
      ) : null}

      {activeTab === 'riders' ? (
        riderMarketSubTab === 'transfer_list' ? (
          <RiderTransferListPage
            riderLoading={riderLoading}
            gameState={gameState}
            marketSearch={marketSearch}
            setMarketSearch={setMarketSearch}
            marketRoleFilter={marketRoleFilter}
            setMarketRoleFilter={setMarketRoleFilter}
            riderRoleOptions={riderRoleOptions}
            marketSort={marketSort}
            setMarketSort={setMarketSort}
            marketOnlyActive={marketOnlyActive}
            setMarketOnlyActive={setMarketOnlyActive}
            marketHideOwn={marketHideOwn}
            setMarketHideOwn={setMarketHideOwn}
            paginatedUnifiedMarketRows={paginatedTransferMarketRows}
            selectedMarketListingId={selectedMarketListingId}
            onSelectMarketItem={(item) => {
              setSelectedMarketListingId(item.listing_id)
              openRiderProfilePage(item.rider_id, item.is_own_item)
            }}
            onQuickActionMarketItem={(item) => {
              if (item.is_own_item || item.is_user_active) return
              openOfferModal(item.raw)
            }}
            marketPageStart={marketPageStart}
            marketPageEnd={marketPageEnd}
            totalMarketRows={transferMarketRows.length}
            marketPage={marketPage}
            marketTotalPages={marketTotalPages}
            onPrevMarketPage={() => setMarketPage((prev) => Math.max(1, prev - 1))}
            onNextMarketPage={() => setMarketPage((prev) => Math.min(marketTotalPages, prev + 1))}
            riderActionLoading={riderActionLoading}
            myReceivedOffers={myReceivedOffers}
            clubNameMap={clubNameMap}
            onRejectOffer={(offerId) => {
              void handleRejectOffer(offerId)
            }}
            onAcceptOffer={(offerId) => {
              void handleAcceptOffer(offerId)
            }}
            onWithdrawSentOffer={(offerId) => {
              void handleWithdrawSentOffer(offerId)
            }}
            onOpenTeamPage={(targetClubId) => {
              openClubProfilePage(targetClubId)
            }}
            onOpenRiderProfile={(riderId, isOwnedByUser) => {
              openRiderProfilePage(riderId, isOwnedByUser)
            }}
            mySentOffers={mySentOffersDashboard}
            mySellerNegotiations={mySellerNegotiations}
            transferHistory={transferHistory}
          />
        ) : (
          <RiderFreeAgentsPage
            riderLoading={riderLoading}
            gameState={gameState}
            marketSearch={marketSearch}
            setMarketSearch={setMarketSearch}
            marketRoleFilter={marketRoleFilter}
            setMarketRoleFilter={setMarketRoleFilter}
            riderRoleOptions={riderRoleOptions}
            marketSort={marketSort}
            setMarketSort={setMarketSort}
            marketOnlyActive={marketOnlyActive}
            setMarketOnlyActive={setMarketOnlyActive}
            paginatedUnifiedMarketRows={paginatedFreeAgentMarketRows}
            selectedFreeAgentId={selectedFreeAgentId}
            onSelectMarketItem={(item) => {
              setSelectedFreeAgentId(item.free_agent_id)
            }}
            onQuickActionMarketItem={(item) => {
              setSelectedFreeAgentId(item.free_agent_id)
              void handleStartFreeAgentNegotiation(item.raw)
            }}
            onOpenRiderProfile={(item) => {
              openRiderProfilePage(item.rider_id)
            }}
            marketPageStart={marketPageStart}
            marketPageEnd={marketPageEnd}
            totalMarketRows={freeAgentMarketRows.length}
            marketPage={marketPage}
            marketTotalPages={marketTotalPages}
            onPrevMarketPage={() => setMarketPage((prev) => Math.max(1, prev - 1))}
            onNextMarketPage={() => setMarketPage((prev) => Math.min(marketTotalPages, prev + 1))}
            selectedFreeAgent={selectedFreeAgent}
            riderActionLoading={riderActionLoading}
            onStartFreeAgentNegotiation={(agent) => {
              void handleStartFreeAgentNegotiation(agent)
            }}
            myFreeAgentNegotiations={myFreeAgentNegotiations}
            transferHistory={transferHistory}
          />
        )
      ) : (
        <StaffFreeAgentPage
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          sortField={sortField}
          setSortField={setSortField}
          sortDirection={sortDirection}
          setSortDirection={setSortDirection}
          paginatedCandidates={paginatedCandidates}
          selectedCandidateId={selectedCandidateId}
          onSelectCandidate={setSelectedCandidateId}
          occupiedRoleMap={occupiedRoleMap}
          pageStart={pageStart}
          pageEnd={pageEnd}
          totalCandidates={sortedCandidates.length}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          onNextPage={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
          selectedCandidate={selectedCandidate}
          hireLoading={hireLoading}
          onHireCandidate={() => {
            void handleHireCandidate()
          }}
        />
      )}

      {offerModalListing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Make Transfer Offer</h3>

            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <div>
                <span className="font-semibold text-gray-900">Rider:</span>{' '}
                {offerModalListing.full_name || offerModalListing.display_name || 'Unknown rider'}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Seller:</span>{' '}
                {clubNameMap[offerModalListing.seller_club_id] ||
                  offerModalListing.seller_club_name ||
                  'Unknown club'}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Asking price:</span>{' '}
                {formatTransferAmount(offerModalListing.asking_price)}
              </div>
            </div>

            {offerModalMessage ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {offerModalMessage}
              </div>
            ) : null}

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Your Offer
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={offerDraftPrice}
                onChange={(e) => setOfferDraftPrice(formatCurrencyInput(e.target.value))}
                placeholder="$128,000"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOfferModalListing(null)
                  setOfferDraftPrice('')
                  setOfferModalMessage(null)
                }}
                className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={riderActionLoading}
                onClick={async () => {
                  if (!offerModalListing) return

                  const parsed = parseCurrencyInput(offerDraftPrice)
                  if (!parsed) {
                    const msg = 'Please enter a valid offer amount.'
                    setOfferModalMessage(msg)
                    setPageMessage(msg)
                    return
                  }

                  const ok = await handleSubmitOffer(offerModalListing, parsed)

                  if (ok) {
                    setOfferModalListing(null)
                    setOfferDraftPrice('')
                    setOfferModalMessage(null)
                  }
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  riderActionLoading
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'bg-yellow-400 text-black hover:bg-yellow-300'
                }`}
              >
                {riderActionLoading ? 'Submitting...' : 'Submit Offer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}