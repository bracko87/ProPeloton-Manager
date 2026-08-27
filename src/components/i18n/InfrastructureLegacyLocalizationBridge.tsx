import enInfrastructure from '../../i18n/locales/en/infrastructure.json'
import srInfrastructure from '../../i18n/locales/sr-Latn/infrastructure.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const ASSET_KEYS: Record<string, string> = {
  'Team Car': 'infrastructure:assets.teamCar',
  'Team Bus': 'infrastructure:assets.teamBus',
  'Equipment Van':
    'infrastructure:assets.equipmentVan',
  'Mobile Workshop':
    'infrastructure:assets.mobileWorkshop',
  'Medical Van':
    'infrastructure:assets.medicalVan',
}

const FACILITY_KIND_KEYS: Record<string, string> = {
  club: 'infrastructure:facilityTypes.club',
  coaching:
    'infrastructure:facilityTypes.coaching',
  medical:
    'infrastructure:facilityTypes.medical',
  youth:
    'infrastructure:facilityTypes.youth',
  mechanics:
    'infrastructure:facilityTypes.mechanics',
  scouting:
    'infrastructure:facilityTypes.scouting',
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'infrastructure',
  enResource: enInfrastructure,
  srResource: srInfrastructure,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean === '/dashboard/infrastructure' ||
      clean.startsWith(
        '/dashboard/infrastructure/',
      )
    )
  },
  aliases: {
    'Infrastructure': 'page.title',
    'Loading infrastructure...': 'page.loading',
    'Refresh': 'page.refresh',
    'Refreshing...': 'page.refreshing',
    'Facilities': 'page.facilities',
    'Assets': 'page.assets',
    'Current game date:': 'page.currentGameDate',

    'Team Cars': 'assets.teamCars',
    'Team Car': 'assets.teamCar',
    'Team Car Fleet': 'assets.teamCarFleet',
    'Team Bus': 'assets.teamBus',
    'Equipment Van': 'assets.equipmentVan',
    'Mobile Workshop': 'assets.mobileWorkshop',
    'Medical Van': 'assets.medicalVan',
    'Acquire Team Car': 'assets.acquireTeamCar',
    'Acquire Team Bus': 'assets.acquireTeamBus',
    'Acquire Equipment Van': 'assets.acquireEquipmentVan',
    'Acquire Mobile Workshop': 'assets.acquireMobileWorkshop',
    'Acquire Medical Van': 'assets.acquireMedicalVan',
    'Garage support vs actual race assignment': 'assets.garageSupportTitle',
    'Garage slots': 'common.garageSlots',
    'Garage size': 'common.garageSize',
    'Available': 'common.available',
    'Assigned': 'common.assigned',
    'In repair': 'common.inRepair',
    'Best support': 'common.bestSupport',
    'Potential tier': 'common.potentialTier',
    'Condition': 'common.condition',
    'Support': 'common.support',
    'Acquired': 'common.acquired',
    'Current status': 'common.currentStatus',
    'Repair': 'common.repair',
    'Sell': 'common.sell',
    'Mechanical response': 'assets.mechanicalResponse',
    'Feeding support': 'assets.feedingSupport',
    'Tactical comms': 'assets.tacticalComms',
    'Travel comfort': 'assets.travelComfort',
    'Rider recovery': 'assets.riderRecovery',
    'Tour fatigue cover': 'assets.tourFatigueCover',
    'Equipment logistics': 'assets.equipmentLogistics',
    'Race readiness': 'assets.raceReadiness',
    'Equipment cover': 'assets.equipmentCover',
    'Technical service': 'assets.technicalService',
    'Repair response': 'assets.repairResponse',
    'Workshop cover': 'assets.workshopCover',
    'Medical response': 'assets.medicalResponse',
    'Health coverage': 'assets.healthCoverage',
    'Medical cover': 'assets.medicalCover',

    'Close infrastructure details': 'facilities.detailsTitle',
    'Starting repair...': 'assetModal.startingRepair',
    'Selling...': 'assetModal.selling',
    'Calculating quote...': 'assetModal.calculating',
  },
  transformParams: (key, params, t) => {
    if (params.asset && ASSET_KEYS[params.asset]) {
      params.asset = t(
        ASSET_KEYS[params.asset],
      )
    }

    if (
      params.kind &&
      FACILITY_KIND_KEYS[
        params.kind.toLowerCase()
      ]
    ) {
      params.kind = t(
        FACILITY_KIND_KEYS[
          params.kind.toLowerCase()
        ],
      )
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
