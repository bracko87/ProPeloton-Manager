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
    '← Back': 'common.back',
    'Loading team profile…': 'teamProfile.loading',
    'Loading team profile...': 'teamProfile.loading',
    'AI-controlled team': 'teamProfile.aiControlled',
    'Player-controlled team': 'teamProfile.playerControlled',
    'Send Message': 'teamProfile.sendMessage',
    'Team profile': 'teamProfile.profileLabel',
    'Country': 'teamProfile.country',
    'Owner': 'teamProfile.owner',
    'Riders': 'teamProfile.riders',
    'Reputation': 'teamProfile.reputation',
    'International rank': 'teamProfile.internationalRank',
    'International points': 'teamProfile.internationalPoints',
    'Sponsors': 'teamProfile.sponsors',
    'Team jersey': 'teamProfile.jersey',
    'Public kit preview for this team.': 'teamProfile.jerseyDescription',
    'Team roster': 'teamProfile.roster',
    'Current riders registered to this team.': 'teamProfile.rosterDescription',
    'Rider': 'teamProfile.rider',
    'Role': 'teamProfile.role',
    'Age': 'teamProfile.age',
    'Last 5 races': 'teamProfile.lastFiveRaces',
    'Loading recent races…': 'teamProfile.loadingRaces',
    'No sponsor logo available.': 'teamProfile.noSponsorLogo',

    'Loading club identity...': 'identity.loading',
    'Club Display Identity': 'identity.title',
    'Base club name': 'identity.baseName',
    'Visible display name': 'identity.displayName',
    'Original club name': 'identity.originalName',
    'History/full name': 'identity.historyName',
    'Locked by sponsor': 'identity.lockedBySponsor',
    'Locked until': 'identity.lockedUntil',
    'Lock reason': 'identity.lockReason',

    'Club History': 'history.title',
    'Total honours': 'history.totalHonours',
    'Victories': 'history.victories',
    'Podiums': 'history.podiums',
    'Win breakdown': 'history.winBreakdown',
    'Results archive': 'history.archive',
    'Search race or rider': 'history.search',
    'All seasons': 'history.allSeasons',
    'All result types': 'history.allResultTypes',
    'One-day results': 'history.oneDayResults',
    'Stage results': 'history.stageResults',
    'All top-10 results': 'history.allTop10',
    'Victories only': 'history.victoriesOnly',
    'Podiums only': 'history.podiumsOnly',
    'Top 10': 'history.top10',

    'Sending…': 'report.sending',
    'Checking…': 'report.checking',
    'Report Player': 'report.reportPlayer',
    'Already Reported': 'report.alreadyReported',
    'Report player or team': 'report.modalTitle',
    'Reason': 'report.reason',
    'Severity': 'report.severity',
    'Details': 'report.details',
    'Cancel': 'report.cancel',
    'Send report': 'report.send',
  },
}

export default createLegacyLocalizationBridge(options)
