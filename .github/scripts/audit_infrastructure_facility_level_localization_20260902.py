from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALE_ROOT = ROOT / "src/i18n/locales"
FACILITIES_TSX = ROOT / "src/pages/dashboard/infrastructure/FacilitiesSection.tsx"
HELPERS_TS = ROOT / "src/pages/dashboard/infrastructure/infrastructureHelpers.ts"
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]

EXPECTED_GUIDE = {
    "title",
    "whatEveryLevelProvides",
    "currentPanelTitle",
    "nextPanelTitle",
    "activeNow",
    "unlocks",
    "effects",
    "monthlyMaintenance",
    "perGameMonth",
    "upgradeCost",
    "constructionTime",
    "estimatedCompletion",
    "levelLabel",
    "currentLevel",
    "unlocked",
    "futureLevel",
    "upgradeToThisLevel",
    "maximumReached",
    "levelBadge",
    "imageAlt",
    "noAdditionalUnlock",
    "noAdditionalEffect",
}

EXPECTED_LEVELS = {
    "club_house": range(0, 6),
    "training_center": range(0, 6),
    "medical_center": range(0, 6),
    "youth_academy": range(0, 3),
    "mechanics_workshop": range(0, 5),
    "scouting_office": range(0, 5),
}

resources = {}
for locale in LOCALES:
    path = LOCALE_ROOT / locale / "infrastructure.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    resources[locale] = data

    if not data.get("common", {}).get("tbd"):
        raise SystemExit(f"{locale}: missing common.tbd")

    guide = data.get("facilityGuide")
    if not isinstance(guide, dict):
        raise SystemExit(f"{locale}: missing facilityGuide")
    missing_guide = sorted(EXPECTED_GUIDE - set(guide))
    if missing_guide:
        raise SystemExit(f"{locale}: missing facilityGuide keys: {missing_guide}")

    details = data.get("facilityLevelDetails")
    if not isinstance(details, dict):
        raise SystemExit(f"{locale}: missing facilityLevelDetails")

    for facility, levels in EXPECTED_LEVELS.items():
        facility_data = details.get(facility)
        if not isinstance(facility_data, dict):
            raise SystemExit(f"{locale}: missing facilityLevelDetails.{facility}")
        for level in levels:
            row = facility_data.get(f"level{level}")
            if not isinstance(row, dict):
                raise SystemExit(f"{locale}: missing {facility}.level{level}")
            for key in ("unlock", "effect"):
                value = row.get(key)
                if not isinstance(value, str) or not value.strip():
                    raise SystemExit(f"{locale}: empty {facility}.level{level}.{key}")

# Catch the old screenshot-visible English strings at the rendering layer.
src = FACILITIES_TSX.read_text(encoding="utf-8")
banned = [
    ">Facility level guide<",
    ">What every level provides<",
    "{isCurrent ? 'Current' : 'Next'} Level",
    ">Active now<",
    ">Unlocks:<",
    ">Effects:<",
    ">Monthly maintenance:<",
    "/ game month",
    ">Upgrade cost<",
    ">Construction time<",
    ">Est. completion<",
    ">Current status<",
    "Status: <span",
    ">Level {level}<",
    "'Current level' : level < currentLevel ? 'Unlocked' : 'Future level'",
    "Upgrade to this level:",
    "Maximum facility level reached.",
    "alt={`${item.name} — Level",
]
for fragment in banned:
    if fragment in src:
        raise SystemExit(f"FacilitiesSection still contains hardcoded screenshot text: {fragment}")

required_source = [
    "facilityGuide.currentPanelTitle",
    "facilityGuide.nextPanelTitle",
    "facilityGuide.whatEveryLevelProvides",
    "facilityGuide.upgradeToThisLevel",
    "facilityGuide.maximumReached",
    "facilityLevelDetails.${key}.level${level}",
    "levelDetail(item, level, configs, t)",
    "facilityGuide.imageAlt",
    "facilityGuide.levelBadge",
]
for fragment in required_source:
    if fragment not in src:
        raise SystemExit(f"FacilitiesSection missing localized runtime path: {fragment}")

helpers = HELPERS_TS.read_text(encoding="utf-8")
for fragment in [
    "getInfrastructureLocale",
    "localizedInfrastructureMonth",
    "Intl.DateTimeFormat",
    "common.tbd",
]:
    if fragment not in helpers:
        raise SystemExit(f"Infrastructure date localization missing: {fragment}")

# Strong sanity check for the user's German screenshot: the formerly English
# card/modal strings and the first two facilities must now be genuinely German.
de = resources["de"]
checks = {
    "facilityGuide.title": de["facilityGuide"]["title"],
    "facilityGuide.currentPanelTitle": de["facilityGuide"]["currentPanelTitle"],
    "club_house.level1.unlock": de["facilityLevelDetails"]["club_house"]["level1"]["unlock"],
    "club_house.level1.effect": de["facilityLevelDetails"]["club_house"]["level1"]["effect"],
    "training_center.level1.effect": de["facilityLevelDetails"]["training_center"]["level1"]["effect"],
}
for key, value in checks.items():
    if any(english in value for english in ["Current Level", "Unlocks", "Staff payroll", "Regular training development", "Facility level guide"]):
        raise SystemExit(f"German screenshot copy still contains English at {key}: {value}")

print("Infrastructure facility level localization audit PASSED")
print("Locales checked:", ", ".join(LOCALES))
print("Facility guide keys:", len(EXPECTED_GUIDE))
print("Facility levels checked:", sum(len(list(v)) for v in EXPECTED_LEVELS.values()))
print("Database unlock/effect copy is localized through facilityLevelDetails with DB fallback only")
print("Infrastructure game-date month labels are locale-aware")
