import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type MainTab = 'teams' | 'riders'
type TeamSubTab = 'current' | 'history'
type RiderSubTab = 'rankings' | 'breakdown'
type TeamTypeFilter = 'all' | 'user' | 'ai'
type StatusFilter = 'all' | 'active' | 'inactive'
type RiderMetric =
  | 'overall'
  | 'potential'
  | 'sprint'
  | 'climbing'
  | 'time_trial'
  | 'endurance'
  | 'flat'
  | 'recovery'
  | 'resistance'
  | 'race_iq'
  | 'teamwork'
  | 'morale'

type TeamCurrentRow = {
  id: string
  name: string
  country_code: string
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
  country_code: string
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

type ClubRosterMini = {
  club_id: string
  rider_id: string
}

type ClubMini = {
  id: string
  name: string
  club_tier: string
  is_ai: boolean
  is_active: boolean
}

type CountryRow = {
  code: string
  name: string
}

type RiderStatsRow = RiderBaseRow & {
  club_id: string | null
  club_name: string | null
  club_tier: string | null
  club_is_ai: boolean | null
  club_is_active: boolean | null
  age_years: number | null
}

const PAGE_SIZE = 20
const RIDER_TOP_LIMIT = 50

/**
 * Change only these two if your actual profile routes are different.
 * Current setup assumes hash-router style:
 *   #/dashboard/team/:id
 *   #/dashboard/rider/:id
 */
const TEAM_PAGE_BASE = '/dashboard/team'
const RIDER_PAGE_BASE = '/dashboard/rider'

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

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function buildHashHref(path: string) {
  return `#${path}`
}

function getTeamPageHref(id: string) {
  return buildHashHref(`${TEAM_PAGE_BASE}/${id}`)
}

function getRiderPageHref(id: string) {
  return buildHashHref(`${RIDER_PAGE_BASE}/${id}`)
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

function getDivisionValue(team: TeamCurrentRow | TeamSnapshotRow) {
  return team.tier2_division || team.tier3_division || team.amateur_division || team.club_tier
}

function getDivisionLabel(team: TeamCurrentRow | TeamSnapshotRow) {
  return formatCompetitionLabel(getDivisionValue(team))
}

function getAgeYears(birthDate: string | null) {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--
  return age
}

function getCountryName(code: string | null, countryNameByCode: Map<string, string>) {
  if (!code) return '—'
  return countryNameByCode.get(code) ?? code
}

function getFlagUrl(code: string | null) {
  if (!code) return null
  return `https://flagcdn.com/24x18/${code.toLowerCase()}.png`
}

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{description}</div>
    </div>
  )
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
    <div className="inline-flex rounded-lg bg-white border border-gray-100 p-1 shadow-sm">
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={cx(
            'px-4 py-2 rounded-md text-sm font-medium transition',
            activeKey === item.key
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function TextSubTabs({
  items,
  activeKey,
  onChange,
}: {
  items: Array<{ key: string; label: string }>
  activeKey: string
  onChange: (key: string) => void
}) {
  return (
    <div className="border-b border-slate-200">
      <div className="flex flex-wrap gap-6">
        {items.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cx(
              'border-b-2 pb-3 text-sm font-medium transition',
              activeKey === item.key
                ? 'border-yellow-500 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function EntityLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <a href={href} className="font-medium text-slate-900 hover:text-yellow-700 hover:underline">
      {children}
    </a>
  )
}

function CountryFlag({
  code,
  countryNameByCode,
}: {
  code: string | null
  countryNameByCode: Map<string, string>
}) {
  if (!code) {
    return <span className="text-slate-400">—</span>
  }

  const name = getCountryName(code, countryNameByCode)
  const flagUrl = getFlagUrl(code)

  if (!flagUrl) {
    return <span className="text-slate-400">—</span>
  }

  return (
    <img
      src={flagUrl}
      alt={name}
      title={name}
      className="h-3.5 w-[18px] rounded-[2px] border border-slate-200 object-cover shrink-0"
      loading="lazy"
    />
  )
}

function TypeBadge({ isAi }: { isAi: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        isAi ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
      )}
    >
      {isAi ? 'AI' : 'User'}
    </span>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        isActive ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'
      )}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}

function MiniBarList({
  items,
}: {
  items: Array<{ label: string; value: number }>
}) {
  const max = Math.max(...items.map(item => item.value), 1)

  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{item.label}</span>
            <span className="font-medium text-slate-900">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-yellow-500"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.ceil(totalItems / pageSize)

  if (totalPages <= 1) return null

  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="text-sm text-slate-500">
        Showing {start}-{end} of {totalItems}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className={cx(
            'px-3 py-1.5 rounded-md text-sm font-medium border transition',
            currentPage === 1
              ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          )}
        >
          Previous
        </button>

        <div className="text-sm font-medium text-slate-700">
          {currentPage} / {totalPages}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className={cx(
            'px-3 py-1.5 rounded-md text-sm font-medium border transition',
            currentPage === totalPages
              ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          )}
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default function StatisticsPage() {
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

  const [search, setSearch] = useState('')
  const [seasonFilter, setSeasonFilter] = useState<string>('all')
  const [teamTypeFilter, setTeamTypeFilter] = useState<TeamTypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [divisionFilter, setDivisionFilter] = useState('all')
  const [countryFilter, setCountryFilter] = useState('all')
  const [riderMetric, setRiderMetric] = useState<RiderMetric>('overall')
  const [riderTableMetric, setRiderTableMetric] = useState<RiderMetric>('overall')

  const [teamCurrentPage, setTeamCurrentPage] = useState(1)
  const [teamHistoryPage, setTeamHistoryPage] = useState(1)
  const [ridersPage, setRidersPage] = useState(1)

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
          clubRosterRes,
          clubsRes,
          countriesRes,
          currentSeasonRes,
        ] = await Promise.all([
          supabase.from('team_rankings_view').select('*'),
          supabase.from('team_ranking_past_winners').select('*'),
          supabase.from('team_ranking_season_snapshots').select('*'),
          supabase
            .from('riders')
            .select(
              'id, display_name, country_code, role, overall, potential, sprint, climbing, time_trial, endurance, flat, recovery, resistance, race_iq, teamwork, morale, birth_date, market_value, salary, contract_expires_season, availability_status, fatigue, image_url'
            ),
          supabase.from('club_roster').select('club_id, rider_id'),
          supabase.from('clubs').select('id, name, club_tier, is_ai, is_active').is('deleted_at', null),
          supabase.from('countries').select('code, name'),
          supabase.rpc('get_current_season_number'),
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
        const riders = (ridersRes.data ?? []) as RiderBaseRow[]
        const clubRoster = (clubRosterRes.data ?? []) as ClubRosterMini[]
        const clubs = (clubsRes.data ?? []) as ClubMini[]
        const countryRows = countriesRes.error ? [] : ((countriesRes.data ?? []) as CountryRow[])
        const currentSeason =
          currentSeasonRes.error || currentSeasonRes.data === null || currentSeasonRes.data === undefined
            ? 1
            : Number(currentSeasonRes.data)

        const clubById = new Map(clubs.map(club => [club.id, club]))
        const rosterByRiderId = new Map(clubRoster.map(row => [row.rider_id, row.club_id]))

        const mergedRiders: RiderStatsRow[] = riders.map(rider => {
          const clubId = rosterByRiderId.get(rider.id) ?? null
          const club = clubId ? clubById.get(clubId) : undefined

          return {
            ...rider,
            club_id: clubId,
            club_name: club?.name ?? null,
            club_tier: club?.club_tier ?? null,
            club_is_ai: club?.is_ai ?? null,
            club_is_active: club?.is_active ?? null,
            age_years: getAgeYears(rider.birth_date),
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

    loadAll()
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
    return Array.from(new Set(historicalSnapshotRows.map(row => row.season_number))).sort((a, b) => b - a)
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
    const codes = Array.from(new Set(riderRows.map(row => row.country_code).filter(Boolean)))
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
    return Array.from(new Set([...currentDivisions, ...historyDivisions].filter(Boolean) as string[])).sort(
      (a, b) => formatCompetitionLabel(a).localeCompare(formatCompetitionLabel(b))
    )
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
        if (tierFilter === 'worldteam') return row.division === 'WORLDTEAM' || row.division === 'worldteam'
        if (tierFilter === 'proteam') return row.division === 'PRO_WEST' || row.division === 'PRO_EAST'
        if (tierFilter === 'continental') return row.division.startsWith('CONTINENTAL_')
        if (tierFilter === 'amateur') {
          return !row.division.startsWith('CONTINENTAL_') && row.division !== 'PRO_WEST' && row.division !== 'PRO_EAST' && row.division !== 'WORLDTEAM'
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

    if (countryFilter !== 'all') rows = rows.filter(row => row.country_code === countryFilter)
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
  const topRider = filteredRiders[0]
  const topPotentialRider = [...filteredRiders].sort((a, b) => (b.potential ?? 0) - (a.potential ?? 0))[0]

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Statistics</h2>
        <p className="mt-1 text-sm text-slate-600">
          Team and rider statistics across your cycling world. Current data is shown immediately,
          while history sections display clean empty states until seasons are completed.
        </p>
      </div>

      <StatsTabGroup
        items={[
          { key: 'teams', label: 'Teams' },
          { key: 'riders', label: 'Riders' },
        ]}
        activeKey={mainTab}
        onChange={key => setMainTab(key as MainTab)}
      />

      {mainTab === 'teams' ? (
        <TextSubTabs
          items={[
            { key: 'current', label: 'Current' },
            { key: 'history', label: 'History' },
          ]}
          activeKey={teamSubTab}
          onChange={key => setTeamSubTab(key as TeamSubTab)}
        />
      ) : (
        <TextSubTabs
          items={[
            { key: 'rankings', label: 'Rankings' },
            { key: 'breakdown', label: 'Breakdown' },
          ]}
          activeKey={riderSubTab}
          onChange={key => setRiderSubTab(key as RiderSubTab)}
        />
      )}

      {mainTab === 'teams' && teamSubTab === 'current' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search teams..."
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />

            <select
              value={teamTypeFilter}
              onChange={e => setTeamTypeFilter(e.target.value as TeamTypeFilter)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All team types</option>
              <option value="user">User teams</option>
              <option value="ai">AI teams</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All status</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>

            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All tiers</option>
              {availableTiers.map(tier => (
                <option key={tier} value={tier}>
                  {formatCompetitionLabel(tier)}
                </option>
              ))}
            </select>

            <select
              value={divisionFilter}
              onChange={e => setDivisionFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All divisions</option>
              {availableDivisions.map(division => (
                <option key={division} value={division}>
                  {formatCompetitionLabel(division)}
                </option>
              ))}
            </select>

            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All countries</option>
              {availableTeamCountries.map(country => (
                <option key={country} value={country}>
                  {getCountryName(country, countryNameByCode)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {mainTab === 'teams' && teamSubTab === 'history' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search teams..."
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />

            <select
              value={seasonFilter}
              onChange={e => setSeasonFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All seasons</option>
              {availableSeasons.map(season => (
                <option key={season} value={season}>
                  Season {season}
                </option>
              ))}
            </select>

            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All tiers</option>
              {availableTiers.map(tier => (
                <option key={tier} value={tier}>
                  {formatCompetitionLabel(tier)}
                </option>
              ))}
            </select>

            <select
              value={divisionFilter}
              onChange={e => setDivisionFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All divisions</option>
              {availableDivisions.map(division => (
                <option key={division} value={division}>
                  {formatCompetitionLabel(division)}
                </option>
              ))}
            </select>

            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All countries</option>
              {availableHistoryCountries.map(country => (
                <option key={country} value={country}>
                  {getCountryName(country, countryNameByCode)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {mainTab === 'riders' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search riders or teams..."
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />

            <select
              value={teamTypeFilter}
              onChange={e => setTeamTypeFilter(e.target.value as TeamTypeFilter)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All team types</option>
              <option value="user">User teams</option>
              <option value="ai">AI teams</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All status</option>
              <option value="active">Fit only</option>
              <option value="inactive">Unavailable only</option>
            </select>

            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All tiers</option>
              {availableTiers.map(tier => (
                <option key={tier} value={tier}>
                  {formatCompetitionLabel(tier)}
                </option>
              ))}
            </select>

            <select
              value={riderMetric}
              onChange={e => setRiderMetric(e.target.value as RiderMetric)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="overall">Sort: Overall</option>
              <option value="potential">Sort: Potential</option>
              <option value="sprint">Sort: Sprint</option>
              <option value="climbing">Sort: Climbing</option>
              <option value="time_trial">Sort: Time Trial</option>
              <option value="race_iq">Sort: Race IQ</option>
              <option value="teamwork">Sort: Teamwork</option>
            </select>

            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All countries</option>
              {availableRiderCountries.map(country => (
                <option key={country} value={country}>
                  {getCountryName(country, countryNameByCode)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {loading ? (
        <SectionCard title="Loading statistics">
          <div className="text-sm text-slate-500">Fetching data...</div>
        </SectionCard>
      ) : error ? (
        <SectionCard title="Statistics error">
          <div className="text-sm text-rose-600">{error}</div>
        </SectionCard>
      ) : mainTab === 'teams' && teamSubTab === 'current' ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Teams in filter" value={filteredTeamCurrent.length} />
            <KpiCard
              label="User teams"
              value={filteredTeamCurrent.filter(row => !row.is_ai).length}
            />
            <KpiCard
              label="AI teams"
              value={filteredTeamCurrent.filter(row => row.is_ai).length}
            />
            <KpiCard
              label="Current leader"
              value={
                topCurrentTeam ? (
                  <EntityLink href={getTeamPageHref(topCurrentTeam.id)}>{topCurrentTeam.name}</EntityLink>
                ) : (
                  '—'
                )
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard
              title="Current leaderboard"
              subtitle="Best teams in the selected filter."
            >
              {filteredTeamCurrent.length === 0 ? (
                <EmptyState
                  title="No teams found"
                  description="Try changing the filters or search term."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">#</th>
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Tier / Division</th>
                        <th className="pb-3 pr-3">Type</th>
                        <th className="pb-3 pr-3">Status</th>
                        <th className="pb-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeamCurrent.slice(0, 12).map((row, index) => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3 font-medium text-slate-900">{index + 1}</td>
                          <td className="py-3 pr-3">
                            <EntityLink href={getTeamPageHref(row.id)}>{row.name}</EntityLink>
                          </td>
                          <td className="py-3 pr-3">
                            <CountryFlag code={row.country_code} countryNameByCode={countryNameByCode} />
                          </td>
                          <td className="py-3 pr-3 text-slate-600">
                            {formatCompetitionLabel(row.club_tier)} / {getDivisionLabel(row)}
                          </td>
                          <td className="py-3 pr-3">
                            <TypeBadge isAi={row.is_ai} />
                          </td>
                          <td className="py-3 pr-3">
                            <StatusBadge isActive={row.is_active} />
                          </td>
                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.season_points ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Country spread"
              subtitle="How many teams appear per country in the current filter."
            >
              {teamsByCountry.length === 0 ? (
                <EmptyState
                  title="No country spread yet"
                  description="Country distribution will appear once current team data is available."
                />
              ) : (
                <MiniBarList items={teamsByCountry} />
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="All current teams"
            subtitle="Full current standings dataset for the selected filters."
          >
            {filteredTeamCurrent.length === 0 ? (
              <EmptyState
                title="No current teams"
                description="No teams match the selected filters."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Tier</th>
                        <th className="pb-3 pr-3">Division</th>
                        <th className="pb-3 pr-3">Type</th>
                        <th className="pb-3 pr-3">Status</th>
                        <th className="pb-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTeamCurrent.map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3">
                            <EntityLink href={getTeamPageHref(row.id)}>{row.name}</EntityLink>
                          </td>
                          <td className="py-3 pr-3">
                            <CountryFlag code={row.country_code} countryNameByCode={countryNameByCode} />
                          </td>
                          <td className="py-3 pr-3 text-slate-600">{formatCompetitionLabel(row.club_tier)}</td>
                          <td className="py-3 pr-3 text-slate-600">{getDivisionLabel(row)}</td>
                          <td className="py-3 pr-3">
                            <TypeBadge isAi={row.is_ai} />
                          </td>
                          <td className="py-3 pr-3">
                            <StatusBadge isActive={row.is_active} />
                          </td>
                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.season_points ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={teamCurrentPage}
                  totalItems={filteredTeamCurrent.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setTeamCurrentPage}
                />
              </>
            )}
          </SectionCard>
        </>
      ) : mainTab === 'teams' && teamSubTab === 'history' ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Seasons recorded" value={availableSeasons.length} />
            <KpiCard label="Past winner rows" value={filteredWinners.length} />
            <KpiCard
              label="Most titles"
              value={teamTitles[0] ? `${teamTitles[0].club_name} (${teamTitles[0].titles})` : '—'}
            />
            <KpiCard
              label="Latest winner"
              value={latestWinner ? latestWinner.club_name : '—'}
              hint={latestWinner ? `Season ${latestWinner.season_number}` : 'No winners recorded yet'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard
              title="Past winners"
              subtitle="Historical champions for completed seasons."
            >
              {filteredWinners.length === 0 ? (
                <EmptyState
                  title="No past winners yet"
                  description="This is expected if you are still early in the game lifecycle or have not filled history yet."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">Season</th>
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Division</th>
                        <th className="pb-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWinners.map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3 font-medium text-slate-900">{row.season_number}</td>
                          <td className="py-3 pr-3">
                            <EntityLink href={getTeamPageHref(row.club_id)}>{row.club_name}</EntityLink>
                          </td>
                          <td className="py-3 pr-3">
                            <CountryFlag code={row.country_code} countryNameByCode={countryNameByCode} />
                          </td>
                          <td className="py-3 pr-3 text-slate-600">{formatCompetitionLabel(row.division)}</td>
                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.points ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Titles leaderboard"
              subtitle="Teams with the most recorded championships."
            >
              {teamTitles.length === 0 ? (
                <EmptyState
                  title="No title leaderboard yet"
                  description="Once past winners are stored, this block will become one of the best parts of the page."
                />
              ) : (
                <MiniBarList
                  items={teamTitles.map(item => ({
                    label: `${item.club_name} (${getCountryName(item.country_code, countryNameByCode)})`,
                    value: item.titles,
                  }))}
                />
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Historical finishes"
            subtitle="Season-by-season finishing positions across divisions."
          >
            {filteredSnapshots.length === 0 ? (
              <EmptyState
                title="No season history yet"
                description="Your game is currently in Season 1, so there are no completed historical seasons to show yet."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">Season</th>
                        <th className="pb-3 pr-3">Pos</th>
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Division</th>
                        <th className="pb-3 pr-3">Type</th>
                        <th className="pb-3 pr-3">Status</th>
                        <th className="pb-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTeamHistory.map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3 font-medium text-slate-900">{row.season_number}</td>
                          <td className="py-3 pr-3 font-semibold text-slate-900">{row.final_position}</td>
                          <td className="py-3 pr-3">
                            <EntityLink href={getTeamPageHref(row.club_id)}>{row.club_name}</EntityLink>
                          </td>
                          <td className="py-3 pr-3">
                            <CountryFlag code={row.country_code} countryNameByCode={countryNameByCode} />
                          </td>
                          <td className="py-3 pr-3 text-slate-600">{formatCompetitionLabel(row.division)}</td>
                          <td className="py-3 pr-3">
                            <TypeBadge isAi={row.is_ai} />
                          </td>
                          <td className="py-3 pr-3">
                            <StatusBadge isActive={row.is_active} />
                          </td>
                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.points ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={teamHistoryPage}
                  totalItems={filteredSnapshots.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setTeamHistoryPage}
                />
              </>
            )}
          </SectionCard>
        </>
      ) : mainTab === 'riders' && riderSubTab === 'rankings' ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Highest overall"
              value={topRider ? `${topRider.display_name} (${topRider.overall ?? 0})` : '—'}
            />
            <KpiCard
              label="Highest potential"
              value={
                topPotentialRider
                  ? `${topPotentialRider.display_name} (${topPotentialRider.potential ?? 0})`
                  : '—'
              }
            />
            <KpiCard
              label="Average age"
              value={
                filteredRiders.length
                  ? (
                      filteredRiders.reduce((sum, row) => sum + (row.age_years ?? 0), 0) /
                      filteredRiders.length
                    ).toFixed(1)
                  : '—'
              }
            />
            <KpiCard label="Riders in filter" value={filteredRiders.length} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard
              title="Top riders"
              subtitle={`Sorted by ${formatCompetitionLabel(riderMetric)}.`}
            >
              {filteredRiders.length === 0 ? (
                <EmptyState
                  title="No riders found"
                  description="Try changing the rider filters."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">Rider</th>
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Age</th>
                        <th className="pb-3 pr-3">Role</th>
                        <th className="pb-3 pr-3">Overall</th>
                        {riderMetric !== 'overall' ? (
                          <th className="pb-3 text-right capitalize">
                            {formatCompetitionLabel(riderMetric)}
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRiders.slice(0, 12).map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3">
                            <EntityLink href={getRiderPageHref(row.id)}>{row.display_name}</EntityLink>
                          </td>
                          <td className="py-3 pr-3 text-slate-600">
                            {row.club_id && row.club_name ? (
                              <EntityLink href={getTeamPageHref(row.club_id)}>{row.club_name}</EntityLink>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 pr-3">
                            <CountryFlag code={row.country_code} countryNameByCode={countryNameByCode} />
                          </td>
                          <td className="py-3 pr-3 text-slate-600">{row.age_years ?? '—'}</td>
                          <td className="py-3 pr-3 text-slate-600">{formatCompetitionLabel(row.role)}</td>
                          <td className="py-3 pr-3 font-semibold text-slate-900">
                            {row.overall ?? '—'}
                          </td>
                          {riderMetric !== 'overall' ? (
                            <td className="py-3 text-right font-semibold text-slate-900">
                              {Number(row[riderMetric] ?? 0)}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Role distribution"
              subtitle="How riders are spread across roles in the selected filter."
            >
              {riderRoles.length === 0 ? (
                <EmptyState
                  title="No role data"
                  description="Role breakdown appears once rider data is available."
                />
              ) : (
                <MiniBarList items={riderRoles} />
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Top 50 riders"
            subtitle="Best available riders in the current filter."
            right={
              <select
                value={riderTableMetric}
                onChange={e => setRiderTableMetric(e.target.value as RiderMetric)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="overall">Overall</option>
                <option value="potential">Potential</option>
                <option value="sprint">Sprint</option>
                <option value="climbing">Climbing</option>
                <option value="time_trial">Time Trial</option>
                <option value="endurance">Endurance</option>
                <option value="flat">Flat</option>
                <option value="recovery">Recovery</option>
                <option value="resistance">Resistance</option>
                <option value="race_iq">Race IQ</option>
                <option value="teamwork">Teamwork</option>
                <option value="morale">Morale</option>
              </select>
            }
          >
            {topRiderTableRows.length === 0 ? (
              <EmptyState title="No riders available" description="No riders match the selected filters." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">Rider</th>
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Age</th>
                        <th className="pb-3 pr-3">Role</th>
                        <th className="pb-3 pr-3">Overall</th>
                        <th className="pb-3 pr-3">{formatCompetitionLabel(riderTableMetric)}</th>
                        <th className="pb-3 pr-3">Availability</th>
                        <th className="pb-3 text-right">Fatigue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRiders.map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3">
                            <EntityLink href={getRiderPageHref(row.id)}>{row.display_name}</EntityLink>
                          </td>
                          <td className="py-3 pr-3 text-slate-600">
                            {row.club_id && row.club_name ? (
                              <EntityLink href={getTeamPageHref(row.club_id)}>{row.club_name}</EntityLink>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 pr-3">
                            <CountryFlag code={row.country_code} countryNameByCode={countryNameByCode} />
                          </td>
                          <td className="py-3 pr-3 text-slate-600">{row.age_years ?? '—'}</td>
                          <td className="py-3 pr-3 text-slate-600">{formatCompetitionLabel(row.role)}</td>
                          <td className="py-3 pr-3 font-semibold text-slate-900">{row.overall ?? '—'}</td>
                          <td className="py-3 pr-3 font-semibold text-slate-900">
                            {Number(row[riderTableMetric] ?? 0)}
                          </td>
                          <td className="py-3 pr-3 text-slate-600">{row.availability_status ?? 'fit'}</td>
                          <td className="py-3 text-right font-semibold text-slate-900">{row.fatigue ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={ridersPage}
                  totalItems={topRiderTableRows.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setRidersPage}
                />
              </>
            )}
          </SectionCard>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Average overall"
              value={
                filteredRiders.length
                  ? (
                      filteredRiders.reduce((sum, row) => sum + (row.overall ?? 0), 0) /
                      filteredRiders.length
                    ).toFixed(1)
                  : '—'
              }
            />
            <KpiCard
              label="Average fatigue"
              value={
                filteredRiders.length
                  ? (
                      filteredRiders.reduce((sum, row) => sum + (row.fatigue ?? 0), 0) /
                      filteredRiders.length
                    ).toFixed(1)
                  : '—'
              }
            />
            <KpiCard
              label="Total market value"
              value={moneyFormatter.format(filteredRiders.reduce((sum, row) => sum + (row.market_value ?? 0), 0))}
            />
            <KpiCard
              label="Average salary"
              value={
                filteredRiders.length
                  ? moneyFormatter.format(
                      Math.round(
                        filteredRiders.reduce((sum, row) => sum + (row.salary ?? 0), 0) /
                          filteredRiders.length
                      )
                    )
                  : '—'
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard
              title="Age distribution"
              subtitle="Quick way to see how balanced the rider pool is."
            >
              {riderAgeBuckets.every(item => item.value === 0) ? (
                <EmptyState
                  title="No age breakdown"
                  description="Age buckets will appear once riders are loaded."
                />
              ) : (
                <MiniBarList items={riderAgeBuckets} />
              )}
            </SectionCard>

            <SectionCard
              title="Top value / salary riders"
              subtitle="Useful when you later want contract and transfer-related stats here."
            >
              {filteredRiders.length === 0 ? (
                <EmptyState
                  title="No rider finance data"
                  description="This area can later become value, wages, and contract expiry summaries."
                />
              ) : (
                <div className="space-y-3">
                  {[...filteredRiders]
                    .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0))
                    .slice(0, 6)
                    .map(row => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3"
                      >
                        <div>
                          <div>
                            <EntityLink href={getRiderPageHref(row.id)}>{row.display_name}</EntityLink>
                          </div>
                          <div className="text-sm text-slate-500 mt-1">
                            {row.club_id && row.club_name ? (
                              <EntityLink href={getTeamPageHref(row.club_id)}>{row.club_name}</EntityLink>
                            ) : (
                              '—'
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-slate-900">
                            {moneyFormatter.format(row.market_value ?? 0)}
                          </div>
                          <div className="text-xs text-slate-500">
                            Salary: {moneyFormatter.format(row.salary ?? 0)}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}