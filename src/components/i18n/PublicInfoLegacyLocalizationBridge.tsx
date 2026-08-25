import enPublicInfo from '../../i18n/locales/en/publicInfo.json'
import srPublicInfo from '../../i18n/locales/sr-Latn/publicInfo.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'publicInfo',
  enResource: enPublicInfo,
  srResource: srPublicInfo,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean === '/about' ||
      clean === '/how-to-play' ||
      clean === '/support' ||
      clean === '/privacy-policy' ||
      clean === '/terms' ||
      clean === '/contact' ||
      clean === '/dashboard/contact-us'
    )
  },
  aliases: {
    'Sending…': 'contactPage.sending',
    'Sending...': 'contactPage.sending',
    'Privacy policy': 'common.privacyPolicy',
    'Terms of use': 'terms.eyebrow',
  },
}

export default createLegacyLocalizationBridge(options)
