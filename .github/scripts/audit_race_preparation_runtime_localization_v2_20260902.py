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

# These are genuinely identical words in the target language; they should not
# be treated as untranslated just because the spelling matches English.
NATURALLY_IDENTICAL = {
    ("fr", "screen.fatigue"),
    ("de", "screen.fit"),
    ("fr", "screen.distance"),
    ("de", "screen.wind"),
}

# Long/meaningful visible copy that should never remain identical to English in
# a non-English locale. Canonical protected terms and short international words
# (Race Plan, Stage Plan(s), Race Sharpness, U23, UCI, KOM, Sprint, Bidons,
# Phase, etc.) are intentionally excluded from the equality check.
MUST_TRANSLATE = [
    "page.title",
    "page.subtitle",
    "tabs.accepted",
    "accepted.description",
    "accepted.openRacePlan",
    "accepted.openStagePlans",
    "header.openRacePage",
    "header.currentGameDate",
    "header.competingSquad",
    "header.competingSquadHelp",
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

# Keys that are important for screen coverage but may legitimately render the
# same token in one or more languages.
MUST_EXIST = [
    "tabs.racePlan",
    "tabs.stagePlans",
    "screen.date",
    "screen.route",
    "screen.profile",
    "screen.start",
    "screen.sprint",
    "screen.bidons",
    "screen.phaseLabel",
    "screen.statusLabel",
    "screen.stagesLower",
    "screen.minLabel",
    "screen.maxLabel",
    "screen.perRiderLower",
    "screen.sourcesCount",
    "stagePlans.title",
    "stagePlans.save",
]


def load(locale: str) -> dict[str, Any]:
    path = ROOT / "src/i18n/locales" / locale / "racePreparation.json"
    return json.loads(path.read_text(encoding="utf-8"))


def flatten(value: Any, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            child_key = f"{prefix}.{key}" if prefix else key
            out.update(flatten(child, child_key))
    elif isinstance(value, str):
        out[prefix] = value
    return out


def placeholders(value: str) -> set[str]:
    return set(PLACEHOLDER_RE.findall(value))


def main() -> None:
    errors: list[str] = []
    resources = {locale: flatten(load(locale)) for locale in LOCALES}
    en = resources["en"]
    en_keys = set(en)

    # Full namespace structure and placeholder parity across all eight locales.
    for locale in LOCALES:
        current = resources[locale]
        current_keys = set(current)
        if current_keys != en_keys:
            errors.append(
                f"{locale}: namespace key mismatch "
                f"missing={sorted(en_keys-current_keys)} extra={sorted(current_keys-en_keys)}"
            )
        for key in en_keys & current_keys:
            if placeholders(en[key]) != placeholders(current[key]):
                errors.append(
                    f"{locale}: placeholder mismatch {key}: "
                    f"en={sorted(placeholders(en[key]))} locale={sorted(placeholders(current[key]))}"
                )

    for key in MUST_TRANSLATE:
        if key not in en:
            errors.append(f"English locale missing critical key: {key}")
            continue
        for locale in LOCALES[1:]:
            value = resources[locale].get(key, "").strip()
            if not value:
                errors.append(f"{locale}: missing/empty critical key {key}")
            elif value == en[key].strip() and (locale, key) not in NATURALLY_IDENTICAL:
                errors.append(f"{locale}: untranslated critical key {key}: {value!r}")

    for key in MUST_EXIST:
        for locale in LOCALES:
            if not resources[locale].get(key, "").strip():
                errors.append(f"{locale}: missing required visible key {key}")

    # The bridge must activate after normal React Router SPA navigation, not only
    # after a hard reload/popstate, and it must recognize the legacy alias route.
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
            errors.append(f"Race Preparation bridge missing runtime activation hook: {required}")

    source = COMPONENT.read_text(encoding="utf-8")
    for required in [
        'const monthLabel = localizedGameMonth(parts.month, "short");',
        'date.toLocaleDateString(locale || getRacePrepLocale(), {',
        'localizedGameMonth(startParts!.month, "short")',
        'localizedGameMonth(endParts!.month, "short")',
        'function localizeRacePrepBackendText',
        'useTranslation("racePreparation")',
    ]:
        if required not in source:
            errors.append(f"RacePreparation.tsx missing locale-aware hook: {required}")

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
    print("Must-translate visible keys:", len(MUST_TRANSLATE))
    print("Additional visible keys present:", len(MUST_EXIST))
    print("SPA route activation: pushState + replaceState + canonical + legacy route")
    print("Date localization: selected-language month/weekday/timestamp checks passed")


if __name__ == "__main__":
    main()
