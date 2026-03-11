import {
  AmateurDivision,
  AMATEUR_DIVISIONS,
  AMATEUR_TO_TIER3_DIVISION,
  CompetitionDivision,
  COUNTRY_TO_AMATEUR_DIVISION,
  DIVISION_CAPACITY,
  TIER2_DIVISIONS,
  TIER2_RULES,
  TIER3_DIVISIONS,
  TIER3_RULES,
  TIER3_TO_TIER2_DIVISION,
  TIER4_RULES,
  TeamRankingRecord,
  TeamTier,
  TEAM_TIERS,
  Tier2Division,
  Tier3Division,
  WORLD_RULES,
} from '../constants/teamRanking'

export type TeamCreationAssignment = {
  tier: TeamTier
  tier2Division: Tier2Division | null
  tier3Division: Tier3Division | null
  amateurDivision: AmateurDivision | null
}

export type TeamMovementReason =
  | 'PROMOTED'
  | 'RELEGATED'
  | 'DIRECT_PROMOTION'
  | 'PLAYOFF_PROMOTION'
  | 'INACTIVE_REMOVED'

export type TeamMovement = {
  teamId: string
  teamName: string
  country: string
  fromTier: TeamTier
  toTier: TeamTier | null
  fromDivision: CompetitionDivision | null
  toDivision: CompetitionDivision | null
  reason: TeamMovementReason
}

export type SeasonMovementResult = {
  relegatedFromWorld: TeamRankingRecord[]
  promotedToWorldDirect: TeamRankingRecord[]
  promotedToWorldPlayoff: TeamRankingRecord[]

  relegatedFromProWest: TeamRankingRecord[]
  relegatedFromProEast: TeamRankingRecord[]

  promotedToProWestDirect: TeamRankingRecord[]
  promotedToProWestPlayoff: TeamRankingRecord[]

  promotedToProEastDirect: TeamRankingRecord[]
  promotedToProEastPlayoff: TeamRankingRecord[]

  relegatedFromTier3: Record<Tier3Division, TeamRankingRecord[]>
  promotedFromAmateur: Record<Tier3Division, TeamRankingRecord[]>

  removedInactiveTeams: TeamRankingRecord[]

  allMovements: TeamMovement[]
}

export type SeasonResetResult = {
  updatedTeams: TeamRankingRecord[]
  movements: SeasonMovementResult
}

function sortTeamsByPointsDesc(teams: TeamRankingRecord[]): TeamRankingRecord[] {
  return [...teams].sort((a, b) => {
    if (b.seasonPoints !== a.seasonPoints) {
      return b.seasonPoints - a.seasonPoints
    }

    if (a.name !== b.name) {
      return a.name.localeCompare(b.name)
    }

    return a.createdAt.localeCompare(b.createdAt)
  })
}

function withRank(
  teams: TeamRankingRecord[],
  rankField: 'overallRank' | 'tierRank' | 'divisionRank',
): TeamRankingRecord[] {
  return teams.map((team, index) => ({
    ...team,
    [rankField]: index + 1,
  }))
}

function getCompetitionDivision(team: TeamRankingRecord): CompetitionDivision | null {
  if (team.tier === TEAM_TIERS.WORLD) return 'WORLD'
  if (team.tier === TEAM_TIERS.PRO) return team.tier2Division ?? null
  if (team.tier === TEAM_TIERS.CONTINENTAL) return team.tier3Division ?? null
  return team.amateurDivision ?? null
}

export function getGlobalStandings(teams: TeamRankingRecord[]): TeamRankingRecord[] {
  return withRank(sortTeamsByPointsDesc(teams), 'overallRank')
}

export function getWorldStandings(teams: TeamRankingRecord[]): TeamRankingRecord[] {
  return withRank(
    sortTeamsByPointsDesc(teams.filter((team) => team.tier === TEAM_TIERS.WORLD)),
    'divisionRank',
  )
}

export function getTier2DivisionStandings(
  teams: TeamRankingRecord[],
  division: Tier2Division,
): TeamRankingRecord[] {
  return withRank(
    sortTeamsByPointsDesc(
      teams.filter(
        (team) => team.tier === TEAM_TIERS.PRO && team.tier2Division === division,
      ),
    ),
    'divisionRank',
  )
}

export function getTier3DivisionStandings(
  teams: TeamRankingRecord[],
  division: Tier3Division,
): TeamRankingRecord[] {
  return withRank(
    sortTeamsByPointsDesc(
      teams.filter(
        (team) =>
          team.tier === TEAM_TIERS.CONTINENTAL && team.tier3Division === division,
      ),
    ),
    'divisionRank',
  )
}

export function getAmateurDivisionStandings(
  teams: TeamRankingRecord[],
  division: AmateurDivision,
): TeamRankingRecord[] {
  return withRank(
    sortTeamsByPointsDesc(
      teams.filter(
        (team) => team.tier === TEAM_TIERS.AMATEUR && team.amateurDivision === division,
      ),
    ),
    'divisionRank',
  )
}

function getTopTeams(
  teams: TeamRankingRecord[],
  count: number,
): TeamRankingRecord[] {
  return teams.slice(0, count)
}

function getBottomTeams(
  teams: TeamRankingRecord[],
  count: number,
): TeamRankingRecord[] {
  return teams.slice(Math.max(0, teams.length - count))
}

function buildPlayoffTable(
  divisionStandings: TeamRankingRecord[][],
  eligibleRanks: readonly number[],
): TeamRankingRecord[] {
  const pool: TeamRankingRecord[] = []

  divisionStandings.forEach((standing) => {
    eligibleRanks.forEach((rank) => {
      const team = standing[rank - 1]
      if (team) {
        pool.push(team)
      }
    })
  })

  return withRank(sortTeamsByPointsDesc(pool), 'overallRank')
}

function dedupeTeams(teams: TeamRankingRecord[]): TeamRankingRecord[] {
  const seen = new Set<string>()
  return teams.filter((team) => {
    if (seen.has(team.id)) return false
    seen.add(team.id)
    return true
  })
}

function moveRecord(
  team: TeamRankingRecord,
  toTier: TeamTier | null,
  toDivision: CompetitionDivision | null,
  reason: TeamMovementReason,
): TeamMovement {
  return {
    teamId: team.id,
    teamName: team.name,
    country: team.country,
    fromTier: team.tier,
    toTier,
    fromDivision: getCompetitionDivision(team),
    toDivision,
    reason,
  }
}

function getTier3RegionGroupPlayoffs(teams: TeamRankingRecord[]) {
  const europeStandings = [
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.WESTERN_EUROPE),
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.CENTRAL_EUROPE),
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.SOUTHERN_BALKAN_EUROPE),
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.NORTHERN_EASTERN_EUROPE),
  ]

  const americaStandings = [
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.NORTH_AMERICA),
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.SOUTH_AMERICA),
  ]

  const africaStandings = [
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.WEST_NORTH_AFRICA),
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.CENTRAL_SOUTH_AFRICA),
  ]

  const asiaStandings = [
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.WEST_CENTRAL_ASIA),
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.SOUTH_ASIA),
    getAmateurDivisionStandings(teams, AMATEUR_DIVISIONS.EAST_SOUTHEAST_ASIA),
  ]

  return {
    europeStandings,
    americaStandings,
    africaStandings,
    asiaStandings,
    europePlayoff: buildPlayoffTable(
      europeStandings,
      TIER4_RULES.europe.playoffEligibleRanks,
    ),
    americaPlayoff: buildPlayoffTable(
      americaStandings,
      TIER4_RULES.america.playoffEligibleRanks,
    ),
    africaPlayoff: buildPlayoffTable(
      africaStandings,
      TIER4_RULES.africa.playoffEligibleRanks,
    ),
    asiaPlayoff: buildPlayoffTable(
      asiaStandings,
      TIER4_RULES.asia.playoffEligibleRanks,
    ),
  }
}

export function assignTeamOnCreation(
  existingTeams: TeamRankingRecord[],
  countryCode: string,
): TeamCreationAssignment {
  const normalizedCountry = countryCode.trim().toUpperCase()
  const amateurDivision = COUNTRY_TO_AMATEUR_DIVISION[normalizedCountry]

  if (!amateurDivision) {
    throw new Error(`No amateur division configured for country code "${countryCode}"`)
  }

  // Highest-tier AI replacement logic is handled in DB now.
  // Fallback allocation if no AI replacement exists:
  return {
    tier: TEAM_TIERS.AMATEUR,
    tier2Division: null,
    tier3Division: null,
    amateurDivision,
  }
}

export function getSeasonMovements(
  teams: TeamRankingRecord[],
): SeasonMovementResult {
  const activeTeams = teams.filter((team) => team.isActive !== false)
  const removedInactiveTeams = teams.filter((team) => team.isActive === false)

  const worldStandings = getWorldStandings(activeTeams)
  const proWestStandings = getTier2DivisionStandings(activeTeams, TIER2_DIVISIONS.PRO_WEST)
  const proEastStandings = getTier2DivisionStandings(activeTeams, TIER2_DIVISIONS.PRO_EAST)

  const tier3Europe = getTier3DivisionStandings(
    activeTeams,
    TIER3_DIVISIONS.CONTINENTAL_EUROPE,
  )
  const tier3America = getTier3DivisionStandings(
    activeTeams,
    TIER3_DIVISIONS.CONTINENTAL_AMERICA,
  )
  const tier3Asia = getTier3DivisionStandings(
    activeTeams,
    TIER3_DIVISIONS.CONTINENTAL_ASIA,
  )
  const tier3Africa = getTier3DivisionStandings(
    activeTeams,
    TIER3_DIVISIONS.CONTINENTAL_AFRICA,
  )
  const tier3Oceania = getTier3DivisionStandings(
    activeTeams,
    TIER3_DIVISIONS.CONTINENTAL_OCEANIA,
  )

  const relegatedFromWorld = getBottomTeams(worldStandings, WORLD_RULES.relegated)

  const promotedToWorldDirect = dedupeTeams([
    ...getTopTeams(proWestStandings, TIER2_RULES.directPromotionToWorld.PRO_WEST),
    ...getTopTeams(proEastStandings, TIER2_RULES.directPromotionToWorld.PRO_EAST),
  ])

  const tier2WorldPlayoff = buildPlayoffTable(
    [proWestStandings, proEastStandings],
    TIER2_RULES.playoffEligibleRanks,
  )

  const promotedToWorldPlayoff = getTopTeams(
    tier2WorldPlayoff,
    TIER2_RULES.playoffPromotionToWorld,
  )

  const relegatedFromProWest = getBottomTeams(
    proWestStandings,
    TIER2_RULES.relegatedPerDivision,
  )
  const relegatedFromProEast = getBottomTeams(
    proEastStandings,
    TIER2_RULES.relegatedPerDivision,
  )

  const promotedToProWestDirect = dedupeTeams([
    getTopTeams(tier3Europe, 1)[0],
    getTopTeams(tier3America, 1)[0],
  ].filter(Boolean) as TeamRankingRecord[])

  const promotedToProEastDirect = dedupeTeams([
    getTopTeams(tier3Asia, 1)[0],
    getTopTeams(tier3Africa, 1)[0],
    getTopTeams(tier3Oceania, 1)[0],
  ].filter(Boolean) as TeamRankingRecord[])

  const tier3WestPlayoff = buildPlayoffTable(
    [tier3Europe, tier3America],
    TIER3_RULES.playoffEligibleRanks,
  )
  const promotedToProWestPlayoff = getTopTeams(
    tier3WestPlayoff,
    TIER3_RULES.playoffPromotionToTier2.PRO_WEST,
  )

  const tier3EastPlayoff = buildPlayoffTable(
    [tier3Asia, tier3Africa, tier3Oceania],
    TIER3_RULES.playoffEligibleRanks,
  )
  const promotedToProEastPlayoff = getTopTeams(
    tier3EastPlayoff,
    TIER3_RULES.playoffPromotionToTier2.PRO_EAST,
  )

  const relegatedFromTier3: Record<Tier3Division, TeamRankingRecord[]> = {
    CONTINENTAL_EUROPE: getBottomTeams(
      tier3Europe,
      TIER3_RULES.relegatedToAmateur.CONTINENTAL_EUROPE,
    ),
    CONTINENTAL_AMERICA: getBottomTeams(
      tier3America,
      TIER3_RULES.relegatedToAmateur.CONTINENTAL_AMERICA,
    ),
    CONTINENTAL_ASIA: getBottomTeams(
      tier3Asia,
      TIER3_RULES.relegatedToAmateur.CONTINENTAL_ASIA,
    ),
    CONTINENTAL_AFRICA: getBottomTeams(
      tier3Africa,
      TIER3_RULES.relegatedToAmateur.CONTINENTAL_AFRICA,
    ),
    CONTINENTAL_OCEANIA: getBottomTeams(
      tier3Oceania,
      TIER3_RULES.relegatedToAmateur.CONTINENTAL_OCEANIA,
    ),
  }

  const t4Playoffs = getTier3RegionGroupPlayoffs(activeTeams)

  const europeDirect = dedupeTeams([
    getTopTeams(t4Playoffs.europeStandings[0], 1)[0],
    getTopTeams(t4Playoffs.europeStandings[1], 1)[0],
    getTopTeams(t4Playoffs.europeStandings[2], 1)[0],
    getTopTeams(t4Playoffs.europeStandings[3], 1)[0],
  ].filter(Boolean) as TeamRankingRecord[])

  const europePlayoffPromoted = getTopTeams(
    t4Playoffs.europePlayoff,
    TIER4_RULES.europe.playoffPromoted,
  )

  const americaDirect = dedupeTeams([
    getTopTeams(t4Playoffs.americaStandings[0], 1)[0],
    getTopTeams(t4Playoffs.americaStandings[1], 1)[0],
  ].filter(Boolean) as TeamRankingRecord[])

  const americaPlayoffPromoted = getTopTeams(
    t4Playoffs.americaPlayoff,
    TIER4_RULES.america.playoffPromoted,
  )

  const africaDirect = dedupeTeams([
    getTopTeams(t4Playoffs.africaStandings[0], 1)[0],
    getTopTeams(t4Playoffs.africaStandings[1], 1)[0],
  ].filter(Boolean) as TeamRankingRecord[])

  const africaPlayoffPromoted = getTopTeams(
    t4Playoffs.africaPlayoff,
    TIER4_RULES.africa.playoffPromoted,
  )

  const asiaDirect = dedupeTeams([
    getTopTeams(t4Playoffs.asiaStandings[0], 1)[0],
    getTopTeams(t4Playoffs.asiaStandings[1], 1)[0],
    getTopTeams(t4Playoffs.asiaStandings[2], 1)[0],
  ].filter(Boolean) as TeamRankingRecord[])

  const asiaPlayoffPromoted = getTopTeams(
    t4Playoffs.asiaPlayoff,
    TIER4_RULES.asia.playoffPromoted,
  )

  const oceaniaStandings = getAmateurDivisionStandings(activeTeams, AMATEUR_DIVISIONS.OCEANIA)
  const oceaniaDirect = getTopTeams(oceaniaStandings, TIER4_RULES.oceania.directPromoted)

  const promotedFromAmateur: Record<Tier3Division, TeamRankingRecord[]> = {
    CONTINENTAL_EUROPE: dedupeTeams([...europeDirect, ...europePlayoffPromoted]),
    CONTINENTAL_AMERICA: dedupeTeams([...americaDirect, ...americaPlayoffPromoted]),
    CONTINENTAL_ASIA: dedupeTeams([...asiaDirect, ...asiaPlayoffPromoted]),
    CONTINENTAL_AFRICA: dedupeTeams([...africaDirect, ...africaPlayoffPromoted]),
    CONTINENTAL_OCEANIA: dedupeTeams([...oceaniaDirect]),
  }

  const allMovements: TeamMovement[] = [
    ...removedInactiveTeams.map((team) =>
      moveRecord(team, null, null, 'INACTIVE_REMOVED'),
    ),

    ...relegatedFromWorld.map((team) =>
      moveRecord(
        team,
        TEAM_TIERS.PRO,
        team.country && COUNTRY_TO_AMATEUR_DIVISION[team.country]
          ? TIER3_TO_TIER2_DIVISION[
              AMATEUR_TO_TIER3_DIVISION[COUNTRY_TO_AMATEUR_DIVISION[team.country]]
            ]
          : null,
        'RELEGATED',
      ),
    ),

    ...promotedToWorldDirect.map((team) =>
      moveRecord(team, TEAM_TIERS.WORLD, 'WORLD', 'DIRECT_PROMOTION'),
    ),
    ...promotedToWorldPlayoff.map((team) =>
      moveRecord(team, TEAM_TIERS.WORLD, 'WORLD', 'PLAYOFF_PROMOTION'),
    ),

    ...relegatedFromProWest.map((team) =>
      moveRecord(
        team,
        TEAM_TIERS.CONTINENTAL,
        AMATEUR_TO_TIER3_DIVISION[COUNTRY_TO_AMATEUR_DIVISION[team.country]],
        'RELEGATED',
      ),
    ),
    ...relegatedFromProEast.map((team) =>
      moveRecord(
        team,
        TEAM_TIERS.CONTINENTAL,
        AMATEUR_TO_TIER3_DIVISION[COUNTRY_TO_AMATEUR_DIVISION[team.country]],
        'RELEGATED',
      ),
    ),

    ...promotedToProWestDirect.map((team) =>
      moveRecord(team, TEAM_TIERS.PRO, TIER2_DIVISIONS.PRO_WEST, 'DIRECT_PROMOTION'),
    ),
    ...promotedToProWestPlayoff.map((team) =>
      moveRecord(team, TEAM_TIERS.PRO, TIER2_DIVISIONS.PRO_WEST, 'PLAYOFF_PROMOTION'),
    ),
    ...promotedToProEastDirect.map((team) =>
      moveRecord(team, TEAM_TIERS.PRO, TIER2_DIVISIONS.PRO_EAST, 'DIRECT_PROMOTION'),
    ),
    ...promotedToProEastPlayoff.map((team) =>
      moveRecord(team, TEAM_TIERS.PRO, TIER2_DIVISIONS.PRO_EAST, 'PLAYOFF_PROMOTION'),
    ),

    ...Object.entries(relegatedFromTier3).flatMap(([division, teamsInDivision]) =>
      teamsInDivision.map((team) =>
        moveRecord(
          team,
          TEAM_TIERS.AMATEUR,
          COUNTRY_TO_AMATEUR_DIVISION[team.country],
          'RELEGATED',
        ),
      ),
    ),

    ...Object.entries(promotedFromAmateur).flatMap(([division, teamsInDivision]) =>
      teamsInDivision.map((team) =>
        moveRecord(team, TEAM_TIERS.CONTINENTAL, division as Tier3Division, 'PROMOTED'),
      ),
    ),
  ]

  return {
    relegatedFromWorld,
    promotedToWorldDirect,
    promotedToWorldPlayoff,

    relegatedFromProWest,
    relegatedFromProEast,

    promotedToProWestDirect,
    promotedToProWestPlayoff,

    promotedToProEastDirect,
    promotedToProEastPlayoff,

    relegatedFromTier3,
    promotedFromAmateur,

    removedInactiveTeams,
    allMovements,
  }
}

export function applySeasonReset(teams: TeamRankingRecord[]): SeasonResetResult {
  const movements = getSeasonMovements(teams)
  const movementMap = new Map<string, TeamMovement>()

  movements.allMovements.forEach((movement) => {
    movementMap.set(movement.teamId, movement)
  })

  const updatedTeams = teams
    .filter((team) => {
      const move = movementMap.get(team.id)
      return move?.reason !== 'INACTIVE_REMOVED'
    })
    .map((team) => {
      const move = movementMap.get(team.id)

      if (!move) {
        return {
          ...team,
          seasonPoints: 0,
          overallRank: null,
          tierRank: null,
          divisionRank: null,
        }
      }

      if (move.toTier === TEAM_TIERS.WORLD) {
        return {
          ...team,
          tier: TEAM_TIERS.WORLD,
          tier2Division: null,
          tier3Division: null,
          amateurDivision: null,
          seasonPoints: 0,
          overallRank: null,
          tierRank: null,
          divisionRank: null,
          isActive: true,
        }
      }

      if (move.toTier === TEAM_TIERS.PRO) {
        return {
          ...team,
          tier: TEAM_TIERS.PRO,
          tier2Division: move.toDivision as Tier2Division,
          tier3Division: null,
          amateurDivision: null,
          seasonPoints: 0,
          overallRank: null,
          tierRank: null,
          divisionRank: null,
          isActive: true,
        }
      }

      if (move.toTier === TEAM_TIERS.CONTINENTAL) {
        return {
          ...team,
          tier: TEAM_TIERS.CONTINENTAL,
          tier2Division: null,
          tier3Division: move.toDivision as Tier3Division,
          amateurDivision: null,
          seasonPoints: 0,
          overallRank: null,
          tierRank: null,
          divisionRank: null,
          isActive: true,
        }
      }

      if (move.toTier === TEAM_TIERS.AMATEUR) {
        return {
          ...team,
          tier: TEAM_TIERS.AMATEUR,
          tier2Division: null,
          tier3Division: null,
          amateurDivision: move.toDivision as AmateurDivision,
          seasonPoints: 0,
          overallRank: null,
          tierRank: null,
          divisionRank: null,
          isActive: true,
        }
      }

      return {
        ...team,
        seasonPoints: 0,
        overallRank: null,
        tierRank: null,
        divisionRank: null,
      }
    })

  return {
    updatedTeams,
    movements,
  }
}