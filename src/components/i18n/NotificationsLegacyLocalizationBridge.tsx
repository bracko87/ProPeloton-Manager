import enNotifications from '../../i18n/locales/en/notifications.json'
import srNotifications from '../../i18n/locales/sr-Latn/notifications.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const PARAMETER_KEYS: Record<string, string> = {
  unread: 'notifications:summary.unread',
  read: 'notifications:summary.read',
  notifications: 'notifications:summary.notifications',
  'advisor reports': 'notifications:summary.advisorReports',
  'Head Coach': 'notifications:roles.headCoach',
  'Sports Director': 'notifications:roles.sportsDirector',
  'Team Doctor': 'notifications:roles.teamDoctor',
  'Chief Mechanic': 'notifications:roles.chiefMechanic',
  Scout: 'notifications:roles.scout',
  'Staff Advisor': 'notifications:roles.staffAdvisor',
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'notifications',
  enResource: enNotifications,
  srResource: srNotifications,
  routeMatch: path => {
    const clean = path.split('?')[0]
    return clean === '/dashboard/notifications' || clean.startsWith('/dashboard/notifications/')
  },
  aliases: {
    'Search notifications…': 'filters.search',
    'Loading notifications...': 'empty.loading',
    'Marking...': 'tabs.marking',
    'Saving...': 'mute.saving',
    game: 'categories.game',
    admin: 'categories.admin',
    system: 'categories.system',
    Staffadvisory: 'categories.staffAdvisory',
    'Staff advisory': 'categories.staffAdvisory',
    'Staff Advisory': 'details.staffAdvisory',
    'Open Rider': 'details.openRider',
    'Open rider': 'details.openRider',
    'Open Squad': 'details.openSquad',
    'Open squad': 'details.openSquad',
    'Race preparation': 'details.racePreparation',
    'Race Preparation': 'details.racePreparation',
    'Mark as Read': 'details.markRead',
    'Mark as read': 'details.markRead',
  },
  transformParams: (_key, params, t) => {
    for (const field of ['state', 'kind', 'role']) {
      const value = params[field]
      const translationKey = value ? PARAMETER_KEYS[value] : undefined
      if (translationKey) params[field] = t(translationKey)
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
