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
    'Loading training page...': 'page.loading',
    'Checking Premium access...':
      'regular.checkingPremium',
    'Saving Default...':
      'regular.savingDefault',
    'Loading available staff...':
      'camps.loadingStaff',
    'Booking Training Camp...':
      'camps.bookingCamp',
    'Cancelling...':
      'camps.cancelling',
    'Loading current training camp...':
      'currentCamp.loading',
    'Starting...':
      'coach.saving',
  },
}

export default createLegacyLocalizationBridge(options)