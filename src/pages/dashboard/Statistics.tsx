import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import TutorialOverlay from '../../components/tutorial/TutorialOverlay'
import {
  statisticsTutorialSteps,
  statisticsWelcomeTutorial,
} from '../../lib/tutorials'
import {
  getTutorialProgress,
  saveTutorialProgress,
} from '../../lib/tutorialProgress'
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

type TeamInternationalPointsRow = {
  team_id: string
  international_points: number | string | null
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
  podiums?: number
  jerseys?: number
  stage_wins?: number
  final_jerseys?: number
}

type CountryRow = {
  code: string
  name: string
}

const PAGE_SIZE = 20
const RIDER_TOP_LIMIT = 50

const STATISTICS_STATE_STORAGE_KEY = 'ppm:statistics-page-state:v1'
const STATISTICS_RESTORE_SCROLL_KEY = 'ppm:statistics-page-restore-scroll-y'
const STATISTICS_RESTORE_PENDING_KEY = 'ppm:statistics-page-restore-pending'

type StoredStatisticsPageState = {
  mainTab?: MainTab
  teamSubTab?: TeamSubTab
  riderSubTab?: RiderSubTab
  search?: string
  seasonFilter?: string
  teamTypeFilter?: TeamTypeFilter
  statusFilter?: StatusFilter
  tierFilter?: string
  divisionFilter?: string
  countryFilter?: string
  riderMetric?: RiderMetric
  riderTableMetric?: RiderMetric
  teamCurrentPage?: number
  teamHistoryPage?: number
  ridersPage?: number
}

function isMainTab(value: unknown): value is MainTab {
  return value === 'teams' || value === 'riders'
}

function isTeamSubTab(value: unknown): value is TeamSubTab {
  return value === 'current' || value === 'history'
}

function isRiderSubTab(value: unknown): value is RiderSubTab {
  return value === 'rankings' || value === 'breakdown'
}

function isTeamTypeFilter(value: unknown): value is TeamTypeFilter {
  return value === 'all' || value === 'user' || value === 'ai'
}

function isStatusFilter(value: unknown): value is StatusFilter {
  return value === 'all' || value === 'active' || value === 'inactive'
}

function isRiderMetric(value: unknown): value is RiderMetric {
  return (
    value === 'season_points_overall' ||
    value === 'season_points_sprint' ||
    value === 'season_points_climbing'
  )
}

function readStoredStatisticsPageState(): StoredStatisticsPageState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(STATISTICS_STATE_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as StoredStatisticsPageState | null
    if (!parsed || typeof parsed !== 'object') return null

    return parsed
  } catch {
    return null
  }
}

function normalizeStoredPage(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.floor(value)
  }

  return fallback
}

const COMPETITION_LABEL_KEYS = {
  worldteam: 'competition.worldTeam',
  proteam: 'competition.proTeam',
  continental: 'competition.continental',
  amateur: 'competition.amateur',
  tt: 'competition.tt',
  TT: 'competition.tt',
  time_trial: 'competition.tt',
  TIME_TRIAL: 'competition.tt',
  'time-trial': 'competition.tt',
  WORLDTEAM: 'competition.worldTeam',
  PROTEAM: 'competition.proTeam',
  CONTINENTAL: 'competition.continental',
  AMATEUR: 'competition.amateur',
  PRO_WEST: 'competition.proWest',
  PRO_EAST: 'competition.proEast',
  CONTINENTAL_EUROPE: 'competition.continentalEurope',
  CONTINENTAL_AMERICA: 'competition.continentalAmerica',
  CONTINENTAL_ASIA: 'competition.continentalAsia',
  CONTINENTAL_AFRICA: 'competition.continentalAfrica',
  CONTINENTAL_OCEANIA: 'competition.continentalOceania',
  NORTH_AMERICA: 'competition.northAmerica',
  SOUTH_AMERICA: 'competition.southAmerica',
  WESTERN_EUROPE: 'competition.westernEurope',
  CENTRAL_EUROPE: 'competition.centralEurope',
  SOUTHERN_BALKAN_EUROPE: 'competition.southernBalkanEurope',
  NORTHERN_EASTERN_EUROPE: 'competition.northernEasternEurope',
  WEST_NORTH_AFRICA: 'competition.westNorthAfrica',
  CENTRAL_SOUTH_AFRICA: 'competition.centralSouthAfrica',
  WEST_CENTRAL_ASIA: 'competition.westCentralAsia',
  SOUTH_ASIA: 'competition.southAsia',
  EAST_SOUTHEAST_ASIA: 'competition.eastSoutheastAsia',
  OCEANIA: 'competition.oceania',
} as const

type CompetitionLabelCode = keyof typeof COMPETITION_LABEL_KEYS

type RiderMetricLabelVariant = 'label' | 'points'

const RIDER_METRIC_LABEL_KEYS = {
  season_points_overall: {
    label: 'metrics.international',
    points: 'metrics.internationalPoints',
  },
  season_points_sprint: {
    label: 'metrics.stageFinish',
    points: 'metrics.stageFinishPoints',
  },
  season_points_climbing: {
    label: 'metrics.gcOneDay',
    points: 'metrics.gcOneDayPoints',
  },
} as const satisfies Record<RiderMetric, Record<RiderMetricLabelVariant, string>>

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

function getDivisionValue(team: TeamCurrentRow | TeamSnapshotRow) {
  return team.tier2_division || team.tier3_division || team.amateur_division || team.club_tier
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

function getDisplayedRiderCountryCode(row: Pick<RiderStatsRow, 'country_code'>) {
  return row.country_code ?? null
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

function normalizeNumberLike(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

type ClubDisplayNameLookupRow = {
  club_id: string
  display_name: string | null
  original_name?: string | null
  full_display_name?: string | null
}

async function loadClubDisplayNameMap(
  clubIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const uniqueClubIds = Array.from(
    new Set(
      clubIds
        .map((clubId) => clubId?.trim())
        .filter((clubId): clubId is string => Boolean(clubId))
    )
  )

  if (uniqueClubIds.length === 0) return new Map()

  const { data, error } = await supabase.rpc('get_club_display_names_v1', {
    p_club_ids: uniqueClubIds,
  })

  if (error) {
    console.warn('Failed to load club display names for statistics page:', error.message)
    return new Map()
  }

  const displayNameByClubId = new Map<string, string>()

  ;((data ?? []) as ClubDisplayNameLookupRow[]).forEach((row) => {
    const clubId = row.club_id?.trim()
    const displayName = row.display_name?.trim()

    if (clubId && displayName) {
      displayNameByClubId.set(clubId, displayName)
    }
  })

  return displayNameByClubId
}

function getClubDisplayNameFromMap(
  displayNameByClubId: Map<string, string>,
  clubId?: string | null,
  fallbackName?: string | null
): string {
  const normalizedClubId = clubId?.trim()
  const displayName = normalizedClubId ? displayNameByClubId.get(normalizedClubId) : null

  return displayName || fallbackName || 'Team'
}

function getSeasonYearFromGameDate(value: string | null): number {
  if (!value) return 2000

  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) && year > 0 ? year : 2000
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

function getStatisticsTabForTutorialStepKey(
  stepKey?: string | null,
): {
  mainTab: MainTab
  teamSubTab: TeamSubTab
  riderSubTab: RiderSubTab
} {
  switch (stepKey) {
    case 'statistics-teams-history':
      return {
        mainTab: 'teams',
        teamSubTab: 'history',
        riderSubTab: 'rankings',
      }

    case 'statistics-riders':
      return {
        mainTab: 'riders',
        teamSubTab: 'current',
        riderSubTab: 'rankings',
      }

    case 'statistics-teams-current':
    default:
      return {
        mainTab: 'teams',
        teamSubTab: 'current',
        riderSubTab: 'rankings',
      }
  }
}

export default function StatisticsPage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation('statistics')

  const formatCompetitionLabel = useCallback(
    (value: string | null | undefined) => {
      if (!value) return '—'

      const translationKey =
        COMPETITION_LABEL_KEYS[value as CompetitionLabelCode] ??
        COMPETITION_LABEL_KEYS[value.toLowerCase() as CompetitionLabelCode] ??
        COMPETITION_LABEL_KEYS[value.toUpperCase() as CompetitionLabelCode]

      return translationKey ? t(translationKey) : toTitleCase(value.replace(/_/g, ' '))
    },
    [t]
  )

  const formatRiderMetricLabel = useCallback(
    (metric: RiderMetric, variant: RiderMetricLabelVariant = 'label') =>
      t(RIDER_METRIC_LABEL_KEYS[metric][variant]),
    [t]
  )

  const getDivisionLabel = useCallback(
    (team: TeamCurrentRow | TeamSnapshotRow) =>
      formatCompetitionLabel(getDivisionValue(team)),
    [formatCompetitionLabel]
  )

  const displayLocale = useMemo(() => {
    const resolvedLanguage = i18n.resolvedLanguage

    if (resolvedLanguage?.startsWith('sr')) return 'sr-Latn-RS'
    if (resolvedLanguage?.startsWith('en')) return 'en-US'
    if (resolvedLanguage?.startsWith('de')) return 'de-DE'

    return resolvedLanguage || 'en-US'
  }, [i18n.resolvedLanguage])

  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(displayLocale, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }),
    [displayLocale]
  )

  const storedStatisticsState = useMemo(() => readStoredStatisticsPageState(), [])
  const storedMainTab = storedStatisticsState?.mainTab
  const storedTeamSubTab = storedStatisticsState?.teamSubTab
  const storedRiderSubTab = storedStatisticsState?.riderSubTab

  const [mainTab, setMainTab] = useState<MainTab>(
    isMainTab(storedMainTab) ? storedMainTab : 'teams'
  )
  const [teamSubTab, setTeamSubTab] = useState<TeamSubTab>(
    isTeamSubTab(storedTeamSubTab) ? storedTeamSubTab : 'current'
  )
  const [riderSubTab, setRiderSubTab] = useState<RiderSubTab>(
    isRiderSubTab(storedRiderSubTab) ? storedRiderSubTab : 'rankings'
  )

  const [tutorialLoading, setTutorialLoading] = useState(true)
  const [tutorialMode, setTutorialMode] = useState<'closed' | 'invite' | 'steps'>('closed')
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)

  const [sharedLoading, setSharedLoading] = useState(true)
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number>(1)
  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)
  const [statisticsRefreshNonce, setStatisticsRefreshNonce] = useState(0)

  const [teamRows, setTeamRows] = useState<TeamCurrentRow[]>([])
  const [winnerRows, setWinnerRows] = useState<TeamWinnerRow[]>([])
  const [snapshotRows, setSnapshotRows] = useState<TeamSnapshotRow[]>([])
  const [riderRows, setRiderRows] = useState<RiderStatsRow[]>([])
  const [countries, setCountries] = useState<CountryRow[]>([])

  const [teamHistoryLoaded, setTeamHistoryLoaded] = useState(false)

  const [teamCurrentLoading, setTeamCurrentLoading] = useState(false)
  const [teamHistoryLoading, setTeamHistoryLoading] = useState(false)
  const [ridersLoading, setRidersLoading] = useState(false)

  const [teamCurrentError, setTeamCurrentError] = useState<string | null>(null)
  const [teamHistoryError, setTeamHistoryError] = useState<string | null>(null)
  const [ridersError, setRidersError] = useState<string | null>(null)

  const loading =
    sharedLoading ||
    (mainTab === 'teams'
      ? teamSubTab === 'current'
        ? teamCurrentLoading
        : teamHistoryLoading
      : ridersLoading)

  const error =
    mainTab === 'teams'
      ? teamSubTab === 'current'
        ? teamCurrentError
        : teamHistoryError
      : ridersError

  const [myClubIds, setMyClubIds] = useState<string[]>([])

  const [search, setSearch] = useState(storedStatisticsState?.search ?? '')
  const [seasonFilter, setSeasonFilter] = useState<string>(
    storedStatisticsState?.seasonFilter ?? 'all'
  )
  const storedTeamTypeFilter = storedStatisticsState?.teamTypeFilter
  const storedStatusFilter = storedStatisticsState?.statusFilter
  const storedRiderMetric = storedStatisticsState?.riderMetric
  const storedRiderTableMetric = storedStatisticsState?.riderTableMetric

  const [teamTypeFilter, setTeamTypeFilter] = useState<TeamTypeFilter>(
    isTeamTypeFilter(storedTeamTypeFilter) ? storedTeamTypeFilter : 'all'
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    isStatusFilter(storedStatusFilter) ? storedStatusFilter : 'all'
  )
  const [tierFilter, setTierFilter] = useState(storedStatisticsState?.tierFilter ?? 'all')
  const [divisionFilter, setDivisionFilter] = useState(
    storedStatisticsState?.divisionFilter ?? 'all'
  )
  const [countryFilter, setCountryFilter] = useState(
    storedStatisticsState?.countryFilter ?? 'all'
  )
  const [riderMetric, setRiderMetric] = useState<RiderMetric>(
    isRiderMetric(storedRiderMetric) ? storedRiderMetric : 'season_points_overall'
  )
  const [riderTableMetric, setRiderTableMetric] = useState<RiderMetric>(
    isRiderMetric(storedRiderTableMetric)
      ? storedRiderTableMetric
      : 'season_points_overall'
  )

  const [teamCurrentPage, setTeamCurrentPage] = useState(
    normalizeStoredPage(storedStatisticsState?.teamCurrentPage, 1)
  )
  const [teamHistoryPage, setTeamHistoryPage] = useState(
    normalizeStoredPage(storedStatisticsState?.teamHistoryPage, 1)
  )
  const [ridersPage, setRidersPage] = useState(
    normalizeStoredPage(storedStatisticsState?.ridersPage, 1)
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const state: StoredStatisticsPageState = {
      mainTab,
      teamSubTab,
      riderSubTab,
      search,
      seasonFilter,
      teamTypeFilter,
      statusFilter,
      tierFilter,
      divisionFilter,
      countryFilter,
      riderMetric,
      riderTableMetric,
      teamCurrentPage,
      teamHistoryPage,
      ridersPage,
    }

    window.sessionStorage.setItem(STATISTICS_STATE_STORAGE_KEY, JSON.stringify(state))
  }, [
    mainTab,
    teamSubTab,
    riderSubTab,
    search,
    seasonFilter,
    teamTypeFilter,
    statusFilter,
    tierFilter,
    divisionFilter,
    countryFilter,
    riderMetric,
    riderTableMetric,
    teamCurrentPage,
    teamHistoryPage,
    ridersPage,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (loading) return

    const shouldRestore = window.sessionStorage.getItem(STATISTICS_RESTORE_PENDING_KEY)
    if (shouldRestore !== '1') return

    const rawScrollY = window.sessionStorage.getItem(STATISTICS_RESTORE_SCROLL_KEY)
    const scrollY = rawScrollY ? Number(rawScrollY) : 0
    if (!Number.isFinite(scrollY)) return

    window.sessionStorage.removeItem(STATISTICS_RESTORE_PENDING_KEY)

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({
          top: Math.max(0, scrollY),
          behavior: 'auto',
        })
      })
    })
  }, [loading, mainTab, teamSubTab, riderSubTab])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const refreshLiveStatistics = () => {
      setStatisticsRefreshNonce(value => value + 1)
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshLiveStatistics()
    }

    window.addEventListener('focus', refreshLiveStatistics)
    window.addEventListener('pageshow', refreshLiveStatistics)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.removeEventListener('focus', refreshLiveStatistics)
      window.removeEventListener('pageshow', refreshLiveStatistics)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  function saveStatisticsReturnState() {
    if (typeof window === 'undefined') return

    const state: StoredStatisticsPageState = {
      mainTab,
      teamSubTab,
      riderSubTab,
      search,
      seasonFilter,
      teamTypeFilter,
      statusFilter,
      tierFilter,
      divisionFilter,
      countryFilter,
      riderMetric,
      riderTableMetric,
      teamCurrentPage,
      teamHistoryPage,
      ridersPage,
    }

    window.sessionStorage.setItem(STATISTICS_STATE_STORAGE_KEY, JSON.stringify(state))
    window.sessionStorage.setItem(STATISTICS_RESTORE_SCROLL_KEY, String(window.scrollY ?? 0))
    window.sessionStorage.setItem(STATISTICS_RESTORE_PENDING_KEY, '1')
  }

  useEffect(() => {
    let alive = true

    async function loadStatisticsTutorialProgress() {
      setTutorialLoading(true)

      const autoStartTutorial =
        window.sessionStorage.getItem('ppm:auto-start-tutorial') === 'statistics'

      if (autoStartTutorial) {
        window.sessionStorage.removeItem('ppm:auto-start-tutorial')

        const firstStep = statisticsTutorialSteps[0]

        await saveTutorialProgress('statistics', 'started', firstStep?.key ?? null)

        if (!alive) return

        setMainTab('teams')
        setTeamSubTab('current')
        setRiderSubTab('rankings')
        setTutorialStepIndex(0)
        setTutorialMode('steps')
        setTutorialLoading(false)
        return
      }

      const progress = await getTutorialProgress('statistics')

      if (!alive) return

      if (progress?.status === 'started') {
        const savedStepIndex = statisticsTutorialSteps.findIndex(
          (step) => step.key === progress.last_step_key,
        )

        const nextStepIndex = savedStepIndex >= 0 ? savedStepIndex : 0
        const tabs = getStatisticsTabForTutorialStepKey(
          statisticsTutorialSteps[nextStepIndex]?.key,
        )

        setMainTab(tabs.mainTab)
        setTeamSubTab(tabs.teamSubTab)
        setRiderSubTab(tabs.riderSubTab)
        setTutorialStepIndex(nextStepIndex)
        setTutorialMode('steps')
      } else {
        setTutorialMode('closed')
      }

      setTutorialLoading(false)
    }

    void loadStatisticsTutorialProgress()

    return () => {
      alive = false
    }
  }, [])

  async function handleStartStatisticsTutorial() {
    const firstStep = statisticsTutorialSteps[0]

    await saveTutorialProgress('statistics', 'started', firstStep?.key ?? null)

    setMainTab('teams')
    setTeamSubTab('current')
    setRiderSubTab('rankings')
    setTutorialStepIndex(0)
    setTutorialMode('steps')
  }

  async function handleSkipStatisticsTutorial() {
    await saveTutorialProgress('statistics', 'skipped', null)
    setTutorialMode('closed')
  }

  async function handleNextStatisticsTutorialStep() {
    const currentStep = statisticsTutorialSteps[tutorialStepIndex]
    const isLastStep = tutorialStepIndex >= statisticsTutorialSteps.length - 1

    if (!isLastStep) {
      const nextIndex = tutorialStepIndex + 1
      const nextStep = statisticsTutorialSteps[nextIndex]
      const tabs = getStatisticsTabForTutorialStepKey(nextStep.key)

      setMainTab(tabs.mainTab)
      setTeamSubTab(tabs.teamSubTab)
      setRiderSubTab(tabs.riderSubTab)

      await saveTutorialProgress('statistics', 'started', nextStep.key)

      setTutorialStepIndex(nextIndex)
      return
    }

    await saveTutorialProgress('statistics', 'completed', currentStep?.key ?? null)

    window.sessionStorage.setItem('ppm:auto-start-tutorial', 'transfers')
    navigate('/dashboard/transfers')
  }

  async function handleFinishStatisticsTutorialForNow() {
    const currentStep = statisticsTutorialSteps[tutorialStepIndex]

    await saveTutorialProgress('statistics', 'completed', currentStep?.key ?? null)

    setTutorialMode('closed')
  }

  async function handleCloseStatisticsTutorial() {
    const currentStep = statisticsTutorialSteps[tutorialStepIndex]

    if (tutorialMode === 'invite') {
      await saveTutorialProgress('statistics', 'skipped', null)
      setTutorialMode('closed')
      return
    }

    if (tutorialMode === 'steps') {
      await saveTutorialProgress(
        'statistics',
        'started',
        currentStep?.key ?? null,
      )
    }

    setTutorialMode('closed')
  }

  function openTeamProfile(teamId: string) {
    saveStatisticsReturnState()

    navigate(`/dashboard/teams/${teamId}`, {
      state: {
        returnTo: '/dashboard/statistics',
        preserveStatisticsState: true,
      },
    })
  }

  function openRiderProfile(rider: Pick<RiderStatsRow, 'id' | 'club_id'> | null | undefined) {
    const riderId = rider?.id?.trim()

    if (!riderId) {
      console.error('Statistics rider has no resolved riders.id:', rider)
      return
    }

    const isMyRider = !!rider?.club_id && myClubIds.includes(rider.club_id)

    saveStatisticsReturnState()

    navigate(
      isMyRider
        ? `/dashboard/my-riders/${riderId}`
        : `/dashboard/external-riders/${riderId}`,
      {
        state: {
          returnTo: '/dashboard/statistics',
          preserveStatisticsState: true,
        },
      }
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
    let cancelled = false

    async function loadSharedStatisticsContext() {
      setSharedLoading(true)

      try {
        const [countriesRes, currentSeasonRes, currentGameDateRes] = await Promise.all([
          supabase.from('countries').select('code, name'),
          supabase.rpc('get_current_season_number'),
          supabase.rpc('get_current_game_date'),
        ])

        if (cancelled) return

        if (countriesRes.error) {
          console.warn('Failed to load countries for statistics page:', countriesRes.error.message)
          setCountries([])
        } else {
          setCountries((countriesRes.data ?? []) as CountryRow[])
        }

        const currentSeason =
          currentSeasonRes.error ||
          currentSeasonRes.data === null ||
          currentSeasonRes.data === undefined
            ? 1
            : Number(currentSeasonRes.data)

        if (currentSeasonRes.error) {
          console.warn(
            'Failed to load current season for statistics page:',
            currentSeasonRes.error.message
          )
        }

        const normalizedGameDate = currentGameDateRes.error
          ? null
          : normalizeGameDateValue(currentGameDateRes.data)

        if (currentGameDateRes.error) {
          console.warn(
            'Failed to load current game date for statistics page:',
            currentGameDateRes.error.message
          )
        }

        setCurrentSeasonNumber(
          Number.isFinite(currentSeason) && currentSeason > 0 ? currentSeason : 1
        )
        setCurrentGameDate(normalizedGameDate)
      } catch (err) {
        console.error('Failed to load shared statistics context:', err)
      } finally {
        if (!cancelled) setSharedLoading(false)
      }
    }

    void loadSharedStatisticsContext()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (mainTab !== 'teams' || teamSubTab !== 'current' || sharedLoading) return

    let cancelled = false

    async function loadCurrentTeams() {
      setTeamCurrentLoading(true)
      setTeamCurrentError(null)

      try {
        const targetSeasonYear =
          currentGameDate !== null
            ? getSeasonYearFromGameDate(currentGameDate)
            : 1999 + currentSeasonNumber

        const [teamsRes, internationalPointsRes] = await Promise.all([
          supabase.from('team_rankings_view').select('*'),
          supabase
            .from('team_international_points_by_season_v1')
            .select('team_id, international_points')
            .eq('season_year', targetSeasonYear),
        ])

        const firstError = teamsRes.error || internationalPointsRes.error
        if (firstError) throw firstError

        const rawTeams = (teamsRes.data ?? []) as TeamCurrentRow[]
        const internationalPointsRows =
          (internationalPointsRes.data ?? []) as TeamInternationalPointsRow[]
        const internationalPointsByTeamId = new Map(
          internationalPointsRows.map(row => [
            row.team_id,
            normalizeNumberLike(row.international_points, 0),
          ])
        )
        const displayNameByClubId = await loadClubDisplayNameMap(
          rawTeams.map(team => team.id)
        )

        if (cancelled) return

        setTeamRows(
          rawTeams.map(team => ({
            ...team,
            name: getClubDisplayNameFromMap(displayNameByClubId, team.id, team.name),
            // The Statistics page labels this column as UCI / international points.
            // Keep normal division ranking points in team_rankings_view untouched and
            // merge the dedicated international season total only for this page.
            season_points: internationalPointsByTeamId.get(team.id) ?? 0,
          }))
        )
      } catch (err: any) {
        if (!cancelled) {
          setTeamCurrentError(err?.message ?? t('page.loadFailed'))
        }
      } finally {
        if (!cancelled) setTeamCurrentLoading(false)
      }
    }

    void loadCurrentTeams()

    return () => {
      cancelled = true
    }
  }, [
    mainTab,
    teamSubTab,
    sharedLoading,
    currentGameDate,
    currentSeasonNumber,
    statisticsRefreshNonce,
    t,
  ])

  useEffect(() => {
    if (mainTab !== 'teams' || teamSubTab !== 'history' || teamHistoryLoaded) return

    let cancelled = false

    async function loadTeamHistory() {
      setTeamHistoryLoading(true)
      setTeamHistoryError(null)

      try {
        const [winnersRes, snapshotsRes] = await Promise.all([
          supabase.from('team_ranking_past_winners').select('*'),
          supabase.from('team_ranking_season_snapshots').select('*'),
        ])

        const firstError = winnersRes.error || snapshotsRes.error
        if (firstError) throw firstError

        const winners = (winnersRes.data ?? []) as TeamWinnerRow[]
        const snapshots = (snapshotsRes.data ?? []) as TeamSnapshotRow[]
        const displayNameByClubId = await loadClubDisplayNameMap([
          ...winners.map(row => row.club_id),
          ...snapshots.map(row => row.club_id),
        ])

        if (cancelled) return

        setWinnerRows(
          winners.map(row => ({
            ...row,
            club_name: getClubDisplayNameFromMap(
              displayNameByClubId,
              row.club_id,
              row.club_name
            ),
          }))
        )

        setSnapshotRows(
          snapshots.map(row => ({
            ...row,
            club_name: getClubDisplayNameFromMap(
              displayNameByClubId,
              row.club_id,
              row.club_name
            ),
          }))
        )

        setTeamHistoryLoaded(true)
      } catch (err: any) {
        if (!cancelled) {
          setTeamHistoryError(err?.message ?? t('page.loadFailed'))
        }
      } finally {
        if (!cancelled) setTeamHistoryLoading(false)
      }
    }

    void loadTeamHistory()

    return () => {
      cancelled = true
    }
  }, [mainTab, teamSubTab, teamHistoryLoaded, t])

  useEffect(() => {
    if (mainTab !== 'riders' || sharedLoading) return

    let cancelled = false

    async function loadRiders() {
      setRidersLoading(true)
      setRidersError(null)

      try {
        const targetSeasonYear =
          currentGameDate !== null
            ? getSeasonYearFromGameDate(currentGameDate)
            : 1999 + currentSeasonNumber

        const { data, error: queryError } = await supabase
          .from('rider_statistics_page_international_v1')
          .select('*')
          .eq('season_year', targetSeasonYear)

        if (queryError) throw queryError

        const riders = (data ?? []) as Record<string, unknown>[]
        const displayNameByClubId = await loadClubDisplayNameMap(
          riders.map(riderRaw => resolveStringValue(riderRaw, ['club_id']))
        )

        if (cancelled) return

        const mergedRiders: RiderStatsRow[] = riders
          .map(riderRaw => {
            const riderId =
              resolveStringValue(riderRaw, ['rider_id', 'id', 'riders_id', 'player_id', 'person_id']) ??
              ''

            if (!riderId) {
              console.warn('Unresolved statistics rider row:', {
                availableKeys: Object.keys(riderRaw),
                riderRaw,
              })
              return null
            }

            const clubId = resolveStringValue(riderRaw, ['club_id'])
            const birthDate =
              resolveStringValue(riderRaw, ['birth_date', 'dob', 'date_of_birth']) ?? null
            const clubIsAiRaw = riderRaw.club_is_ai
            const clubIsActiveRaw = riderRaw.club_is_active

            const seasonPointsOverall = normalizeNumberLike(
              resolveNumberValue(riderRaw, [
                'season_points_overall',
                'international_points',
                'points',
              ]),
              0
            )

            const seasonPointsSprint = normalizeNumberLike(
              resolveNumberValue(riderRaw, ['season_points_sprint', 'stage_finish_points']),
              0
            )

            const seasonPointsClimbingRaw = resolveNumberValue(riderRaw, [
              'season_points_climbing',
            ])

            const seasonPointsClimbing =
              seasonPointsClimbingRaw !== null
                ? normalizeNumberLike(seasonPointsClimbingRaw, 0)
                : normalizeNumberLike(resolveNumberValue(riderRaw, ['final_gc_points']), 0) +
                  normalizeNumberLike(resolveNumberValue(riderRaw, ['oneday_finish_points']), 0) +
                  normalizeNumberLike(resolveNumberValue(riderRaw, ['leader_day_points']), 0)

            const stageWins = normalizeNumberLike(
              resolveNumberValue(riderRaw, ['stage_wins', 'podiums']),
              0
            )

            const finalJerseys = normalizeNumberLike(
              resolveNumberValue(riderRaw, ['final_jerseys', 'jerseys']),
              0
            )

            return {
              id: riderId,
              display_name:
                resolveStringValue(riderRaw, ['display_name', 'name']) ?? 'Unknown rider',
              country_code:
                resolveStringValue(riderRaw, ['country_code', 'nationality_code', 'country']) ??
                null,
              club_country_code:
                resolveStringValue(riderRaw, ['club_country_code', 'team_country_code']) ?? null,
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
              birth_date: birthDate,
              market_value: resolveNumberValue(riderRaw, ['market_value']),
              salary: resolveNumberValue(riderRaw, ['salary']),
              contract_expires_season: resolveNumberValue(riderRaw, [
                'contract_expires_season',
              ]),
              availability_status:
                resolveStringValue(riderRaw, ['availability_status']) ?? 'fit',
              fatigue: resolveNumberValue(riderRaw, ['fatigue']),
              image_url: resolveStringValue(riderRaw, ['image_url']),
              club_id: clubId,
              club_name: getClubDisplayNameFromMap(
                displayNameByClubId,
                clubId,
                resolveStringValue(riderRaw, ['club_name'])
              ),
              club_tier: resolveStringValue(riderRaw, ['club_tier']),
              club_is_ai: typeof clubIsAiRaw === 'boolean' ? clubIsAiRaw : null,
              club_is_active:
                typeof clubIsActiveRaw === 'boolean' ? clubIsActiveRaw : null,
              age_years: getAgeYearsAtDate(birthDate, currentGameDate),
              season_points_overall: seasonPointsOverall,
              season_points_sprint: seasonPointsSprint,
              season_points_climbing: seasonPointsClimbing,
              podiums: stageWins,
              jerseys: finalJerseys,
              stage_wins: stageWins,
              final_jerseys: finalJerseys,
            } satisfies RiderStatsRow
          })
          .filter(row => row !== null) as RiderStatsRow[]

        setRiderRows(mergedRiders)
      } catch (err: any) {
        if (!cancelled) {
          setRidersError(err?.message ?? t('page.loadFailed'))
        }
      } finally {
        if (!cancelled) setRidersLoading(false)
      }
    }

    void loadRiders()

    return () => {
      cancelled = true
    }
  }, [
    mainTab,
    sharedLoading,
    currentGameDate,
    currentSeasonNumber,
    statisticsRefreshNonce,
    t,
  ])

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
    const historyTiers = historicalSnapshotRows.map(row => row.club_tier)
    const riderTiers = riderRows.map(row => row.club_tier).filter(Boolean) as string[]
    return Array.from(new Set([...teamTiers, ...historyTiers, ...riderTiers])).sort((a, b) =>
      formatCompetitionLabel(a).localeCompare(formatCompetitionLabel(b))
    )
  }, [teamRows, historicalSnapshotRows, riderRows, formatCompetitionLabel])

  const availableDivisions = useMemo(() => {
    const currentDivisions = teamRows.map(row => getDivisionValue(row))
    const historyDivisions = historicalSnapshotRows.map(row => row.division)
    return Array.from(
      new Set([...currentDivisions, ...historyDivisions].filter(Boolean) as string[])
    ).sort((a, b) => formatCompetitionLabel(a).localeCompare(formatCompetitionLabel(b)))
  }, [teamRows, historicalSnapshotRows, formatCompetitionLabel])

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
  }, [filteredRiders, formatCompetitionLabel])

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
  const topPodiumsRider = [...filteredRiders].sort((a, b) => {
    const podiumDiff = (b.podiums ?? 0) - (a.podiums ?? 0)
    if (podiumDiff !== 0) return podiumDiff
    return (b.season_points_overall ?? 0) - (a.season_points_overall ?? 0)
  })[0]

  const topJerseysRider = [...filteredRiders].sort((a, b) => {
    const jerseyDiff = (b.jerseys ?? 0) - (a.jerseys ?? 0)
    if (jerseyDiff !== 0) return jerseyDiff
    return (b.season_points_overall ?? 0) - (a.season_points_overall ?? 0)
  })[0]

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">{t('page.title')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('page.subtitle')}</p>
        </div>

        <div className="shrink-0 self-start md:self-start">
          <StatsTabGroup
            items={[
              { key: 'teams', label: t('page.teams') },
              { key: 'riders', label: t('page.riders') },
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
          topPodiumsRider={topPodiumsRider}
          topJerseysRider={topJerseysRider}
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

      {!tutorialLoading && tutorialMode === 'invite' ? (
        <TutorialOverlay
          open
          variant="invite"
          title={statisticsWelcomeTutorial.title}
          body={statisticsWelcomeTutorial.body}
          primaryAction={statisticsWelcomeTutorial.primaryAction}
          secondaryAction={statisticsWelcomeTutorial.secondaryAction}
          onPrimary={handleStartStatisticsTutorial}
          onSecondary={handleSkipStatisticsTutorial}
          onClose={handleCloseStatisticsTutorial}
        />
      ) : null}

      {!tutorialLoading && tutorialMode === 'steps' ? (
        <TutorialOverlay
          open
          variant="panel"
          title={statisticsTutorialSteps[tutorialStepIndex].title}
          body={statisticsTutorialSteps[tutorialStepIndex].body}
          stepLabel={`${tutorialStepIndex + 1}/${statisticsTutorialSteps.length}`}
          primaryAction={
            statisticsTutorialSteps[tutorialStepIndex].primaryAction ?? 'Next'
          }
          secondaryAction={
            tutorialStepIndex === statisticsTutorialSteps.length - 1
              ? statisticsTutorialSteps[tutorialStepIndex].secondaryAction
              : 'Skip tutorial'
          }
          onPrimary={handleNextStatisticsTutorialStep}
          onSecondary={
            tutorialStepIndex === statisticsTutorialSteps.length - 1
              ? handleFinishStatisticsTutorialForNow
              : handleSkipStatisticsTutorial
          }
          onClose={handleCloseStatisticsTutorial}
        />
      ) : null}
    </div>
  )
}
