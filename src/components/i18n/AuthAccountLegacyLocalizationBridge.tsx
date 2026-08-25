import enAuth from '../../i18n/locales/en/auth.json'
import srAuth from '../../i18n/locales/sr-Latn/auth.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'auth',
  enResource: enAuth,
  srResource: srAuth,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean === '/register' ||
      clean === '/forgot-password' ||
      clean === '/reset-password'
    )
  },
  aliases: {
    'Create Account': 'register.createAccount',
    'Checking email availability…': 'register.checkingEmail',
    'Checking email availability...': 'register.checkingEmail',
    'Resending activation email…': 'register.resendingActivation',
    'Resending activation email...': 'register.resendingActivation',
    'Creating…': 'register.creating',
    'Creating...': 'register.creating',
    'Checking…': 'register.checking',
    'Checking...': 'register.checking',
    'Please wait…': 'register.pleaseWait',
    'Please wait...': 'register.pleaseWait',
    'Sending reset link…': 'forgot.sending',
    'Sending reset link...': 'forgot.sending',
    'Verifying your reset link…': 'reset.verifying',
    'Verifying your reset link...': 'reset.verifying',
    'Updating password…': 'reset.updating',
    'Updating password...': 'reset.updating',
  },
}

export default createLegacyLocalizationBridge(options)
