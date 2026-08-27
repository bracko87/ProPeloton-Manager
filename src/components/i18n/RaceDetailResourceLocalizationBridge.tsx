import enRaceDetail from '../../i18n/locales/en/raceDetail.json'
import srRaceDetail from '../../i18n/locales/sr-Latn/raceDetail.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'raceDetail',
  enResource: enRaceDetail,
  srResource: srRaceDetail,
  routeMatch: path => {
    const clean = path.split('?')[0]
    return /^\/dashboard\/races\/[^/]+/.test(clean)
  },
  aliases: {
    'Loading race detail...': 'page.loading',
    'Race date': 'summary.raceDate',
    'Replay unavailable': 'replay.unavailable',
    'Replay is not available yet.': 'replay.notAvailableYet',
    'Stage points': 'stage.points',
    'Points:': 'stage.pointsLabel',
    'Time bonuses:': 'stage.timeBonuses',
    'GC time bonuses:': 'stage.gcTimeBonuses',
    'Stage weather': 'weather.title',
    'Leaders / Winners': 'leaders.title',
    'General leader': 'leaders.general',
    'Best sprinter': 'leaders.sprinter',
    'Best climber': 'leaders.climber',
    'Best young rider': 'leaders.young',
    'Best team': 'leaders.team',
    'Participants and results': 'participants.participantsResults',
    'Teams & riders': 'participants.teamsRiders',
    'Hide': 'participants.hide',
    'Show': 'participants.show',
  },
}

export default createLegacyLocalizationBridge(options)
