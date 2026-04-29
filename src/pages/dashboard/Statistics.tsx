import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { normalizeGameDateValue } from '../../features/squad/utils/dates'
import TeamStatisticsSection from '../../features/squad/components/TeamStatisticsSection'
import RiderStatisticsSection from '../../features/squad/components/RiderStatisticsSection'

type MainTab = 'teams' | 'riders'
type TeamSubTab = 'current' | 'history'
type RiderSubTab = 'rankings' | 'breakdown'
type TeamTypeFilter = 'all' | 'user' | 'ai'
type StatusFilter = 'all' | 'active' | 'inactive'
type RiderMetric =
  | 'season_points_overall'
  | 'season_points_sprint'
  | 'season_points_climbing'

type TeamCurrentRow = {
  id: string
  name: string
  country_code: string | null
  club_tier: string
  tier2_division: string | null
  tier3_division: string | null
  amateur_division: string | null
  season_points: number | null
  created_at: string
  logo_path: string | null
  is_ai: boolean
  is_active: boolean
}

type TeamWinnerRow = {
  id: string
  season_number: number
  division: string
  club_id: string
  club_name: string
  country_code: string
  points: number | null
}

type TeamSnapshotRow = {
  id: string
  season_number: number
  division: string
  club_id: string
  club_name: string
  country_code: string
  club_tier: string
  tier2_division: string | null
  tier3_division: string | null
  amateur_division: string | null
  points: number | null
  final_position: number
  is_ai: boolean
  is_active: boolean
}

type RiderBaseRow = {
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
}

type RiderStatsRow = RiderBaseRow & {
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

type CountryRow = {
  code: string
  name: string
}

type RiderBaseLookupRow = {
  id: string
  display_name: string | null
  country_code: string | null
  birth_date: string | null
  image_url: string | null
}

type ClubRosterMini = {
  id: string
  rider_id: string
  club_id: string
}

type ClubMini = {
  id: string
  name: string
  club_tier: string | null
  is_ai: boolean | null
  is_active: boolean | null
  country_code: string | null
}

const PAGE_SIZE = 20
const RIDER_TOP_LIMIT = 50

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const COMPETITION_LABELS: Record<string, string> = {
  worldteam: 'WorldTeam',
  proteam: 'ProTeam',
  continental: 'Continental',
  amateur: 'Amateur',
  WORLDTEAM: 'WorldTeam',
  PROTEAM: 'ProTeam',
  CONTINENTAL: 'Continental',
  AMATEUR: 'Amateur',
  PRO_WEST: 'ProTeam West',
  PRO_EAST: 'ProTeam East',
  CONTINENTAL_EUROPE: 'Continental Europe',
  CONTINENTAL_AMERICA: 'Continental America',
  CONTINENTAL_ASIA: 'Continental Asia',
  CONTINENTAL_AFRICA: 'Continental Africa',
  CONTINENTAL_OCEANIA: 'Continental Oceania',
  NORTH_AMERICA: 'North America',
  SOUTH_AMERICA: 'South America',
  WESTERN_EUROPE: 'Western Europe',
  CENTRAL_EUROPE: 'Central Europe',
  SOUTHERN_BALKAN_EUROPE: 'Southern & Balkan Europe',
  NORTHERN_EASTERN_EUROPE: 'Northern & Eastern Europe',
  WEST_NORTH_AFRICA: 'West & North Africa',
  CENTRAL_SOUTH_AFRICA: 'Central & South Africa',
  WEST_CENTRAL_ASIA: 'West & Central Asia',
  SOUTH_ASIA: 'South Asia',
  EAST_SOUTHEAST_ASIA: 'East & Southeast Asia',
  OCEANIA: 'Oceania',
}

const RIDER_METRIC_LABELS: Record<RiderMetric, string> = {
  season_points_overall: 'Overall',
  season_points_sprint: 'Sprinting',
  season_points_climbing: 'Climbing',
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(' ')
    .map(word => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(' ')
}

function formatCompetitionLabel(value: string | null | undefined) {
  if (!value) return '—'
  if (COMPETITION_LABELS[value]) return COMPETITION_LABELS[value]
  if (COMPETITION_LABELS[value.toLowerCase()]) return COMPETITION_LABELS[value.toLowerCase()]
  return toTitleCase(value.replace(/_/g, ' '))
}

function formatRiderMetricLabel(metric: RiderMetric) {
  return RIDER_METRIC_LABELS[metric]
}

function getDivisionValue(team: TeamCurrentRow | TeamSnapshotRow) {
  return team.tier2_division || team.tier3_division || team.amateur_division || team.club_tier
}

function getDivisionLabel(team: TeamCurrentRow | TeamSnapshotRow) {
  return formatCompetitionLabel(getDivisionValue(team))
}

function getAgeYearsAtDate(birthDate: string | null, referenceDate: string | null) {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return null

  const now = referenceDate ? new Date(`${referenceDate}T00:00:00Z`) : new Date()
  if (Number.isNaN(now.getTime())) return null

  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age--
  return age
}

function getCountryName(code: string | null, countryNameByCode: Map<string, string>) {
  if (!code) return '—'
  return countryNameByCode.get(code) ?? code
}

function getDisplayedRiderCountryCode(
  row: Pick<RiderStatsRow, 'club_country_code' | 'country_code'>
) {
  return row.club_country_code ?? row.country_code ?? null
}

function resolveStringValue(raw: Record<string, unknown>, aliases: string[]) {
  for (const key of aliases) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

function resolveNumberValue(raw: Record<string, unknown>, aliases: string[]) {
  for (const key of aliases) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return null
}

function StatsTabGroup({
  items,
  activeKey,
  onChange,
}: {
  items: Array<{ key: string; label: string }>
  activeKey: string
  onChange: (key: string) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={cx(
            'rounded-md px-4 py-2 text-sm font-medium transition',
            activeKey === item.key ? 'bg-yellow-400 text-black' : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default function StatisticsPage() {
  const navigate = useNavigate()
  const [mainTab, setMainTab] = useState<MainTab>('teams')
  const [teamSubTab, setTeamSubTab] = useState<TeamSubTab>('current')
  const [riderSubTab, setRiderSubTab] = useState<RiderSubTab>('rankings')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number>(1)

  const [teamRows, setTeamRows] = useState<TeamCurrentRow[]>([])
  const [winnerRows, setWinnerRows] = useState<TeamWinnerRow[]>([])
  const [snapshotRows, setSnapshotRows] = useState<TeamSnapshotRow[]>([])
  const [riderRows, setRiderRows] = useState<RiderStatsRow[]>([])
  const [countries, setCountries] = useState<CountryRow[]>([])

  const [myClubIds, setMyClubIds] = useState<string[]>([])

  const [search, setSearch] = useState('')
  const [seasonFilter, setSeasonFilter] = useState<string>('all')
  const [teamTypeFilter, setTeamTypeFilter] = useState<TeamTypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [divisionFilter, setDivisionFilter] = useState('all')
  const [countryFilter, setCountryFilter] = useState('all')
  const [riderMetric, setRiderMetric] = useState<RiderMetric>('season_points_overall')
  const [riderTableMetric, setRiderTableMetric] = useState<RiderMetric>('season_points_overall')

  const [teamCurrentPage, setTeamCurrentPage] = useState(1)
  const [teamHistoryPage, setTeamHistoryPage] = useState(1)
  const [ridersPage, setRidersPage] = useState(1)

  function openTeamProfile(teamId: string) {
    navigate(`/dashboard/teams/${teamId}`)
  }

  function openRiderProfile(rider: Pick<RiderStatsRow, 'id' | 'club_id'> | null | undefined) {
    const riderId = rider?.id?.trim()

    if (!riderId) {
      console.error('Statistics rider has no resolved riders.id:', rider)
      return
    }

    const isMyRider = !!rider?.club_id && myClubIds.includes(rider.club_id)

    navigate(
      isMyRider
        ? `/dashboard/my-riders/${riderId}`
        : `/dashboard/external-riders/${riderId}`
    )
  }

  useEffect(() => {
    let cancelled = false

    async function loadMyClubs() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData.user?.id ?? null

        if (!userId || cancelled) {
          if (!cancelled) {
            setMyClubIds([])
          }
          return
        }

        const { data, error: queryError } = await supabase
          .from('clubs')
          .select('id')
          .eq('owner_user_id', userId)
          .in('club_type', ['main', 'developing'])

        if (cancelled) return
        if (queryError) throw queryError

        const ownedClubs = (data ?? []) as Array<{ id: string }>

        setMyClubIds(ownedClubs.map(club => club.id))
      } catch (err) {
        console.error('Failed to load my clubs for statistics page:', err)
      }
    }

    void loadMyClubs()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    async function loadAll() {
      try {
        setLoading(true)
        setError(null)

        const [
          teamRankingsRes,
          winnersRes,
          snapshotsRes,
          ridersRes,
          riderBaseRes,
          clubRosterRes,
          clubsRes,
          countriesRes,
          currentSeasonRes,
          currentGameDateRes,
        ] = await Promise.all([
          supabase.from('team_rankings_view').select('*'),
          supabase.from('team_ranking_past_winners').select('*'),
          supabase.from('team_ranking_season_snapshots').select('*'),
          supabase.from('rider_statistics_view').select('*'),
          supabase.from('riders').select('id, display_name, country_code, birth_date, image_url'),
          supabase.from('club_riders').select('id, rider_id, club_id'),
          supabase.from('clubs').select('id, name, club_tier, is_ai, is_active, country_code'),
          supabase.from('countries').select('code, name'),
          supabase.rpc('get_current_season_number'),
          supabase.rpc('get_current_game_date'),
        ])

        const firstError =
          teamRankingsRes.error ||
          winnersRes.error ||
          snapshotsRes.error ||
          ridersRes.error ||
          clubRosterRes.error ||
          clubsRes.error

        if (firstError) throw firstError

        const teams = (teamRankingsRes.data ?? []) as TeamCurrentRow[]
        const winners = (winnersRes.data ?? []) as TeamWinnerRow[]
        const snapshots = (snapshotsRes.data ?? []) as TeamSnapshotRow[]
        const riders = (ridersRes.data ?? []) as Record<string, unknown>[]
        const riderBaseRows = riderBaseRes.error
          ? []
          : ((riderBaseRes.data ?? []) as RiderBaseLookupRow[])
        const clubRoster = (clubRosterRes.data ?? []) as ClubRosterMini[]
        const clubs = (clubsRes.data ?? []) as ClubMini[]
        const countryRows = countriesRes.error ? [] : ((countriesRes.data ?? []) as CountryRow[])
        const currentSeason =
          currentSeasonRes.error ||
          currentSeasonRes.data === null ||
          currentSeasonRes.data === undefined
            ? 1
            : Number(currentSeasonRes.data)
        const normalizedGameDate = currentGameDateRes.error
          ? null
          : normalizeGameDateValue(currentGameDateRes.data)

        const riderBaseById = new Map(riderBaseRows.map(rider => [rider.id, rider]))
        const clubById = new Map(clubs.map(club => [club.id, club]))
        const rosterByRosterId = new Map(clubRoster.map(row => [row.id, row]))
        const rosterByRiderId = new Map(clubRoster.map(row => [row.rider_id, row.club_id]))
        const teamCountryByClubId = new Map(teams.map(team => [team.id, team.country_code]))

        const mergedRiders: RiderStatsRow[] = riders.map(riderRaw => {
          const rawStatsId =
            resolveStringValue(riderRaw, ['id']) ??
            (riderRaw['id'] !== undefined && riderRaw['id'] !== null
              ? String(riderRaw['id'])
              : null)

          const rawRealRiderId =
            resolveStringValue(riderRaw, ['rider_id', 'riders_id', 'player_id', 'person_id']) ??
            (riderRaw['rider_id'] !== undefined && riderRaw['rider_id'] !== null
              ? String(riderRaw['rider_id'])
              : null)

          const rawRosterId =
            resolveStringValue(riderRaw, ['club_rider_id', 'club_riders_id', 'roster_id']) ??
            rawStatsId

          const rosterMatch = rawRosterId ? rosterByRosterId.get(rawRosterId) : undefined

          const candidateRiderIds = [rawRealRiderId, rosterMatch?.rider_id, rawStatsId].filter(
            (value): value is string => typeof value === 'string' && value.trim() !== ''
          )

          const riderId =
            candidateRiderIds.find(candidateId => riderBaseById.has(candidateId)) ??
            candidateRiderIds[0] ??
            ''

          if (!riderId) {
            console.warn('Unresolved statistics rider row:', {
              availableKeys: Object.keys(riderRaw),
              rawStatsId,
              rawRealRiderId,
              rawRosterId,
              riderRaw,
            })
          }

          const baseRider = riderId ? riderBaseById.get(riderId) : undefined

          const displayName =
            resolveStringValue(riderRaw, ['display_name', 'name']) ??
            baseRider?.display_name ??
            'Unknown rider'

          const rawCountryCode =
            resolveStringValue(riderRaw, ['country_code', 'nationality_code', 'country']) ?? null

          const rawBirthDate =
            resolveStringValue(riderRaw, ['birth_date', 'dob', 'date_of_birth']) ?? null

          const clubId =
            resolveStringValue(riderRaw, ['club_id']) ??
            rosterMatch?.club_id ??
            (riderId ? rosterByRiderId.get(riderId) ?? null : null)

          const club = clubId ? clubById.get(clubId) : undefined

          const finalRiderCountryCode = rawCountryCode ?? baseRider?.country_code ?? null

          const clubCountryCode =
            resolveStringValue(riderRaw, ['club_country_code', 'team_country_code']) ??
            (clubId ? teamCountryByClubId.get(clubId) ?? club?.country_code ?? null : null)

          const finalBirthDate = rawBirthDate ?? baseRider?.birth_date ?? null

          const resolvedImageUrl =
            resolveStringValue(riderRaw, ['image_url']) ?? baseRider?.image_url ?? null

          const resolvedAgeYears =
            getAgeYearsAtDate(finalBirthDate, normalizedGameDate) ??
            resolveNumberValue(riderRaw, ['age_years', 'age', 'rider_age'])

          const clubIsAiRaw = riderRaw.club_is_ai
          const clubIsActiveRaw = riderRaw.club_is_active

          return {
            id: riderId,
            display_name: displayName,
            country_code: finalRiderCountryCode,
            club_country_code: clubCountryCode,
            role: resolveStringValue(riderRaw, ['role']) ?? '',
            overall: resolveNumberValue(riderRaw, ['overall']),
            potential: resolveNumberValue(riderRaw, ['potential']),
            sprint: resolveNumberValue(riderRaw, ['sprint']),
            climbing: resolveNumberValue(riderRaw, ['climbing']),
            time_trial: resolveNumberValue(riderRaw, ['time_trial']),
            endurance: resolveNumberValue(riderRaw, ['endurance']),
            flat: resolveNumberValue(riderRaw, ['flat']),
            recovery: resolveNumberValue(riderRaw, ['recovery']),
            resistance: resolveNumberValue(riderRaw, ['resistance']),
            race_iq: resolveNumberValue(riderRaw, ['race_iq']),
            teamwork: resolveNumberValue(riderRaw, ['teamwork']),
            morale: resolveNumberValue(riderRaw, ['morale']),
            birth_date: finalBirthDate,
            market_value: resolveNumberValue(riderRaw, ['market_value']),
            salary: resolveNumberValue(riderRaw, ['salary']),
            contract_expires_season: resolveNumberValue(riderRaw, ['contract_expires_season']),
            availability_status: resolveStringValue(riderRaw, ['availability_status']) ?? 'fit',
            fatigue: resolveNumberValue(riderRaw, ['fatigue']),
            image_url: resolvedImageUrl,
            club_id: clubId,
            club_name: resolveStringValue(riderRaw, ['club_name']) ?? club?.name ?? null,
            club_tier: resolveStringValue(riderRaw, ['club_tier']) ?? club?.club_tier ?? null,
            club_is_ai: typeof clubIsAiRaw === 'boolean' ? clubIsAiRaw : (club?.is_ai ?? null),
            club_is_active:
              typeof clubIsActiveRaw === 'boolean' ? clubIsActiveRaw : (club?.is_active ?? null),
            age_years: resolvedAgeYears ?? null,
            season_points_overall: resolveNumberValue(riderRaw, ['season_points_overall']) ?? 0,
            season_points_sprint: resolveNumberValue(riderRaw, ['season_points_sprint']) ?? 0,
            season_points_climbing:
              resolveNumberValue(riderRaw, ['season_points_climbing']) ?? 0,
          }
        })

        setCurrentSeasonNumber(Number.isFinite(currentSeason) && currentSeason > 0 ? currentSeason : 1)
        setTeamRows(teams)
        setWinnerRows(winners)
        setSnapshotRows(snapshots)
        setRiderRows(mergedRiders)
        setCountries(countryRows)
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load statistics.')
      } finally {
        setLoading(false)
      }
    }

    void loadAll()
  }, [])

  const countryNameByCode = useMemo(() => {
    return new Map(countries.map(country => [country.code, country.name]))
  }, [countries])

  const historicalWinnerRows = useMemo(() => {
    return winnerRows.filter(row => row.season_number > 0 && row.season_number < currentSeasonNumber)
  }, [winnerRows, currentSeasonNumber])

  const historicalSnapshotRows = useMemo(() => {
    return snapshotRows.filter(row => row.season_number > 0 && row.season_number < currentSeasonNumber)
  }, [snapshotRows, currentSeasonNumber])

  const availableSeasons = useMemo(() => {
    return Array.from(new Set(historicalSnapshotRows.map(row => row.season_number))).sort(
      (a, b) => b - a
    )
  }, [historicalSnapshotRows])

  const availableTeamCountries = useMemo(() => {
    const codes = Array.from(new Set(teamRows.map(row => row.country_code).filter(Boolean)))
    return codes.sort((a, b) =>
      getCountryName(a, countryNameByCode).localeCompare(getCountryName(b, countryNameByCode))
    )
  }, [teamRows, countryNameByCode])

  const availableHistoryCountries = useMemo(() => {
    const codes = Array.from(
      new Set(
        [
          ...historicalWinnerRows.map(row => row.country_code),
          ...historicalSnapshotRows.map(row => row.country_code),
        ].filter(Boolean)
      )
    )
    return codes.sort((a, b) =>
      getCountryName(a, countryNameByCode).localeCompare(getCountryName(b, countryNameByCode))
    )
  }, [historicalWinnerRows, historicalSnapshotRows, countryNameByCode])

  const availableRiderCountries = useMemo(() => {
    const codes = Array.from(
      new Set(
        riderRows
          .map(row => getDisplayedRiderCountryCode(row))
          .filter((code): code is string => Boolean(code))
      )
    )

    return codes.sort((a, b) =>
      getCountryName(a, countryNameByCode).localeCompare(getCountryName(b, countryNameByCode))
    )
  }, [riderRows, countryNameByCode])

  const availableTiers = useMemo(() => {
    const teamTiers = teamRows.map(row => row.club_tier)
    const riderTiers = riderRows.map(row => row.club_tier).filter(Boolean) as string[]
    return Array.from(new Set([...teamTiers, ...riderTiers])).sort((a, b) =>
      formatCompetitionLabel(a).localeCompare(formatCompetitionLabel(b))
    )
  }, [teamRows, riderRows])

  const availableDivisions = useMemo(() => {
    const currentDivisions = teamRows.map(row => getDivisionValue(row))
    const historyDivisions = historicalSnapshotRows.map(row => row.division)
    return Array.from(
      new Set([...currentDivisions, ...historyDivisions].filter(Boolean) as string[])
    ).sort((a, b) => formatCompetitionLabel(a).localeCompare(formatCompetitionLabel(b)))
  }, [teamRows, historicalSnapshotRows])

  const filteredTeamCurrent = useMemo(() => {
    let rows = [...teamRows]

    if (teamTypeFilter === 'ai') rows = rows.filter(row => row.is_ai)
    if (teamTypeFilter === 'user') rows = rows.filter(row => !row.is_ai)

    if (statusFilter === 'active') rows = rows.filter(row => row.is_active)
    if (statusFilter === 'inactive') rows = rows.filter(row => !row.is_active)

    if (tierFilter !== 'all') rows = rows.filter(row => row.club_tier === tierFilter)
    if (divisionFilter !== 'all') rows = rows.filter(row => getDivisionValue(row) === divisionFilter)
    if (countryFilter !== 'all') rows = rows.filter(row => row.country_code === countryFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(row => row.name.toLowerCase().includes(q))
    }

    return rows.sort((a, b) => (b.season_points ?? 0) - (a.season_points ?? 0))
  }, [teamRows, teamTypeFilter, statusFilter, tierFilter, divisionFilter, countryFilter, search])

  const filteredWinners = useMemo(() => {
    let rows = [...historicalWinnerRows]

    if (seasonFilter !== 'all') rows = rows.filter(row => String(row.season_number) === seasonFilter)
    if (divisionFilter !== 'all') rows = rows.filter(row => row.division === divisionFilter)

    if (tierFilter !== 'all') {
      rows = rows.filter(row => {
        if (tierFilter === 'worldteam') {
          return row.division === 'WORLDTEAM' || row.division === 'worldteam'
        }
        if (tierFilter === 'proteam') {
          return row.division === 'PRO_WEST' || row.division === 'PRO_EAST'
        }
        if (tierFilter === 'continental') {
          return row.division.startsWith('CONTINENTAL_')
        }
        if (tierFilter === 'amateur') {
          return (
            !row.division.startsWith('CONTINENTAL_') &&
            row.division !== 'PRO_WEST' &&
            row.division !== 'PRO_EAST' &&
            row.division !== 'WORLDTEAM'
          )
        }
        return true
      })
    }

    if (countryFilter !== 'all') rows = rows.filter(row => row.country_code === countryFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(row => row.club_name.toLowerCase().includes(q))
    }

    return rows.sort((a, b) => b.season_number - a.season_number)
  }, [historicalWinnerRows, seasonFilter, divisionFilter, tierFilter, countryFilter, search])

  const filteredSnapshots = useMemo(() => {
    let rows = [...historicalSnapshotRows]

    if (seasonFilter !== 'all') rows = rows.filter(row => String(row.season_number) === seasonFilter)
    if (tierFilter !== 'all') rows = rows.filter(row => row.club_tier === tierFilter)
    if (divisionFilter !== 'all') rows = rows.filter(row => row.division === divisionFilter)
    if (countryFilter !== 'all') rows = rows.filter(row => row.country_code === countryFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(row => row.club_name.toLowerCase().includes(q))
    }

    return rows.sort((a, b) => {
      if (b.season_number !== a.season_number) return b.season_number - a.season_number
      return a.final_position - b.final_position
    })
  }, [historicalSnapshotRows, seasonFilter, tierFilter, divisionFilter, countryFilter, search])

  const filteredRiders = useMemo(() => {
    let rows = [...riderRows]

    if (teamTypeFilter === 'ai') rows = rows.filter(row => row.club_is_ai === true)
    if (teamTypeFilter === 'user') rows = rows.filter(row => row.club_is_ai === false)

    if (statusFilter === 'active') {
      rows = rows.filter(row => (row.availability_status ?? 'fit') === 'fit')
    }
    if (statusFilter === 'inactive') {
      rows = rows.filter(row => (row.availability_status ?? 'fit') !== 'fit')
    }

    if (countryFilter !== 'all') {
      rows = rows.filter(row => getDisplayedRiderCountryCode(row) === countryFilter)
    }

    if (tierFilter !== 'all') rows = rows.filter(row => row.club_tier === tierFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(
        row =>
          row.display_name.toLowerCase().includes(q) ||
          (row.club_name ?? '').toLowerCase().includes(q)
      )
    }

    return rows.sort((a, b) => Number(b[riderMetric] ?? 0) - Number(a[riderMetric] ?? 0))
  }, [riderRows, teamTypeFilter, statusFilter, countryFilter, tierFilter, search, riderMetric])

  const topRiderTableRows = useMemo(() => {
    return [...filteredRiders]
      .sort((a, b) => Number(b[riderTableMetric] ?? 0) - Number(a[riderTableMetric] ?? 0))
      .slice(0, RIDER_TOP_LIMIT)
  }, [filteredRiders, riderTableMetric])

  const teamsByCountry = useMemo(() => {
    const counts = new Map<string, number>()
    filteredTeamCurrent.forEach(row => {
      const label = getCountryName(row.country_code, countryNameByCode)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [filteredTeamCurrent, countryNameByCode])

  const teamTitles = useMemo(() => {
    const map = new Map<string, { club_name: string; country_code: string; titles: number }>()
    filteredWinners.forEach(row => {
      const key = row.club_id
      const existing = map.get(key)
      if (existing) {
        existing.titles += 1
      } else {
        map.set(key, {
          club_name: row.club_name,
          country_code: row.country_code,
          titles: 1,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => b.titles - a.titles).slice(0, 8)
  }, [filteredWinners])

  const riderRoles = useMemo(() => {
    const counts = new Map<string, number>()
    filteredRiders.forEach(row => {
      const label = formatCompetitionLabel(row.role)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [filteredRiders])

  const riderAgeBuckets = useMemo(() => {
    const buckets = [
      { label: '18–21', min: 18, max: 21, value: 0 },
      { label: '22–25', min: 22, max: 25, value: 0 },
      { label: '26–29', min: 26, max: 29, value: 0 },
      { label: '30–33', min: 30, max: 33, value: 0 },
      { label: '34+', min: 34, max: 99, value: 0 },
    ]

    filteredRiders.forEach(row => {
      const age = row.age_years ?? -1
      const bucket = buckets.find(item => age >= item.min && age <= item.max)
      if (bucket) bucket.value += 1
    })

    return buckets.map(({ label, value }) => ({ label, value }))
  }, [filteredRiders])

  const paginatedTeamCurrent = useMemo(() => {
    const start = (teamCurrentPage - 1) * PAGE_SIZE
    return filteredTeamCurrent.slice(start, start + PAGE_SIZE)
  }, [filteredTeamCurrent, teamCurrentPage])

  const paginatedTeamHistory = useMemo(() => {
    const start = (teamHistoryPage - 1) * PAGE_SIZE
    return filteredSnapshots.slice(start, start + PAGE_SIZE)
  }, [filteredSnapshots, teamHistoryPage])

  const paginatedRiders = useMemo(() => {
    const start = (ridersPage - 1) * PAGE_SIZE
    return topRiderTableRows.slice(start, start + PAGE_SIZE)
  }, [topRiderTableRows, ridersPage])

  useEffect(() => {
    setTeamCurrentPage(1)
  }, [search, teamTypeFilter, statusFilter, tierFilter, divisionFilter, countryFilter, mainTab, teamSubTab])

  useEffect(() => {
    setTeamHistoryPage(1)
  }, [search, seasonFilter, tierFilter, divisionFilter, countryFilter, mainTab, teamSubTab])

  useEffect(() => {
    setRidersPage(1)
  }, [search, teamTypeFilter, statusFilter, tierFilter, countryFilter, riderMetric, riderTableMetric, mainTab, riderSubTab])

  const topCurrentTeam = filteredTeamCurrent[0]
  const latestWinner = filteredWinners[0]
  const topOverallPointsRider = [...filteredRiders].sort(
    (a, b) => (b.season_points_overall ?? 0) - (a.season_points_overall ?? 0)
  )[0]
  const topSprintPointsRider = [...filteredRiders].sort(
    (a, b) => (b.season_points_sprint ?? 0) - (a.season_points_sprint ?? 0)
  )[0]
  const topClimbingPointsRider = [...filteredRiders].sort(
    (a, b) => (b.season_points_climbing ?? 0) - (a.season_points_climbing ?? 0)
  )[0]

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Statistics</h2>
          <p className="mt-1 text-sm text-slate-600">
            Team and rider statistics across your cycling world. Rider rankings here are global,
            so they compare the best riders from all teams in the game.
          </p>
        </div>

        <div className="shrink-0 self-start md:self-start">
          <StatsTabGroup
            items={[
              { key: 'teams', label: 'Teams' },
              { key: 'riders', label: 'Riders' },
            ]}
            activeKey={mainTab}
            onChange={key => setMainTab(key as MainTab)}
          />
        </div>
      </div>

      {mainTab === 'teams' ? (
        <TeamStatisticsSection
          teamSubTab={teamSubTab}
          setTeamSubTab={setTeamSubTab}
          loading={loading}
          error={error}
          search={search}
          setSearch={setSearch}
          seasonFilter={seasonFilter}
          setSeasonFilter={setSeasonFilter}
          teamTypeFilter={teamTypeFilter}
          setTeamTypeFilter={setTeamTypeFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          tierFilter={tierFilter}
          setTierFilter={setTierFilter}
          divisionFilter={divisionFilter}
          setDivisionFilter={setDivisionFilter}
          countryFilter={countryFilter}
          setCountryFilter={setCountryFilter}
          availableSeasons={availableSeasons}
          availableTiers={availableTiers}
          availableDivisions={availableDivisions}
          availableTeamCountries={availableTeamCountries}
          availableHistoryCountries={availableHistoryCountries}
          countryNameByCode={countryNameByCode}
          filteredTeamCurrent={filteredTeamCurrent}
          filteredWinners={filteredWinners}
          filteredSnapshots={filteredSnapshots}
          paginatedTeamCurrent={paginatedTeamCurrent}
          paginatedTeamHistory={paginatedTeamHistory}
          teamsByCountry={teamsByCountry}
          teamTitles={teamTitles}
          topCurrentTeam={topCurrentTeam}
          latestWinner={latestWinner}
          teamCurrentPage={teamCurrentPage}
          setTeamCurrentPage={setTeamCurrentPage}
          teamHistoryPage={teamHistoryPage}
          setTeamHistoryPage={setTeamHistoryPage}
          pageSize={PAGE_SIZE}
          openTeamProfile={openTeamProfile}
          formatCompetitionLabel={formatCompetitionLabel}
          getDivisionLabel={getDivisionLabel}
          getCountryName={getCountryName}
        />
      ) : (
        <RiderStatisticsSection
          riderSubTab={riderSubTab}
          setRiderSubTab={setRiderSubTab}
          loading={loading}
          error={error}
          search={search}
          setSearch={setSearch}
          teamTypeFilter={teamTypeFilter}
          setTeamTypeFilter={setTeamTypeFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          tierFilter={tierFilter}
          setTierFilter={setTierFilter}
          riderMetric={riderMetric}
          setRiderMetric={setRiderMetric}
          riderTableMetric={riderTableMetric}
          setRiderTableMetric={setRiderTableMetric}
          countryFilter={countryFilter}
          setCountryFilter={setCountryFilter}
          availableTiers={availableTiers}
          availableRiderCountries={availableRiderCountries}
          countryNameByCode={countryNameByCode}
          filteredRiders={filteredRiders}
          topRiderTableRows={topRiderTableRows}
          paginatedRiders={paginatedRiders}
          riderRoles={riderRoles}
          riderAgeBuckets={riderAgeBuckets}
          topOverallPointsRider={topOverallPointsRider}
          topSprintPointsRider={topSprintPointsRider}
          topClimbingPointsRider={topClimbingPointsRider}
          ridersPage={ridersPage}
          setRidersPage={setRidersPage}
          pageSize={PAGE_SIZE}
          openRiderProfile={openRiderProfile}
          openTeamProfile={openTeamProfile}
          formatCompetitionLabel={formatCompetitionLabel}
          formatRiderMetricLabel={formatRiderMetricLabel}
          getCountryName={getCountryName}
          getDisplayedRiderCountryCode={getDisplayedRiderCountryCode}
          moneyFormatter={moneyFormatter}
        />
      )}
    </div>
  )
}