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
    'Loading infrastructure...':
      'page.loading',
    'Refreshing...':
      'page.refreshing',
    'Close infrastructure details':
      'facilities.detailsTitle',
    'Starting repair...':
      'assetModal.startingRepair',
    'Selling...':
      'assetModal.selling',
    'Calculating quote...':
      'assetModal.calculating',
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
