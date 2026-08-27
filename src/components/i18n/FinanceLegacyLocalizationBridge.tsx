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
    'Finance': 'page.title',
    'Overview of income, expenses and transactions.': 'page.subtitle',
    'Refresh': 'page.refresh',
    'Overview': 'tabs.overview',
    'Sponsors': 'tabs.sponsors',
    'Transactions': 'tabs.transactions',
    'Tax': 'tabs.tax',
    'Team Policies & Operations': 'tabs.policies',
    'Previous': 'common.previous',
    'Next': 'common.next',
    'First': 'common.first',
    'Last': 'common.last',
    'Reset': 'common.reset',
    'Apply': 'common.apply',
    'Type': 'common.type',
    'Amount': 'common.amount',
    'Status': 'common.status',
    'Season': 'common.season',
    'Signed': 'common.signed',
    'Main Sponsor': 'sponsors.mainSponsor',
    'Secondary Sponsor': 'sponsors.secondarySponsor',
    'Technical Sponsor': 'sponsors.technicalSponsor',
    'View Offers': 'sponsors.viewOffers',
    'Sponsor Status': 'sponsors.sponsorStatus',
    'Main Sponsor Contract Summary': 'sponsors.contractSummary',
    'Transactions': 'transactions.title',
    'Game Date': 'transactions.gameDate',
    'Archive': 'transactions.archive',
    'Tax': 'tax.title',
    'Tax statement': 'tax.statement',
    'Audit history': 'tax.auditHistory',
    'Team Policies & Operations': 'policies.title',
    'Active policies': 'policies.activePolicies',
    'Upcoming Trips': 'policies.upcomingTrips',
    'Operations': 'policies.operations',
    'Team Policies': 'policies.teamPolicies',
    'Selected option': 'policies.selectedOption',
    'Effect': 'policies.effect',
    'Cost type': 'policies.costType',
    'Estimated cost': 'policies.estimatedCost',
    'Notification': 'policies.notification',
    'Apply Changes': 'policies.applyChanges',
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
