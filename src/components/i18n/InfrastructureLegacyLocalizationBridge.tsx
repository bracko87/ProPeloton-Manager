import enInfrastructure from '../../i18n/locales/en/infrastructure.json'
import srInfrastructure from '../../i18n/locales/sr-Latn/infrastructure.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const enResource = {
  ...enInfrastructure,
  bridge: {
    none: 'None',
    excellent: 'Excellent',
    basicClubCar: 'Basic Club Car',
    professionalTeamCar: 'Professional Team Car',
    coinBalanceLine: 'Current coin balance: {{balance}}',
  },
}

const srResource = {
  ...srInfrastructure,
  bridge: {
    none: 'Nema',
    excellent: 'Odlično',
    basicClubCar: 'Osnovni klupski automobil',
    professionalTeamCar: 'Profesionalni timski automobil',
    coinBalanceLine: 'Trenutno stanje Coins: {{balance}}',
  },
}

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
  enResource,
  srResource,
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
    'Team Cars provide race support, tactical communication, feeding coverage, and fatigue reduction on race days. Manage the garage by slot, start new deliveries, repair worn cars, or sell available cars.': 'assets.teamCarDescription',
    'Garage support vs actual race assignment': 'assets.garageSupportTitle',
    'The garage shows what your club owns and what is being delivered. Actual race bonuses should still come from the cars assigned to a specific event. A strong garage increases your available options, but only assigned and eligible cars should affect a race result.': 'assets.teamCarAssignment',
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
    'Acquire': 'common.acquire',
    'None': 'bridge.none',
    'Excellent': 'bridge.excellent',
    'Basic Club Car': 'bridge.basicClubCar',
    'Professional Team Car': 'bridge.professionalTeamCar',
    'Mechanical response': 'assets.mechanicalResponse',
    'Best owned car support value available for race-day service and technical response.': 'assets.mechanicalResponseDescription',
    'Feeding support': 'assets.feedingSupport',
    'Garage-level race fatigue reduction from the current Team Car fleet summary.': 'assets.feedingSupportDescription',
    'Tactical comms': 'assets.tacticalComms',
    'Highest current support tier available from owned Team Cars and their condition.': 'assets.tacticalCommsDescription',
    'Highest configured Team Car tier that can be acquired through the garage system.': 'assets.teamCarPotential',
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
    'Owned cars appear first, pending deliveries fill the next empty slots, and open slots remain available for future acquisitions.': 'assets.garageSlotsTeamCar',
    'Empty Team Car slot available for a new delivery.': 'assets.emptyTeamCar',
    'Additional permanent Team Car garage capacity.': 'assets.additionalTeamCarCapacity',

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
