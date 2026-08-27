import enTraining from '../../i18n/locales/en/training.json'
import srTraining from '../../i18n/locales/sr-Latn/training.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'training',
  enResource: enTraining,
  srResource: srTraining,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean === '/dashboard/training' ||
      clean.startsWith('/dashboard/training/')
    )
  },
  aliases: {
    'Training': 'page.title',
    'Plan regular training manually or delegate a rolling three-day plan to your Head Coach.': 'page.subtitle',
    'Loading training page...': 'page.loading',
    'Regular Training': 'page.regularTab',
    'Training Camps': 'page.campsTab',
    'Focused Rider Training': 'page.focusedRider',
    'First Team': 'common.firstTeam',
    'U23': 'common.u23',
    'Refresh': 'common.refresh',
    'Previous': 'common.previous',
    'Next': 'common.next',
    'Head Coach Training Automation': 'regular.automationTitle',
    'Team Defaults': 'regular.teamDefaults',
    'Rider Overrides': 'regular.riderOverrides',
    'Override Today': 'regular.overrideToday',
    'Save Today Override': 'regular.saveTodayOverride',
    'Save Override': 'regular.saveOverride',
    'Create Override': 'regular.createOverride',
    'Clear Today Override': 'regular.clearTodayOverride',
    'Clear Override': 'regular.clearOverride',
    'Head Coach Management': 'coach.title',
    'Head Coach Training Management': 'coach.infoTitle',
    'Coach active': 'coach.coachActive',
    'Manual fallback': 'coach.manualFallback',
    'No eligible coach': 'coach.noEligibleCoach',
    'Enable': 'coach.enable',
    'Disable': 'coach.disable',
    'Current / Planned Training Camp': 'camps.currentTitle',
    'Available Camps': 'camps.availableCamps',
    'Rider Selection': 'camps.riderSelection',
    'Staff Selection': 'camps.staffSelection',
    'Book Training Camp': 'camps.bookCamp',
    'Checking Premium access...': 'regular.checkingPremium',
    'Saving Default...': 'regular.savingDefault',
    'Loading available staff...': 'camps.loadingStaff',
    'Booking Training Camp...': 'camps.bookingCamp',
    'Cancelling...': 'camps.cancelling',
    'Loading current training camp...': 'currentCamp.loading',
    'Starting...': 'coach.saving',
  },
}

export default createLegacyLocalizationBridge(options)
