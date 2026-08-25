import enClub from '../../i18n/locales/en/club.json'
import srClub from '../../i18n/locales/sr-Latn/club.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const enResource = {
  ...enClub,
  bridge: {
    worldTierPrefixed: '· World tier {{tier}}',
  },
}

const srResource = {
  ...srClub,
  bridge: {
    worldTierPrefixed: '· Svetski nivo {{tier}}',
  },
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'club',
  enResource,
  srResource,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean.startsWith('/dashboard/teams/') ||
      clean === '/dashboard/club-identity' ||
      clean === '/dashboard/statistics/club-history'
    )
  },
  aliases: {
    'Loading team profile…': 'teamProfile.loading',
    'Loading club identity...': 'identity.loading',
    'Sending…': 'report.sending',
    'Checking…': 'report.checking',
    'No sponsor logo available.': 'teamProfile.noSponsorLogo',
  },
}

export default createLegacyLocalizationBridge(options)
