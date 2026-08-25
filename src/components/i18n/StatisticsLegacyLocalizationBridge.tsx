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
    'Fetching data…': 'page.fetching',
    'Fetching data...': 'page.fetching',
    'Loading statistics…': 'page.loading',
    'Loading statistics...': 'page.loading',
  },
  transformParams: (key, params, t) => {
    if (params.metric && METRIC_KEYS[params.metric]) {
      params.metric = t(METRIC_KEYS[params.metric])
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
