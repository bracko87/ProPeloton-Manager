import enRacePreparation from '../../i18n/locales/en/racePreparation.json'
import srRacePreparation from '../../i18n/locales/sr-Latn/racePreparation.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const ROLE_KEYS: Record<string, string> = {
  'Sport Director': 'racePreparation:roles.sportDirector',
  'Team Doctor': 'racePreparation:roles.teamDoctor',
  Physio: 'racePreparation:roles.physio',
  Mechanic: 'racePreparation:roles.mechanic',
  'U23 Head Coach': 'racePreparation:roles.u23HeadCoach',
}

const ASSET_KEYS: Record<string, string> = {
  'Team Bus': 'racePreparation:assets.teamBus',
  'Equipment Van': 'racePreparation:assets.equipmentVan',
  'Mobile Workshop': 'racePreparation:assets.mobileWorkshop',
  'Medical Van': 'racePreparation:assets.medicalVan',
  'Team Car 1': 'racePreparation:assets.teamCar1',
  'Team Car 2': 'racePreparation:assets.teamCar2',
  'Team Car 3': 'racePreparation:assets.teamCar3',
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'racePreparation',
  enResource: enRacePreparation,
  srResource: srRacePreparation,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean === '/dashboard/race-preparation' ||
      clean.startsWith('/dashboard/race-preparation/')
    )
  },
  aliases: {
    'Race Preparation': 'page.title',
    'Accepted races are listed first. Race Plan handles whole-race startlist, travel, staff, assets and costs. Stage Plans handle stage-by-stage tactics after the race plan is submitted.':
      'page.subtitle',
    'Loading Race Preparation…': 'page.loading',
    'Loading Race Preparation...': 'page.loading',
    'No accepted race selected.': 'page.noAcceptedSelected',
    'No accepted races found for this club.': 'page.noAcceptedFound',
    'Accepted Races': 'tabs.accepted',
    'Race Plan': 'tabs.racePlan',
    'Stage Plans': 'tabs.stagePlans',
    'Confirmed participations. The status shows what can be done now for Race Plan and Stage Plans.': 'accepted.description',
    'Your team missed the startlist and is not participating': 'accepted.missedStartlist',
    'Open Race Plan': 'accepted.openRacePlan',
    'Open Stage Plans': 'accepted.openStagePlans',
    'Stage Plans open after the Race Plan is submitted': 'accepted.stagePlansAfterSubmit',
    'Open Race Page': 'header.openRacePage',
    'Current game date': 'header.currentGameDate',
    'Competing squad': 'header.competingSquad',
    'Rider selection comes from this squad. Staff, assets, equipment, supplies and finance remain shared by the club.': 'header.competingSquadHelp',
    'Race Plan opens': 'header.racePlanOpens',
    'Rider deadline': 'header.riderDeadline',
    'Stages': 'header.stages',
    'Route:': 'header.route',
    'Profile:': 'header.profile',
    'Distance:': 'header.distance',
    'Stage profile preview': 'header.stageProfilePreview',
    'Distance pending': 'header.distancePending',
    'Stage Profile': 'stagePlans.stageProfile',
    'Team Plan': 'stagePlans.teamPlan',
    'Individual Tactics': 'stagePlans.individualTactics',
    'Rider Roles': 'stagePlans.riderRoles',
    'Equipment': 'stagePlans.equipment',
    'Supplies': 'stagePlans.supplies',
    'Save Stage Plan': 'stagePlans.save',
    'Stage Plan locked': 'stagePlans.locked',
    'View only': 'stagePlans.viewOnly',
    'Edit Stage Plan': 'stagePlans.edit',
    'Stage Plan Readiness': 'stagePlans.readiness',
    'Loading Stage Plans…': 'stagePlans.loading',
    'Stage Plans open after the Race Plan is submitted.': 'stagePlans.notOpen',
    'Select a stage to prepare its Stage Plan.': 'stagePlans.selectStage',
    'Sport Director Suggestion': 'stagePlans.sportDirectorSuggestion',
    'Ask Sport Director': 'stagePlans.askSportDirector',
    'Apply Suggestion': 'stagePlans.applySuggestion',
    'Managed by U23 Head Coach': 'stagePlans.u23Managed',
    'This Stage Plan is managed automatically by the U23 Head Coach and is view-only.': 'stagePlans.u23ViewOnly',
    'Team Tactic': 'stagePlans.teamTactic',
    'Notes': 'stagePlans.notes',
    'Saving...': 'stagePlans.saving',
    'Updating preview...': 'racePlan.updatingPreview',
    'Stage profile could not be loaded.': 'header.profileLoadFailed',
    'Stage profile data is not available yet.': 'header.profileUnavailable',
    'Stage profile points are missing.': 'header.profileMissing',
    'The rider deadline is': 'dialog.riderDeadlineIs',
    'Changing to': 'dialog.changingToFragment',
    'will remove the currently selected riders and reset the tactical planner. Support staff, assets, supplies and equipment settings will remain unchanged.':
      'dialog.changeSquadTail',
    '. If you submit the Race Plan now, riders, race staff and race assets will be locked for this race. Stage Plans will open immediately after submission.':
      'dialog.submitTail',
  },
  transformParams: (key, params, t) => {
    if (params.role && ROLE_KEYS[params.role]) {
      params.role = t(ROLE_KEYS[params.role])
    }

    if (params.asset && ASSET_KEYS[params.asset]) {
      params.asset = t(ASSET_KEYS[params.asset])
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
