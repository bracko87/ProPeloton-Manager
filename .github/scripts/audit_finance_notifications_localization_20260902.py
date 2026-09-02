from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('.')
LOCALES = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']
NON_EN = [x for x in LOCALES if x != 'en']

finance = (ROOT / 'src/pages/dashboard/Finance.tsx').read_text(encoding='utf-8')
notification_localization = (ROOT / 'src/features/notifications/notificationLocalization.ts').read_text(encoding='utf-8')
notifications_page = (ROOT / 'src/pages/dashboard/NotificationsPage.tsx').read_text(encoding='utf-8')

required_finance_markers = [
    "transactionLabels.raceSuppliesPurchase",
    "transactionLabels.racePreparationCost",
    "transactionLabels.clubHouseStaffPayrollSaving",
    "transactionLabels.staffPayrollSaving",
]
for marker in required_finance_markers:
    if marker not in finance:
        raise SystemExit(f'Missing Finance localization marker: {marker}')

if '<span>{item.type_code}</span>' in notifications_page:
    raise SystemExit('Notifications page still renders raw type_code')
if 'localizeNotificationTypeCodeLabel(item.type_code)' not in notifications_page:
    raise SystemExit('Notifications page is not using localized type-code labels')

for marker in [
    "tokens[0] === 'RACE'",
    "notificationTypes.suppliesLow",
    "notificationTypes.planOpen",
    "templateValues.restockRequired",
    "templateValues.countAvailable",
    "templateValues.countLeft",
    "templateValues.thresholdValue",
    "templateLabels.bidonsWaterBottles",
    "templateLabels.nutritionPacks",
    "templateLabels.energyGels",
    "templateLabels.raceJerseyComplete",
    "templateLabels.rainJackets",
]:
    if marker not in notification_localization:
        raise SystemExit(f'Missing notification localization marker: {marker}')

finance_keys = [
    'raceSuppliesPurchase',
    'racePreparationCost',
    'clubHouseStaffPayrollSaving',
    'staffPayrollSaving',
]
notification_type_keys = ['suppliesLow', 'planOpen']
notification_label_keys = [
    'supplyStatus', 'bidonsWaterBottles', 'nutritionPacks', 'energyGels',
    'raceJerseyComplete', 'rainJackets', 'requiredJerseyKits',
    'availableJerseyKits', 'missingJerseyKits', 'eligibilityCheck',
]
notification_value_keys = [
    'restockRequired', 'lowStock', 'inStock', 'outOfStock', 'inRepair',
    'sold', 'expired', 'repaid', 'finalWarning', 'countAvailable', 'countLeft',
    'thresholdValue', 'countWeeks', 'countDays', 'countSeasons',
]

loaded_finance = {}
loaded_notifications = {}
for locale in LOCALES:
    fpath = ROOT / 'src/i18n/locales' / locale / 'finance.json'
    npath = ROOT / 'src/i18n/locales' / locale / 'notifications.json'
    loaded_finance[locale] = json.loads(fpath.read_text(encoding='utf-8'))
    loaded_notifications[locale] = json.loads(npath.read_text(encoding='utf-8'))

    for key in finance_keys:
        value = loaded_finance[locale].get('transactionLabels', {}).get(key)
        if not isinstance(value, str) or not value.strip():
            raise SystemExit(f'{locale}: missing finance transactionLabels.{key}')
    for key in notification_type_keys:
        value = loaded_notifications[locale].get('notificationTypes', {}).get(key)
        if not isinstance(value, str) or not value.strip():
            raise SystemExit(f'{locale}: missing notificationTypes.{key}')
    for key in notification_label_keys:
        value = loaded_notifications[locale].get('templateLabels', {}).get(key)
        if not isinstance(value, str) or not value.strip():
            raise SystemExit(f'{locale}: missing templateLabels.{key}')
    for key in notification_value_keys:
        value = loaded_notifications[locale].get('templateValues', {}).get(key)
        if not isinstance(value, str) or not value.strip():
            raise SystemExit(f'{locale}: missing templateValues.{key}')

# Strong non-English checks for the exact screenshot problems.
english_finance = loaded_finance['en']['transactionLabels']
english_notif = loaded_notifications['en']
for locale in NON_EN:
    for key in finance_keys:
        if loaded_finance[locale]['transactionLabels'][key] == english_finance[key]:
            raise SystemExit(f'{locale}: finance key still equals English: {key}')
    for key in notification_type_keys:
        if loaded_notifications[locale]['notificationTypes'][key] == english_notif['notificationTypes'][key]:
            raise SystemExit(f'{locale}: notification type still equals English: {key}')
    for key in notification_label_keys:
        if loaded_notifications[locale]['templateLabels'][key] == english_notif['templateLabels'][key]:
            raise SystemExit(f'{locale}: notification label still equals English: {key}')
    for key in ['restockRequired', 'lowStock', 'inStock', 'outOfStock']:
        if loaded_notifications[locale]['templateValues'][key] == english_notif['templateValues'][key]:
            raise SystemExit(f'{locale}: notification value still equals English: {key}')

hr = loaded_notifications['hr']
assert hr['notificationTypes']['suppliesLow'] == 'Niske zalihe'
assert hr['notificationTypes']['planOpen'] == 'Plan otvoren'
assert hr['templateLabels']['bidonsWaterBottles'] == 'Bidoni / boce za vodu'
assert hr['templateLabels']['nutritionPacks'] == 'Paketi prehrane'
assert hr['templateValues']['restockRequired'] == 'Potrebna nadopuna zaliha'
assert hr['templateLocalization']['genericMessage'].startswith('Nova obavijest')

sr = loaded_notifications['sr-Latn']
assert sr['notificationTypes']['suppliesLow'] == 'Niske zalihe'
assert sr['notificationTypes']['planOpen'] == 'Plan otvoren'

print('Finance + notifications localization audit PASSED')
print('Locales checked:', ', '.join(LOCALES))
print('Finance transaction labels checked:', len(finance_keys))
print('Notification type labels checked:', len(notification_type_keys))
print('Notification detail labels checked:', len(notification_label_keys))
print('Notification dynamic values checked:', len(notification_value_keys))
print('Croatian screenshot assertions: PASSED')
print('Serbian title assertions: PASSED')
print('Raw notification type-code display: removed for translated UI')
