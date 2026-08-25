import enSeasonReset from '../../i18n/locales/en/seasonReset.json'
import srSeasonReset from '../../i18n/locales/sr-Latn/seasonReset.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'seasonReset',
  enResource: enSeasonReset,
  srResource: srSeasonReset,
  routeMatch: path => path.split('?')[0] === '/dashboard/season-reset-preview',
  aliases: {
    'Loading season reset preview…': 'page.loading',
    'Loading season reset preview...': 'page.loading',
  },
}

export default createLegacyLocalizationBridge(options)
