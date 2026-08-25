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
    'Loading equipment...': 'page.loading',
    'Loading overview...': 'overview.loading',
    'Loading inventory...': 'inventory.loading',
    'Loading market...': 'market.loading',
    'Starting repairs...':
      'inventory.startingRepairs',
    'Loading equipment preview...':
      'preview.loading',
    'Loading setup presets...':
      'presets.loading',
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
