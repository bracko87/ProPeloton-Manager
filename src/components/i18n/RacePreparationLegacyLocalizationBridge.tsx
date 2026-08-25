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
    'Loading Race Preparation…': 'page.loading',
    'Loading Race Preparation...': 'page.loading',
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
