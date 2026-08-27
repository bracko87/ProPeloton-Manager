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
    'Team Staff': 'page.title',
    'Staff': 'rolesSection.title',
    'Staff Roles': 'rolesSection.title',
    'Weekly Staff Wages': 'summary.weeklyWages',
    'Open Staff Slots': 'summary.openSlots',
    'Total Staff Capacity': 'summary.totalCapacity',
    'Warnings': 'summary.warnings',
    'Find Staff': 'rolesSection.findStaff',
    'Weekly Wage': 'common.weeklyWage',
    'Contract': 'common.contract',
    'Current Assignment': 'common.currentAssignment',
    'Active Effects': 'common.activeEffects',
    'Staff Attributes': 'common.staffAttributes',
    'Currently not assigned': 'assignment.notAssigned',
    'Expires today': 'assignment.expiresToday',
    '1 day left': 'assignment.oneDayLeft',
    'Open Staff Profile': 'assignment.openProfile',
    'Training': 'attributes.training',
    'Recovery Planning': 'attributes.recoveryPlanning',
    'Youth Development': 'attributes.youthDevelopment',
    'Experience': 'attributes.experience',
    'Leadership': 'attributes.leadership',
    'Loyalty': 'attributes.loyalty',
    'Daily Training': 'attributes.dailyTraining',
    'Training Efficiency': 'attributes.trainingEfficiency',
    'Potential Growth': 'attributes.potentialGrowth',
    'Recovery': 'attributes.recovery',
    'Prevention': 'attributes.prevention',
    'Diagnosis': 'attributes.diagnosis',
    'Rehabilitation': 'attributes.rehabilitation',
    'Recovery Speed': 'attributes.recoverySpeed',
    'Nutrition': 'attributes.nutrition',
    'Consistency': 'attributes.consistency',
    'Bike Setup': 'attributes.bikeSetup',
    'Reliability': 'attributes.reliability',
    'Race Planning': 'attributes.racePlanning',
    'Team Control': 'attributes.teamControl',
    'Evaluation': 'attributes.evaluation',
    'Network': 'attributes.network',
    'Accuracy': 'attributes.accuracy',
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
