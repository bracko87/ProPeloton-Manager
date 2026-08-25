import enAccountPages from '../../i18n/locales/en/accountPages.json'
import srAccountPages from '../../i18n/locales/sr-Latn/accountPages.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'accountPages',
  enResource: enAccountPages,
  srResource: srAccountPages,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean === '/dashboard/inbox' ||
      clean === '/dashboard/my-profile' ||
      clean === '/dashboard/invite-friends' ||
      clean === '/dashboard/forum'
    )
  },
  aliases: {
    'Loading profile…': 'profile.loading',
    'Loading profile...': 'profile.loading',
    'Saving…': 'profile.saving',
    'Saving...': 'profile.saving',
    'Sending email…': 'profile.sendingEmail',
    'Sending email...': 'profile.sendingEmail',
    'Loading conversations…': 'inbox.loadingConversations',
    'Loading conversations...': 'inbox.loadingConversations',
    'Loading messages…': 'inbox.loadingMessages',
    'Loading messages...': 'inbox.loadingMessages',
    'Sending…': 'inbox.sending',
    'Sending...': 'inbox.sending',
    'Loading invite link…': 'invite.loadingLink',
    'Loading invite link...': 'invite.loadingLink',
    'Loading referral activity…': 'invite.loadingActivity',
    'Loading referral activity...': 'invite.loadingActivity',
  },
}

export default createLegacyLocalizationBridge(options)
