import enHelp from '../../i18n/locales/en/help.json'
import srHelp from '../../i18n/locales/sr-Latn/help.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'help',
  enResource: enHelp,
  srResource: srHelp,
  routeMatch: path => path.split('?')[0] === '/dashboard/help',
}

export default createLegacyLocalizationBridge(options)
