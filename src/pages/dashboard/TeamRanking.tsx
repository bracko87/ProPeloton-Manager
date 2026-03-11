import React, { useEffect, useMemo, useState } from 'react'
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
}

const TIER_OPTIONS: TierOption[] = [
  { value: TEAM_TIERS.WORLD, label: 'WorldTeam' },
  { value: TEAM_TIERS.PRO, label: 'ProTeam' },
  { value: TEAM_TIERS.CONTINENTAL, label: 'Continental' },
  { value: TEAM_TIERS.AMATEUR, label: 'Amateur' },
]

function TeamLogo({ src, teamName }: TeamLogoProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [src])

  const hasValidSrc = typeof src === 'string' && src.trim().length > 0
  const showFallback = !hasValidSrc || imageFailed

  return (
    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-100">
      {showFallback ? (
        <span className="text-[10px] text-slate-400">No logo</span>
      ) : (
        <img
          src={src}
          alt={`${teamName} logo`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  )
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

    return {
      key: `amateur-${division}`,
      label: `Amateur: ${DIVISION_LABELS[division as AmateurDivision]}`,
      type: 'AMATEUR',
      division,
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
  }))
}

function getPromotionPositions(option: StandingOption): number[] {
  if (option.type === 'TIER2' || option.type === 'TIER3' || option.type === 'AMATEUR') {
    return [1]
  }

  return []
}

function getPlayoffPositions(option: StandingOption): number[] {
  if (option.type === 'TIER2' || option.type === 'TIER3') {
    return [2, 3, 4]
  }

  return []
}

function getRelegationCount(option: StandingOption): number {
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

  return relegationCountMap[option.division] ?? 0
}

function getRowClass(
  row: StandingRow,
  totalRows: number,
  option: StandingOption,
  isMyTeam: boolean,
): string {
  const classes = ['border-b border-slate-200']

  const promotionPositions = getPromotionPositions(option)
  const playoffPositions = getPlayoffPositions(option)
  const relegationCount = getRelegationCount(option)

  const isPromotionSpot = promotionPositions.includes(row.position)
  const isPlayoffSpot = playoffPositions.includes(row.position)
  const isRelegationSpot = relegationCount > 0 && row.position > totalRows - relegationCount

  if (isPromotionSpot) {
    classes.push('bg-green-50')
  } else if (isPlayoffSpot) {
    classes.push('bg-sky-50')
  } else if (isRelegationSpot) {
    classes.push('bg-red-50')
  }

  if (isMyTeam) {
    classes.push('ring-1 ring-inset ring-yellow-400')

    if (!isPromotionSpot && !isPlayoffSpot && !isRelegationSpot) {
      classes.push('bg-yellow-50')
    }
  }

  return classes.join(' ')
}

export function TeamRankingPage(): JSX.Element {
  const [teams, setTeams] = useState<TeamRankingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTier, setSelectedTier] = useState<TeamRankingRecord['tier']>(TEAM_TIERS.WORLD)
  const [selectedDivision, setSelectedDivision] = useState<CompetitionDivision | null>(null)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        const data = await getTeamRankingTeams()
        if (!mounted) return
        setTeams(data)
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const myTeam = useMemo(
    () => teams.find((team) => team.isAi !== true && team.isActive !== false) ?? null,
    [teams],
  )

  useEffect(() => {
    if (!myTeam) return

    if (myTeam.tier === TEAM_TIERS.WORLD) {
      setSelectedTier(TEAM_TIERS.WORLD)
      setSelectedDivision(null)
      return
    }

    if (myTeam.tier === TEAM_TIERS.PRO) {
      setSelectedTier(TEAM_TIERS.PRO)
      setSelectedDivision(myTeam.tier2Division ?? null)
      return
    }

    if (myTeam.tier === TEAM_TIERS.CONTINENTAL) {
      setSelectedTier(TEAM_TIERS.CONTINENTAL)
      setSelectedDivision(myTeam.tier3Division ?? null)
      return
    }

    if (myTeam.tier === TEAM_TIERS.AMATEUR) {
      setSelectedTier(TEAM_TIERS.AMATEUR)
      setSelectedDivision(myTeam.amateurDivision ?? null)
    }
  }, [myTeam])

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

  const myTeamName = myTeam?.name ?? ''
  const myTeamCountry = myTeam?.country ?? ''

  const handleTierChange = (value: TeamRankingRecord['tier']) => {
    setSelectedTier(value)

    if (value === TEAM_TIERS.WORLD) {
      setSelectedDivision(null)
      return
    }

    setSelectedDivision(null)
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
                onChange={(e) => setSelectedDivision(e.target.value as CompetitionDivision)}
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
          <h3 className="text-lg font-semibold text-slate-900">
            {selectedStanding?.label ?? 'Select a tier and division'}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {selectedStanding
              ? 'Current season standings based on points collected across all competitions.'
              : 'Choose a tier and division to view the standings.'}
          </p>
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
                  const isMyTeam = row.teamName === myTeamName && row.countryCode === myTeamCountry

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
                        <div className="flex items-center gap-3">
                          <TeamLogo src={row.logoPath} teamName={row.teamName} />

                          <div className="flex items-center gap-2">
                            <span className="font-medium">{row.teamName}</span>
                            {isMyTeam ? (
                              <span className="rounded-full bg-yellow-200 px-2 py-0.5 text-[11px] font-semibold text-yellow-900">
                                Your team
                              </span>
                            ) : null}
                          </div>
                        </div>
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
      </div>
    </div>
  )
}

export default TeamRankingPage