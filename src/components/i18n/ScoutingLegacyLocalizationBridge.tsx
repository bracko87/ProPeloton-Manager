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
    'Scouting Overview': 'page.title',
    'Loading scout reports…': 'page.loading',
    'Loading scout reports...': 'page.loading',
    'All': 'filters.all',
    'New': 'filters.new',
    'Reviewed': 'filters.reviewed',
    'Unknown rider': 'report.unknownRider',
    'Scout': 'report.scout',
    'Overall': 'report.overall',
    'Potential': 'report.potential',
    'Key strengths': 'report.keyStrengths',
    'Notes:': 'report.notes',
    'Open rider profile': 'report.openProfile',
    '(+ more)': 'report.more',
    'Previous': 'pagination.previous',
    'Next': 'pagination.next',
  },
}

export default createLegacyLocalizationBridge(options)
