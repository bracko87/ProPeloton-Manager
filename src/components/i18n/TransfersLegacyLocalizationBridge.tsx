import enTransfers from '../../i18n/locales/en/transfers.json'
import srTransfers from '../../i18n/locales/sr-Latn/transfers.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const STAFF_ROLE_KEYS: Record<string, string> = {
  'Head Coach': 'transfers:staffRoles.headCoach',
  Trainer: 'transfers:staffRoles.trainer',
  'U23 Head Coach': 'transfers:staffRoles.u23HeadCoach',
  'Team Doctor': 'transfers:staffRoles.teamDoctor',
  Physio: 'transfers:staffRoles.physio',
  Nutritionist: 'transfers:staffRoles.nutritionist',
  Mechanic: 'transfers:staffRoles.mechanic',
  'Sport Director': 'transfers:staffRoles.sportDirector',
  'Scout / Analyst': 'transfers:staffRoles.scoutAnalyst',
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'transfers',
  enResource: enTransfers,
  srResource: srTransfers,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return clean === '/dashboard/transfers' || clean.startsWith('/dashboard/transfers/')
  },
  aliases: {
    'Transfers': 'page.title',
    'Riders and staff market, shortlist and negotiations.': 'page.subtitle',
    'Riders': 'page.riders',
    'Staff': 'page.staff',
    'Transfer List': 'page.transferList',
    'Free Agents': 'page.freeAgents',
    'Shortlist': 'page.shortlist',
    'Loading transfers…': 'page.loading',
    'Loading transfers...': 'page.loading',
    'Transfer List Riders': 'transferList.title',
    'Loading rider market…': 'transferList.loading',
    'Loading rider market...': 'transferList.loading',
    'Make Offer': 'transferList.makeOffer',
    'Transfer Activity': 'activity.title',
    'Incoming': 'activity.incoming',
    'Outgoing': 'activity.outgoing',
    'Transfer History': 'history.title',
    'Arrivals': 'history.arrivals',
    'Departures': 'history.departures',
    'How Transfer Offers Work': 'transferHelp.title',
    'Loading free agents…': 'freeAgents.loading',
    'Loading free agents...': 'freeAgents.loading',
    'Free Agent Negotiations': 'freeAgents.negotiations',
    'Rider Shortlist': 'shortlist.title',
    'Loading shortlist...': 'shortlist.loading',
    'Open Profile': 'shortlist.openProfile',
    'Start Negotiation': 'shortlist.startNegotiation',
    'Available Staff': 'staffMarket.title',
    'Role Filter': 'staffMarket.roleFilter',
    'Sort By': 'staffMarket.sortBy',
    'Candidate Details': 'staffMarket.candidateDetails',
    'Weekly Wage Demand': 'staffMarket.weeklyWage',
    'Role Capacity': 'staffMarket.roleCapacityTitle',
    'Staff Attributes': 'staffMarket.attributes',
    'Contract Term': 'staffMarket.contractTerm',
    'Hire Staff': 'staffMarket.hire',
    'Current Staff Roles': 'staffMarket.currentRoles',
    'Previous': 'common.previous',
    'Next': 'common.next',
    'First': 'common.first',
    'Last': 'common.last',
    'Salary': 'common.salary',
    'Loading Transfer Intelligence...': 'negotiationIntelligence.title',
    'Updating...': 'common.updating',
  },
  transformParams: (key, params, t) => {
    if (params.role && STAFF_ROLE_KEYS[params.role]) {
      params.role = t(STAFF_ROLE_KEYS[params.role])
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
