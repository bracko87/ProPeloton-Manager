import enStaff from '../../i18n/locales/en/staff.json'
import srStaff from '../../i18n/locales/sr-Latn/staff.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const ROLE_KEYS: Record<string, string> = {
  'Head Coach': 'staff:roles.headCoach.label',
  Trainer: 'staff:roles.trainer.label',
  'Team Doctor': 'staff:roles.teamDoctor.label',
  Physio: 'staff:roles.physio.label',
  Nutritionist: 'staff:roles.nutritionist.label',
  Mechanic: 'staff:roles.mechanic.label',
  'Sport Director': 'staff:roles.sportDirector.label',
  'Scout / Analyst': 'staff:roles.scoutAnalyst.label',
  'U23 Head Coach': 'staff:roles.u23HeadCoach.label',
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'staff',
  enResource: enStaff,
  srResource: srStaff,
  routeMatch: path =>
    path === '/dashboard/staff' ||
    path.startsWith('/dashboard/staff?'),
  aliases: {
    'Loading staff...': 'page.loading',
    'Staff': 'rolesSection.title',
  },
  transformParams: (key, params, t) => {
    if (
      key.endsWith('.noAssigned') ||
      key.endsWith('.role') ||
      key.endsWith('.staffList')
    ) {
      const role = params.role
      if (role && ROLE_KEYS[role]) {
        params.role = t(ROLE_KEYS[role])
      }
    }

    if (key.endsWith('.scope')) {
      const scope = params.scope?.toLowerCase()

      if (scope === 'first team') {
        params.scope = t('staff:common.firstTeam')
      } else if (scope === 'u23') {
        params.scope = t('staff:common.u23')
      } else if (scope === 'all') {
        params.scope = t('staff:common.all')
      }
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
