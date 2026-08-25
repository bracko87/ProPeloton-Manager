import enCustomizeTeam from '../../i18n/locales/en/customizeTeam.json'
import srCustomizeTeam from '../../i18n/locales/sr-Latn/customizeTeam.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'customizeTeam',
  enResource: enCustomizeTeam,
  srResource: srCustomizeTeam,
  routeMatch: path => path.split('?')[0] === '/dashboard/customize-team',
  aliases: {
    'Loading club settings…': 'page.loading',
    'Loading club settings...': 'page.loading',
    'Saving changes…': 'page.saving',
    'Saving changes...': 'page.saving',
    'Applying…': 'identity.applying',
    'Applying...': 'identity.applying',
  },
}

export default createLegacyLocalizationBridge(options)
