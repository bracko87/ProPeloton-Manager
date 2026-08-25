import enFinance from '../../i18n/locales/en/finance.json'
import srFinance from '../../i18n/locales/sr-Latn/finance.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const DISPLAY_VALUE_KEYS: Record<string, string> = {
  Today: 'finance:overview.today',
  'This week': 'finance:overview.thisWeek',
  'This month': 'finance:overview.thisMonth',
  'Main Sponsor': 'finance:sponsors.mainSponsor',
  'Secondary Sponsor': 'finance:sponsors.secondarySponsor',
  'Technical Sponsor': 'finance:sponsors.technicalSponsor',
  ok: 'finance:tax.ok',
  adjusted: 'finance:tax.adjusted',
  refunded: 'finance:tax.refunded',
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'finance',
  enResource: enFinance,
  srResource: srFinance,
  routeMatch: path => {
    const clean = path.split('?')[0]
    return clean === '/dashboard/finance' || clean.startsWith('/dashboard/finance/')
  },
  aliases: {
    'Loading...': 'page.loading',
    'Loading sponsor dashboard...': 'sponsors.loadingDashboard',
    'Loading sponsor objectives…': 'sponsors.loadingObjectives',
    'Loading tax data...': 'tax.loading',
    'Loading team policies...': 'policies.loading',
    'Applying...': 'policies.applying',
    'Signing...': 'sponsors.signing',
    'Calculating technical sponsor cash/equipment support package…':
      'sponsors.calculatingPackage',
    'Calculating technical sponsor cash/equipment support package...':
      'sponsors.calculatingPackage',
  },
  transformParams: (_key, params, t) => {
    for (const field of ['period', 'kind', 'status']) {
      const value = params[field]
      const translationKey = value ? DISPLAY_VALUE_KEYS[value] : undefined

      if (translationKey) {
        params[field] = t(translationKey)
      }
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
