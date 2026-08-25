import enRiderProfile from '../../i18n/locales/en/riderProfile.json'
import srRiderProfile from '../../i18n/locales/sr-Latn/riderProfile.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const enResource = {
  ...enRiderProfile,
  bridge: {
    averagePosition: 'Average P{{position}}',
    racesUsed: '{{count}} races used',
    sessionsUsed: '{{count}} sessions used',
    stageCount: '{{count}} stages',
    seasonLabel: 'Season {{season}}',
    ageLabel: 'Age {{age}}',
    hours: '{{count}} in-game hours',
    oneHour: '{{count}} in-game hour',
    coinBalance: '{{count}} coins',
    oneCoinBalance: '{{count}} coin',
  },
}

const srResource = {
  ...srRiderProfile,
  bridge: {
    averagePosition: 'Prosek P{{position}}',
    racesUsed: 'Korišćeno trka: {{count}}',
    sessionsUsed: 'Korišćeno treninga: {{count}}',
    stageCount: '{{count}} etapa',
    seasonLabel: 'Sezona {{season}}',
    ageLabel: 'Godine {{age}}',
    hours: '{{count}} sati u igri',
    oneHour: '{{count}} sat u igri',
    coinBalance: '{{count}} novčića',
    oneCoinBalance: '{{count}} novčić',
  },
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'riderProfile',
  enResource,
  srResource,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean.startsWith('/dashboard/riders/') ||
      clean.startsWith('/dashboard/my-riders/') ||
      clean.startsWith('/dashboard/external-riders/') ||
      clean === '/dashboard/compare-riders'
    )
  },
  aliases: {
    'Loading rider profile...': 'wrapper.loading',
    'Loading…': 'common.loading',
    'Loading...': 'common.loading',
    'Time trial': 'skills.timeTrial',
    'Time Trial': 'skills.timeTrial',
    'Basic View': 'skills.basicView',
    'Modern View': 'skills.modernView',
    'Mark as scouted': 'simpleProfile.markScouted',
    'Unmark scouted': 'simpleProfile.unmarkScouted',
    'Show history': 'simpleProfile.showHistory',
    'Hide history': 'simpleProfile.hideHistory',
    'Open team': 'simpleProfile.openTeam',
    'Free agent': 'external.freeAgent',
    'Transfer listed': 'external.transferListed',
    'Checking Premium access...': 'common.checkingPremium',
    'Loading recent races...': 'external.loadingRecentRaces',
    'Loading career history...': 'external.loadingCareer',
    'Loading current team...': 'external.loadingCurrentTeam',
    'Starting…': 'scouting.starting',
    'Starting...': 'scouting.starting',
    'Submitting…': 'market.submitting',
    'Submitting...': 'market.submitting',
    'Checking…': 'premiumBid.checking',
    'Checking...': 'premiumBid.checking',
    'Unknown Rider': 'common.unknownRider',
    'Unknown rider': 'common.unknownRider',
    'Unknown Club': 'common.unknownClub',
    'Unknown club': 'common.unknownClub',
    'Unknown Country': 'common.unknownCountry',
    'Unknown country': 'common.unknownCountry',
  },
}

export default createLegacyLocalizationBridge(options)
