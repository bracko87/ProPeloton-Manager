import enProPackages from '../../i18n/locales/en/proPackages.json'
import srProPackages from '../../i18n/locales/sr-Latn/proPackages.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'proPackages',
  enResource: enProPackages,
  srResource: srProPackages,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean === '/dashboard/pro' ||
      clean === '/dashboard/pro-packages'
    )
  },
  aliases: {
    'Loading Premium...': 'premium.loading',
    'Redirecting...': 'premium.redirecting',
    'Loading packages...': 'packages.loading',
    'Loading...': 'history.loading',
    Purchase: 'history.coinPackage',
    'Daily Charge': 'transactions.dailyCharge',
    'Daily Gameplay Unlock': 'transactions.dailyUnlock',
    'Referral Reward': 'transactions.referral',
    'Admin Adjustment': 'transactions.admin',
    'Developing Team Purchase': 'transactions.developingPurchase',
    'Developing Team Unlock': 'transactions.developingPurchase',
    'Developing Team Legacy Creation': 'transactions.developingLegacy',
    'Developing Team Season Activation':
      'transactions.developingSeasonalActivation',
    'Developing Team Season Renewal':
      'transactions.developingSeasonalRenewal',
    'Developing Team Season Reactivation':
      'transactions.developingSeasonalReactivation',
    'Scout Report Extra': 'transactions.extraScout',
    'Extra Scouting Report': 'transactions.extraScout',
    'Premium Monthly Grant': 'transactions.premiumGrant',
    'Premium Monthly Coin Grant': 'transactions.premiumGrant',
  },
}

export default createLegacyLocalizationBridge(options)
