import enScouting from '../../i18n/locales/en/scouting.json'
import srScouting from '../../i18n/locales/sr-Latn/scouting.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'scouting',
  enResource: enScouting,
  srResource: srScouting,
  routeMatch: path => {
    const clean = path.split('?')[0]
    return clean === '/dashboard/scouting' || clean.startsWith('/dashboard/scouting/')
  },
  aliases: {
    'Loading scout reports…': 'page.loading',
    '(+ more)': 'report.more',
  },
}

export default createLegacyLocalizationBridge(options)
