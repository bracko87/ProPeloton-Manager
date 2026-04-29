import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AmateurDivision,
  AMATEUR_DIVISIONS,
  CompetitionDivision,
  DIVISION_LABELS,
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
  label: string
  type: StandingType
  division: CompetitionDivision
  promotionLabel?: string
  playoffLabel?: string
  relegationLabel?: string
}

type StandingRow = {
  id: string
  position: number
  teamName: string
  countryCode: string
  points: number
  logoPath?: string | null
  isActive: boolean
}

type TierOption = {
  value: TeamRankingRecord['tier']
  label: string
}

type DivisionSelectOption = {
  value: CompetitionDivision
  label: string
}

type TeamLogoProps = {
  src?: string | null
  teamName: string
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

const TIER_OPTIONS: TierOption[] = [
  { value: TEAM_TIERS.WORLD, label: 'WorldTeam' },
  { value: TEAM_TIERS.PRO, label: 'ProTeam' },
  { value: TEAM_TIERS.CONTINENTAL, label: 'Continental' },
  { value: TEAM_TIERS.AMATEUR, label: 'Amateur' },
]

function TeamLogo({ src, teamName, className = 'h-8 w-8' }: TeamLogoProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [src])

  const hasValidSrc = typeof src === 'string' && src.trim().length > 0
  const showFallback = !hasValidSrc || imageFailed

  return (
    <div
      className={`flex shrink-0 ${className} items-center justify-center overflow-hidden rounded border border-slate-200 bg-white p-1`}
    >
      {showFallback ? (
        <span className="text-[10px] text-slate-400">No logo</span>
      ) : (
        <img
          src={src}
          alt={`${teamName} logo`}
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
): Pick<StandingOption, 'promotionLabel' | 'playoffLabel'> {
  if (division === 'OCEANIA') {
    return {
      promotionLabel: 'Top 3 promoted directly',
    }
  }

  if (isEuropeanAmateurDivision(division)) {
    return {
      promotionLabel: 'Winner promoted directly',
      playoffLabel: '2nd-3rd enter promotion playoff',
    }
  }

  return {
    promotionLabel: 'Winner promoted directly',
    playoffLabel: '2nd-4th enter promotion playoff',
  }
}

function getStandingOption(
  tier: TeamRankingRecord['tier'],
  division: CompetitionDivision | null,
): StandingOption | null {
  if (tier === TEAM_TIERS.WORLD) {
    return {
      key: 'world',
      label: DIVISION_LABELS.WORLD,
      type: 'WORLD',
      division: 'WORLD',
      relegationLabel: 'Bottom 5 relegated',
    }
  }

  if (tier === TEAM_TIERS.PRO) {
    if (division === 'PRO_WEST') {
      return {
        key: 'pro-west',
        label: DIVISION_LABELS.PRO_WEST,
        type: 'TIER2',
        division: 'PRO_WEST',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter World playoff',
        relegationLabel: 'Bottom 5 relegated',
      }
    }

    if (division === 'PRO_EAST') {
      return {
        key: 'pro-east',
        label: DIVISION_LABELS.PRO_EAST,
        type: 'TIER2',
        division: 'PRO_EAST',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter World playoff',
        relegationLabel: 'Bottom 5 relegated',
      }
    }

    return null
  }

  if (tier === TEAM_TIERS.CONTINENTAL) {
    const standingMap: Record<Tier3Division, StandingOption> = {
      CONTINENTAL_EUROPE: {
        key: 'cont-europe',
        label: DIVISION_LABELS.CONTINENTAL_EUROPE,
        type: 'TIER3',
        division: 'CONTINENTAL_EUROPE',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter Pro West playoff',
        relegationLabel: 'Bottom 6 relegated',
      },
      CONTINENTAL_AMERICA: {
        key: 'cont-america',
        label: DIVISION_LABELS.CONTINENTAL_AMERICA,
        type: 'TIER3',
        division: 'CONTINENTAL_AMERICA',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter Pro West playoff',
        relegationLabel: 'Bottom 5 relegated',
      },
      CONTINENTAL_ASIA: {
        key: 'cont-asia',
        label: DIVISION_LABELS.CONTINENTAL_ASIA,
        type: 'TIER3',
        division: 'CONTINENTAL_ASIA',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter Pro East playoff',
        relegationLabel: 'Bottom 6 relegated',
      },
      CONTINENTAL_AFRICA: {
        key: 'cont-africa',
        label: DIVISION_LABELS.CONTINENTAL_AFRICA,
        type: 'TIER3',
        division: 'CONTINENTAL_AFRICA',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter Pro East playoff',
        relegationLabel: 'Bottom 5 relegated',
      },
      CONTINENTAL_OCEANIA: {
        key: 'cont-oceania',
        label: DIVISION_LABELS.CONTINENTAL_OCEANIA,
        type: 'TIER3',
        division: 'CONTINENTAL_OCEANIA',
        promotionLabel: 'Winner promoted directly',
        playoffLabel: '2nd-4th enter Pro East playoff',
        relegationLabel: 'Bottom 3 relegated',
      },
    }

    if (division && division in standingMap) {
      return standingMap[division as Tier3Division]
    }

    return null
  }

  if (tier === TEAM_TIERS.AMATEUR) {
    if (!division) return null

    const amateurDetails = getAmateurStandingDetails(division)

    return {
      key: `amateur-${division}`,
      label: `Amateur: ${DIVISION_LABELS[division as AmateurDivision]}`,
      type: 'AMATEUR',
      division,
      promotionLabel: amateurDetails.promotionLabel,
      playoffLabel: amateurDetails.playoffLabel,
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
      label: DIVISION_LABELS[division],
    }))
  }

  if (tier === TEAM_TIERS.CONTINENTAL) {
    return Object.values(TIER3_DIVISIONS).map((division) => ({
      value: division,
      label: DIVISION_LABELS[division],
    }))
  }

  return Object.values(AMATEUR_DIVISIONS).map((division) => ({
    value: division,
    label: DIVISION_LABELS[division],
  }))
}

function toStandingRows(teams: TeamRankingRecord[]): StandingRow[] {
  return teams.map((team, index) => ({
    id: team.id,
    position: team.divisionRank ?? team.tierRank ?? team.overallRank ?? index + 1,
    teamName: team.name,
    countryCode: team.country,
    points: team.seasonPoints,
    logoPath: team.logoPath ?? null,
    isActive: team.isActive !== false,
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
  const [winners, setWinners] = useState<PastWinnerRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setError(null)
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
          setError('Failed to load past winners.')
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
            <h3 className="text-xl font-semibold text-slate-900">Past winners</h3>
            <p className="mt-1 text-sm text-slate-600">
              {standingLabel
                ? `${standingLabel} champions from previous seasons.`
                : 'Previous season champions.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-6">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading past winners...</div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!loading && !error && winners.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <div className="text-base font-semibold text-slate-900">No past winners yet</div>
              <div className="mt-2 text-sm text-slate-600">
                Season 1 is still in progress, so there are no previous champions to show.
              </div>
            </div>
          ) : null}

          {!loading && !error && winners.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Season
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Team
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Country
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Points
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
                        Season {winner.season_number}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-900">
                        <div className="flex items-center gap-3">
                          <TeamLogo src={winner.logo_path} teamName={winner.club_name} />
                          <span className="font-medium">{winner.club_name}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        <img
                          src={`https://flagcdn.com/24x18/${winner.country_code.toLowerCase()}.png`}
                          alt={`${winner.country_code} flag`}
                          className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                          loading="lazy"
                        />
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

  const [teams, setTeams] = useState<TeamRankingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTier, setSelectedTier] = useState<TeamRankingRecord['tier']>(TEAM_TIERS.WORLD)
  const [selectedDivision, setSelectedDivision] = useState<CompetitionDivision | null>(null)
  const [myClubIds, setMyClubIds] = useState<string[]>([])
  const [isPastWinnersOpen, setIsPastWinnersOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    async function load(): Promise<void> {
      try {
        const [{ data: authData }, teamsResult] = await Promise.all([
          supabase.auth.getUser(),
          getTeamRankingTeams(),
        ])

        if (!mounted) return

        const userId = authData.user?.id ?? null

        if (userId) {
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

          if (mainClub) {
            const mainClubTier = mapClubTierToRankingTier(mainClub.club_tier)

            if (mainClubTier) {
              setSelectedTier(mainClubTier)

              if (mainClubTier === TEAM_TIERS.WORLD) {
                setSelectedDivision(null)
              } else if (mainClubTier === TEAM_TIERS.PRO) {
                setSelectedDivision(mainClub.tier2_division ?? null)
              } else if (mainClubTier === TEAM_TIERS.CONTINENTAL) {
                setSelectedDivision(mainClub.tier3_division ?? null)
              } else if (mainClubTier === TEAM_TIERS.AMATEUR) {
                setSelectedDivision(mainClub.amateur_division ?? null)
              }
            }
          }
        } else {
          setMyClubIds([])
        }

        setTeams(teamsResult)
      } catch (error) {
        console.error('Failed to load team ranking page:', error)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

    const onFocus = () => {
      void load()
    }

    window.addEventListener('focus', onFocus)

    return () => {
      mounted = false
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const divisionOptions = useMemo(() => getDivisionOptions(selectedTier), [selectedTier])

  const selectedStanding = useMemo(
    () => getStandingOption(selectedTier, selectedDivision),
    [selectedTier, selectedDivision],
  )

  const selectedRows = useMemo(() => {
    if (!selectedStanding) {
      return []
    }

    if (selectedStanding.type === 'WORLD') {
      return toStandingRows(getWorldStandings(teams))
    }

    if (selectedStanding.type === 'TIER2') {
      return toStandingRows(
        getTier2DivisionStandings(teams, selectedStanding.division as Tier2Division),
      )
    }

    if (selectedStanding.type === 'TIER3') {
      return toStandingRows(
        getTier3DivisionStandings(teams, selectedStanding.division as Tier3Division),
      )
    }

    return toStandingRows(
      getAmateurDivisionStandings(teams, selectedStanding.division as AmateurDivision),
    )
  }, [selectedStanding, teams])

  const handleTierChange = (value: TeamRankingRecord['tier']) => {
    setSelectedTier(value)

    if (value === TEAM_TIERS.WORLD) {
      setSelectedDivision(null)
      return
    }

    setSelectedDivision(null)
  }

  const openClubProfile = (clubId: string) => {
    navigate(`/dashboard/teams/${clubId}`)
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold">Team Ranking</h2>
      <p className="mt-1 text-sm text-slate-600">
        View current standings, compare divisions, and track promotion or relegation zones.
      </p>

      <div className="mt-4 rounded bg-white p-4 shadow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full gap-4 md:grid-cols-2 lg:max-w-2xl">
            <div>
              <label htmlFor="tier-select" className="mb-2 block text-sm font-medium text-slate-700">
                Select tier
              </label>
              <select
                id="tier-select"
                value={selectedTier}
                onChange={(e) => handleTierChange(e.target.value as TeamRankingRecord['tier'])}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                {TIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="division-select"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Select division
              </label>
              <select
                id="division-select"
                value={selectedDivision ?? ''}
                onChange={(e) =>
                  setSelectedDivision(
                    e.target.value ? (e.target.value as CompetitionDivision) : null,
                  )
                }
                disabled={selectedTier === TEAM_TIERS.WORLD}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">
                  {selectedTier === TEAM_TIERS.WORLD
                    ? 'No division selection needed'
                    : 'Choose division'}
                </option>
                {divisionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedStanding?.promotionLabel ? (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                {selectedStanding.promotionLabel}
              </span>
            ) : null}
            {selectedStanding?.playoffLabel ? (
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">
                {selectedStanding.playoffLabel}
              </span>
            ) : null}
            {selectedStanding?.relegationLabel ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
                {selectedStanding.relegationLabel}
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
                {selectedStanding?.label ?? 'Select a tier and division'}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {selectedStanding
                  ? 'Current season standings based on points collected across all competitions.'
                  : 'Choose a tier and division to view the standings.'}
              </p>
            </div>

            {selectedStanding ? (
              <button
                type="button"
                onClick={() => setIsPastWinnersOpen(true)}
                className="self-start text-sm font-medium text-yellow-700 underline decoration-yellow-500 underline-offset-4 hover:text-yellow-800"
              >
                Past winners
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Pos
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Team
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Country
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Points
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    Loading standings...
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

                          <div className="flex items-center gap-2">
                            <span className="font-medium hover:underline">{row.teamName}</span>

                            {!row.isActive ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                Inactive
                              </span>
                            ) : null}

                            {isMyTeam ? (
                              <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                                Your team
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        <img
                          src={`https://flagcdn.com/24x18/${row.countryCode.toLowerCase()}.png`}
                          alt={`${row.countryCode} flag`}
                          className="h-4 w-6 rounded-sm border border-slate-200 object-cover"
                          loading="lazy"
                        />
                      </td>

                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                        {row.points.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}

              {!loading && !selectedStanding ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    Select a tier and division to view standings.
                  </td>
                </tr>
              ) : null}

              {!loading && selectedStanding && selectedRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    No teams available for this standing yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-4 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-green-300 bg-green-100" />
            <span>Direct promotion</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-blue-300 bg-blue-100" />
            <span>Playoff places</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-red-300 bg-red-100" />
            <span>Relegation places</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-yellow-300 bg-yellow-100" />
            <span>Your team</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-slate-300 bg-slate-100" />
            <span>Inactive team</span>
          </div>
        </div>
      </div>

      <PastWinnersModal
        isOpen={isPastWinnersOpen}
        onClose={() => setIsPastWinnersOpen(false)}
        division={selectedStanding?.division ?? null}
        standingLabel={selectedStanding?.label ?? null}
      />
    </div>
  )
}