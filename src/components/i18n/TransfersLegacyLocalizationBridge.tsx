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
    'Loading transfers…': 'page.loading',
    'Loading transfers...': 'page.loading',
    'Loading rider market…': 'transferList.loading',
    'Loading rider market...': 'transferList.loading',
    'Loading free agents…': 'freeAgents.loading',
    'Loading free agents...': 'freeAgents.loading',
    'Loading shortlist...': 'shortlist.loading',
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
