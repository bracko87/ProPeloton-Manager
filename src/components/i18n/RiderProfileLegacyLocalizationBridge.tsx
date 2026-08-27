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
    '← Back': 'common.back',
    'Loading rider profile...': 'wrapper.loading',
    'Loading…': 'common.loading',
    'Loading...': 'common.loading',
    'Overview': 'tabs.overview',
    'Contract': 'tabs.contract',
    'Training': 'tabs.training',
    'Analysis': 'tabs.analysis',
    'Compare': 'tabs.compare',
    'History': 'tabs.history',
    'Rider Profile': 'external.title',
    'Season Stats': 'external.seasonStats',
    'Basic Information': 'external.basicInformation',
    'Current Team:': 'external.currentTeam',
    'Availability & Medical': 'external.availabilityMedical',
    'Last 5 Races': 'external.lastFiveRaces',
    'Career Honours': 'history.careerHonours',
    'Performance Analysis': 'owned.performanceAnalysis',
    'Training and skill development': 'owned.trainingDevelopment',
    'Performance matrix': 'owned.performanceMatrix',
    'Time trial': 'skills.timeTrial',
    'Time Trial': 'skills.timeTrial',
    'Basic View': 'skills.basicView',
    'Basic view': 'skills.basicView',
    'Modern View': 'skills.modernView',
    'Modern view': 'skills.modernView',
    'Skill Attributes': 'skills.skillAttributes',
    'Mark as scouted': 'simpleProfile.markScouted',
    'Mark as Scouted': 'simpleProfile.markScouted',
    'Unmark scouted': 'simpleProfile.unmarkScouted',
    'Unmark Scouted': 'simpleProfile.unmarkScouted',
    'Show history': 'simpleProfile.showHistory',
    'Show History': 'simpleProfile.showHistory',
    'Hide history': 'simpleProfile.hideHistory',
    'Hide History': 'simpleProfile.hideHistory',
    'Open team': 'simpleProfile.openTeam',
    'Open Team': 'simpleProfile.openTeam',
    'Free agent': 'external.freeAgent',
    'Free Agent': 'external.freeAgent',
    'Transfer listed': 'external.transferListed',
    'Transfer Listed': 'external.transferListed',
    'Start Scouting': 'scouting.start',
    'Make Transfer Offer': 'market.transferOffer',
    'Make Premium Offer': 'premiumBid.title',
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
