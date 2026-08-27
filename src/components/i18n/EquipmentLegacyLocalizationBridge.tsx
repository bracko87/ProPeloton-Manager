import enEquipment from '../../i18n/locales/en/equipment.json'
import srEquipment from '../../i18n/locales/sr-Latn/equipment.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const CATEGORY_KEYS: Record<string, string> = {
  frame: 'equipment:categories.frame',
  frames: 'equipment:categories.frames',
  wheelset: 'equipment:categories.wheelset',
  wheelsets: 'equipment:categories.wheelsets',
  tires: 'equipment:categories.tires',
  groupset: 'equipment:categories.groupset',
  groupsets: 'equipment:categories.groupsets',
  helmet: 'equipment:categories.helmet',
  helmets: 'equipment:categories.helmets',
  shoes: 'equipment:categories.shoes',
}

function translateCategory(
  value: string | undefined,
  t: (key: string) => string,
): string | undefined {
  if (!value) return value

  const key =
    CATEGORY_KEYS[value.toLowerCase()]

  return key ? t(key) : value
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'equipment',
  enResource: enEquipment,
  srResource: srEquipment,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean === '/dashboard/equipment' ||
      clean.startsWith('/dashboard/equipment/')
    )
  },
  aliases: {
    'Equipment': 'page.title',
    'Manage team equipment, default setup, inventory actions, market purchases, and race supplies.': 'page.subtitle',
    'Loading equipment...': 'page.loading',
    'Overview': 'page.overview',
    'Inventory': 'page.inventory',
    'Market': 'page.market',
    'Race Supplies': 'page.raceSupplies',
    'Refresh': 'common.refresh',
    'Search': 'common.search',
    'Close': 'common.close',
    'Cancel': 'common.cancel',
    'Confirm': 'common.confirm',
    'Previous': 'common.previous',
    'Next': 'common.next',
    'Quality': 'common.quality',
    'Condition': 'common.condition',
    'Value': 'common.value',
    'Quantity': 'common.quantity',
    'Available': 'common.available',
    'Selected': 'common.selected',
    'Overall readiness': 'overview.overallReadiness',
    'Average condition': 'overview.averageCondition',
    'Maintenance needed': 'overview.maintenanceNeeded',
    'Inventory Summary': 'overview.inventorySummary',
    'Default Race Setup': 'overview.defaultSetup',
    'Save Default Setup': 'overview.saveDefault',
    'Technical Sponsor': 'overview.technicalSponsor',
    'Equipment Intelligence': 'overview.intelligence',
    'Maintenance Planner': 'inventory.maintenancePlanner',
    'Owned Equipment': 'inventory.ownedEquipment',
    'Repair': 'inventory.repair',
    'Sell': 'inventory.sell',
    'Discard': 'inventory.discard',
    'Confirm Repair': 'inventory.confirmRepair',
    'Confirm Sale': 'inventory.confirmSale',
    'Confirm Discard': 'inventory.confirmDiscard',
    'Equipment Market': 'market.title',
    'Market Comparison': 'market.comparison',
    'Compare': 'market.compare',
    'Buy': 'market.buy',
    'Buy equipment': 'market.buyEquipment',
    'Loading overview...': 'overview.loading',
    'Loading inventory...': 'inventory.loading',
    'Loading market...': 'market.loading',
    'Starting repairs...': 'inventory.startingRepairs',
    'Loading equipment preview...': 'preview.loading',
    'Loading setup presets...': 'presets.loading',
  },
  transformParams: (key, params, t) => {
    if (params.category) {
      params.category =
        translateCategory(
          params.category,
          t,
        ) ?? params.category
    }

    if (params.categories) {
      params.categories = params.categories
        .split(',')
        .map(part =>
          translateCategory(
            part.trim(),
            t,
          ) ?? part.trim(),
        )
        .join(', ')
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
