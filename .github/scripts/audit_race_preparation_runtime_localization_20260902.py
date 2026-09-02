#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / "src/pages/dashboard/RacePreparation.tsx"
BRIDGE = ROOT / "src/components/i18n/RacePreparationLegacyLocalizationBridge.tsx"
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]
PLACEHOLDER_RE = re.compile(r"{{\s*([A-Za-z0-9_]+)\s*}}")

# These are the visible areas that were repeatedly reported as English on the
# real Race Preparation screen. Protected canonical terms (Race Plan, Stage
# Plan(s), Race Sharpness, KOM, U23, UCI, etc.) are deliberately not required
# to differ from English.
CRITICAL_TRANSLATED_KEYS = [
    "page.title",
    "page.subtitle",
    "tabs.accepted",
    "accepted.description",
    "accepted.openRacePlan",
    "accepted.openStagePlans",
    "header.openRacePage",
    "header.currentGameDate",
    "header.competingSquad",
    "header.racePlanOpens",
    "header.riderDeadline",
    "header.stages",
    "screen.firstSquad",
    "screen.developingTeam",
    "screen.role",
    "screen.fatigue",
    "screen.availability",
    "screen.raceReady",
    "screen.fit",
    "screen.startingFreshnessHelp",
    "screen.season",
    "screen.selectedStageProfile",
    "screen.date",
    "screen.route",
    "screen.profile",
    "screen.distance",
    "screen.stageWeather",
    "screen.temp",
    "screen.wind",
    "screen.rain",
    "screen.finish",
    "screen.missingStagePlans",
    "screen.missingStagePlansHelp",
    "screen.savedStages",
    "screen.missingCount",
    "screen.stagePlanLock",
    "screen.lockTime",
    "screen.stageStart",
    "screen.openLockHint",
    "screen.selectedStageSave",
    "screen.notSavedYet",
    "screen.openStageSaveHelp",
    "screen.riderEquipmentPackages",
    "screen.chooseEquipmentPackage",
    "screen.askSportDirector",
    "screen.stageRoles",
    "screen.chooseRole",
    "screen.riderStageRoles",
    "screen.engineRole",
    "screen.freeRole",
    "screen.individualTactics",
    "screen.phaseDescription",
    "screen.saveStageWarning",
    "screen.followStageRole",
    "screen.stageRaceSupplies",
    "screen.stageSupplyDesc",
    "screen.stageSupplySetup",
    "screen.ridersSelected",
    "screen.bidons",
    "screen.energyGels",
    "screen.nutritionPacks",
    "screen.rainJackets",
    "screen.minMaxPerRider",
    "screen.mandatoryJersey",
    "screen.rainAutoUsed",
    "screen.weatherNoRisk",
    "screen.notNeeded",
    "screen.stageStockCheck",
    "screen.stockCheckHelp",
    "screen.planOnly",
    "screen.oneUseConsumable",
    "screen.stageSaveOnly",
    "screen.finalStageCalculation",
    "screen.finalCalcDesc",
    "screen.racePlanBonusTotal",
    "screen.equipmentBonusDirection",
    "screen.rainJacketEffect",
    "screen.notActive",
    "screen.bidonsNeeded",
    "screen.energyGelsNeeded",
    "screen.nutritionPacksNeeded",
    "screen.raceJerseysNeeded",
    "screen.rainJacketsNeeded",
    "screen.durabilityNote",
    "screen.bonusTitle",
    "screen.bonusStandardized",
    "screen.bonusDescription",
    "screen.fatigueControl",
    "screen.recoverySupport",
    "screen.healthProtection",
    "screen.mechanicalReliability",
    "screen.raceSupport",
    "screen.validationSelectedRiders",
    "screen.validationNoSportDirector",
    "screen.validationNoMechanic",
    "screen.validationNoAssets",
    "screen.defaultRaceSetup",
    "screen.openRacePage",
    "screen.stagePlansIntro",
    "screen.allRounder",
    "screen.statusOpenValue",
    "screen.statusLockedValue",
    "screen.anotherRace",
    "screen.assignedTo",
    "screen.assignedToRange",
    "screen.ageYears",
    "screen.beforeSplit",
    "screen.afterSplit",
    "screen.phaseLabel",
    "screen.savedLabel",
    "screen.missingLabel",
    "screen.noSuppliesLabel",
    "screen.rawEffectLabel",
    "screen.breakdownLabel",
    "screen.ridersSelectedSuffix",
    "screen.neededSuffix",
    "screen.autoNeededSuffix",
    "screen.teamCars",
    "screen.bonusSource",
    "bonus.title",
    "bonus.standardized",
    "bonus.description",
    "bonus.breakdownHelp",
    "bonus.sourceContribution",
    "bonus.standardizedTotal",
    "bonus.capHelp",
    "bonus.noBreakdown",
    "bonus.none",
    "riderRoles.teamLeader",
    "riderRoles.climber",
    "riderRoles.helper",
    "riderRoles.breakawayRider",
    "riderRoles.breakawayChaser",
]


def load(locale: str) -> dict[str, Any]:
    path = ROOT / "src/i18n/locales" / locale / "racePreparation.json"
    return json.loads(path.read_text(encoding="utf-8"))


def flatten(value: Any, prefix: str = "") -> dict[str, str]:
    result: dict[str, str] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            child_key = f"{prefix}.{key}" if prefix else key
            result.update(flatten(child, child_key))
    elif isinstance(value, str):
        result[prefix] = value
    return result


def placeholders(value: str) -> set[str]:
    return set(PLACEHOLDER_RE.findall(value))


def main() -> None:
    errors: list[str] = []
    resources = {locale: load(locale) for locale in LOCALES}
    flat = {locale: flatten(resources[locale]) for locale in LOCALES}
    en = flat["en"]
    en_keys = set(en)

    # Full namespace structure and interpolation parity, not just a hand-picked
    # small subset of recent keys.
    for locale in LOCALES:
        keys = set(flat[locale])
        if keys != en_keys:
            errors.append(
                f"{locale}: racePreparation key mismatch "
                f"missing={sorted(en_keys - keys)} extra={sorted(keys - en_keys)}"
            )
        for key in en_keys & keys:
            if placeholders(en[key]) != placeholders(flat[locale][key]):
                errors.append(
                    f"{locale}: placeholder mismatch {key}: "
                    f"en={sorted(placeholders(en[key]))} "
                    f"locale={sorted(placeholders(flat[locale][key]))}"
                )

    # Every critical visible area must have real non-English copy. Short tokens
    # that are legitimately identical between languages are excluded above.
    for key in CRITICAL_TRANSLATED_KEYS:
        if key not in en:
            errors.append(f"English locale missing critical key: {key}")
            continue
        for locale in LOCALES[1:]:
            value = flat[locale].get(key, "").strip()
            if not value:
                errors.append(f"{locale}: missing/empty critical key {key}")
                continue
            if value == en[key].strip():
                errors.append(f"{locale}: untranslated critical key {key}: {value!r}")

    bridge = BRIDGE.read_text(encoding="utf-8")
    for required in [
        "window.history.pushState",
        "window.history.replaceState",
        "queueMicrotask(updateRoute)",
        "'/dashboard/race-preparation'",
        "'/dashboard/team-schedule'",
        "return active ? <ActiveRacePreparationLegacyLocalizationBridge /> : null",
    ]:
        if required not in bridge:
            errors.append(f"Race Preparation runtime bridge missing: {required}")

    source = COMPONENT.read_text(encoding="utf-8")
    required_source = [
        'const monthLabel = localizedGameMonth(parts.month, "short");',
        'date.toLocaleDateString(locale || getRacePrepLocale(), {',
        'localizedGameMonth(startParts!.month, "short")',
        'localizedGameMonth(endParts!.month, "short")',
        'function localizeRacePrepBackendText',
        'useTranslation("racePreparation")',
    ]
    for required in required_source:
        if required not in source:
            errors.append(f"RacePreparation.tsx missing runtime localization hook: {required}")

    for forbidden in [
        'monthLabels[startParts!.month - 1]',
        'monthLabels[endParts!.month - 1]',
        'const monthLabel = monthLabels[parts.month - 1]',
        '.toLocaleString(undefined, {',
        '.toLocaleDateString(undefined, {',
    ]:
        if forbidden in source:
            errors.append(f"RacePreparation.tsx still bypasses selected locale: {forbidden}")

    if errors:
        print("Race Preparation RUNTIME localization audit FAILED")
        for error in errors:
            print(" -", error)
        raise SystemExit(1)

    print("Race Preparation RUNTIME localization audit PASSED")
    print("Locales checked:", ", ".join(LOCALES))
    print("Namespace leaf keys:", len(en_keys))
    print("Critical visible translations checked:", len(CRITICAL_TRANSLATED_KEYS))
    print("SPA route activation: pushState + replaceState + both Race Preparation routes")
    print("Date localization: selected-locale weekday/month/timestamp checks passed")


if __name__ == "__main__":
    main()
