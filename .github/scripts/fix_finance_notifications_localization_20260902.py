from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('.')
LOCALES = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']
NON_EN = [x for x in LOCALES if x != 'en']

# ---------------------------------------------------------------------------
# Finance transaction labels
# ---------------------------------------------------------------------------
finance_path = ROOT / 'src/pages/dashboard/Finance.tsx'
finance = finance_path.read_text(encoding='utf-8')
anchor = "  if (cleaned.includes('race reward')) return t('transactionLabels.raceReward')\n"
insert = """  if (cleaned.includes('race reward')) return t('transactionLabels.raceReward')
  if (cleaned.includes('race supplies purchase')) return t('transactionLabels.raceSuppliesPurchase')
  if (cleaned.includes('race preparation cost')) return t('transactionLabels.racePreparationCost')
  if (cleaned.includes('club house staff payroll saving') || cleaned.includes('clubhouse staff payroll saving')) return t('transactionLabels.clubHouseStaffPayrollSaving')
  if (cleaned.includes('staff payroll saving')) return t('transactionLabels.staffPayrollSaving')
"""
if "transactionLabels.raceSuppliesPurchase" not in finance:
    if anchor not in finance:
        raise SystemExit('Finance transaction formatter anchor not found')
    finance = finance.replace(anchor, insert, 1)
finance_path.write_text(finance, encoding='utf-8')

finance_values = {
    'en': {
        'raceSuppliesPurchase': 'Race Supplies Purchase',
        'racePreparationCost': 'Race Preparation Cost',
        'clubHouseStaffPayrollSaving': 'Club House Staff Payroll Saving',
        'staffPayrollSaving': 'Staff Payroll Saving',
    },
    'sr-Latn': {
        'raceSuppliesPurchase': 'Kupovina zaliha za trku',
        'racePreparationCost': 'Trošak pripreme trke',
        'clubHouseStaffPayrollSaving': 'Ušteda na platama osoblja – Sedište kluba',
        'staffPayrollSaving': 'Ušteda na platama osoblja',
    },
    'de': {
        'raceSuppliesPurchase': 'Kauf von Rennvorräten',
        'racePreparationCost': 'Kosten der Rennvorbereitung',
        'clubHouseStaffPayrollSaving': 'Einsparung bei Personalkosten – Clubhaus',
        'staffPayrollSaving': 'Einsparung bei Personalkosten',
    },
    'hr': {
        'raceSuppliesPurchase': 'Kupnja zaliha za utrku',
        'racePreparationCost': 'Trošak pripreme utrke',
        'clubHouseStaffPayrollSaving': 'Ušteda na plaćama osoblja – Sjedište kluba',
        'staffPayrollSaving': 'Ušteda na plaćama osoblja',
    },
    'es': {
        'raceSuppliesPurchase': 'Compra de suministros de carrera',
        'racePreparationCost': 'Coste de preparación de carrera',
        'clubHouseStaffPayrollSaving': 'Ahorro en nómina del personal – Sede del club',
        'staffPayrollSaving': 'Ahorro en nómina del personal',
    },
    'it': {
        'raceSuppliesPurchase': 'Acquisto rifornimenti gara',
        'racePreparationCost': 'Costo di preparazione gara',
        'clubHouseStaffPayrollSaving': 'Risparmio stipendi staff – Sede del club',
        'staffPayrollSaving': 'Risparmio stipendi staff',
    },
    'fr': {
        'raceSuppliesPurchase': 'Achat de ravitaillement de course',
        'racePreparationCost': 'Coût de préparation de course',
        'clubHouseStaffPayrollSaving': 'Économie sur la masse salariale – Siège du club',
        'staffPayrollSaving': 'Économie sur la masse salariale',
    },
    'ru': {
        'raceSuppliesPurchase': 'Покупка гоночных запасов',
        'racePreparationCost': 'Расходы на подготовку к гонке',
        'clubHouseStaffPayrollSaving': 'Экономия на зарплатах персонала — клубный дом',
        'staffPayrollSaving': 'Экономия на зарплатах персонала',
    },
}

for locale in LOCALES:
    path = ROOT / 'src/i18n/locales' / locale / 'finance.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    data.setdefault('transactionLabels', {}).update(finance_values[locale])
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# ---------------------------------------------------------------------------
# Notification localization runtime
# ---------------------------------------------------------------------------
loc_path = ROOT / 'src/features/notifications/notificationLocalization.ts'
text = loc_path.read_text(encoding='utf-8')

old_tokens = """  const tokens = String(typeCode)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)

  if (tokens.length === 0) return null

  const translated: string[] = []
  for (const token of tokens) {
"""
new_tokens = """  const tokens = String(typeCode)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)

  if (tokens.length === 0) return null

  // In non-English notification titles the leading RACE/RACES token is
  // redundant (for example \"Utrka Zalihe Niske\"). Keep English untouched,
  // but render the actual notification subject in translated locales.
  const displayTokens =
    tokens.length > 1 && (tokens[0] === 'RACE' || tokens[0] === 'RACES')
      ? tokens.slice(1)
      : tokens

  const exactTypeKeyByCode: Record<string, string> = {
    RACE_SUPPLIES_LOW: 'notificationTypes.suppliesLow',
    RACE_SUPPLIES_LOW_STOCK: 'notificationTypes.suppliesLow',
    RACE_PLAN_OPEN: 'notificationTypes.planOpen',
    RACE_PLAN_OPENED: 'notificationTypes.planOpen',
  }
  const exactKey = exactTypeKeyByCode[String(typeCode).toUpperCase()]
  if (exactKey) {
    const exactValue = nt(exactKey, { defaultValue: '' })
    if (exactValue && exactValue !== exactKey) return exactValue
  }

  const translated: string[] = []
  for (const token of displayTokens) {
"""
if 'const displayTokens =' not in text:
    if old_tokens not in text:
        raise SystemExit('notification type-code tokenization anchor not found')
    text = text.replace(old_tokens, new_tokens, 1)

# Export a UI-safe label helper so NotificationsPage never prints raw codes in
# translated locales.
wrapper_anchor = """function getTopic(item: NotificationItem): string {
"""
wrapper = """export function localizeNotificationTypeCodeLabel(
  typeCode: string | null | undefined
): string {
  if (!typeCode) return ''
  if (!shouldLocalizeNotifications()) return String(typeCode)
  return localizeTypeCode(typeCode) || nt('categories.other')
}

function getTopic(item: NotificationItem): string {
"""
if 'export function localizeNotificationTypeCodeLabel' not in text:
    if wrapper_anchor not in text:
        raise SystemExit('getTopic anchor not found')
    text = text.replace(wrapper_anchor, wrapper, 1)

# Supply/detail labels that were collapsing to generic "Detail".
label_anchor = """  'end date': 'templateLabels.endDate',
}"""
label_insert = """  'end date': 'templateLabels.endDate',
  'critical items': 'mechanic.criticalItems',
  'supply status': 'templateLabels.supplyStatus',
  'bidons / water bottles': 'templateLabels.bidonsWaterBottles',
  'nutrition packs': 'templateLabels.nutritionPacks',
  'energy gels': 'templateLabels.energyGels',
  'race jersey complete': 'templateLabels.raceJerseyComplete',
  'rain jackets': 'templateLabels.rainJackets',
  'required jersey kits': 'templateLabels.requiredJerseyKits',
  'available jersey kits': 'templateLabels.availableJerseyKits',
  'missing jersey kits': 'templateLabels.missingJerseyKits',
  'eligibility check': 'templateLabels.eligibilityCheck',
}"""
if "'bidons / water bottles'" not in text:
    if label_anchor not in text:
        raise SystemExit('detail label map anchor not found')
    text = text.replace(label_anchor, label_insert, 1)

old_value_tail = """  const key = valueKeyByNormalized[normalized]
  if (key) return nt(key)

  if (/\\/week\\b/i.test(value)) {
    return value.replace(/\\/week\\b/gi, `/${nt('templateLocalization.perWeek')}`)
  }

  return value
}"""
new_value_tail = """  const key = valueKeyByNormalized[normalized]
  if (key) return nt(key)

  const exactValueKeys: Record<string, string> = {
    'restock required': 'templateValues.restockRequired',
    'low stock': 'templateValues.lowStock',
    'in stock': 'templateValues.inStock',
    'out of stock': 'templateValues.outOfStock',
    'in repair': 'templateValues.inRepair',
    sold: 'templateValues.sold',
    expired: 'templateValues.expired',
    repaid: 'templateValues.repaid',
    'final warning': 'templateValues.finalWarning',
  }
  const exactValueKey = exactValueKeys[normalized]
  if (exactValueKey) return nt(exactValueKey)

  const availableMatch = /^(\\d+(?:[.,]\\d+)?)\\s+available$/i.exec(value.trim())
  if (availableMatch) {
    return nt('templateValues.countAvailable', { count: availableMatch[1] })
  }

  const leftMatch = /^(\\d+(?:[.,]\\d+)?)\\s+left$/i.exec(value.trim())
  if (leftMatch) {
    return nt('templateValues.countLeft', { count: leftMatch[1] })
  }

  const thresholdMatch = /^threshold\\s+(\\d+(?:[.,]\\d+)?)$/i.exec(value.trim())
  if (thresholdMatch) {
    return nt('templateValues.thresholdValue', { count: thresholdMatch[1] })
  }

  const unitPatterns: Array<[RegExp, string]> = [
    [/^(\\d+(?:[.,]\\d+)?)\\s+weeks?$/i, 'templateValues.countWeeks'],
    [/^(\\d+(?:[.,]\\d+)?)\\s+days?$/i, 'templateValues.countDays'],
    [/^(\\d+(?:[.,]\\d+)?)\\s+seasons?$/i, 'templateValues.countSeasons'],
  ]
  for (const [pattern, translationKey] of unitPatterns) {
    const match = pattern.exec(value.trim())
    if (match) return nt(translationKey, { count: match[1] })
  }

  // Composite race-supply summaries are generated in English by the template
  // because the underlying values are dynamic. Translate the fixed prose while
  // preserving quantities and thresholds.
  let translatedValue = value
  const supplyNameKeys: Array<[RegExp, string]> = [
    [/Bidons\\s*\\/\\s*Water Bottles/gi, 'templateLabels.bidonsWaterBottles'],
    [/Nutrition Packs/gi, 'templateLabels.nutritionPacks'],
    [/Energy Gels/gi, 'templateLabels.energyGels'],
    [/Race Jersey Complete/gi, 'templateLabels.raceJerseyComplete'],
    [/Rain Jackets/gi, 'templateLabels.rainJackets'],
  ]
  for (const [pattern, translationKey] of supplyNameKeys) {
    translatedValue = translatedValue.replace(pattern, nt(translationKey))
  }
  translatedValue = translatedValue
    .replace(/(\\d+(?:[.,]\\d+)?)\\s+available\\b/gi, (_all, count) => nt('templateValues.countAvailable', { count }))
    .replace(/(\\d+(?:[.,]\\d+)?)\\s+left\\b/gi, (_all, count) => nt('templateValues.countLeft', { count }))
    .replace(/threshold\\s+(\\d+(?:[.,]\\d+)?)/gi, (_all, count) => nt('templateValues.thresholdValue', { count }))

  if (translatedValue !== value) return translatedValue

  if (/\\/week\\b/i.test(value)) {
    return value.replace(/\\/week\\b/gi, `/${nt('templateLocalization.perWeek')}`)
  }

  return value
}"""
if 'templateValues.restockRequired' not in text:
    if old_value_tail not in text:
        raise SystemExit('notification value localizer tail anchor not found')
    text = text.replace(old_value_tail, new_value_tail, 1)

loc_path.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# Notifications page: do not expose raw type codes in translated locales.
# ---------------------------------------------------------------------------
page_path = ROOT / 'src/pages/dashboard/NotificationsPage.tsx'
page = page_path.read_text(encoding='utf-8')
import_anchor = """import {
  applyNotificationTemplates,
"""
if "localizeNotificationTypeCodeLabel" not in page:
    page = page.replace(
        import_anchor,
        """import { localizeNotificationTypeCodeLabel } from '@/features/notifications/notificationLocalization'\nimport {\n  applyNotificationTemplates,\n""",
        1,
    )
page = page.replace('<span>{item.type_code}</span>', '<span>{localizeNotificationTypeCodeLabel(item.type_code)}</span>')
page_path.write_text(page, encoding='utf-8')

# ---------------------------------------------------------------------------
# Locale additions for notification type names, supply details and values.
# ---------------------------------------------------------------------------
notification_values = {
    'en': {
        'types': {'suppliesLow': 'Race supplies low', 'planOpen': 'Race plan open'},
        'labels': {
            'supplyStatus': 'Supply status', 'bidonsWaterBottles': 'Bidons / Water Bottles',
            'nutritionPacks': 'Nutrition Packs', 'energyGels': 'Energy Gels',
            'raceJerseyComplete': 'Race Jersey Complete', 'rainJackets': 'Rain Jackets',
            'requiredJerseyKits': 'Required jersey kits', 'availableJerseyKits': 'Available jersey kits',
            'missingJerseyKits': 'Missing jersey kits', 'eligibilityCheck': 'Eligibility check',
        },
        'values': {
            'restockRequired': 'Restock Required', 'lowStock': 'Low stock', 'inStock': 'In stock',
            'outOfStock': 'Out of stock', 'inRepair': 'In repair', 'sold': 'Sold', 'expired': 'Expired',
            'repaid': 'Repaid', 'finalWarning': 'Final warning',
            'countAvailable': '{{count}} available', 'countLeft': '{{count}} left',
            'thresholdValue': 'threshold {{count}}', 'countWeeks': '{{count}} weeks',
            'countDays': '{{count}} days', 'countSeasons': '{{count}} seasons',
        },
    },
    'sr-Latn': {
        'types': {'suppliesLow': 'Niske zalihe', 'planOpen': 'Plan otvoren'},
        'labels': {
            'supplyStatus': 'Status zaliha', 'bidonsWaterBottles': 'Bidoni / flaše za vodu',
            'nutritionPacks': 'Paketi ishrane', 'energyGels': 'Energetski gelovi',
            'raceJerseyComplete': 'Komplet trkačkog dresa', 'rainJackets': 'Kišne jakne',
            'requiredJerseyKits': 'Potrebni kompleti dresova', 'availableJerseyKits': 'Dostupni kompleti dresova',
            'missingJerseyKits': 'Nedostajući kompleti dresova', 'eligibilityCheck': 'Provera uslova za nastup',
        },
        'values': {
            'restockRequired': 'Potrebna dopuna zaliha', 'lowStock': 'Niske zalihe', 'inStock': 'Na stanju',
            'outOfStock': 'Nema na stanju', 'inRepair': 'Na popravci', 'sold': 'Prodato', 'expired': 'Isteklo',
            'repaid': 'Otplaćeno', 'finalWarning': 'Poslednje upozorenje',
            'countAvailable': '{{count}} dostupno', 'countLeft': '{{count}} preostalo',
            'thresholdValue': 'prag {{count}}', 'countWeeks': '{{count}} nedelja',
            'countDays': '{{count}} dana', 'countSeasons': '{{count}} sezona',
        },
    },
    'de': {
        'types': {'suppliesLow': 'Vorräte knapp', 'planOpen': 'Plan geöffnet'},
        'labels': {
            'supplyStatus': 'Vorratsstatus', 'bidonsWaterBottles': 'Bidons / Trinkflaschen',
            'nutritionPacks': 'Verpflegungspakete', 'energyGels': 'Energiegels',
            'raceJerseyComplete': 'Kompletter Renntrikotsatz', 'rainJackets': 'Regenjacken',
            'requiredJerseyKits': 'Benötigte Trikotsätze', 'availableJerseyKits': 'Verfügbare Trikotsätze',
            'missingJerseyKits': 'Fehlende Trikotsätze', 'eligibilityCheck': 'Teilnahmeprüfung',
        },
        'values': {
            'restockRequired': 'Nachschub erforderlich', 'lowStock': 'Vorrat knapp', 'inStock': 'Auf Lager',
            'outOfStock': 'Nicht auf Lager', 'inRepair': 'In Reparatur', 'sold': 'Verkauft', 'expired': 'Abgelaufen',
            'repaid': 'Zurückgezahlt', 'finalWarning': 'Letzte Warnung',
            'countAvailable': '{{count}} verfügbar', 'countLeft': '{{count}} übrig',
            'thresholdValue': 'Schwellenwert {{count}}', 'countWeeks': '{{count}} Wochen',
            'countDays': '{{count}} Tage', 'countSeasons': '{{count}} Saisons',
        },
    },
    'hr': {
        'types': {'suppliesLow': 'Niske zalihe', 'planOpen': 'Plan otvoren'},
        'labels': {
            'supplyStatus': 'Status zaliha', 'bidonsWaterBottles': 'Bidoni / boce za vodu',
            'nutritionPacks': 'Paketi prehrane', 'energyGels': 'Energetski gelovi',
            'raceJerseyComplete': 'Komplet trkaćeg dresa', 'rainJackets': 'Kišne jakne',
            'requiredJerseyKits': 'Potrebni kompleti dresova', 'availableJerseyKits': 'Dostupni kompleti dresova',
            'missingJerseyKits': 'Nedostajući kompleti dresova', 'eligibilityCheck': 'Provjera uvjeta za nastup',
        },
        'values': {
            'restockRequired': 'Potrebna nadopuna zaliha', 'lowStock': 'Niske zalihe', 'inStock': 'Na zalihi',
            'outOfStock': 'Nema na zalihi', 'inRepair': 'Na popravku', 'sold': 'Prodano', 'expired': 'Isteklo',
            'repaid': 'Otplaćeno', 'finalWarning': 'Posljednje upozorenje',
            'countAvailable': '{{count}} dostupno', 'countLeft': '{{count}} preostalo',
            'thresholdValue': 'prag {{count}}', 'countWeeks': '{{count}} tjedana',
            'countDays': '{{count}} dana', 'countSeasons': '{{count}} sezona',
        },
    },
    'es': {
        'types': {'suppliesLow': 'Suministros bajos', 'planOpen': 'Plan abierto'},
        'labels': {
            'supplyStatus': 'Estado de suministros', 'bidonsWaterBottles': 'Bidones / botellas de agua',
            'nutritionPacks': 'Paquetes de nutrición', 'energyGels': 'Geles energéticos',
            'raceJerseyComplete': 'Kit completo de maillot', 'rainJackets': 'Chaquetas de lluvia',
            'requiredJerseyKits': 'Kits de maillot necesarios', 'availableJerseyKits': 'Kits de maillot disponibles',
            'missingJerseyKits': 'Kits de maillot faltantes', 'eligibilityCheck': 'Comprobación de elegibilidad',
        },
        'values': {
            'restockRequired': 'Es necesario reponer', 'lowStock': 'Pocas existencias', 'inStock': 'En stock',
            'outOfStock': 'Agotado', 'inRepair': 'En reparación', 'sold': 'Vendido', 'expired': 'Caducado',
            'repaid': 'Reembolsado', 'finalWarning': 'Advertencia final',
            'countAvailable': '{{count}} disponibles', 'countLeft': '{{count}} restantes',
            'thresholdValue': 'umbral {{count}}', 'countWeeks': '{{count}} semanas',
            'countDays': '{{count}} días', 'countSeasons': '{{count}} temporadas',
        },
    },
    'it': {
        'types': {'suppliesLow': 'Scorte basse', 'planOpen': 'Piano aperto'},
        'labels': {
            'supplyStatus': 'Stato scorte', 'bidonsWaterBottles': 'Borracce / bottiglie d’acqua',
            'nutritionPacks': 'Pacchetti nutrizione', 'energyGels': 'Gel energetici',
            'raceJerseyComplete': 'Kit completo maglia gara', 'rainJackets': 'Giacche antipioggia',
            'requiredJerseyKits': 'Kit maglia necessari', 'availableJerseyKits': 'Kit maglia disponibili',
            'missingJerseyKits': 'Kit maglia mancanti', 'eligibilityCheck': 'Controllo di idoneità',
        },
        'values': {
            'restockRequired': 'Rifornimento necessario', 'lowStock': 'Scorte basse', 'inStock': 'Disponibile',
            'outOfStock': 'Esaurito', 'inRepair': 'In riparazione', 'sold': 'Venduto', 'expired': 'Scaduto',
            'repaid': 'Rimborsato', 'finalWarning': 'Avviso finale',
            'countAvailable': '{{count}} disponibili', 'countLeft': '{{count}} rimanenti',
            'thresholdValue': 'soglia {{count}}', 'countWeeks': '{{count}} settimane',
            'countDays': '{{count}} giorni', 'countSeasons': '{{count}} stagioni',
        },
    },
    'fr': {
        'types': {'suppliesLow': 'Stocks faibles', 'planOpen': 'Plan ouvert'},
        'labels': {
            'supplyStatus': 'État des stocks', 'bidonsWaterBottles': 'Bidons / bouteilles d’eau',
            'nutritionPacks': 'Packs nutritionnels', 'energyGels': 'Gels énergétiques',
            'raceJerseyComplete': 'Kit complet de maillot', 'rainJackets': 'Vestes de pluie',
            'requiredJerseyKits': 'Kits de maillot requis', 'availableJerseyKits': 'Kits de maillot disponibles',
            'missingJerseyKits': 'Kits de maillot manquants', 'eligibilityCheck': 'Contrôle d’éligibilité',
        },
        'values': {
            'restockRequired': 'Réapprovisionnement requis', 'lowStock': 'Stocks faibles', 'inStock': 'En stock',
            'outOfStock': 'Rupture de stock', 'inRepair': 'En réparation', 'sold': 'Vendu', 'expired': 'Expiré',
            'repaid': 'Remboursé', 'finalWarning': 'Avertissement final',
            'countAvailable': '{{count}} disponibles', 'countLeft': '{{count}} restants',
            'thresholdValue': 'seuil {{count}}', 'countWeeks': '{{count}} semaines',
            'countDays': '{{count}} jours', 'countSeasons': '{{count}} saisons',
        },
    },
    'ru': {
        'types': {'suppliesLow': 'Мало запасов', 'planOpen': 'План открыт'},
        'labels': {
            'supplyStatus': 'Состояние запасов', 'bidonsWaterBottles': 'Фляги / бутылки для воды',
            'nutritionPacks': 'Пакеты питания', 'energyGels': 'Энергетические гели',
            'raceJerseyComplete': 'Комплект гоночной формы', 'rainJackets': 'Дождевые куртки',
            'requiredJerseyKits': 'Необходимые комплекты формы', 'availableJerseyKits': 'Доступные комплекты формы',
            'missingJerseyKits': 'Недостающие комплекты формы', 'eligibilityCheck': 'Проверка допуска',
        },
        'values': {
            'restockRequired': 'Требуется пополнение запасов', 'lowStock': 'Мало запасов', 'inStock': 'В наличии',
            'outOfStock': 'Нет в наличии', 'inRepair': 'В ремонте', 'sold': 'Продано', 'expired': 'Истекло',
            'repaid': 'Погашено', 'finalWarning': 'Последнее предупреждение',
            'countAvailable': '{{count}} доступно', 'countLeft': '{{count}} осталось',
            'thresholdValue': 'порог {{count}}', 'countWeeks': '{{count}} недель',
            'countDays': '{{count}} дней', 'countSeasons': '{{count}} сезонов',
        },
    },
}

for locale in LOCALES:
    path = ROOT / 'src/i18n/locales' / locale / 'notifications.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    data.setdefault('notificationTypes', {}).update(notification_values[locale]['types'])
    data.setdefault('templateLabels', {}).update(notification_values[locale]['labels'])
    data.setdefault('templateValues', {}).update(notification_values[locale]['values'])

    # Fix the two Croatian generic notification phrases visible in the current UI.
    if locale == 'hr':
        tl = data.setdefault('templateLocalization', {})
        tl['genericMessage'] = 'Nova obavijest „{{topic}}“ dostupna je za vaš klub.'
        tl['genericEntityMessage'] = '{{entity}}: dostupna je nova obavijest „{{topic}}“.'

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Applied finance transaction and notification localization fixes')
