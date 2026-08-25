import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import i18n from '../../i18n'
import enRaceDetail from '../../i18n/locales/en/raceDetail.json'
import srRaceDetail from '../../i18n/locales/sr-Latn/raceDetail.json'

if (!i18n.hasResourceBundle('en', 'raceDetail')) {
  i18n.addResourceBundle(
    'en',
    'raceDetail',
    enRaceDetail,
    true,
    true,
  )
}

if (!i18n.hasResourceBundle('sr-Latn', 'raceDetail')) {
  i18n.addResourceBundle(
    'sr-Latn',
    'raceDetail',
    srRaceDetail,
    true,
    true,
  )
}

type Translator = (
  key: string,
  options?: Record<string, unknown>,
) => string

type DynamicDescriptor =
  | {
      kind: 'stageCount'
      count: string
    }
  | {
      kind: 'stageNumber'
      stage: string
    }
  | {
      kind: 'acceptedMax'
      accepted: string
      max: string
    }
  | {
      kind: 'scorePreview'
      score: string
    }
  | {
      kind: 'pendingEstimateError'
      error: string
    }
  | {
      kind: 'favoritesError'
      error: string
    }
  | {
      kind: 'participantsError'
      error: string
    }
  | {
      kind: 'teamRiderCount'
      teams: string
      riders: string
    }
  | {
      kind: 'assignedRiders'
      count: string
    }
  | {
      kind: 'age'
      age: string
    }
  | {
      kind: 'riderDetailsUnavailable'
      count: string
    }
  | {
      kind: 'stageResultsNumber'
      stage: string
    }
  | {
      kind: 'classificationError'
      error: string
    }
  | {
      kind: 'stageResultsError'
      error: string
    }
  | {
      kind: 'sprintNumber'
      number: string
    }
  | {
      kind: 'canceledReason'
      reason: string
    }
  | {
      kind: 'weatherCancellationReason'
      reason: string
    }
  | {
      kind: 'replayAvailableForRace'
      race: string
    }
  | {
      kind: 'replayUnlockDescription'
      coins: string
    }
  | {
      kind: 'replayAvailableAt'
      date: string
    }
  | {
      kind: 'unlockReplay'
      coins: string
    }
  | {
      kind: 'unlockFor'
      coins: string
    }
  | {
      kind: 'coinBalance'
      balance: string
    }
  | {
      kind: 'replayUnlocked'
      coins: string
    }
  | {
      kind: 'startsIn'
      time: string
    }
  | {
      kind: 'ridersCount'
      count: string
    }
  | {
      kind: 'phase'
      phase: string
    }
  | {
      kind: 'teamPlan'
      plan: string
    }
  | {
      kind: 'tutorialStep'
      current: string
      total: string
    }
  | {
      kind: 'raceInfoAria'
      race: string
    }
  | {
      kind: 'raceLogoAlt'
      race: string
    }
  | {
      kind: 'replayProgress'
      percent: string
    }
  | {
      kind: 'compressedStarts'
      seconds: string
    }

type TranslationToken =
  | {
      type: 'key'
      key: string
    }
  | {
      type: 'dynamic'
      descriptor: DynamicDescriptor
    }

type NodeState = {
  token: TranslationToken
  lastRendered: string
}

const staticKeys = new Map<string, string>()
const textState = new WeakMap<Node, NodeState>()
const attributeState = new WeakMap<
  Element,
  Map<string, NodeState>
>()

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function add(source: string, key: string): void {
  staticKeys.set(normalizeText(source), key)
}

function addMany(entries: Array<[string, string]>): void {
  entries.forEach(([source, key]) => add(source, key))
}

/* -------------------------------------------------------
 * Main race page
 * ----------------------------------------------------- */

addMany([
  ['Loading race detail…', 'raceDetail:page.loading'],
  ['Loading race detail...', 'raceDetail:page.loading'],
  ['← Back', 'raceDetail:page.back'],
  ['Race not found.', 'raceDetail:page.notFound'],
  ['Stages', 'raceDetail:page.stages'],
  ['No stages found for this race.', 'raceDetail:page.noStages'],
  [
    'Tour logo not available yet',
    'raceDetail:page.tourLogoUnavailable',
  ],
  ['One-day race', 'raceDetail:page.oneDayRace'],

  ['Teams', 'raceDetail:summary.teams'],
  ['Riders min/max', 'raceDetail:summary.ridersMinMax'],
  ['Prize fund', 'raceDetail:summary.prizeFund'],
  ['Applications open', 'raceDetail:summary.applicationsOpen'],
  ['Applications close', 'raceDetail:summary.applicationsClose'],
  [
    'Team list announcement',
    'raceDetail:summary.teamListAnnouncement',
  ],
  [
    'Rider submission deadline',
    'raceDetail:summary.riderSubmissionDeadline',
  ],
  ['Startlist locked', 'raceDetail:summary.startlistLocked'],
  ['Apply for race', 'raceDetail:summary.apply'],
  ['Applying…', 'raceDetail:summary.applying'],
  ['Applying...', 'raceDetail:summary.applying'],
  ['Cancel application', 'raceDetail:summary.cancelApplication'],
  ['Cancelling…', 'raceDetail:summary.cancelling'],
  ['Cancelling...', 'raceDetail:summary.cancelling'],
])

/* -------------------------------------------------------
 * Race status
 * ----------------------------------------------------- */

addMany([
  [
    'Applications not open',
    'raceDetail:status.applicationsNotOpen',
  ],
  [
    'Open for Applications',
    'raceDetail:status.openApplications',
  ],
  [
    'Applications closed',
    'raceDetail:status.applicationsClosed',
  ],
  [
    'Application submitted',
    'raceDetail:status.applicationSubmitted',
  ],
  ['Accepted', 'raceDetail:status.accepted'],
  ['Declined', 'raceDetail:status.declined'],
  ['Withdrawn', 'raceDetail:status.withdrawn'],
  ['Race active', 'raceDetail:status.raceActive'],
  ['Race finished', 'raceDetail:status.raceFinished'],
  ['Race canceled', 'raceDetail:status.raceCanceled'],
  ['Race cancelled', 'raceDetail:status.raceCanceled'],
  ['Partly canceled', 'raceDetail:status.partlyCanceled'],
  [
    'Race active. The startlist is locked and this race is awaiting race simulation.',
    'raceDetail:status.activeNotice',
  ],
  [
    'Race finished. Applications and rider submissions are closed.',
    'raceDetail:status.finishedNotice',
  ],
  [
    'Race cancelled. Applications and rider submissions are closed.',
    'raceDetail:status.cancelledNotice',
  ],
])

/* -------------------------------------------------------
 * Application modal
 * ----------------------------------------------------- */

addMany([
  [
    'Race application preview',
    'raceDetail:application.preview',
  ],
  ['Close', 'raceDetail:application.close'],
  [
    'Loading application preview…',
    'raceDetail:application.loadingPreview',
  ],
  [
    'Loading application preview...',
    'raceDetail:application.loadingPreview',
  ],
  [
    'Your team is already accepted for this race.',
    'raceDetail:application.alreadyAccepted',
  ],
  [
    'Your team already has an application submitted for this race.',
    'raceDetail:application.alreadyApplied',
  ],
  [
    'You cannot apply for this race right now.',
    'raceDetail:application.cannotApply',
  ],
  [
    'Review your application preview before submitting.',
    'raceDetail:application.review',
  ],
  [
    'Acceptance estimate',
    'raceDetail:application.acceptanceEstimate',
  ],
  [
    'Estimated chance',
    'raceDetail:application.estimatedChance',
  ],
  [
    'Competition pressure',
    'raceDetail:application.competitionPressure',
  ],
  [
    'This is an estimate. Final acceptance is decided when applications close.',
    'raceDetail:application.estimateExplanation',
  ],
  [
    'Team prestige / commitment',
    'raceDetail:application.prestigeCommitment',
  ],
  [
    'Application strength',
    'raceDetail:application.applicationStrength',
  ],
  [
    'Default score is 50. Completing races improves this; missing startlists reduces it.',
    'raceDetail:application.scoreExplanation',
  ],
  ['Applied teams', 'raceDetail:application.appliedTeams'],
  ['Accepted teams', 'raceDetail:application.acceptedTeams'],
  ['Target teams', 'raceDetail:application.targetTeams'],
  ['Max teams', 'raceDetail:application.maxTeams'],
  ['Riders required', 'raceDetail:application.ridersRequired'],
  [
    'Rider deadline',
    'raceDetail:application.riderDeadline',
  ],
  ['Not now', 'raceDetail:application.notNow'],
  ['Submitting…', 'raceDetail:application.submitting'],
  ['Submitting...', 'raceDetail:application.submitting'],
  ['Submit application', 'raceDetail:application.submit'],

  [
    'Loading your application estimate…',
    'raceDetail:application.pendingLoading',
  ],
  [
    'Loading your application estimate...',
    'raceDetail:application.pendingLoading',
  ],
  [
    'Your application is submitted. Official participants will appear here once the team list is published.',
    'raceDetail:application.pendingNoQuote',
  ],
  [
    'Waiting for team selection',
    'raceDetail:application.waitingSelection',
  ],
  [
    'Official participants are not confirmed yet. Accepted teams and riders will replace this estimate once the team list is published.',
    'raceDetail:application.waitingDescription',
  ],
  [
    'Application estimate',
    'raceDetail:application.applicationEstimate',
  ],
  [
    'Already accepted',
    'raceDetail:application.alreadyAcceptedCount',
  ],
  [
    'Target / max teams',
    'raceDetail:application.targetMaxTeams',
  ],
])

/* -------------------------------------------------------
 * Stage / profile
 * ----------------------------------------------------- */

addMany([
  ['Stage', 'raceDetail:stage.stage'],
  ['Canceled', 'raceDetail:stage.canceled'],
  ['Cancelled', 'raceDetail:stage.canceled'],
  [
    'Weather cancellation likely',
    'raceDetail:stage.weatherCancellationLikely',
  ],
  [
    'This is only a warning before the lock point. The final cancellation decision is made automatically 24 in-game hours before stage start.',
    'raceDetail:stage.weatherCancellationExplanation',
  ],
  ['Stage profile', 'raceDetail:stage.profile'],
  [
    'Loading stage profile…',
    'raceDetail:stage.loadingProfile',
  ],
  [
    'Loading stage profile...',
    'raceDetail:stage.loadingProfile',
  ],
  [
    'Stage profile data is not available yet.',
    'raceDetail:stage.profileUnavailable',
  ],
  [
    'Stage profile chart is not available yet.',
    'raceDetail:stage.profileChartUnavailable',
  ],
  ['Route TBD', 'raceDetail:stage.routeTbd'],
  ['Distance', 'raceDetail:stage.distance'],
  ['Terrain', 'raceDetail:stage.terrain'],
  ['Profile', 'raceDetail:stage.profileLabel'],
  ['Elevation', 'raceDetail:stage.elevation'],
  ['Terrain split', 'raceDetail:stage.terrainSplit'],

  ['Flat', 'raceDetail:stage.flat'],
  ['Hilly', 'raceDetail:stage.hilly'],
  ['Mountain', 'raceDetail:stage.mountain'],
  ['Cobbled', 'raceDetail:stage.cobbled'],
  ['Time Trial', 'raceDetail:stage.timeTrial'],
  [
    'Individual Time Trial',
    'raceDetail:stage.individualTimeTrial',
  ],
  [
    'Team Time Trial',
    'raceDetail:stage.teamTimeTrial',
  ],
  ['Prologue', 'raceDetail:stage.prologue'],

  ['Stage points', 'raceDetail:stage.points'],
  [
    'No stage points configured for this stage.',
    'raceDetail:stage.noPoints',
  ],
  ['Points:', 'raceDetail:stage.pointsLabel'],
  ['Time bonuses:', 'raceDetail:stage.timeBonuses'],
  [
    '🏁 Mountain finish',
    'raceDetail:stage.mountainFinish',
  ],
  [
    'Mountain classification:',
    'raceDetail:stage.mountainClassification',
  ],
  ['GC time bonuses:', 'raceDetail:stage.gcTimeBonuses'],
  ['🏁 Finish sprint', 'raceDetail:stage.finishSprint'],
  [
    'Points classification finish:',
    'raceDetail:stage.pointsClassificationFinish',
  ],
])

/* -------------------------------------------------------
 * Weather
 * ----------------------------------------------------- */

addMany([
  ['Stage weather', 'raceDetail:weather.title'],
  [
    'Weather forecast becomes visible 7 days before this stage.',
    'raceDetail:weather.forecastLater',
  ],
  ['Temp', 'raceDetail:weather.temp'],
  ['Wind', 'raceDetail:weather.wind'],
  ['Rain', 'raceDetail:weather.rain'],
  ['Clear', 'raceDetail:weather.clear'],
  ['Partly Cloudy', 'raceDetail:weather.partlyCloudy'],
  ['Overcast', 'raceDetail:weather.overcast'],
  ['Foggy', 'raceDetail:weather.foggy'],
  ['Drizzle', 'raceDetail:weather.drizzle'],
  ['Heavy Rain', 'raceDetail:weather.heavyRain'],
  ['Sleet', 'raceDetail:weather.sleet'],
  ['Snow', 'raceDetail:weather.snow'],
  ['Thunderstorm', 'raceDetail:weather.thunderstorm'],
  [
    'Average temperature below 5°C',
    'raceDetail:weather.temperatureBelow5',
  ],
])

/* -------------------------------------------------------
 * Participants / favourites
 * ----------------------------------------------------- */

addMany([
  [
    'Race information',
    'raceDetail:participants.raceInformation',
  ],
  [
    'Participants and results',
    'raceDetail:participants.participantsResults',
  ],
  ['Hide', 'raceDetail:participants.hide'],
  ['Show', 'raceDetail:participants.show'],
  [
    'Teams & riders',
    'raceDetail:participants.teamsRiders',
  ],
  ['Results', 'raceDetail:participants.results'],
  [
    'Race active. Teams and riders are locked. Results will appear here after the race simulation engine runs.',
    'raceDetail:participants.activeLocked',
  ],

  [
    'Calculating race favorites...',
    'raceDetail:participants.calculatingFavorites',
  ],
  [
    'Based on rider skills, selected race role and this season results.',
    'raceDetail:participants.favoritesCalculation',
  ],
  [
    'Top 5 race favorites',
    'raceDetail:participants.topFavorites',
  ],
  [
    'Calculated from rider skills, this season results, race profile and assigned role.',
    'raceDetail:participants.favoritesDescription',
  ],
  ['Unknown rider', 'raceDetail:participants.unknownRider'],
  ['No #', 'raceDetail:participants.noNumber'],
  [
    'Loading accepted teams and riders...',
    'raceDetail:participants.loading',
  ],
  [
    'No accepted teams have been confirmed yet. Accepted teams will appear here once the official startlist is published.',
    'raceDetail:participants.noneConfirmed',
  ],
  ['teams ·', 'raceDetail:participants.teamsFragment'],
  [
    'assigned riders',
    'raceDetail:participants.assignedRidersFragment',
  ],
  ['Team logo', 'raceDetail:participants.teamLogo'],
  ['Team jersey', 'raceDetail:participants.teamJersey'],
  [
    'Riders participating in this race',
    'raceDetail:participants.participatingRiders',
  ],
  ['No riders assigned yet.', 'raceDetail:participants.noRiders'],
])

/* -------------------------------------------------------
 * Results / classifications
 * ----------------------------------------------------- */

addMany([
  [
    'Race classifications',
    'raceDetail:results.classifications',
  ],
  [
    'Current tour standings',
    'raceDetail:results.currentStandings',
  ],
  [
    'General classification',
    'raceDetail:results.general',
  ],
  [
    'Points classification',
    'raceDetail:results.points',
  ],
  [
    'Mountain classification',
    'raceDetail:results.mountain',
  ],
  [
    'Young rider classification',
    'raceDetail:results.young',
  ],
  [
    'Team classification',
    'raceDetail:results.teamClassification',
  ],
  [
    'No classification data available for this view.',
    'raceDetail:results.noClassification',
  ],
  [
    'All stages were cancelled due to weather. No race classifications were generated.',
    'raceDetail:results.allWeatherCanceled',
  ],
  [
    'Loading race classifications…',
    'raceDetail:results.loadingClassifications',
  ],
  [
    'Loading race classifications...',
    'raceDetail:results.loadingClassifications',
  ],
  [
    'Full race standing',
    'raceDetail:results.fullRaceStanding',
  ],
  ['Stage results', 'raceDetail:results.stageResults'],
  ['Stage result', 'raceDetail:results.stageResult'],
  ['Sprint points', 'raceDetail:results.sprintPoints'],
  ['Mountain points', 'raceDetail:results.mountainPoints'],
  [
    'Loading stage results…',
    'raceDetail:results.loadingStageResults',
  ],
  [
    'Loading stage results...',
    'raceDetail:results.loadingStageResults',
  ],
  [
    'No stage result data available.',
    'raceDetail:results.noStageResults',
  ],
  [
    'No sprint point data available for this stage.',
    'raceDetail:results.noSprintPoints',
  ],
  [
    'No mountain point data available for this stage.',
    'raceDetail:results.noMountainPoints',
  ],
  [
    'Full stage standing',
    'raceDetail:results.fullStageStanding',
  ],

  ['Country', 'raceDetail:results.country'],
  ['Rider', 'raceDetail:results.rider'],
  ['Team', 'raceDetail:results.team'],
  ['Time', 'raceDetail:results.time'],
  ['Gap', 'raceDetail:results.gap'],
  ['Status', 'raceDetail:results.status'],
  ['Points', 'raceDetail:results.pointsColumn'],
  ['Pts', 'raceDetail:results.pts'],
  ['Bonus', 'raceDetail:results.bonus'],
  ['Leader', 'raceDetail:results.leader'],
  ['Winner', 'raceDetail:results.winner'],
])

/* -------------------------------------------------------
 * Rewards
 * ----------------------------------------------------- */

addMany([
  ['Race rewards', 'raceDetail:rewards.eyebrow'],
  [
    'Prize money and international points',
    'raceDetail:rewards.title',
  ],
  [
    'Prize money, team points, and rider points generated by the race engine.',
    'raceDetail:rewards.description',
  ],
  ['Loading rewards…', 'raceDetail:rewards.loading'],
  ['Loading rewards...', 'raceDetail:rewards.loading'],
  [
    'No reward data available.',
    'raceDetail:rewards.noData',
  ],
  [
    'Select which race reward table to view.',
    'raceDetail:rewards.select',
  ],
  [
    'Prize money by team',
    'raceDetail:rewards.prizeByTeam',
  ],
  [
    'International points by team',
    'raceDetail:rewards.pointsByTeam',
  ],
  [
    'International points by rider',
    'raceDetail:rewards.pointsByRider',
  ],
  ['Prize', 'raceDetail:rewards.prize'],
])

/* -------------------------------------------------------
 * Race report
 * ----------------------------------------------------- */

addMany([
  ['Race report', 'raceDetail:report.title'],
  ['Stage report', 'raceDetail:report.stageReport'],
  [
    'Compact race commentary and final road groups.',
    'raceDetail:report.description',
  ],
  ['Watch replay', 'raceDetail:report.watchReplay'],
  ['Loading race report…', 'raceDetail:report.loading'],
  ['Loading race report...', 'raceDetail:report.loading'],
  [
    'No race report available for this stage yet.',
    'raceDetail:report.none',
  ],
  ['Km', 'raceDetail:report.km'],
  ['Commentary', 'raceDetail:report.commentary'],
  ['Road groups', 'raceDetail:report.roadGroups'],
  [
    'Final race situation from the replay engine.',
    'raceDetail:report.roadGroupsDescription',
  ],
  [
    'No road group data available yet.',
    'raceDetail:report.noGroups',
  ],
  ['Riders —', 'raceDetail:report.ridersUnknown'],

  ['Tactical', 'raceDetail:report.tactical'],
  ['Neutral', 'raceDetail:report.neutral'],
  ['Attack', 'raceDetail:report.attack'],
  ['Catch', 'raceDetail:report.catch'],
  ['Crash', 'raceDetail:report.crash'],
  ['Mechanical', 'raceDetail:report.mechanical'],
  ['Weather', 'raceDetail:report.weather'],
  ['Split', 'raceDetail:report.split'],
  ['Summary', 'raceDetail:report.summary'],
  ['Event', 'raceDetail:report.event'],
])

/* -------------------------------------------------------
 * Replay access / player-facing replay
 * ----------------------------------------------------- */

addMany([
  ['Live race', 'raceDetail:replay.liveRace'],
  ['Stage canceled', 'raceDetail:replay.stageCanceled'],
  ['Replay available', 'raceDetail:replay.available'],
  ['Replay unavailable', 'raceDetail:replay.unavailable'],
  [
    'This stage was canceled. No replay is available.',
    'raceDetail:replay.stageCanceledDescription',
  ],
  [
    'Replay will be available at the scheduled stage time.',
    'raceDetail:replay.notOpen',
  ],
  [
    'Replay is not available yet.',
    'raceDetail:replay.notAvailable',
  ],
  [
    'Replay is temporarily unavailable.',
    'raceDetail:replay.temporaryUnavailable',
  ],
  ['Unlocking replay…', 'raceDetail:replay.unlocking'],
  ['Unlocking replay...', 'raceDetail:replay.unlocking'],
  [
    'Failed to unlock this race replay.',
    'raceDetail:replay.unlockFailed',
  ],
  ['Checking replay…', 'raceDetail:replay.checking'],
  ['Checking replay...', 'raceDetail:replay.checking'],
  ['Watch replay', 'raceDetail:replay.watch'],

  ['Race replay', 'raceDetail:replay.title'],
  [
    'Riders start one by one, from the lowest-ranked favourite to the strongest favourite',
    'raceDetail:replay.ridersStart',
  ],
  [
    'Teams start one by one, from the lowest-ranked team to the strongest team',
    'raceDetail:replay.teamsStart',
  ],
  [
    'Follow the groups, gaps, attacks and points as the stage unfolds',
    'raceDetail:replay.roadDescription',
  ],

  ['Stage profile replay', 'raceDetail:replay.profile'],
  ['Play', 'raceDetail:replay.play'],
  ['Pause', 'raceDetail:replay.pause'],
  ['Finish replay', 'raceDetail:replay.finishReplay'],
  ['Restart', 'raceDetail:replay.restart'],
  ['Live commentary', 'raceDetail:replay.liveCommentary'],
  [
    'Press Play to start live commentary.',
    'raceDetail:replay.pressPlay',
  ],

  [
    'Final stage result · riders',
    'raceDetail:replay.finalRiders',
  ],
  [
    'Time trial · riders',
    'raceDetail:replay.timeTrialRiders',
  ],
  [
    'Time trial · teams',
    'raceDetail:replay.timeTrialTeams',
  ],
  [
    'Stage standing · riders',
    'raceDetail:replay.stageStandingRiders',
  ],

  ['Rider / team', 'raceDetail:replay.riderTeam'],
  ['Energy', 'raceDetail:replay.energy'],
  ['On course', 'raceDetail:replay.onCourse'],
  ['Waiting', 'raceDetail:replay.waiting'],
  ['Finished', 'raceDetail:replay.finished'],
  ['Time check', 'raceDetail:replay.timeCheck'],
  [
    'The live time check activates once the first rider reaches halfway.',
    'raceDetail:replay.timeCheckWaiting',
  ],
  ['Before check', 'raceDetail:replay.beforeCheck'],
  ['Pos.', 'raceDetail:replay.position'],
  ['Group', 'raceDetail:replay.group'],

  [
    'Loading universal engine inputs…',
    'raceDetail:replay.loadingEngine',
  ],
  [
    'Loading universal engine inputs...',
    'raceDetail:replay.loadingEngine',
  ],
  [
    'Universal engine calculation is not available for this stage.',
    'raceDetail:replay.engineUnavailable',
  ],

  [
    'Rankings and cumulative awards appear when each point is reached.',
    'raceDetail:replay.stagePointsDescription',
  ],
  [
    'No stage points available',
    'raceDetail:replay.noStagePoints',
  ],
  [
    'This stage has no sprint, KOM, or finish point definitions.',
    'raceDetail:replay.noStageDefinitions',
  ],
  [
    'This point has not been reached yet.',
    'raceDetail:replay.pointNotReached',
  ],
  [
    'This point was reached without an awarded result.',
    'raceDetail:replay.pointNoAward',
  ],
  [
    'Current stage totals',
    'raceDetail:replay.currentStageTotals',
  ],
  [
    'No sprint, KOM, or bonus awards have been revealed yet.',
    'raceDetail:replay.noAwards',
  ],
  ['Total', 'raceDetail:replay.total'],
])

/* -------------------------------------------------------
 * Leaders
 * ----------------------------------------------------- */

addMany([
  ['General leader', 'raceDetail:leaders.general'],
  ['Best sprinter', 'raceDetail:leaders.sprinter'],
  ['Best climber', 'raceDetail:leaders.climber'],
  ['Best young rider', 'raceDetail:leaders.young'],
  ['Best team', 'raceDetail:leaders.team'],
])

/* -------------------------------------------------------
 * Tutorial
 * ----------------------------------------------------- */

addMany([
  ['Race Profile', 'raceDetail:tutorial.profileTitle'],
  [
    'This is the Race Profile page. Here you can see the most important race information: how many teams can participate, the prize fund, when applications close, when participating teams are announced, and how many riders each team can bring. For stage races, you can also see how many stages are included.',
    'raceDetail:tutorial.profileBody',
  ],
  [
    'Stages, Results and Replay',
    'raceDetail:tutorial.stagesTitle',
  ],
  [
    'The race profile also shows detailed stage information. You can review stage profiles, route maps, terrain split, stage weather, sprint points, mountain points, and other stage details. Weather is only published close to the race, so it may appear later. Further down, Race Information shows participating teams and riders before the race, and results after the race. If your team participates and the race is active or finished, you can use Watch Race or Watch Replay to follow the action on the map.',
    'raceDetail:tutorial.stagesBody',
  ],
  ['Next', 'raceDetail:tutorial.next'],
  [
    'Continue to Race Preparation',
    'raceDetail:tutorial.continuePreparation',
  ],
  ['Finish for now', 'raceDetail:tutorial.finish'],
  ['Skip tutorial', 'raceDetail:tutorial.skip'],
  ['Close tutorial', 'raceDetail:tutorial.close'],
])

function translateKnownReason(
  reason: string,
  t: Translator,
): string {
  const normalized = normalizeText(reason)

  if (normalized === 'Snow') {
    return t('raceDetail:weather.snow')
  }

  if (
    normalized ===
    'Average temperature below 5°C'
  ) {
    return t(
      'raceDetail:weather.temperatureBelow5',
    )
  }

  return reason
}

function detectDynamic(
  value: string,
): DynamicDescriptor | null {
  let match = /^(\d+) stages?$/.exec(value)

  if (match) {
    return {
      kind: 'stageCount',
      count: match[1],
    }
  }

  match = /^Stage (\d+)$/.exec(value)

  if (match) {
    return {
      kind: 'stageNumber',
      stage: match[1],
    }
  }

  match =
    /^(\d+) accepted · max (\d+)$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'acceptedMax',
      accepted: match[1],
      max: match[2],
    }
  }

  match = /^Score preview:\s*(.+)$/.exec(value)

  if (match) {
    return {
      kind: 'scorePreview',
      score: match[1],
    }
  }

  match =
    /^Your application is submitted\. The detailed acceptance estimate could not be loaded:\s*(.+)$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'pendingEstimateError',
      error: match[1],
    }
  }

  match =
    /^Top 5 favorites are not available yet:\s*(.+)$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'favoritesError',
      error: match[1],
    }
  }

  match =
    /^Could not load participants:\s*(.+)$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'participantsError',
      error: match[1],
    }
  }

  match =
    /^(\d+) teams · (\d+) assigned riders$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'teamRiderCount',
      teams: match[1],
      riders: match[2],
    }
  }

  match = /^(\d+) assigned riders$/.exec(value)

  if (match) {
    return {
      kind: 'assignedRiders',
      count: match[1],
    }
  }

  match = /^(\d+) yrs$/.exec(value)

  if (match) {
    return {
      kind: 'age',
      age: match[1],
    }
  }

  match =
    /^(\d+) riders assigned\. Rider details are not available yet\.$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'riderDetailsUnavailable',
      count: match[1],
    }
  }

  match =
    /^Stage results – Stage (\d+)$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'stageResultsNumber',
      stage: match[1],
    }
  }

  match =
    /^Could not load race classifications:\s*(.+)$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'classificationError',
      error: match[1],
    }
  }

  match =
    /^Could not load stage results:\s*(.+)$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'stageResultsError',
      error: match[1],
    }
  }

  match = /^Sprint (\d+)$/.exec(value)

  if (match) {
    return {
      kind: 'sprintNumber',
      number: match[1],
    }
  }

  match = /^Canceled · (.+)$/.exec(value)

  if (match) {
    return {
      kind: 'canceledReason',
      reason: match[1],
    }
  }

  match =
    /^Weather cancellation likely:\s*(.+)$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'weatherCancellationReason',
      reason: match[1],
    }
  }

  match =
    /^Replay is available for (.+)\.$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'replayAvailableForRace',
      race: match[1],
    }
  }

  match =
    /^Replay is available\. Teams that did not participate can unlock it for ([\d,.]+) coins\.$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'replayUnlockDescription',
      coins: match[1],
    }
  }

  match =
    /^Replay available at the scheduled stage time:\s*(.+)$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'replayAvailableAt',
      date: match[1],
    }
  }

  match =
    /^Unlock replay · ([\d,.]+) coins$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'unlockReplay',
      coins: match[1],
    }
  }

  match =
    /^Unlock for ([\d,.]+) coins$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'unlockFor',
      coins: match[1],
    }
  }

  match = /^Coin balance:\s*(.+)$/.exec(value)

  if (match) {
    return {
      kind: 'coinBalance',
      balance: match[1],
    }
  }

  match =
    /^Replay unlocked for ([\d,.]+) coins\.$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'replayUnlocked',
      coins: match[1],
    }
  }

  match = /^Starts in (.+)$/.exec(value)

  if (match) {
    return {
      kind: 'startsIn',
      time: match[1],
    }
  }

  match = /^(\d+) riders$/.exec(value)

  if (match) {
    return {
      kind: 'ridersCount',
      count: match[1],
    }
  }

  match = /^Phase (\d+)$/.exec(value)

  if (match) {
    return {
      kind: 'phase',
      phase: match[1],
    }
  }

  match = /^Team plan:\s*(.+)$/.exec(value)

  if (match) {
    return {
      kind: 'teamPlan',
      plan: match[1],
    }
  }

  match =
    /^Race profile tutorial (\d+) of (\d+)$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'tutorialStep',
      current: match[1],
      total: match[2],
    }
  }

  match =
    /^Race information for (.+)$/.exec(value)

  if (match) {
    return {
      kind: 'raceInfoAria',
      race: match[1],
    }
  }

  match = /^(.+) logo$/.exec(value)

  if (match) {
    return {
      kind: 'raceLogoAlt',
      race: match[1],
    }
  }

  match =
    /^Replay progress (\d+) percent$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'replayProgress',
      percent: match[1],
    }
  }

  match =
    /^Compressed replay starts · ([\d.]+)s apart$/.exec(
      value,
    )

  if (match) {
    return {
      kind: 'compressedStarts',
      seconds: match[1],
    }
  }

  return null
}

function detectToken(
  value: string,
): TranslationToken | null {
  const normalized = normalizeText(value)

  const key = staticKeys.get(normalized)

  if (key) {
    return {
      type: 'key',
      key,
    }
  }

  const dynamic =
    detectDynamic(normalized)

  if (dynamic) {
    return {
      type: 'dynamic',
      descriptor: dynamic,
    }
  }

  return null
}

function renderDynamic(
  descriptor: DynamicDescriptor,
  t: Translator,
): string {
  switch (descriptor.kind) {
    case 'stageCount':
      return t(
        Number(descriptor.count) === 1
          ? 'raceDetail:page.stageCountOne'
          : 'raceDetail:page.stageCount',
        {
          count: descriptor.count,
        },
      )

    case 'stageNumber':
      return t('raceDetail:stage.stageNumber', {
        stage: descriptor.stage,
      })

    case 'acceptedMax':
      return t('raceDetail:summary.acceptedMax', {
        accepted: descriptor.accepted,
        max: descriptor.max,
      })

    case 'scorePreview':
      return t(
        'raceDetail:application.scorePreview',
        {
          score: descriptor.score,
        },
      )

    case 'pendingEstimateError':
      return t(
        'raceDetail:application.pendingEstimateError',
        {
          error: descriptor.error,
        },
      )

    case 'favoritesError':
      return t(
        'raceDetail:participants.favoritesUnavailable',
        {
          error: descriptor.error,
        },
      )

    case 'participantsError':
      return t(
        'raceDetail:participants.loadError',
        {
          error: descriptor.error,
        },
      )

    case 'teamRiderCount':
      return t(
        'raceDetail:participants.teamRiderCount',
        {
          teams: descriptor.teams,
          riders: descriptor.riders,
        },
      )

    case 'assignedRiders':
      return t(
        'raceDetail:participants.assignedRiders',
        {
          count: descriptor.count,
        },
      )

    case 'age':
      return t('raceDetail:participants.age', {
        age: descriptor.age,
      })

    case 'riderDetailsUnavailable':
      return t(
        'raceDetail:participants.riderDetailsUnavailable',
        {
          count: descriptor.count,
        },
      )

    case 'stageResultsNumber':
      return t(
        'raceDetail:results.stageResultsNumber',
        {
          stage: descriptor.stage,
        },
      )

    case 'classificationError':
      return t(
        'raceDetail:results.classificationsError',
        {
          error: descriptor.error,
        },
      )

    case 'stageResultsError':
      return t(
        'raceDetail:results.stageResultsError',
        {
          error: descriptor.error,
        },
      )

    case 'sprintNumber':
      return t('raceDetail:stage.sprintNumber', {
        number: descriptor.number,
      })

    case 'canceledReason':
      return t('raceDetail:stage.canceledReason', {
        reason: translateKnownReason(
          descriptor.reason,
          t,
        ),
      })

    case 'weatherCancellationReason':
      return t(
        'raceDetail:stage.weatherCancellationReason',
        {
          reason: translateKnownReason(
            descriptor.reason,
            t,
          ),
        },
      )

    case 'replayAvailableForRace':
      return t(
        'raceDetail:replay.availableForRace',
        {
          race: descriptor.race,
        },
      )

    case 'replayUnlockDescription':
      return t(
        'raceDetail:replay.unlockDescription',
        {
          coins: descriptor.coins,
        },
      )

    case 'replayAvailableAt':
      return t('raceDetail:replay.availableAt', {
        date: descriptor.date,
      })

    case 'unlockReplay':
      return t('raceDetail:replay.unlockReplay', {
        coins: descriptor.coins,
      })

    case 'unlockFor':
      return t('raceDetail:replay.unlockFor', {
        coins: descriptor.coins,
      })

    case 'coinBalance':
      return t('raceDetail:replay.coinBalance', {
        balance: descriptor.balance,
      })

    case 'replayUnlocked':
      return t('raceDetail:replay.unlocked', {
        coins: descriptor.coins,
      })

    case 'startsIn':
      return t('raceDetail:replay.startsIn', {
        time: descriptor.time,
      })

    case 'ridersCount':
      return t('raceDetail:report.riders', {
        count: descriptor.count,
      })

    case 'phase':
      return t('raceDetail:report.phase', {
        phase: descriptor.phase,
      })

    case 'teamPlan':
      return t('raceDetail:report.teamPlan', {
        plan: descriptor.plan,
      })

    case 'tutorialStep':
      return t('raceDetail:tutorial.step', {
        current: descriptor.current,
        total: descriptor.total,
      })

    case 'raceInfoAria':
      return `${t(
        'raceDetail:participants.raceInformation',
      )}: ${descriptor.race}`

    case 'raceLogoAlt':
      return `${descriptor.race} logo`

    case 'replayProgress':
      return `Replay progress ${descriptor.percent} percent`

    case 'compressedStarts':
      return t(
        'raceDetail:replay.compressedStarts',
        {
          seconds: descriptor.seconds,
        },
      )
  }
}

function renderToken(
  token: TranslationToken,
  t: Translator,
): string {
  if (token.type === 'key') {
    return t(token.key)
  }

  return renderDynamic(
    token.descriptor,
    t,
  )
}

function setTranslatedText(
  node: Text,
  translated: string,
): void {
  const original = node.nodeValue ?? ''

  const leading =
    original.match(/^\s+/)?.[0] ?? ''

  const trailing =
    original.match(/\s+$/)?.[0] ?? ''

  node.nodeValue =
    `${leading}${translated}${trailing}`
}

function translateTextNodes(
  root: Element,
  t: Translator,
): void {
  const walker =
    document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
    )

  let node = walker.nextNode()

  while (node) {
    const textNode = node as Text

    const current = normalizeText(
      textNode.nodeValue ?? '',
    )

    if (current) {
      const previous =
        textState.get(textNode)

      const token =
        previous &&
        current === previous.lastRendered
          ? previous.token
          : detectToken(current)

      if (token) {
        const translated =
          renderToken(token, t)

        const normalizedTranslation =
          normalizeText(translated)

        if (
          current !==
          normalizedTranslation
        ) {
          setTranslatedText(
            textNode,
            translated,
          )
        }

        textState.set(textNode, {
          token,
          lastRendered:
            normalizedTranslation,
        })
      }
    }

    node = walker.nextNode()
  }
}

function translateAttributes(
  root: Element,
  t: Translator,
): void {
  root
    .querySelectorAll('*')
    .forEach(element => {
      let stateMap =
        attributeState.get(element)

      for (const attribute of [
        'title',
        'aria-label',
        'placeholder',
      ] as const) {
        const current = normalizeText(
          element.getAttribute(
            attribute,
          ) ?? '',
        )

        if (!current) continue

        const previous =
          stateMap?.get(attribute)

        const token =
          previous &&
          current ===
            previous.lastRendered
            ? previous.token
            : detectToken(current)

        if (!token) continue

        const translated =
          renderToken(token, t)

        const normalizedTranslation =
          normalizeText(translated)

        if (
          normalizeText(
            element.getAttribute(
              attribute,
            ) ?? '',
          ) !==
          normalizedTranslation
        ) {
          element.setAttribute(
            attribute,
            translated,
          )
        }

        if (!stateMap) {
          stateMap =
            new Map<
              string,
              NodeState
            >()

          attributeState.set(
            element,
            stateMap,
          )
        }

        stateMap.set(attribute, {
          token,
          lastRendered:
            normalizedTranslation,
        })
      }
    })
}

function getCurrentRoute(): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  const hashPath =
    window.location.hash
      .replace(/^#/, '')
      .split('?')[0]

  if (hashPath) {
    return hashPath
  }

  return window.location.pathname
}

function getTranslationRoots(): Element[] {
  const roots: Element[] = []

  const main =
    document.querySelector('main')

  if (main) {
    roots.push(main)
  } else {
    const app =
      document.getElementById('app')

    if (app) {
      roots.push(app)
    }
  }

  document
    .querySelectorAll(
      '[data-tutorial-overlay-panel="true"]',
    )
    .forEach(element => {
      roots.push(element)
    })

  return roots
}

export default function RaceDetailLegacyLocalizationBridge(): null {
  const { t, i18n: reactI18n } =
    useTranslation('raceDetail')

  const [route, setRoute] =
    useState(getCurrentRoute)

  const isRaceDetailRoute =
    useMemo(() => {
      const path =
        route.split('?')[0]

      return /^\/dashboard\/races\/[^/]+/.test(
        path,
      )
    }, [route])

  useEffect(() => {
    const handleRouteChange =
      (): void => {
        setRoute(getCurrentRoute())
      }

    window.addEventListener(
      'hashchange',
      handleRouteChange,
    )

    window.addEventListener(
      'popstate',
      handleRouteChange,
    )

    return () => {
      window.removeEventListener(
        'hashchange',
        handleRouteChange,
      )

      window.removeEventListener(
        'popstate',
        handleRouteChange,
      )
    }
  }, [])

  useEffect(() => {
    if (!isRaceDetailRoute) return

    let applying = false

    const applyTranslations =
      (): void => {
        if (applying) return

        applying = true

        try {
          getTranslationRoots().forEach(
            root => {
              translateTextNodes(
                root,
                t,
              )

              translateAttributes(
                root,
                t,
              )
            },
          )
        } finally {
          applying = false
        }
      }

    applyTranslations()

    const observer =
      new MutationObserver(() => {
        applyTranslations()
      })

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'title',
          'aria-label',
          'placeholder',
        ],
      },
    )

    const handleLanguageChanged =
      (): void => {
        applyTranslations()
      }

    reactI18n.on(
      'languageChanged',
      handleLanguageChanged,
    )

    return () => {
      observer.disconnect()

      reactI18n.off(
        'languageChanged',
        handleLanguageChanged,
      )
    }
  }, [
    isRaceDetailRoute,
    reactI18n,
    t,
  ])

  return null
}