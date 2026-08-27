import enTeamRanking from '../../i18n/locales/en/teamRanking.json'
import srTeamRanking from '../../i18n/locales/sr-Latn/teamRanking.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const DISPLAY_KEYS: Record<string, string> = {
  WorldTeam: 'teamRanking:divisions.world',
  'ProTeam West': 'teamRanking:divisions.proWest',
  'ProTeam East': 'teamRanking:divisions.proEast',
  'Continental Europe': 'teamRanking:divisions.continentalEurope',
  'Continental America': 'teamRanking:divisions.continentalAmerica',
  'Continental Asia': 'teamRanking:divisions.continentalAsia',
  'Continental Africa': 'teamRanking:divisions.continentalAfrica',
  'Continental Oceania': 'teamRanking:divisions.continentalOceania',
  'North America': 'teamRanking:divisions.northAmerica',
  'South America': 'teamRanking:divisions.southAmerica',
  'Western Europe': 'teamRanking:divisions.westernEurope',
  'Central Europe': 'teamRanking:divisions.centralEurope',
  'Southern & Balkan Europe': 'teamRanking:divisions.southernBalkanEurope',
  'Northern & Eastern Europe': 'teamRanking:divisions.northernEasternEurope',
  'West & North Africa': 'teamRanking:divisions.westNorthAfrica',
  'Central & South Africa': 'teamRanking:divisions.centralSouthAfrica',
  'West & Central Asia': 'teamRanking:divisions.westCentralAsia',
  'South Asia': 'teamRanking:divisions.southAsia',
  'East & Southeast Asia': 'teamRanking:divisions.eastSoutheastAsia',
  Oceania: 'teamRanking:divisions.oceania',
  'Winner promoted directly': 'teamRanking:zones.winnerPromoted',
  'Top 3 promoted directly': 'teamRanking:zones.top3Promoted',
  '2nd-3rd enter promotion playoff': 'teamRanking:zones.secondThirdPlayoff',
  '2nd-4th enter promotion playoff': 'teamRanking:zones.secondFourthPlayoff',
  '2nd-4th enter World playoff': 'teamRanking:zones.worldPlayoff',
  '2nd-4th enter Pro West playoff': 'teamRanking:zones.proWestPlayoff',
  '2nd-4th enter Pro East playoff': 'teamRanking:zones.proEastPlayoff',
  'Bottom 3 relegated': 'teamRanking:zones.bottom3',
  'Bottom 5 relegated': 'teamRanking:zones.bottom5',
  'Bottom 6 relegated': 'teamRanking:zones.bottom6',
  'No direct promotion places.': 'teamRanking:rules.noDirect',
  'No playoff places.': 'teamRanking:rules.noPlayoff',
  'No relegation places.': 'teamRanking:rules.noRelegation',
}

function translateDisplayValue(
  value: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | undefined {
  if (!value) return value

  const directKey = DISPLAY_KEYS[value]
  if (directKey) return t(directKey)

  const amateurMatch = value.match(/^Amateur:\s*(.+)$/)
  if (amateurMatch) {
    const division = translateDisplayValue(amateurMatch[1], t) ?? amateurMatch[1]
    return t('teamRanking:divisions.amateurStanding', { division })
  }

  return value
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'teamRanking',
  enResource: enTeamRanking,
  srResource: srTeamRanking,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean === '/dashboard/team-ranking' ||
      clean.startsWith('/dashboard/team-ranking/')
    )
  },
  aliases: {
    'Team Ranking': 'page.title',
    'Select tier': 'page.selectTier',
    'Select division': 'page.selectDivision',
    'Loading standings…': 'page.loading',
    'Loading standings...': 'page.loading',
    'Loading past winners…': 'pastWinners.loading',
    'Loading past winners...': 'pastWinners.loading',
    'Pos': 'table.position',
    'Team': 'table.team',
    'Country': 'table.country',
    'Races': 'table.races',
    'Race Rep.': 'table.raceReputation',
    'Points': 'table.points',
    'Inactive': 'table.inactive',
    'Your team': 'table.yourTeam',
  },
  transformParams: (key, params, t) => {
    if (params.standing) {
      params.standing = translateDisplayValue(params.standing, t) ?? params.standing
    }

    if (params.value) {
      params.value = translateDisplayValue(params.value, t) ?? params.value
    }

    if (params.division) {
      params.division = translateDisplayValue(params.division, t) ?? params.division
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
