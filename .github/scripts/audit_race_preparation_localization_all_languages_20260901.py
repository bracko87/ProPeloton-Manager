#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / 'src/pages/dashboard/RacePreparation.tsx'
LOCALES = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']

CRITICAL_KEYS = {
    'firstSquad', 'developingTeam', 'role', 'fatigue', 'availability',
    'startingFreshnessHelp', 'season', 'selectedStageProfile', 'date', 'route',
    'profile', 'distance', 'stageWeather', 'temp', 'wind', 'rain', 'finish',
    'missingStagePlans', 'missingStagePlansHelp', 'savedStages', 'missingCount',
    'stagePlanLock', 'lockTime', 'stageStart', 'statusOpen', 'statusLocked',
    'openLockHint', 'lockedLockHint', 'selectedStageSave', 'locksBefore',
    'notSavedYet', 'openStageSaveHelp', 'missingStagePlan',
    'riderEquipmentPackages', 'chooseEquipmentPackage', 'askSportDirector',
    'save', 'stageRoles', 'chooseRole', 'riderStageRoles', 'engineRole',
    'freeRole', 'individualTactics', 'phaseDescription', 'saveStageWarning',
    'rider', 'phase', 'followStageRole', 'stageRaceSupplies', 'stageSupplyDesc',
    'stageSupplySetup', 'ridersSelected', 'stageSupplies', 'energyGels',
    'nutritionPacks', 'rainJackets', 'mandatoryJersey', 'rainAutoUsed',
    'weatherNoRisk', 'notNeeded', 'stageStockCheck', 'stockCheckHelp',
    'planOnly', 'oneUseConsumable', 'stageSaveOnly', 'finalStageCalculation',
    'finalCalcDesc', 'ttFinalCalcDesc', 'racePlanBonusTotal',
    'equipmentBonusDirection', 'rainJacketEffect', 'notActive',
    'stageSuppliesSummary', 'bidonsNeeded', 'energyGelsNeeded',
    'nutritionPacksNeeded', 'raceJerseysNeeded', 'rainJacketsNeeded',
    'durabilityNote', 'bonusTitle', 'bonusStandardized', 'bonusDescription',
    'details', 'fatigueControl', 'recoverySupport', 'healthProtection',
    'mechanicalReliability', 'raceSupport', 'fatigueDesc', 'recoveryDesc',
    'healthDesc', 'mechanicalDesc', 'raceSupportDesc',
    'validationSelectedRiders', 'validationNoSportDirector',
    'validationNoMechanic', 'validationNoAssets', 'defaultRaceSetup',
    'left', 'limit', 'openRacePage', 'stagePlansIntro', 'stagePlansSubmitted',
    'allRounder', 'statusOpenValue', 'statusLockedValue',
}

# These words are either protected/international or naturally identical in one or
# more target languages (for example French "Fatigue" / "Distance" and German
# "Phase"). Equality here is not evidence of English fallback.
ALLOW_IDENTICAL = {
    'start', 'sprint', 'raceJerseyKit', 'phase', 'distance', 'fatigue',
}


def load(locale: str) -> dict:
    path = ROOT / 'src/i18n/locales' / locale / 'racePreparation.json'
    return json.loads(path.read_text(encoding='utf-8'))


def main() -> None:
    errors: list[str] = []
    resources = {locale: load(locale) for locale in LOCALES}
    en_screen = resources['en'].get('screen')
    if not isinstance(en_screen, dict):
        raise SystemExit('English racePreparation.screen is missing')

    en_keys = set(en_screen)
    missing_required = sorted(CRITICAL_KEYS - en_keys)
    if missing_required:
        errors.append(f'English screen missing required keys: {missing_required}')

    for locale in LOCALES:
        screen = resources[locale].get('screen')
        if not isinstance(screen, dict):
            errors.append(f'{locale}: racePreparation.screen missing')
            continue
        keys = set(screen)
        if keys != en_keys:
            missing = sorted(en_keys - keys)
            extra = sorted(keys - en_keys)
            errors.append(f'{locale}: screen key mismatch missing={missing} extra={extra}')
            continue
        for key in CRITICAL_KEYS:
            value = screen.get(key)
            if not isinstance(value, str) or not value.strip():
                errors.append(f'{locale}: empty screen.{key}')
        if locale != 'en':
            for key in CRITICAL_KEYS - ALLOW_IDENTICAL:
                value = str(screen.get(key, '')).strip()
                en_value = str(en_screen.get(key, '')).strip()
                if value == en_value and len(en_value) >= 6:
                    errors.append(f'{locale}: untranslated screen.{key}: {value!r}')

    src = COMPONENT.read_text(encoding='utf-8')
    required_snippets = [
        'import appI18n from "../../i18n";',
        'function racePrepText(',
        'function getRacePrepLocale(',
        'function localizedGameMonth(',
        'function localizeRacePrepBackendText(',
        'localizeRacePrepBackendText(error)',
        'localizeRacePrepBackendText(warning)',
        'localizedGameMonth(parts.month',
    ]
    for snippet in required_snippets:
        if snippet not in src:
            errors.append(f'Component missing expected localization hook: {snippet}')

    forbidden_patterns = {
        'hardcoded bonus title': r'>\s*Race Plan Bonus Preview\s*<',
        'hardcoded standardized bonus title': r'>\s*Standardized Race Bonus Percentages\s*<',
        'hardcoded equipment section': r'>\s*1\. Rider Equipment Packages\s*<',
        'hardcoded roles section': r'>\s*2\. Stage Roles\s*<',
        'hardcoded tactics section': r'>\s*3\. Individual Tactics\s*<',
        'hardcoded supplies section': r'>\s*4\. Stage Race Supplies\s*<',
        'hardcoded final calculation section': r'>\s*5\. Final Stage Calculation\s*<',
        'hardcoded selected stage save': r'>\s*Selected stage save\s*<',
        'hardcoded stage plan lock': r'>\s*Stage Plan lock\s*<',
        'hardcoded selected stage profile': r'>\s*SELECTED STAGE PROFILE\s*<',
        'hardcoded stage weather': r'>\s*STAGE WEATHER\s*<',
        'hardcoded rider role label': r'Role:\s*\{String\(option\.assigned_role',
        'hardcoded fatigue label': r'Fatigue:\s*\{String\(rider\.fatigue',
        'hardcoded availability label': r'Availability:\s*\{availabilityLabel\}',
        'raw quote error': r'(?<!localizeRacePrepBackendText\()\{error\}',
        'raw quote warning': r'(?<!localizeRacePrepBackendText\()\{warning\}',
        'browser-default weekday locale': r'toLocaleDateString\(undefined\s*,',
        'raw sharpness label': r'Race Sharpness:\s*\{percent\}/100\s*·\s*\{sharpness\.race_sharpness_label\}',
    }
    for label, pattern in forbidden_patterns.items():
        if re.search(pattern, src):
            errors.append(f'Component still contains {label}')

    if errors:
        print('Race Preparation localization audit FAILED')
        for error in errors:
            print(' -', error)
        raise SystemExit(1)

    print('Race Preparation localization audit PASSED')
    print('Locales checked:', ', '.join(LOCALES))
    print('screen keys:', len(en_keys))
    print('Critical UI keys:', len(CRITICAL_KEYS))


if __name__ == '__main__':
    main()
