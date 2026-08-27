import enRaceDetail from '../../i18n/locales/en/raceDetail.json'
import srRaceDetail from '../../i18n/locales/sr-Latn/raceDetail.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const enResource = {
  ...enRaceDetail,
  bridge: {
    raceDate: 'Race date: {{date}}',
    leadersTitle: 'Leaders / Winners',
    average: 'Average',
    minMax: 'Min / max',
    sunnyWindy: 'Sunny Windy',
    cancellationInfo:
      'Cancellation is decided automatically 24 in-game hours before the stage start, using the generated stage weather. Snow or an average temperature below 5°C cancels the stage.',
  },
}

const srResource = {
  ...srRaceDetail,
  bridge: {
    raceDate: 'Datum trke: {{date}}',
    leadersTitle: 'Lideri / pobednici',
    average: 'Prosek',
    minMax: 'Min / maks',
    sunnyWindy: 'Sunčano i vetrovito',
    cancellationInfo:
      'Otkazivanje se određuje automatski 24 sata u igri pre početka etape, na osnovu generisanih vremenskih uslova. Sneg ili prosečna temperatura ispod 5°C otkazuju etapu.',
  },
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'raceDetail',
  enResource,
  srResource,
  routeMatch: path => {
    const clean = path.split('?')[0]
    return /^\/dashboard\/races\/[^/]+/.test(clean)
  },
  aliases: {
    'Loading race detail...': 'page.loading',
    'Race date': 'bridge.raceDate',
    'Replay unavailable': 'replay.unavailable',
    'Replay is not available yet.': 'replay.notAvailable',
    'Stage points': 'stage.points',
    'Points:': 'stage.pointsLabel',
    'Time bonuses:': 'stage.timeBonuses',
    'GC time bonuses:': 'stage.gcTimeBonuses',
    'Stage weather': 'weather.title',
    'Leaders / Winners': 'bridge.leadersTitle',
    'Average': 'bridge.average',
    'Min / max': 'bridge.minMax',
    'Sunny Windy': 'bridge.sunnyWindy',
    'Cancellation is decided automatically 24 in-game hours before the stage start, using the generated stage weather. Snow or an average temperature below 5°C cancels the stage.':
      'bridge.cancellationInfo',
    'General leader': 'leaders.general',
    'Best sprinter': 'leaders.sprinter',
    'Best climber': 'leaders.climber',
    'Best young rider': 'leaders.young',
    'Best team': 'leaders.team',
    'Participants and results': 'participants.participantsResults',
    'Teams & riders': 'participants.teamsRiders',
    'Hide': 'participants.hide',
    'Show': 'participants.show',
    'No accepted teams have been confirmed yet. Accepted teams will appear here once the official startlist is published.':
      'participants.noneConfirmed',
  },
}

export default createLegacyLocalizationBridge(options)
