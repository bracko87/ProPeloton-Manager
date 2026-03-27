/**
 * src/pages/dashboard/Transfers.tsx
 *
 * Transfers page
 *
 * Riders tab now supports:
 * - list own rider for transfer
 * - browse transfer market
 * - submit transfer offer
 * - seller accept/reject open offers
 * - buyer contract negotiation after club acceptance
 *
 * Staff tab kept from your previous version.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import RiderProfileModal from '../../components/riders/RiderProfileModal'

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

type RiderPopupRow = {
  id: string
  display_name: string
  country_code: string | null
  role: string
  overall: number | null
  potential: number | null
  sprint: number | null
  climbing: number | null
  time_trial: number | null
  endurance: number | null
  flat: number | null
  recovery: number | null
  resistance: number | null
  race_iq: number | null
  teamwork: number | null
  morale: number | null
  birth_date: string | null
  market_value: number | null
  salary: number | null
  contract_expires_season: number | null
  availability_status: string | null
  fatigue: number | null
  image_url: string | null
  club_id: string | null
  club_name: string | null
  club_country_code: string | null
  club_tier: string | null
  club_is_ai: boolean | null
  club_is_active: boolean | null
  age_years: number | null
  season_points_overall: number
  season_points_sprint: number
  season_points_climbing: number
}

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

const CANDIDATES_PER_PAGE = 10

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
      className={`px-4 py-2 rounded-md text-sm font-medium transition ${
        active
          ? 'bg-yellow-400 text-black'
          : 'text-gray-600 hover:bg-gray-100'
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

function CompactMarketRow({
  title,
  subtitle,
  value,
  countryCode,
  onClick,
}: {
  title: string
  subtitle: string
  value?: string
  countryCode?: string | null
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-gray-100 bg-white px-3 py-3 text-left transition hover:border-gray-200 hover:bg-gray-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {countryCode ? (
              <img
                src={getCountryFlagUrl(safeCountryCode(countryCode))}
                alt={getCountryName(countryCode)}
                className="h-4 w-6 rounded-sm border border-gray-200 object-cover shrink-0"
              />
            ) : null}

            <div className="truncate text-sm font-semibold text-gray-900">
              {title}
            </div>
          </div>

          <div className="mt-1 truncate text-xs text-gray-500">{subtitle}</div>
        </div>

        {value ? (
          <div className="shrink-0 text-sm font-semibold text-gray-700">{value}</div>
        ) : null}
      </div>
    </button>
  )
}

export default function TransfersPage() {
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
  const [ownRiders, setOwnRiders] = useState<OwnedRiderRow[]>([])
  const [marketListings, setMarketListings] = useState<MarketListingRow[]>([])
  const [myListings, setMyListings] = useState<TransferListingRow[]>([])
  const [transferOffers, setTransferOffers] = useState<TransferOfferRow[]>([])
  const [transferNegotiations, setTransferNegotiations] = useState<TransferNegotiationRow[]>([])
  const [freeAgents, setFreeAgents] = useState<FreeAgentMarketRow[]>([])
  const [freeAgentNegotiations, setFreeAgentNegotiations] = useState<
    FreeAgentNegotiationRow[]
  >([])

  const [selectedOwnedRiderId, setSelectedOwnedRiderId] = useState<string | null>(null)
  const [selectedMarketListingId, setSelectedMarketListingId] = useState<string | null>(null)

  const [listAskingPrice, setListAskingPrice] = useState('')
  const [listDurationDays, setListDurationDays] = useState('7')
  const [offerPrice, setOfferPrice] = useState('')

  const [riderActionLoading, setRiderActionLoading] = useState(false)

  const [negotiationDrafts, setNegotiationDrafts] = useState<
    Record<string, { salary: string; duration: string }>
  >({})

  const [selectedPopupRider, setSelectedPopupRider] = useState<RiderPopupRow | null>(null)
  const [isRiderPopupOpen, setIsRiderPopupOpen] = useState(false)
  const [isRiderScouted, setIsRiderScouted] = useState(false)
  const [showRiderHistory, setShowRiderHistory] = useState(false)

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
        const message =
          err instanceof Error ? err.message : 'Failed to load transfers page.'
        if (!mounted) return
        setError(message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadTransfersPage()

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

    const { data, error } = await supabase
      .from('clubs')
      .select('id, name')
      .in('id', uniqueIds)

    if (error) throw error

    const result: Record<string, string> = {}
    for (const row of data || []) {
      result[row.id] = row.name || row.id
    }
    return result
  }

  async function openRiderPopup(riderId: string) {
    try {
      setPageMessage(null)

      const { data, error } = await supabase
        .from('rider_statistics_view')
        .select('*')
        .eq('rider_id', riderId)
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('Rider profile not found.')

      const row = data as Record<string, any>

      const popupRow: RiderPopupRow = {
        id: row.rider_id ?? row.id,
        display_name: row.display_name ?? 'Unknown rider',
        country_code: row.country_code ?? null,
        role: row.role ?? '',
        overall: row.overall ?? null,
        potential: row.potential ?? null,
        sprint: row.sprint ?? null,
        climbing: row.climbing ?? null,
        time_trial: row.time_trial ?? null,
        endurance: row.endurance ?? null,
        flat: row.flat ?? null,
        recovery: row.recovery ?? null,
        resistance: row.resistance ?? null,
        race_iq: row.race_iq ?? null,
        teamwork: row.teamwork ?? null,
        morale: row.morale ?? null,
        birth_date: row.birth_date ?? null,
        market_value: row.market_value ?? null,
        salary: row.salary ?? null,
        contract_expires_season: row.contract_expires_season ?? null,
        availability_status: row.availability_status ?? null,
        fatigue: row.fatigue ?? null,
        image_url: row.image_url ?? null,
        club_id: row.club_id ?? null,
        club_name: row.club_name ?? null,
        club_country_code: row.club_country_code ?? null,
        club_tier: row.club_tier ?? null,
        club_is_ai: row.club_is_ai ?? null,
        club_is_active: row.club_is_active ?? null,
        age_years: row.age_years ?? null,
        season_points_overall: row.season_points_overall ?? 0,
        season_points_sprint: row.season_points_sprint ?? 0,
        season_points_climbing: row.season_points_climbing ?? 0,
      }

      setSelectedPopupRider(popupRow)
      setIsRiderScouted(false)
      setShowRiderHistory(false)
      setIsRiderPopupOpen(true)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to open rider profile.'
      setPageMessage(message)
    }
  }

  async function loadRiderData(clubIdValue: string, mounted = true) {
    setRiderLoading(true)

    try {
      const [
        marketResult,
        ownRidersResult,
        myListingsResult,
        offersResult,
        negotiationsResult,
        freeAgentsResult,
        freeAgentNegotiationsResult,
      ] = await Promise.all([
        supabase.rpc('get_transfer_market_listings', {
          p_page: 1,
          p_page_size: 100,
        }),
        supabase
          .from('rider_statistics_view')
          .select(`
            rider_id,
            display_name,
            role,
            age_years,
            overall,
            potential,
            market_value,
            salary,
            contract_expires_at,
            availability_status
          `)
          .eq('club_id', clubIdValue)
          .order('overall', { ascending: false }),
        supabase
          .from('rider_transfer_listings')
          .select(`
            id,
            rider_id,
            seller_club_id,
            asking_price,
            min_allowed_price,
            max_allowed_price,
            listed_on_game_date,
            expires_on_game_date,
            status,
            auto_price_clamped,
            created_at,
            updated_at
          `)
          .eq('seller_club_id', clubIdValue)
          .order('created_at', { ascending: false }),
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
          .order('created_at', { ascending: false }),
        supabase
          .from('rider_free_agents')
          .select(`
            id,
            rider_id,
            source_type,
            source_club_id,
            desired_tier,
            expected_salary_weekly,
            min_acceptable_salary_weekly,
            preferred_duration_seasons,
            available_from_game_date,
            expires_on_game_date,
            status,
            rider:riders!rider_free_agents_rider_id_fkey(
              id,
              display_name,
              country_code,
              role,
              overall,
              potential,
              market_value,
              salary,
              contract_expires_at,
              availability_status
            ),
            source_club:clubs!rider_free_agents_source_club_id_fkey(
              id,
              name
            )
          `)
          .eq('status', 'available')
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
              potential
            )
          `)
          .order('created_at', { ascending: false }),
      ])

      if (marketResult.error) throw marketResult.error
      if (ownRidersResult.error) throw ownRidersResult.error
      if (myListingsResult.error) throw myListingsResult.error
      if (offersResult.error) throw offersResult.error
      if (negotiationsResult.error) throw negotiationsResult.error
      if (freeAgentsResult.error) throw freeAgentsResult.error
      if (freeAgentNegotiationsResult.error) throw freeAgentNegotiationsResult.error

      const market = (marketResult.data || []) as MarketListingRow[]
      const own = (ownRidersResult.data || []) as OwnedRiderRow[]
      const listings = (myListingsResult.data || []) as TransferListingRow[]
      const offers = (offersResult.data || []) as TransferOfferRow[]
      const negotiations = (negotiationsResult.data || []) as TransferNegotiationRow[]
      const freeAgentsRows = (freeAgentsResult.data || []) as FreeAgentMarketRow[]
      const freeAgentNegotiationRows =
        (freeAgentNegotiationsResult.data || []) as FreeAgentNegotiationRow[]

      const clubIds = [
        clubIdValue,
        ...market.map((row) => row.seller_club_id),
        ...listings.map((row) => row.seller_club_id),
        ...offers.flatMap((row) => [row.seller_club_id, row.buyer_club_id]),
        ...negotiations.flatMap((row) => [row.seller_club_id, row.buyer_club_id]),
        ...freeAgentsRows
          .map((row) => row.source_club?.id || row.source_club_id)
          .filter(Boolean) as string[],
        ...freeAgentNegotiationRows.map((row) => row.club_id),
      ]

      const names = await fetchClubNameMap(clubIds)

      if (!mounted) return

      setMarketListings(market)
      setOwnRiders(own)
      setMyListings(listings)
      setTransferOffers(offers)
      setTransferNegotiations(negotiations)
      setFreeAgents(freeAgentsRows)
      setFreeAgentNegotiations(freeAgentNegotiationRows)
      setClubNameMap(names)

      if (!selectedOwnedRiderId && own.length) {
        setSelectedOwnedRiderId(own[0].rider_id)
        setListAskingPrice(String(Math.round(own[0].market_value || 0)))
      }

      if (!selectedMarketListingId && market.length) {
        setSelectedMarketListingId(market[0].listing_id)
        setOfferPrice(String(market[0].asking_price))
      }
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
    () =>
      paginatedCandidates.find((candidate) => candidate.id === selectedCandidateId) || null,
    [paginatedCandidates, selectedCandidateId]
  )

  const occupiedRoleMap = useMemo(() => {
    const map = new Map<StaffRole, ClubStaffRow>()
    for (const row of clubStaff) {
      map.set(row.role_type, row)
    }
    return map
  }, [clubStaff])

  const selectedOwnedRider = useMemo(
    () => ownRiders.find((rider) => rider.rider_id === selectedOwnedRiderId) || null,
    [ownRiders, selectedOwnedRiderId]
  )

  const selectedMarketListing = useMemo(
    () => marketListings.find((listing) => listing.listing_id === selectedMarketListingId) || null,
    [marketListings, selectedMarketListingId]
  )

  useEffect(() => {
    if (selectedOwnedRider) {
      setListAskingPrice(String(Math.round(selectedOwnedRider.market_value || 0)))
    }
  }, [selectedOwnedRiderId, selectedOwnedRider])

  useEffect(() => {
    if (selectedMarketListing) {
      setOfferPrice(String(selectedMarketListing.asking_price))
    }
  }, [selectedMarketListingId, selectedMarketListing])

  const myReceivedOffers = useMemo(() => {
    if (!clubId) return []
    return transferOffers.filter((offer) => offer.seller_club_id === clubId)
  }, [transferOffers, clubId])

  const mySentOffers = useMemo(() => {
    if (!clubId) return []
    return transferOffers.filter((offer) => offer.buyer_club_id === clubId)
  }, [transferOffers, clubId])

  const myBuyerNegotiations = useMemo(() => {
    if (!clubId) return []
    return transferNegotiations.filter((negotiation) => negotiation.buyer_club_id === clubId)
  }, [transferNegotiations, clubId])

  const mySellerNegotiations = useMemo(() => {
    if (!clubId) return []
    return transferNegotiations.filter((negotiation) => negotiation.seller_club_id === clubId)
  }, [transferNegotiations, clubId])

  function getNegotiationDraft(negotiation: TransferNegotiationRow) {
    return (
      negotiationDrafts[negotiation.id] || {
        salary: String(
          negotiation.offer_salary_weekly ||
            negotiation.expected_salary_weekly ||
            negotiation.min_acceptable_salary_weekly
        ),
        duration: String(
          negotiation.offer_duration_seasons || negotiation.preferred_duration_seasons || 1
        ),
      }
    )
  }

  function updateNegotiationDraft(
    negotiationId: string,
    patch: Partial<{ salary: string; duration: string }>
  ) {
    setNegotiationDrafts((prev) => {
      const currentNegotiation = transferNegotiations.find((neg) => neg.id === negotiationId)

      if (!currentNegotiation) {
        return prev
      }

      return {
        ...prev,
        [negotiationId]: {
          ...getNegotiationDraft(currentNegotiation),
          ...prev[negotiationId],
          ...patch,
        },
      }
    })
  }

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
      const message =
        err instanceof Error ? err.message : 'Failed to hire staff candidate.'
      setPageMessage(message)
    } finally {
      setHireLoading(false)
    }
  }

  async function handleListRider() {
    if (!selectedOwnedRider || !clubId) return

    try {
      setRiderActionLoading(true)
      setPageMessage(null)

      const askingPrice = Number(listAskingPrice)
      const durationDays = Number(listDurationDays || 7)

      const { error } = await supabase.rpc('list_rider_for_transfer', {
        p_rider_id: selectedOwnedRider.rider_id,
        p_asking_price: Number.isFinite(askingPrice) ? askingPrice : null,
        p_duration_days: Number.isFinite(durationDays) ? durationDays : 7,
      })

      if (error) throw error

      await reloadRiders(clubId)
      setPageMessage(`${selectedOwnedRider.display_name} has been listed for transfer.`)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to list rider for transfer.'
      setPageMessage(message)
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleCancelListing(listingId: string) {
    if (!clubId) return

    try {
      setRiderActionLoading(true)
      setPageMessage(null)

      const { error } = await supabase.rpc('cancel_rider_transfer_listing', {
        p_listing_id: listingId,
      })

      if (error) throw error

      await reloadRiders(clubId)
      setPageMessage('Transfer listing cancelled.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to cancel transfer listing.'
      setPageMessage(message)
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleSubmitOffer() {
    if (!selectedMarketListing || !clubId) return

    try {
      setRiderActionLoading(true)
      setPageMessage(null)

      const offeredPrice = Number(offerPrice)
      if (!Number.isFinite(offeredPrice) || offeredPrice <= 0) {
        throw new Error('Please enter a valid offer amount.')
      }

      const { error } = await supabase.rpc('submit_rider_transfer_offer', {
        p_listing_id: selectedMarketListing.listing_id,
        p_buyer_club_id: clubId,
        p_offered_price: offeredPrice,
      })

      if (error) throw error

      await reloadRiders(clubId)
      setPageMessage('Transfer offer submitted.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to submit transfer offer.'
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
      const message =
        err instanceof Error ? err.message : 'Failed to accept offer.'
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
      const message =
        err instanceof Error ? err.message : 'Failed to reject offer.'
      setPageMessage(message)
    } finally {
      setRiderActionLoading(false)
    }
  }

  async function handleSubmitNegotiation(negotiation: TransferNegotiationRow) {
    if (!clubId) return

    const draft = getNegotiationDraft(negotiation)

    try {
      setRiderActionLoading(true)
      setPageMessage(null)

      const salary = Number(draft.salary)
      const duration = Number(draft.duration)

      if (!Number.isFinite(salary) || salary <= 0) {
        throw new Error('Please enter a valid salary offer.')
      }

      if (!Number.isFinite(duration) || duration < 1) {
        throw new Error('Please enter a valid contract duration.')
      }

      const { error } = await supabase.rpc('submit_rider_transfer_contract_offer', {
        p_negotiation_id: negotiation.id,
        p_offer_salary_weekly: salary,
        p_offer_duration_seasons: duration,
      })

      if (error) throw error

      await reloadRiders(clubId)
      setPageMessage('Rider contract offer submitted.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to submit rider contract offer.'
      setPageMessage(message)
    } finally {
      setRiderActionLoading(false)
    }
  }

  const pageStart =
    sortedCandidates.length === 0 ? 0 : (currentPage - 1) * CANDIDATES_PER_PAGE + 1
  const pageEnd = Math.min(currentPage * CANDIDATES_PER_PAGE, sortedCandidates.length)

  if (loading) {
    return (
      <div className="w-full">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Transfers</h2>
            <p className="text-sm text-gray-500 mt-1">
              Riders and staff market, shortlist and negotiations.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow border border-gray-100 text-sm text-gray-500">
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
            <p className="text-sm text-gray-500 mt-1">
              Riders and staff market, shortlist and negotiations.
            </p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
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
          <p className="text-sm text-gray-500 mt-1">
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

        <div className="inline-flex rounded-lg bg-white border border-gray-100 p-1 shadow-sm">
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
        <div className="mb-5 rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800 border border-yellow-200">
          {pageMessage}
        </div>
      ) : null}

      {activeTab === 'riders' ? (
        <div className="space-y-4">
          {riderMarketSubTab === 'transfer_list' ? (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                <div className="bg-white rounded-lg p-4 shadow border border-gray-100 h-[640px] flex flex-col">
                  <h4 className="font-semibold text-gray-900">Transfer List Riders</h4>
                  <div className="mt-1 text-sm text-gray-500">
                    Listed riders on the market. Click any row to open the rider popup.
                  </div>

                  <div className="mt-4 space-y-2 flex-1 overflow-auto pr-1">
                    {riderLoading ? (
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                        Loading transfer market...
                      </div>
                    ) : marketListings.length === 0 ? (
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                        No active transfer listings.
                      </div>
                    ) : (
                      marketListings.map((listing) => (
                        <CompactMarketRow
                          key={listing.listing_id}
                          title={listing.display_name}
                          subtitle={`${listing.role || '—'} • OVR ${listing.overall ?? '—'} • Seller: ${
                            listing.seller_club_name ||
                            clubNameMap[listing.seller_club_id] ||
                            'Unknown club'
                          }`}
                          value={formatCurrency(listing.asking_price)}
                          countryCode={listing.country_code}
                          onClick={() => {
                            setSelectedMarketListingId(listing.listing_id)
                            setOfferPrice(String(listing.asking_price))
                            openRiderPopup(listing.rider_id)
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow border border-gray-100 h-[640px] flex flex-col">
                  <h4 className="font-semibold text-gray-900">Transfer Offers</h4>
                  <div className="mt-1 text-sm text-gray-500">
                    Seller and buyer offer activity. Click any row to open the rider popup.
                  </div>

                  <div className="mt-4 space-y-2 flex-1 overflow-auto pr-1">
                    {riderLoading ? (
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                        Loading offers...
                      </div>
                    ) : [...myReceivedOffers, ...mySentOffers].length === 0 ? (
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                        No transfer offers visible yet.
                      </div>
                    ) : (
                      [...myReceivedOffers, ...mySentOffers].map((offer) => {
                        const isReceived = offer.seller_club_id === clubId
                        const counterpartyName = isReceived
                          ? clubNameMap[offer.buyer_club_id] || 'Buyer club'
                          : clubNameMap[offer.seller_club_id] || 'Seller club'

                        return (
                          <CompactMarketRow
                            key={offer.id}
                            title={`${counterpartyName} • ${offer.status}`}
                            subtitle={`${isReceived ? 'Received' : 'Sent'} • Rider ${
                              offer.rider_id
                            }${
                              offer.auto_block_reason ? ` • ${offer.auto_block_reason}` : ''
                            }`}
                            value={formatCurrency(offer.offered_price)}
                            onClick={() => openRiderPopup(offer.rider_id)}
                          />
                        )
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-4 w-full">
                <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
                  <h4 className="font-semibold text-gray-900">List My Rider</h4>

                  <div className="mt-4 space-y-2 max-h-[280px] overflow-auto pr-1">
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
                            onClick={() => setSelectedOwnedRiderId(rider.rider_id)}
                            className={`w-full rounded-lg p-3 border text-left transition ${
                              selected
                                ? 'border-yellow-300 bg-yellow-50'
                                : 'border-gray-100 bg-white hover:border-gray-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900">
                                  {rider.display_name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {rider.role || '—'} • OVR {rider.overall ?? '—'} • POT{' '}
                                  {rider.potential ?? '—'}
                                </div>
                              </div>
                              <div className="text-sm font-semibold text-gray-700 shrink-0">
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

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          onClick={handleListRider}
                          disabled={riderActionLoading}
                          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                            riderActionLoading
                              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                              : 'bg-yellow-400 hover:bg-yellow-300 text-black'
                          }`}
                        >
                          {riderActionLoading ? 'Processing...' : 'List Rider'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
                  <h4 className="font-semibold text-gray-900">Selected Listing</h4>

                  {!selectedMarketListing ? (
                    <div className="mt-3 text-sm text-gray-500">
                      Select a listed rider from the Transfer List box above.
                    </div>
                  ) : (
                    <>
                      <div className="mt-3">
                        <div className="font-semibold text-gray-900">
                          {selectedMarketListing.display_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {selectedMarketListing.role || '—'} • Age{' '}
                          {selectedMarketListing.age_years ?? '—'} • OVR{' '}
                          {selectedMarketListing.overall ?? '—'} • POT{' '}
                          {selectedMarketListing.potential ?? '—'}
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
                              Listing expires{' '}
                              {formatDate(selectedMarketListing.expires_on_game_date)}
                            </div>

                            <button
                              type="button"
                              onClick={handleSubmitOffer}
                              disabled={riderActionLoading}
                              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                riderActionLoading
                                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                  : 'bg-yellow-400 hover:bg-yellow-300 text-black'
                              }`}
                            >
                              {riderActionLoading ? 'Processing...' : 'Submit Offer'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
                  <h4 className="font-semibold text-gray-900">My Listings</h4>
                  <div className="mt-3 space-y-2">
                    {myListings.length === 0 ? (
                      <div className="text-sm text-gray-500">
                        No transfer listings created by your club yet.
                      </div>
                    ) : (
                      myListings.map((listing) => (
                        <div
                          key={listing.id}
                          className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900">
                                Rider ID: {listing.rider_id}
                              </div>
                              <div className="text-xs text-gray-500">
                                Status: {listing.status} • Asking:{' '}
                                {formatCurrency(listing.asking_price)} • Expires{' '}
                                {formatDate(listing.expires_on_game_date)}
                              </div>
                            </div>

                            {listing.status === 'listed' ? (
                              <button
                                type="button"
                                onClick={() => handleCancelListing(listing.id)}
                                disabled={riderActionLoading}
                                className="px-3 py-2 rounded-md text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
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

                <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
                  <h4 className="font-semibold text-gray-900">Offers Received</h4>
                  <div className="mt-3 space-y-2">
                    {myReceivedOffers.length === 0 ? (
                      <div className="text-sm text-gray-500">No visible incoming offers.</div>
                    ) : (
                      myReceivedOffers.map((offer) => (
                        <div
                          key={offer.id}
                          className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900">
                                {clubNameMap[offer.buyer_club_id] || offer.buyer_club_id}
                              </div>
                              <div className="text-xs text-gray-500">
                                Offer {formatCurrency(offer.offered_price)} • Status{' '}
                                {offer.status}
                              </div>
                              <div className="text-[11px] text-gray-400">
                                Expires {formatDate(offer.expires_on_game_date)}
                                {offer.auto_block_reason
                                  ? ` • ${offer.auto_block_reason}`
                                  : ''}
                              </div>
                            </div>

                            {offer.status === 'open' ? (
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleRejectOffer(offer.id)}
                                  disabled={riderActionLoading}
                                  className="px-3 py-2 rounded-md text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAcceptOffer(offer.id)}
                                  disabled={riderActionLoading}
                                  className="px-3 py-2 rounded-md text-sm font-medium bg-yellow-400 hover:bg-yellow-300 text-black"
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

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
                  <h4 className="font-semibold text-gray-900">My Sent Offers</h4>
                  <div className="mt-3 space-y-2">
                    {mySentOffers.length === 0 ? (
                      <div className="text-sm text-gray-500">No visible outgoing offers.</div>
                    ) : (
                      mySentOffers.map((offer) => (
                        <div
                          key={offer.id}
                          className="rounded-lg border border-gray-100 bg-gray-50 p-3"
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

                <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
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
                            className="rounded-lg border border-gray-100 bg-gray-50 p-3"
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
                                  Preferred duration{' '}
                                  {negotiation.preferred_duration_seasons} season(s) • Expires{' '}
                                  {formatDate(negotiation.expires_on_game_date)}
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                {negotiation.locked_until
                                  ? ` • Locked until ${negotiation.locked_until}`
                                  : ''}
                                {negotiation.closed_reason
                                  ? ` • ${negotiation.closed_reason}`
                                  : ''}
                              </div>

                              {isOpen ? (
                                <button
                                  type="button"
                                  onClick={() => handleSubmitNegotiation(negotiation)}
                                  disabled={riderActionLoading}
                                  className="px-4 py-2 rounded-md text-sm font-medium bg-yellow-400 hover:bg-yellow-300 text-black"
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

              <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
                <h4 className="font-semibold text-gray-900">Seller Negotiations</h4>
                <div className="mt-3 space-y-2">
                  {mySellerNegotiations.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      No rider negotiations involving your selling club yet.
                    </div>
                  ) : (
                    mySellerNegotiations.map((negotiation) => (
                      <div
                        key={negotiation.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
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
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                <div className="bg-white rounded-lg p-4 shadow border border-gray-100 h-[640px] flex flex-col">
                  <h4 className="font-semibold text-gray-900">Free Agents</h4>
                  <div className="mt-1 text-sm text-gray-500">
                    Available free agents. Click any row to open the rider popup.
                  </div>

                  <div className="mt-4 space-y-2 flex-1 overflow-auto pr-1">
                    {riderLoading ? (
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                        Loading free agents...
                      </div>
                    ) : freeAgents.length === 0 ? (
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                        No available free agents right now.
                      </div>
                    ) : (
                      freeAgents.map((agent) => (
                        <CompactMarketRow
                          key={agent.id}
                          title={agent.rider?.display_name || 'Unknown rider'}
                          subtitle={`${agent.rider?.role || '—'} • OVR ${
                            agent.rider?.overall ?? '—'
                          } • Desired tier ${agent.desired_tier}`}
                          value={formatCurrency(agent.expected_salary_weekly)}
                          countryCode={agent.rider?.country_code}
                          onClick={() => openRiderPopup(agent.rider_id)}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow border border-gray-100 h-[640px] flex flex-col">
                  <h4 className="font-semibold text-gray-900">Free Agent Negotiations</h4>
                  <div className="mt-1 text-sm text-gray-500">
                    Your visible free-agent negotiations. Click any row to open the rider popup.
                  </div>

                  <div className="mt-4 space-y-2 flex-1 overflow-auto pr-1">
                    {riderLoading ? (
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                        Loading negotiations...
                      </div>
                    ) : freeAgentNegotiations.length === 0 ? (
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                        No free-agent negotiations yet.
                      </div>
                    ) : (
                      freeAgentNegotiations.map((negotiation) => (
                        <CompactMarketRow
                          key={negotiation.id}
                          title={negotiation.rider?.display_name || 'Unknown rider'}
                          subtitle={`Status ${negotiation.status} • Expected ${formatCurrency(
                            negotiation.expected_salary_weekly
                          )} • Min ${formatCurrency(
                            negotiation.min_acceptable_salary_weekly
                          )}`}
                          value={
                            negotiation.offer_salary_weekly
                              ? formatCurrency(negotiation.offer_salary_weekly)
                              : `${negotiation.preferred_duration_seasons}y`
                          }
                          countryCode={negotiation.rider?.country_code}
                          onClick={() => openRiderPopup(negotiation.rider_id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4 w-full">
          <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">Available Staff</h4>
                <div className="mt-1 text-sm text-gray-500">
                  Browse available staff candidates and hire directly into vacant roles.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Role Filter
                  </label>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as 'all' | StaffRole)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  >
                    <option value="all">All Roles</option>
                    <option value="head_coach">Head Coach</option>
                    <option value="team_doctor">Team Doctor</option>
                    <option value="mechanic">Mechanic</option>
                    <option value="sport_director">Sport Director</option>
                    <option value="scout_analyst">Scout / Analyst</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Sort By
                  </label>
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as StaffSortField)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  >
                    <option value="salary">Salary</option>
                    <option value="skills">Skills</option>
                    <option value="name">Name</option>
                    <option value="country">Country</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Direction
                  </label>
                  <select
                    value={sortDirection}
                    onChange={(e) => setSortDirection(e.target.value as SortDirection)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {paginatedCandidates.length === 0 ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                  No available staff candidates found.
                </div>
              ) : (
                paginatedCandidates.map((candidate) => {
                  const occupiedRole = occupiedRoleMap.get(candidate.role_type)
                  const selected = candidate.id === selectedCandidateId

                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setSelectedCandidateId(candidate.id)}
                      className={`w-full rounded-lg p-4 shadow border text-left transition ${
                        selected
                          ? 'border-yellow-300 bg-yellow-50'
                          : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <img
                              src={getCountryFlagUrl(safeCountryCode(candidate.country_code))}
                              alt={getCountryName(candidate.country_code)}
                              className="h-4 w-6 rounded-sm border border-gray-200 object-cover shrink-0"
                            />
                            <div className="text-sm font-semibold text-gray-900">
                              {candidate.staff_name}
                            </div>
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {roleLabel(candidate.role_type)}
                            {candidate.specialization ? ` • ${candidate.specialization}` : ''}
                          </div>
                        </div>

                        <div className="text-sm font-semibold text-gray-700 shrink-0">
                          {formatCurrency(candidate.salary_weekly)}/week
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {getCandidateStats(candidate).map((stat) => (
                          <div key={stat.label} className="rounded-lg bg-gray-50 p-2">
                            <div className="text-[11px] text-gray-500">{stat.label}</div>
                            <div className="mt-1 text-sm font-semibold text-gray-900">
                              {stat.value}
                            </div>
                          </div>
                        ))}
                      </div>

                      {occupiedRole ? (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          Role currently filled by {occupiedRole.staff_name}.
                        </div>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-gray-500">
                Showing {pageStart}-{pageEnd} of {sortedCandidates.length} candidates
              </div>

              {sortedCandidates.length > CANDIDATES_PER_PAGE ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                      currentPage === 1
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Previous
                  </button>

                  <div className="text-sm text-gray-600 px-2">
                    Page {currentPage} / {totalPages}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                      currentPage === totalPages
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
              <h4 className="font-semibold text-gray-900">Candidate Details</h4>

              {!selectedCandidate ? (
                <div className="mt-3 text-sm text-gray-500">
                  Select a staff candidate to view details.
                </div>
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-3">
                    <img
                      src={getCountryFlagUrl(safeCountryCode(selectedCandidate.country_code))}
                      alt={getCountryName(selectedCandidate.country_code)}
                      className="h-5 w-7 rounded-sm border border-gray-200 object-cover"
                    />
                    <div>
                      <div className="font-semibold text-gray-900">
                        {selectedCandidate.staff_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {roleLabel(selectedCandidate.role_type)}
                        {selectedCandidate.specialization
                          ? ` • ${selectedCandidate.specialization}`
                          : ''}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="text-xs text-gray-500">Weekly Wage Demand</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {formatCurrency(selectedCandidate.salary_weekly)}
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="text-xs text-gray-500">Availability</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {selectedCandidate.is_available ? 'Available' : 'Unavailable'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm font-semibold text-gray-900">Staff Attributes</div>
                    <div className="mt-3 space-y-2">
                      {[
                        ...getCandidateStats(selectedCandidate),
                        { label: 'Leadership', value: selectedCandidate.leadership },
                        { label: 'Loyalty', value: selectedCandidate.loyalty },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                        >
                          <span className="text-sm text-gray-600">{stat.label}</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {stat.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-400">
                      {occupiedRoleMap.get(selectedCandidate.role_type)
                        ? 'Role must be vacant for direct hire'
                        : ' '}
                    </div>

                    <button
                      type="button"
                      onClick={handleHireCandidate}
                      disabled={
                        hireLoading || Boolean(occupiedRoleMap.get(selectedCandidate.role_type))
                      }
                      className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                        hireLoading || Boolean(occupiedRoleMap.get(selectedCandidate.role_type))
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-yellow-400 hover:bg-yellow-300 text-black'
                      }`}
                    >
                      {hireLoading ? 'Hiring...' : 'Hire Staff'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
              <h4 className="font-semibold text-gray-900">Current Staff Roles</h4>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                {(
                  [
                    'head_coach',
                    'team_doctor',
                    'mechanic',
                    'sport_director',
                    'scout_analyst',
                  ] as StaffRole[]
                ).map((role) => {
                  const current = occupiedRoleMap.get(role)

                  return (
                    <div
                      key={role}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <span>{roleLabel(role)}</span>
                      <span className={current ? 'text-gray-800' : 'text-gray-400'}>
                        {current ? current.staff_name : 'Vacant'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <RiderProfileModal
        rider={selectedPopupRider}
        isOpen={isRiderPopupOpen}
        onClose={() => {
          setIsRiderPopupOpen(false)
          setSelectedPopupRider(null)
          setIsRiderScouted(false)
          setShowRiderHistory(false)
        }}
        onOpenTeamProfile={() => {}}
        isRiderScouted={isRiderScouted}
        setIsRiderScouted={setIsRiderScouted}
        showRiderHistory={showRiderHistory}
        setShowRiderHistory={setShowRiderHistory}
        countryNameByCode={new Map<string, string>()}
      />
    </div>
  )
}