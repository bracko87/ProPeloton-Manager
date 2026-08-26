/**
 * TEAM LOGO CONSISTENCY FIX:
 * - public.clubs.logo_path is the current source of truth for team logos.
 * - Team Ranking hydrates the latest logo_path directly from public.clubs.
 * - External http(s) logos are used directly.
 * - club-logos storage paths are converted to public display URLs.
 * - This prevents newly created/customized club logos from showing as "No logo".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import TutorialOverlay from '../../components/tutorial/TutorialOverlay'
import { teamRankingTutorialSteps } from '../../lib/tutorials'
import {
  getTutorialProgress,
  saveTutorialProgress,
} from '../../lib/tutorialProgress'
import {
  AmateurDivision,
  AMATEUR_DIVISIONS,
  CompetitionDivision,
  TeamRankingRecord,
  TEAM_TIERS,
  Tier2Division,
  TIER2_DIVISIONS,
  Tier3Division,
  TIER3_DIVISIONS,
} from '../../constants/teamRanking'
import { supabase } from '../../lib/supabase'
import { getTeamRankingTeams } from '../../services/teamRanking.service'
import {
  getAmateurDivisionStandings,
  getTier2DivisionStandings,
  getTier3DivisionStandings,
  getWorldStandings,
} from '../../utils/teamRanking.utils'

type StandingType = 'WORLD' | 'TIER2' | 'TIER3' | 'AMATEUR'

type StandingOption = {
  key: string
  divisionLabelKey: string
  type: StandingType
  division: CompetitionDivision
  promotionKey?: string
  playoffKey?: string
  relegationKey?: string
}

type PublicInactivityStatus = 'inactive' | 'season_end_removal_pending'

type ClubPublicInactivityRow = {
  club_id: string
  public_inactivity_status: PublicInactivityStatus | null
  inactivity_days_snapshot: number | null
  season_end_transition_pending: boolean | null
}

type ClubPublicInactivityUi = {
  status: PublicInactivityStatus | null
  days: number | null
  seasonEndTransitionPending: boolean
}

type StandingRow = {
  id: string
  position: number
  teamName: string
  countryCode: string
  points: number
  completedRaceCount: number
  raceReputationValue: number
  logoPath?: string | null
  isActive: boolean
  publicInactivityStatus: PublicInactivityStatus | null
  inactivityDaysSnapshot: number | null
  seasonEndTransitionPending: boolean
}

type OrderedTeamStandingRow = {
  season_year?: number | string | null
  team_id?: string | null
  ranking_position?: number | string | null
  international_points?: number | string | null
  completed_race_count?: number | string | null
  race_reputation_value?: number | string | null
}

type OrderedTeamStandingUi = {
  seasonYear: number | null
  rankingPosition: number | null
  internationalPoints: number
  completedRaceCount: number
  raceReputationValue: number
}

type TierOption = {
  value: TeamRankingRecord['tier']
  labelKey: string
}

type DivisionSelectOption = {
  value: CompetitionDivision
  labelKey: string
}

type TeamLogoProps = {
  src?: string | null
  teamName: string
  className?: string
}

type CountryFlagProps = {
  countryCode?: string | null
  className?: string
}

type PastWinnerRecord = {
  season_number: number
  club_id: string
  club_name: string
  country_code: string
  points: number
  logo_path: string | null
}

type MyOwnedClubRecord = {
  id: string
  club_type: 'main' | 'developing' | string | null
  club_tier: string | null
  tier2_division: Tier2Division | null
  tier3_division: Tier3Division | null
  amateur_division: AmateurDivision | null
}

type ClubDisplayNameLookupRow = {
  club_id: string
  display_name: string | null
  original_name?: string | null
  full_display_name?: string | null
}

type ClubLogoLookupRow = {
  id: string
  logo_path: string | null
}

function resolveClubLogoDisplayUrl(logoPath?: string | null): string | null {
  const value = typeof logoPath === 'string' ? logoPath.trim() : ''
  if (!value) return null

  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('blob:')
  ) {
    return value
  }

  const { data } = supabase.storage.from('club-logos').getPublicUrl(value)
  return data?.publicUrl ?? null
}

async function loadClubLogoPathMap(
  clubIds: Array<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const uniqueClubIds = Array.from(
    new Set(
      clubIds
        .map((clubId) => clubId?.trim())
        .filter((clubId): clubId is string => Boolean(clubId)),
    ),
  )

  if (uniqueClubIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('clubs')
    .select('id, logo_path')
    .in('id', uniqueClubIds)

  if (error) {
    console.warn('Could not load current club logos for team ranking:', error.message)
    return new Map()
  }

  const logoMap = new Map<string, string | null>()

  for (const row of (data ?? []) as ClubLogoLookupRow[]) {
    logoMap.set(row.id, row.logo_path ?? null)
  }

  return logoMap
}

async function loadClubDisplayNameMap(
  clubIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const uniqueClubIds = Array.from(
    new Set(
      clubIds
        .map((clubId) => clubId?.trim())
        .filter((clubId): clubId is string => Boolean(clubId)),
    ),
  )

  if (uniqueClubIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase.rpc('get_club_display_names_v1', {
    p_club_ids: uniqueClubIds,
  })

  if (error) {
    console.warn('Could not load club display names for team ranking:', error.message)
    return new Map()
  }

  const displayNameByClubId = new Map<string, string>()

  for (const row of (data ?? []) as ClubDisplayNameLookupRow[]) {
    const clubId = row.club_id?.trim()
    const displayName = row.display_name?.trim()

    if (clubId && displayName) {
      displayNameByClubId.set(clubId, displayName)
    }
  }

  return displayNameByClubId
}

async function loadPublicClubInactivityMap(
  clubIds: Array<string | null | undefined>,
): Promise<Map<string, ClubPublicInactivityUi>> {
  const uniqueClubIds = Array.from(
    new Set(
      clubIds
        .map((clubId) => clubId?.trim())
        .filter((clubId): clubId is string => Boolean(clubId)),
    ),
  )

  if (uniqueClubIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase.rpc('get_public_club_inactivity_statuses_v1', {
    p_club_ids: uniqueClubIds,
  })

  if (error) {
    console.warn('Could not load public inactivity statuses for team ranking:', error.message)
    return new Map()
  }

  const map = new Map<string, ClubPublicInactivityUi>()

  for (const row of (data ?? []) as ClubPublicInactivityRow[]) {
    const clubId = row.club_id?.trim()

    if (!clubId) continue

    map.set(clubId, {
      status: row.public_inactivity_status ?? null,
      days: row.inactivity_days_snapshot ?? null,
      seasonEndTransitionPending: row.season_end_transition_pending === true,
    })
  }

  return map
}

function normalizePointsValue(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeTieBreakerValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function getTeamRecordNumber(
  team: TeamRankingRecord,
  keys: string[],
): number {
  const record = team as unknown as Record<string, unknown>

  for (const key of keys) {
    const value = normalizeTieBreakerValue(record[key])

    if (value !== 0) {
      return value
    }
  }

  return 0
}

function getCompletedRaceCountFromTeam(team: TeamRankingRecord): number {
  return getTeamRecordNumber(team, [
    'completedRaceCount',
    'seasonRaceCount',
    'racesDoneCount',
    'totalRacesDone',
    'teamRaceCount',
    'completed_race_count',
    'season_race_count',
    'races_done_count',
    'total_races_done',
    'team_race_count',
  ])
}

function getRaceReputationValueFromTeam(team: TeamRankingRecord): number {
  return getTeamRecordNumber(team, [
    'raceReputationValue',
    'teamRaceReputationValue',
    'raceReputation',
    'race_reputation_value',
    'team_race_reputation_value',
    'race_reputation',
  ])
}

function formatTieBreakerNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'

  return value.toLocaleString(undefined, {
    maximumFractionDigits: value % 1 === 0 ? 0 : 1,
  })
}

async function loadOrderedTeamStandingsByTeamId(): Promise<Map<string, OrderedTeamStandingUi>> {
  try {
    const { data, error } = await supabase.rpc('team_ranking_get_ordered_standings_v1')

    if (error) {
      console.warn(
        'Could not load canonical team standings. Falling back to team ranking records:',
        error.message,
      )
      return new Map()
    }

    const map = new Map<string, OrderedTeamStandingUi>()

    for (const row of (data ?? []) as OrderedTeamStandingRow[]) {
      const teamId = row.team_id?.trim()

      if (!teamId) continue

      const seasonYear = normalizeTieBreakerValue(row.season_year)
      const rankingPosition = normalizeTieBreakerValue(row.ranking_position)

      map.set(teamId, {
        seasonYear: seasonYear > 0 ? seasonYear : null,
        rankingPosition: rankingPosition > 0 ? rankingPosition : null,
        internationalPoints: normalizePointsValue(row.international_points),
        completedRaceCount: normalizeTieBreakerValue(row.completed_race_count),
        raceReputationValue: normalizeTieBreakerValue(row.race_reputation_value),
      })
    }

    return map
  } catch (error) {
    console.warn(
      'Canonical team standings lookup failed. Falling back to team ranking records:',
      error,
    )
    return new Map()
  }
}

const TIER_OPTIONS: TierOption[] = [
  { value: TEAM_TIERS.WORLD, labelKey: 'tiers.world' },
  { value: TEAM_TIERS.PRO, labelKey: 'tiers.pro' },
  { value: TEAM_TIERS.CONTINENTAL, labelKey: 'tiers.continental' },
  { value: TEAM_TIERS.AMATEUR, labelKey: 'tiers.amateur' },
]

const DIVISION_TRANSLATION_KEYS: Record<CompetitionDivision, string> = {
  WORLD: 'divisions.world',
  PRO_WEST: 'divisions.proWest',
  PRO_EAST: 'divisions.proEast',
  CONTINENTAL_EUROPE: 'divisions.continentalEurope',
  CONTINENTAL_AMERICA: 'divisions.continentalAmerica',
  CONTINENTAL_ASIA: 'divisions.continentalAsia',
  CONTINENTAL_AFRICA: 'divisions.continentalAfrica',
  CONTINENTAL_OCEANIA: 'divisions.continentalOceania',
  NORTH_AMERICA: 'divisions.northAmerica',
  SOUTH_AMERICA: 'divisions.southAmerica',
  WESTERN_EUROPE: 'divisions.westernEurope',
  CENTRAL_EUROPE: 'divisions.centralEurope',
  SOUTHERN_BALKAN_EUROPE: 'divisions.southernBalkanEurope',
  NORTHERN_EASTERN_EUROPE: 'divisions.northernEasternEurope',
  WEST_NORTH_AFRICA: 'divisions.westNorthAfrica',
  CENTRAL_SOUTH_AFRICA: 'divisions.centralSouthAfrica',
  WEST_CENTRAL_ASIA: 'divisions.westCentralAsia',
  SOUTH_ASIA: 'divisions.southAsia',
  EAST_SOUTHEAST_ASIA: 'divisions.eastSoutheastAsia',
  OCEANIA: 'divisions.oceania',
}

function getDefaultDivisionForTier(
  tier: TeamRankingRecord['tier'],
): CompetitionDivision | null {
  if (tier === TEAM_TIERS.PRO) {
    return Object.values(TIER2_DIVISIONS)[0] ?? null
  }

  if (tier === TEAM_TIERS.CONTINENTAL) {
    return Object.values(TIER3_DIVISIONS)[0] ?? null
  }

  if (tier === TEAM_TIERS.AMATEUR) {
    return Object.values(AMATEUR_DIVISIONS)[0] ?? null
  }

  return null
}

function isDivisionAllowedForTier(
  tier: TeamRankingRecord['tier'],
  division: CompetitionDivision | null,
): division is CompetitionDivision {
  if (!division) return false

  if (tier === TEAM_TIERS.WORLD) {
    return division === 'WORLD'
  }

  if (tier === TEAM_TIERS.PRO) {
    return Object.values(TIER2_DIVISIONS).includes(division as Tier2Division)
  }

  if (tier === TEAM_TIERS.CONTINENTAL) {
    return Object.values(TIER3_DIVISIONS).includes(division as Tier3Division)
  }

  if (tier === TEAM_TIERS.AMATEUR) {
    return Object.values(AMATEUR_DIVISIONS).includes(division as AmateurDivision)
  }

  return false
}

function resolveDivisionForTier(
  tier: TeamRankingRecord['tier'],
  division: CompetitionDivision | null,
): CompetitionDivision | null {
  if (tier === TEAM_TIERS.WORLD) {
    return null
  }

  if (isDivisionAllowedForTier(tier, division)) {
    return division
  }

  return getDefaultDivisionForTier(tier)
}

function safeCountryCode(countryCode?: string | null): string | null {
  const code = countryCode?.trim().toLowerCase()

  if (!code || !/^[a-z]{2}$/.test(code)) {
    return null
  }

  return code
}

function getCountryFlagUrl(countryCode: string): string {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

function getDisplayLocale(resolvedLanguage?: string): string {
  return resolvedLanguage?.startsWith('sr')
    ? 'sr-Latn-RS'
    : resolvedLanguage || 'en'
}

function getCountryName(
  countryCode: string | null | undefined,
  displayLocale: string,
  unknownCountryLabel: string,
): string {
  const safeCode = safeCountryCode(countryCode)

  if (!safeCode) {
    return unknownCountryLabel
  }

  const code = safeCode.toUpperCase()

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

function CountryFlag({ countryCode, className = '' }: CountryFlagProps): JSX.Element {
  const { t, i18n } = useTranslation('teamRanking')
  const displayLocale = getDisplayLocale(i18n.resolvedLanguage)
  const safeCode = safeCountryCode(countryCode)
  const countryName = getCountryName(
    countryCode,
    displayLocale,
    t('table.unknownCountry'),
  )
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [safeCode])

  const imageClassName = [
    'h-4 w-6 shrink-0 rounded-sm border border-slate-200 object-cover',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const fallbackClassName = [
    'inline-block h-4 w-6 shrink-0 rounded-sm border border-slate-200 bg-slate-100',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (!safeCode || imageFailed) {
    return (
      <span
        className={fallbackClassName}
        title={countryName}
        aria-label={countryName}
      />
    )
  }

  return (
    <img
      src={getCountryFlagUrl(safeCode)}
      alt={countryName}
      title={countryName}
      className={imageClassName}
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  )
}

function TeamLogo({ src, teamName, className = 'h-8 w-8' }: TeamLogoProps): JSX.Element {
  const { t } = useTranslation('teamRanking')
  const [imageFailed, setImageFailed] = useState(false)

  const resolvedSrc = useMemo(
    () => resolveClubLogoDisplayUrl(src),
    [src],
  )

  useEffect(() => {
    setImageFailed(false)
  }, [resolvedSrc])

  const showFallback = !resolvedSrc || imageFailed

  return (
    <div
      className={`flex shrink-0 ${className} items-center justify-center overflow-hidden rounded border border-slate-200 bg-white p-1`}
    >
      {showFallback ? (
        <span className="text-[10px] text-slate-400">{t('table.noLogo')}</span>
      ) : (
        <img
          src={resolvedSrc}
          alt={t('table.logoAlt', { team: teamName })}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  )
}

function isEuropeanAmateurDivision(division: CompetitionDivision): boolean {
  return (
    division === 'WESTERN_EUROPE' ||
    division === 'CENTRAL_EUROPE' ||
    division === 'SOUTHERN_BALKAN_EUROPE' ||
    division === 'NORTHERN_EASTERN_EUROPE'
  )
}

function getAmateurStandingDetails(
  division: CompetitionDivision,
): Pick<StandingOption, 'promotionKey' | 'playoffKey'> {
  if (division === 'OCEANIA') {
    return {
      promotionKey: 'zones.top3Promoted',
    }
  }

  if (isEuropeanAmateurDivision(division)) {
    return {
      promotionKey: 'zones.winnerPromoted',
      playoffKey: 'zones.secondThirdPlayoff',
    }
  }

  return {
    promotionKey: 'zones.winnerPromoted',
    playoffKey: 'zones.secondFourthPlayoff',
  }
}

function getStandingOption(
  tier: TeamRankingRecord['tier'],
  division: CompetitionDivision | null,
): StandingOption | null {
  const resolvedDivision = resolveDivisionForTier(tier, division)

  if (tier === TEAM_TIERS.WORLD) {
    return {
      key: 'world',
      divisionLabelKey: DIVISION_TRANSLATION_KEYS.WORLD,
      type: 'WORLD',
      division: 'WORLD',
      relegationKey: 'zones.bottom5',
    }
  }

  if (tier === TEAM_TIERS.PRO) {
    if (resolvedDivision === 'PRO_WEST') {
      return {
        key: 'pro-west',
        divisionLabelKey: DIVISION_TRANSLATION_KEYS.PRO_WEST,
        type: 'TIER2',
        division: 'PRO_WEST',
        promotionKey: 'zones.winnerPromoted',
        playoffKey: 'zones.worldPlayoff',
        relegationKey: 'zones.bottom5',
      }
    }

    if (resolvedDivision === 'PRO_EAST') {
      return {
        key: 'pro-east',
        divisionLabelKey: DIVISION_TRANSLATION_KEYS.PRO_EAST,
        type: 'TIER2',
        division: 'PRO_EAST',
        promotionKey: 'zones.winnerPromoted',
        playoffKey: 'zones.worldPlayoff',
        relegationKey: 'zones.bottom5',
      }
    }

    return null
  }

  if (tier === TEAM_TIERS.CONTINENTAL) {
    const standingMap: Record<Tier3Division, StandingOption> = {
      CONTINENTAL_EUROPE: {
        key: 'cont-europe',
        divisionLabelKey: DIVISION_TRANSLATION_KEYS.CONTINENTAL_EUROPE,
        type: 'TIER3',
        division: 'CONTINENTAL_EUROPE',
        promotionKey: 'zones.winnerPromoted',
        playoffKey: 'zones.proWestPlayoff',
        relegationKey: 'zones.bottom6',
      },
      CONTINENTAL_AMERICA: {
        key: 'cont-america',
        divisionLabelKey: DIVISION_TRANSLATION_KEYS.CONTINENTAL_AMERICA,
        type: 'TIER3',
        division: 'CONTINENTAL_AMERICA',
        promotionKey: 'zones.winnerPromoted',
        playoffKey: 'zones.proWestPlayoff',
        relegationKey: 'zones.bottom5',
      },
      CONTINENTAL_ASIA: {
        key: 'cont-asia',
        divisionLabelKey: DIVISION_TRANSLATION_KEYS.CONTINENTAL_ASIA,
        type: 'TIER3',
        division: 'CONTINENTAL_ASIA',
        promotionKey: 'zones.winnerPromoted',
        playoffKey: 'zones.proEastPlayoff',
        relegationKey: 'zones.bottom6',
      },
      CONTINENTAL_AFRICA: {
        key: 'cont-africa',
        divisionLabelKey: DIVISION_TRANSLATION_KEYS.CONTINENTAL_AFRICA,
        type: 'TIER3',
        division: 'CONTINENTAL_AFRICA',
        promotionKey: 'zones.winnerPromoted',
        playoffKey: 'zones.proEastPlayoff',
        relegationKey: 'zones.bottom5',
      },
      CONTINENTAL_OCEANIA: {
        key: 'cont-oceania',
        divisionLabelKey: DIVISION_TRANSLATION_KEYS.CONTINENTAL_OCEANIA,
        type: 'TIER3',
        division: 'CONTINENTAL_OCEANIA',
        promotionKey: 'zones.winnerPromoted',
        playoffKey: 'zones.proEastPlayoff',
        relegationKey: 'zones.bottom3',
      },
    }

    if (resolvedDivision && resolvedDivision in standingMap) {
      return standingMap[resolvedDivision as Tier3Division]
    }

    return null
  }

  if (tier === TEAM_TIERS.AMATEUR) {
    if (!resolvedDivision) return null

    const amateurDetails = getAmateurStandingDetails(resolvedDivision)

    return {
      key: `amateur-${resolvedDivision}`,
      divisionLabelKey: DIVISION_TRANSLATION_KEYS[resolvedDivision],
      type: 'AMATEUR',
      division: resolvedDivision,
      promotionKey: amateurDetails.promotionKey,
      playoffKey: amateurDetails.playoffKey,
    }
  }

  return null
}

function getDivisionOptions(tier: TeamRankingRecord['tier']): DivisionSelectOption[] {
  if (tier === TEAM_TIERS.WORLD) {
    return []
  }

  if (tier === TEAM_TIERS.PRO) {
    return Object.values(TIER2_DIVISIONS).map((division) => ({
      value: division,
      labelKey: DIVISION_TRANSLATION_KEYS[division],
    }))
  }

  if (tier === TEAM_TIERS.CONTINENTAL) {
    return Object.values(TIER3_DIVISIONS).map((division) => ({
      value: division,
      labelKey: DIVISION_TRANSLATION_KEYS[division],
    }))
  }

  return Object.values(AMATEUR_DIVISIONS).map((division) => ({
    value: division,
    labelKey: DIVISION_TRANSLATION_KEYS[division],
  }))
}

function PublicInactivityBadge({ row }: { row: StandingRow }): JSX.Element | null {
  const { t } = useTranslation('teamRanking')

  if (!row.publicInactivityStatus) return null

  const title =
    row.publicInactivityStatus === 'season_end_removal_pending'
      ? t('inactivity.seasonEndPending')
      : t('inactivity.standingResults')

  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
    >
      {t('inactivity.label')}
    </span>
  )
}

function toStandingRows(
  teams: TeamRankingRecord[],
  inactivityByClubId: Map<string, ClubPublicInactivityUi>,
): StandingRow[] {
  return teams.map((team, index) => {
    const inactivity = inactivityByClubId.get(team.id)

    return {
      id: team.id,
      position: team.divisionRank ?? team.tierRank ?? team.overallRank ?? index + 1,
      teamName: team.name,
      countryCode: team.country,
      points: team.seasonPoints,
      completedRaceCount: getCompletedRaceCountFromTeam(team),
      raceReputationValue: getRaceReputationValueFromTeam(team),
      logoPath: team.logoPath ?? null,
      isActive: team.isActive !== false,
      publicInactivityStatus: inactivity?.status ?? null,
      inactivityDaysSnapshot: inactivity?.days ?? null,
      seasonEndTransitionPending: inactivity?.seasonEndTransitionPending ?? false,
    }
  })
}

function compareStandingRowsBySeasonEndTieBreakers(
  a: StandingRow,
  b: StandingRow,
): number {
  if (b.points !== a.points) {
    return b.points - a.points
  }

  if (b.completedRaceCount !== a.completedRaceCount) {
    return b.completedRaceCount - a.completedRaceCount
  }

  if (b.raceReputationValue !== a.raceReputationValue) {
    return b.raceReputationValue - a.raceReputationValue
  }

  const byName = a.teamName.localeCompare(b.teamName, undefined, {
    sensitivity: 'base',
    numeric: true,
  })

  if (byName !== 0) {
    return byName
  }

  return a.id.localeCompare(b.id)
}

function applySeasonEndTieBreakers(rows: StandingRow[]): StandingRow[] {
  return rows
    .slice()
    .sort(compareStandingRowsBySeasonEndTieBreakers)
    .map((row, index) => ({
      ...row,
      position: index + 1,
    }))
}

function getRowClass(
  row: StandingRow,
  totalRows: number,
  option: StandingOption,
  isMyTeam: boolean,
): string {
  const classes = ['border-b', 'border-slate-200']

  const relegationCountMap: Record<string, number> = {
    WORLD: 5,
    PRO_WEST: 5,
    PRO_EAST: 5,
    CONTINENTAL_EUROPE: 6,
    CONTINENTAL_AMERICA: 5,
    CONTINENTAL_ASIA: 6,
    CONTINENTAL_AFRICA: 5,
    CONTINENTAL_OCEANIA: 3,
  }

  const relegationCount = relegationCountMap[option.division] ?? 0

  let isDirectPromotion = false
  let isPlayoffPromotion = false

  if (option.type === 'TIER2' || option.type === 'TIER3') {
    if (row.position === 1) {
      isDirectPromotion = true
    } else if (row.position >= 2 && row.position <= 4) {
      isPlayoffPromotion = true
    }
  }

  if (option.type === 'AMATEUR') {
    if (option.division === 'OCEANIA') {
      if (row.position >= 1 && row.position <= 3) {
        isDirectPromotion = true
      }
    } else if (isEuropeanAmateurDivision(option.division)) {
      if (row.position === 1) {
        isDirectPromotion = true
      } else if (row.position >= 2 && row.position <= 3) {
        isPlayoffPromotion = true
      }
    } else {
      if (row.position === 1) {
        isDirectPromotion = true
      } else if (row.position >= 2 && row.position <= 4) {
        isPlayoffPromotion = true
      }
    }
  }

  if (isDirectPromotion) {
    classes.push('bg-green-50')
  } else if (isPlayoffPromotion) {
    classes.push('bg-blue-50')
  }

  if (relegationCount > 0 && row.position > totalRows - relegationCount) {
    classes.push('bg-red-50')
  }

  if (!row.isActive) {
    classes.push('opacity-70')
  }

  if (isMyTeam) {
    classes.push('ring-1', 'ring-yellow-400', 'bg-yellow-50')
  }

  return classes.join(' ')
}

function mapClubTierToRankingTier(clubTier: string | null): TeamRankingRecord['tier'] | null {
  switch (clubTier) {
    case 'worldteam':
      return TEAM_TIERS.WORLD
    case 'proteam':
      return TEAM_TIERS.PRO
    case 'continental':
      return TEAM_TIERS.CONTINENTAL
    case 'amateur':
      return TEAM_TIERS.AMATEUR
    default:
      return null
  }
}

function isValidRankingTier(value: string | null): value is TeamRankingRecord['tier'] {
  return Object.values(TEAM_TIERS).includes(value as TeamRankingRecord['tier'])
}

function isValidCompetitionDivision(value: string | null): value is CompetitionDivision {
  if (!value) return false

  return (
    value === 'WORLD' ||
    Object.values(TIER2_DIVISIONS).includes(value as Tier2Division) ||
    Object.values(TIER3_DIVISIONS).includes(value as Tier3Division) ||
    Object.values(AMATEUR_DIVISIONS).includes(value as AmateurDivision)
  )
}

function getTeamRankingSelectionFromSearch(search: string): {
  tier: TeamRankingRecord['tier']
  division: CompetitionDivision | null
  hasSelection: boolean
} {
  const params = new URLSearchParams(search)
  const tierParam = params.get('tier')
  const divisionParam = params.get('division')

  const tier = isValidRankingTier(tierParam) ? tierParam : TEAM_TIERS.WORLD
  const rawDivision = isValidCompetitionDivision(divisionParam) ? divisionParam : null
  const division = resolveDivisionForTier(tier, rawDivision)

  return {
    tier,
    division,
    hasSelection: isValidRankingTier(tierParam),
  }
}

function buildTeamRankingSearch(
  currentSearch: string,
  tier: TeamRankingRecord['tier'],
  division: CompetitionDivision | null,
): string {
  const params = new URLSearchParams(currentSearch)
  const resolvedDivision = resolveDivisionForTier(tier, division)

  params.set('tier', tier)

  if (tier === TEAM_TIERS.WORLD || !resolvedDivision) {
    params.delete('division')
  } else {
    params.set('division', resolvedDivision)
  }

  const nextSearch = params.toString()
  return nextSearch ? `?${nextSearch}` : ''
}

function PastWinnersModal({
  isOpen,
  onClose,
  division,
  standingLabel,
}: {
  isOpen: boolean
  onClose: () => void
  division: CompetitionDivision | null
  standingLabel: string | null
}): JSX.Element | null {
  const { t } = useTranslation('teamRanking')
  const [winners, setWinners] = useState<PastWinnerRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !division) return

    let cancelled = false

    async function loadPastWinners(): Promise<void> {
      try {
        setLoading(true)
        setHasError(false)
        setWinners([])

        const { data, error: queryError } = await supabase.rpc(
          'get_team_ranking_past_winners',
          { p_division: division },
        )

        if (cancelled) return

        if (queryError) {
          throw queryError
        }

        setWinners((data ?? []) as PastWinnerRecord[])
      } catch (err) {
        console.error('Failed to load past winners:', err)
        if (!cancelled) {
          setHasError(true)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadPastWinners()

    return () => {
      cancelled = true
    }
  }, [isOpen, division])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">{t('pastWinners.title')}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {standingLabel
                ? t('pastWinners.champions', { standing: standingLabel })
                : t('pastWinners.previousChampions')}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('pastWinners.close')}
          </button>
        </div>

        <div className="px-6 py-6">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              {t('pastWinners.loading')}
            </div>
          ) : null}

          {!loading && hasError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {t('pastWinners.loadFailed')}
            </div>
          ) : null}

          {!loading && !hasError && winners.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <div className="text-base font-semibold text-slate-900">
                {t('pastWinners.noneTitle')}
              </div>
              <div className="mt-2 text-sm text-slate-600">
                {t('pastWinners.noneDescription')}
              </div>
            </div>
          ) : null}

          {!loading && !hasError && winners.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {t('pastWinners.season')}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {t('pastWinners.team')}
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {t('pastWinners.country')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {t('pastWinners.internationalPoints')}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {winners.map((winner) => (
                    <tr
                      key={`${winner.season_number}-${winner.club_id}`}
                      className="border-t border-slate-200"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {t('pastWinners.seasonNumber', { season: winner.season_number })}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-900">
                        <div className="flex items-center gap-3">
                          <TeamLogo src={winner.logo_path} teamName={winner.club_name} />
                          <span className="font-medium">{winner.club_name}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        <CountryFlag countryCode={winner.country_code} />
                      </td>

                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                        {winner.points.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function TeamRankingPage(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation('teamRanking')
  const displayLocale =
    i18n.resolvedLanguage?.startsWith('sr')
      ? 'sr-Latn-RS'
      : i18n.resolvedLanguage || 'en'
  const initialSelection = useMemo(
    () => getTeamRankingSelectionFromSearch(location.search),
    // Only use the current URL for the first render.
    // User changes are then controlled by local state and replaceState navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const shouldAutoSelectMyCompetitionRef = useRef(!initialSelection.hasSelection)

  const [teams, setTeams] = useState<TeamRankingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTier, setSelectedTier] = useState<TeamRankingRecord['tier']>(initialSelection.tier)
  const [selectedDivision, setSelectedDivision] = useState<CompetitionDivision | null>(
    initialSelection.division,
  )
  const [myClubIds, setMyClubIds] = useState<string[]>([])
  const [inactivityByClubId, setInactivityByClubId] = useState<
    Map<string, ClubPublicInactivityUi>
  >(new Map())
  const [isPastWinnersOpen, setIsPastWinnersOpen] = useState(false)
  const [seasonRulesExpanded, setSeasonRulesExpanded] = useState(false)
  const [tutorialLoading, setTutorialLoading] = useState(true)
  const [tutorialMode, setTutorialMode] = useState<'closed' | 'invite' | 'steps'>('closed')
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)

  useEffect(() => {
    let mounted = true
    const initialPathname = location.pathname
    const initialSearch = location.search
    const initialHash = location.hash

    async function hydrateMyClubContext(userId: string | null): Promise<void> {
      if (!userId) {
        if (mounted) {
          setMyClubIds([])
        }
        return
      }

      try {
        const { data: myClubs, error: myClubsError } = await supabase
          .from('clubs')
          .select('id, club_type, club_tier, tier2_division, tier3_division, amateur_division')
          .eq('owner_user_id', userId)
          .in('club_type', ['main', 'developing'])

        if (!mounted) return

        if (myClubsError) {
          throw myClubsError
        }

        const ownedClubs = (myClubs ?? []) as MyOwnedClubRecord[]
        const mainClub = ownedClubs.find((club) => club.club_type === 'main') ?? null

        setMyClubIds(ownedClubs.map((club) => club.id))

        if (mainClub && shouldAutoSelectMyCompetitionRef.current) {
          const mainClubTier = mapClubTierToRankingTier(mainClub.club_tier)

          if (mainClubTier) {
            let mainClubDivision: CompetitionDivision | null = null

            if (mainClubTier === TEAM_TIERS.PRO) {
              mainClubDivision = mainClub.tier2_division ?? null
            } else if (mainClubTier === TEAM_TIERS.CONTINENTAL) {
              mainClubDivision = mainClub.tier3_division ?? null
            } else if (mainClubTier === TEAM_TIERS.AMATEUR) {
              mainClubDivision = mainClub.amateur_division ?? null
            }

            const resolvedMainClubDivision = resolveDivisionForTier(
              mainClubTier,
              mainClubDivision,
            )

            setSelectedTier(mainClubTier)
            setSelectedDivision(resolvedMainClubDivision)
            shouldAutoSelectMyCompetitionRef.current = false

            navigate(
              {
                pathname: initialPathname,
                search: buildTeamRankingSearch(
                  initialSearch,
                  mainClubTier,
                  resolvedMainClubDivision,
                ),
                hash: initialHash,
              },
              { replace: true },
            )
          }
        }
      } catch (error) {
        console.warn('Could not load owned clubs for team ranking:', error)
      }
    }

    async function hydrateRankingMetadata(
      baseTeams: TeamRankingRecord[],
    ): Promise<void> {
      try {
        const teamIds = baseTeams.map((team) => team.id)

        const [
          displayNameByClubId,
          currentLogoPathByClubId,
          publicInactivityByClubId,
        ] = await Promise.all([
          loadClubDisplayNameMap(teamIds),
          loadClubLogoPathMap(teamIds),
          loadPublicClubInactivityMap(teamIds),
        ])

        if (!mounted) return

        setInactivityByClubId(publicInactivityByClubId)

        setTeams((currentTeams) =>
          currentTeams.map((team) => ({
            ...team,
            name: displayNameByClubId.get(team.id) ?? team.name,
            logoPath:
              currentLogoPathByClubId.has(team.id)
                ? currentLogoPathByClubId.get(team.id) ?? null
                : team.logoPath ?? null,
          })),
        )
      } catch (error) {
        console.warn('Could not hydrate team ranking metadata:', error)
      }
    }

    async function load(): Promise<void> {
      try {
        setLoading(true)

        const [
          { data: authData },
          teamsResult,
          orderedStandingsByTeamId,
        ] = await Promise.all([
          supabase.auth.getUser(),
          getTeamRankingTeams(),
          loadOrderedTeamStandingsByTeamId(),
        ])

        if (!mounted) return

        const userId = authData.user?.id ?? null

        const teamsWithCanonicalStandings = teamsResult.map((team) => {
          const canonicalStanding = orderedStandingsByTeamId.get(team.id)

          return {
            ...team,
            // The ordered-standings RPC is the authoritative source used by
            // promotion/relegation. If it is temporarily unavailable, preserve
            // the already-loaded team_rankings_view points instead of zeroing them.
            seasonPoints:
              canonicalStanding?.internationalPoints ?? team.seasonPoints,
            completedRaceCount:
              canonicalStanding?.completedRaceCount ??
              getCompletedRaceCountFromTeam(team),
            raceReputationValue:
              canonicalStanding?.raceReputationValue ??
              getRaceReputationValueFromTeam(team),
          }
        })

        // First paint uses the same canonical points and season-end tie-breakers
        // that promotion/relegation uses. Display names, logos and inactivity
        // badges hydrate separately without overwriting ranking statistics.
        setTeams(teamsWithCanonicalStandings)
        setLoading(false)

        void hydrateMyClubContext(userId)
        void hydrateRankingMetadata(teamsResult)
      } catch (error) {
        console.error('Failed to load team ranking page:', error)

        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
    // Intentionally do not reload standings when only the URL query changes.
    // Tier/division selection is controlled locally and should not refetch the whole page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  useEffect(() => {
    let alive = true

    async function loadTeamRankingTutorialProgress() {
      setTutorialLoading(true)

      const autoStartTutorial =
        window.sessionStorage.getItem('ppm:auto-start-tutorial') === 'team-ranking'

      if (autoStartTutorial) {
        window.sessionStorage.removeItem('ppm:auto-start-tutorial')

        const firstStep = teamRankingTutorialSteps[0]

        await saveTutorialProgress('team-ranking', 'started', firstStep?.key ?? null)

        if (!alive) return

        setTutorialStepIndex(0)
        setTutorialMode('steps')
        setTutorialLoading(false)
        return
      }

      const progress = await getTutorialProgress('team-ranking')

      if (!alive) return

      if (progress?.status === 'started') {
        const savedStepIndex = teamRankingTutorialSteps.findIndex(
          (step) => step.key === progress.last_step_key,
        )

        setTutorialStepIndex(savedStepIndex >= 0 ? savedStepIndex : 0)
        setTutorialMode('steps')
      } else {
        setTutorialMode('closed')
      }

      setTutorialLoading(false)
    }

    void loadTeamRankingTutorialProgress()

    return () => {
      alive = false
    }
  }, [])

  const divisionOptions = useMemo(() => getDivisionOptions(selectedTier), [selectedTier])

  const selectedStanding = useMemo(
    () => getStandingOption(selectedTier, selectedDivision),
    [selectedTier, selectedDivision],
  )

  const selectedStandingLabel = useMemo(() => {
    if (!selectedStanding) return null

    const divisionLabel = t(selectedStanding.divisionLabelKey)

    return selectedStanding.type === 'AMATEUR'
      ? t('divisions.amateurStanding', { division: divisionLabel })
      : divisionLabel
  }, [selectedStanding, t])

  const selectedPromotionLabel = selectedStanding?.promotionKey
    ? t(selectedStanding.promotionKey)
    : null
  const selectedPlayoffLabel = selectedStanding?.playoffKey
    ? t(selectedStanding.playoffKey)
    : null
  const selectedRelegationLabel = selectedStanding?.relegationKey
    ? t(selectedStanding.relegationKey)
    : null

  const localizedTutorialStep = useMemo(() => {
    const fallbackStep = teamRankingTutorialSteps[tutorialStepIndex]

    if (!fallbackStep) return null

    if (tutorialStepIndex === 0) {
      return {
        ...fallbackStep,
        title: t('tutorial.competitionsTitle'),
        body: t('tutorial.competitionsBody'),
        primaryAction: t('tutorial.next'),
      }
    }

    if (tutorialStepIndex === teamRankingTutorialSteps.length - 1) {
      return {
        ...fallbackStep,
        title: t('tutorial.pointsTitle'),
        body: t('tutorial.pointsBody'),
        primaryAction: t('tutorial.continueStatistics'),
        secondaryAction: t('tutorial.finish'),
      }
    }

    return fallbackStep
  }, [tutorialStepIndex, t])

  const selectedRows = useMemo(() => {
    if (!selectedStanding) {
      return []
    }

    if (selectedStanding.type === 'WORLD') {
      return applySeasonEndTieBreakers(
        toStandingRows(getWorldStandings(teams), inactivityByClubId),
      )
    }

    if (selectedStanding.type === 'TIER2') {
      return applySeasonEndTieBreakers(
        toStandingRows(
          getTier2DivisionStandings(teams, selectedStanding.division as Tier2Division),
          inactivityByClubId,
        ),
      )
    }

    if (selectedStanding.type === 'TIER3') {
      return applySeasonEndTieBreakers(
        toStandingRows(
          getTier3DivisionStandings(teams, selectedStanding.division as Tier3Division),
          inactivityByClubId,
        ),
      )
    }

    return applySeasonEndTieBreakers(
      toStandingRows(
        getAmateurDivisionStandings(teams, selectedStanding.division as AmateurDivision),
        inactivityByClubId,
      ),
    )
  }, [selectedStanding, teams, inactivityByClubId])

  function replaceStandingUrl(
    tier: TeamRankingRecord['tier'],
    division: CompetitionDivision | null,
  ): void {
    navigate(
      {
        pathname: location.pathname,
        search: buildTeamRankingSearch(location.search, tier, division),
        hash: location.hash,
      },
      { replace: true },
    )
  }

  const handleTierChange = (value: TeamRankingRecord['tier']) => {
    const nextDivision = resolveDivisionForTier(value, null)

    shouldAutoSelectMyCompetitionRef.current = false
    setSelectedTier(value)
    setSelectedDivision(nextDivision)
    replaceStandingUrl(value, nextDivision)
  }

  const handleDivisionChange = (value: CompetitionDivision | null) => {
    const nextDivision = resolveDivisionForTier(selectedTier, value)

    shouldAutoSelectMyCompetitionRef.current = false
    setSelectedDivision(nextDivision)
    replaceStandingUrl(selectedTier, nextDivision)
  }

  const openClubProfile = (clubId: string) => {
    const returnTo = `${location.pathname}${buildTeamRankingSearch(
      location.search,
      selectedTier,
      selectedDivision,
    )}${location.hash}`

    navigate(`/dashboard/teams/${clubId}`, {
      state: {
        returnTo,
        returnLabel: t('common.back'),
        returnScrollX: typeof window !== 'undefined' ? window.scrollX : 0,
        returnScrollY: typeof window !== 'undefined' ? window.scrollY : 0,
        teamRankingTier: selectedTier,
        teamRankingDivision: selectedDivision,
      },
    })
  }

  async function handleStartTeamRankingTutorial() {
    const firstStep = teamRankingTutorialSteps[0]

    await saveTutorialProgress('team-ranking', 'started', firstStep?.key ?? null)

    setTutorialStepIndex(0)
    setTutorialMode('steps')
  }

  async function handleSkipTeamRankingTutorial() {
    await saveTutorialProgress('team-ranking', 'skipped', null)
    setTutorialMode('closed')
  }

  async function handleNextTeamRankingTutorialStep() {
    const currentStep = teamRankingTutorialSteps[tutorialStepIndex]
    const isLastStep = tutorialStepIndex >= teamRankingTutorialSteps.length - 1

    if (!isLastStep) {
      const nextIndex = tutorialStepIndex + 1
      const nextStep = teamRankingTutorialSteps[nextIndex]

      await saveTutorialProgress('team-ranking', 'started', nextStep.key)

      setTutorialStepIndex(nextIndex)
      return
    }

    await saveTutorialProgress('team-ranking', 'completed', currentStep?.key ?? null)

    window.sessionStorage.setItem('ppm:auto-start-tutorial', 'statistics')
    navigate('/dashboard/statistics')
  }

  async function handleFinishTeamRankingTutorialForNow() {
    const currentStep = teamRankingTutorialSteps[tutorialStepIndex]

    await saveTutorialProgress('team-ranking', 'completed', currentStep?.key ?? null)

    setTutorialMode('closed')
  }

  async function handleCloseTeamRankingTutorial() {
    const currentStep = teamRankingTutorialSteps[tutorialStepIndex]

    if (tutorialMode === 'invite') {
      await saveTutorialProgress('team-ranking', 'skipped', null)
      setTutorialMode('closed')
      return
    }

    if (tutorialMode === 'steps') {
      await saveTutorialProgress(
        'team-ranking',
        'started',
        currentStep?.key ?? null,
      )
    }

    setTutorialMode('closed')
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold">{t('page.title')}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {t('page.subtitle')}
      </p>

      <div className="mt-4 rounded bg-white p-4 shadow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full gap-4 md:grid-cols-2 lg:max-w-2xl">
            <div>
              <label htmlFor="tier-select" className="mb-2 block text-sm font-medium text-slate-700">
                {t('page.selectTier')}
              </label>
              <select
                id="tier-select"
                value={selectedTier}
                onChange={(e) => handleTierChange(e.target.value as TeamRankingRecord['tier'])}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {TIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="division-select"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                {t('page.selectDivision')}
              </label>
              <select
                id="division-select"
                value={selectedTier === TEAM_TIERS.WORLD ? '' : selectedDivision ?? ''}
                onChange={(e) =>
                  handleDivisionChange(
                    e.target.value ? (e.target.value as CompetitionDivision) : null,
                  )
                }
                disabled={selectedTier === TEAM_TIERS.WORLD}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {selectedTier === TEAM_TIERS.WORLD ? (
                  <option value="">{t('page.noDivisionNeeded')}</option>
                ) : null}

                {divisionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedPromotionLabel ? (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                {selectedPromotionLabel}
              </span>
            ) : null}
            {selectedPlayoffLabel ? (
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">
                {selectedPlayoffLabel}
              </span>
            ) : null}
            {selectedRelegationLabel ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
                {selectedRelegationLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded bg-white shadow">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {selectedStandingLabel ?? t('page.selectTierDivision')}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {selectedStanding
                  ? t('page.standingsDescription')
                  : t('page.chooseStanding')}
              </p>
            </div>

            {selectedStanding ? (
              <button
                type="button"
                onClick={() => setIsPastWinnersOpen(true)}
                className="self-start text-sm font-medium text-yellow-700 underline decoration-yellow-500 underline-offset-4 hover:text-yellow-800"
              >
                {t('pastWinners.title')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('table.position')}
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('table.team')}
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('table.country')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('table.races')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('table.raceReputation')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t('table.points')}
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    {t('page.loading')}
                  </td>
                </tr>
              ) : null}

              {!loading &&
                selectedStanding &&
                selectedRows.map((row) => {
                  const isMyTeam = myClubIds.includes(row.id)

                  return (
                    <tr
                      key={row.id}
                      className={getRowClass(
                        row,
                        selectedRows.length,
                        selectedStanding,
                        isMyTeam,
                      )}
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                        {row.position}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-900">
                        <button
                          type="button"
                          onClick={() => openClubProfile(row.id)}
                          className="flex w-full items-center gap-3 rounded-md text-left transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        >
                          <TeamLogo src={row.logoPath} teamName={row.teamName} />

                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-semibold text-slate-900 hover:underline">
                                {row.teamName}
                              </span>
                              <PublicInactivityBadge row={row} />
                            </div>

                            {!row.isActive && !row.publicInactivityStatus ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                {t('table.inactive')}
                              </span>
                            ) : null}

                            {isMyTeam ? (
                              <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                                {t('table.yourTeam')}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        <CountryFlag countryCode={row.countryCode} />
                      </td>

                      <td
                        className="px-4 py-3 text-right text-sm text-slate-700"
                        title={t('table.tieBreaker1')}
                      >
                        {formatTieBreakerNumber(row.completedRaceCount)}
                      </td>

                      <td
                        className="px-4 py-3 text-right text-sm text-slate-700"
                        title={t('table.tieBreaker2')}
                      >
                        {formatTieBreakerNumber(row.raceReputationValue)}
                      </td>

                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                        {row.points.toLocaleString(displayLocale)}
                      </td>
                    </tr>
                  )
                })}

              {!loading && !selectedStanding ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    {t('page.selectStanding')}
                  </td>
                </tr>
              ) : null}

              {!loading && selectedStanding && selectedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    {t('page.noTeams')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-4 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-green-300 bg-green-100" />
            <span>{t('zones.directPromotion')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-blue-300 bg-blue-100" />
            <span>{t('zones.playoffPlaces')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-red-300 bg-red-100" />
            <span>{t('zones.relegationPlaces')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-yellow-300 bg-yellow-100" />
            <span>{t('zones.yourTeam')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-slate-300 bg-slate-100" />
            <span>{t('zones.inactiveTeam')}</span>
          </div>
          <div className="text-slate-500">
            {t('table.tieBreakers')}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded bg-white p-4 shadow">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {t('rules.title')}
            </h3>
            <div className="mt-1 text-sm text-slate-600">
              {t('rules.subtitle')}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSeasonRulesExpanded((current) => !current)}
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            aria-expanded={seasonRulesExpanded}
          >
            {seasonRulesExpanded ? t('rules.hide') : t('rules.show')}
            <span className="ml-2" aria-hidden="true">
              {seasonRulesExpanded ? '▲' : '▼'}
            </span>
          </button>
        </div>

        {seasonRulesExpanded ? (
          <>
            <div className="mt-4 text-sm text-slate-600">
              {t('rules.intro')}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {t('rules.rankingTitle')}
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                  <li>{t('rules.ranking1')}</li>
                  <li>{t('rules.ranking2')}</li>
                  <li>{t('rules.ranking3')}</li>
                  <li>{t('rules.ranking4')}</li>
                </ol>
                <div className="mt-3 text-xs text-slate-500">
                  {t('rules.zeroPoints')}
                </div>
              </div>

              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="text-sm font-semibold text-green-900">
                  {t('rules.directTitle')}
                </div>
                <div className="mt-2 text-sm text-green-800">
                  {t('rules.directText')}
                </div>
                <div className="mt-3 text-xs text-green-700">
                  {t('rules.currentView', { value: selectedPromotionLabel ?? t('rules.noDirect') })}
                </div>
              </div>

              <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                <div className="text-sm font-semibold text-sky-900">
                  {t('rules.playoffTitle')}
                </div>
                <div className="mt-2 text-sm text-sky-800">
                  {t('rules.playoffText')}
                </div>
                <div className="mt-3 text-xs text-sky-700">
                  {t('rules.currentView', { value: selectedPlayoffLabel ?? t('rules.noPlayoff') })}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="text-sm font-semibold text-red-900">
                  {t('rules.relegationTitle')}
                </div>
                <div className="mt-2 text-sm text-red-800">
                  {t('rules.relegationText')}
                </div>
                <div className="mt-3 text-xs text-red-700">
                  {t('rules.currentView', { value: selectedRelegationLabel ?? t('rules.noRelegation') })}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {t('rules.divisionGuide')}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  <li>{t('rules.worldGuide')}</li>
                  <li>{t('rules.proGuide')}</li>
                  <li>{t('rules.continentalGuide')}</li>
                  <li>{t('rules.amateurGuide')}</li>
                </ul>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <PastWinnersModal
        isOpen={isPastWinnersOpen}
        onClose={() => setIsPastWinnersOpen(false)}
        division={selectedStanding?.division ?? null}
        standingLabel={selectedStandingLabel}
      />

      {!tutorialLoading && tutorialMode === 'invite' ? (
        <TutorialOverlay
          open
          variant="invite"
          title={t('tutorial.welcomeTitle')}
          body={t('tutorial.welcomeBody')}
          primaryAction={t('tutorial.start')}
          secondaryAction={t('tutorial.noThanks')}
          onPrimary={handleStartTeamRankingTutorial}
          onSecondary={handleSkipTeamRankingTutorial}
          onClose={handleCloseTeamRankingTutorial}
        />
      ) : null}

      {!tutorialLoading && tutorialMode === 'steps' ? (
        <TutorialOverlay
          open
          variant="panel"
          title={localizedTutorialStep?.title ?? teamRankingTutorialSteps[tutorialStepIndex].title}
          body={localizedTutorialStep?.body ?? teamRankingTutorialSteps[tutorialStepIndex].body}
          stepLabel={`${tutorialStepIndex + 1}/${teamRankingTutorialSteps.length}`}
          primaryAction={
            localizedTutorialStep?.primaryAction ?? t('tutorial.next')
          }
          secondaryAction={
            tutorialStepIndex === teamRankingTutorialSteps.length - 1
              ? localizedTutorialStep?.secondaryAction ?? t('tutorial.finish')
              : t('tutorial.skip')
          }
          onPrimary={handleNextTeamRankingTutorialStep}
          onSecondary={
            tutorialStepIndex === teamRankingTutorialSteps.length - 1
              ? handleFinishTeamRankingTutorialForNow
              : handleSkipTeamRankingTutorial
          }
          onClose={handleCloseTeamRankingTutorial}
        />
      ) : null}
    </div>
  )
}
