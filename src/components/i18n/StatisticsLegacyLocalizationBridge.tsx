import enStatistics from '../../i18n/locales/en/statistics.json'
import srStatistics from '../../i18n/locales/sr-Latn/statistics.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const METRIC_KEYS: Record<string, string> = {
  international: 'statistics:metrics.international',
  'stage finish': 'statistics:metrics.stageFinish',
  'gc / one-day': 'statistics:metrics.gcOneDay',
  International: 'statistics:metrics.international',
  'Stage finish': 'statistics:metrics.stageFinish',
  'GC / one-day': 'statistics:metrics.gcOneDay',
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'statistics',
  enResource: enStatistics,
  srResource: srStatistics,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return clean === '/dashboard/statistics' || clean.startsWith('/dashboard/statistics/')
  },
  aliases: {
    'Statistics': 'page.title',
    'Teams': 'page.teams',
    'Riders': 'page.riders',
    'Fetching data…': 'page.fetching',
    'Fetching data...': 'page.fetching',
    'Loading statistics…': 'page.loading',
    'Loading statistics...': 'page.loading',
    'Current': 'common.current',
    'History': 'common.history',
    'Rankings': 'common.rankings',
    'Breakdown': 'common.breakdown',
    'User teams': 'filters.userTeams',
    'AI teams': 'filters.aiTeams',
    'All tiers': 'filters.allTiers',
    'All divisions': 'filters.allDivisions',
    'All countries': 'filters.allCountries',
    'Previous': 'common.previous',
    'Next': 'common.next',
  },
  transformParams: (key, params, t) => {
    if (params.metric && METRIC_KEYS[params.metric]) {
      params.metric = t(METRIC_KEYS[params.metric])
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
