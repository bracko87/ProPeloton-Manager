import enCreateClub from '../../i18n/locales/en/createClub.json'
import srCreateClub from '../../i18n/locales/sr-Latn/createClub.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const enResource = {
  ...enCreateClub,
  bridge: {
    namedCountryFlag: '{{country}} flag',
  },
}

const srResource = {
  ...srCreateClub,
  bridge: {
    namedCountryFlag: 'Zastava: {{country}}',
  },
}

const patternTranslationKeys: Record<string, string> = {
  Solid: 'patterns.solid',
  Band: 'patterns.band',
  'Double Band': 'patterns.doubleBand',
  'Vertical Split': 'patterns.verticalSplit',
  'Horizontal Split': 'patterns.horizontalSplit',
  'Diagonal Sash': 'patterns.diagonalSash',
  'Diagonal Split': 'patterns.diagonalSplit',
  'Vertical Stripes': 'patterns.verticalStripes',
  'Horizontal Stripes': 'patterns.horizontalStripes',
  Chevron: 'patterns.chevron',
  'Center Stripe': 'patterns.centerStripe',
  Quartered: 'patterns.quartered',
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'createClub',
  enResource,
  srResource,
  routeMatch: path => path.split('?')[0] === '/create-club',
  aliases: {
    'Loading countries…': 'page.loadingCountries',
    'Loading countries...': 'page.loadingCountries',
    'Applying…': 'logo.applying',
    'Applying...': 'logo.applying',
    'Creating…': 'page.creating',
    'Creating...': 'page.creating',
  },
  transformParams: (key, params, t) => {
    if (key === 'createClub:patterns.select' && params.pattern) {
      const translationKey = patternTranslationKeys[params.pattern]

      if (translationKey) {
        return {
          ...params,
          pattern: t(`createClub:${translationKey}`),
        }
      }
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
