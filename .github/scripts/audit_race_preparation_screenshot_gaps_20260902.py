#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "src/pages/dashboard/RacePreparation.tsx"
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]

REQUIRED_SCREEN_KEYS = [
    "allStagePlansSaved",
    "allStagePlansReady",
    "equipmentDefaultFallbackHelp",
    "stageSupplyEffects",
    "stageSupplyEffectsDesc",
    "enginePreview",
    "energySaving",
    "fatigueReduction",
    "postStageRecovery",
    "powerGelsLabel",
    "powerGelsSummary",
    "weatherRiskLine",
    "weatherRiskNoneReason",
    "weatherRiskRain",
    "weatherRiskCold",
    "weatherRiskWind",
    "weatherRiskCondition",
    "leaderShort",
]

REQUIRED_TACTIC_KEYS = [
    "protectLeader",
    "conserveEnergy",
    "stayNearFront",
    "controlTempo",
    "chaseBreakaway",
    "attack",
    "joinBreakaway",
    "fightSprintPoints",
    "fightKomPoints",
    "avoidRisks",
    "sprintTrainRider",
    "leadOutRider",
    "finalSprint",
]

FORBIDDEN_SCREENSHOT_LITERALS = [
    "Selected stage profile",
    "Stage Supply Effects",
    "Live preview from this stage plan and currently available",
    "Engine preview",
    ">Energy saving<",
    ">Fatigue reduction<",
    ">Post-stage recovery<",
    "The dropdown also includes the Default Race Setup",
    "Stage Plan save only stores the plan.",
    "Weather: {needs.weatherRisk.reason}. Missing jackets do not",
    "Engine role: {engineRoleLabel}",
    "Engine role: {STAGE_RIDER_ROLE_LABELS[role] ?? role}",
]


def main() -> None:
    errors: list[str] = []
    resources: dict[str, dict] = {}

    for locale in LOCALES:
        path = ROOT / "src/i18n/locales" / locale / "racePreparation.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        resources[locale] = data

        screen = data.get("screen", {})
        tactics = data.get("tactics", {})
        for key in REQUIRED_SCREEN_KEYS:
            if not str(screen.get(key, "")).strip():
                errors.append(f"{locale}: missing screen.{key}")
        for key in REQUIRED_TACTIC_KEYS:
            if not str(tactics.get(key, "")).strip():
                errors.append(f"{locale}: missing tactics.{key}")

    en = resources["en"]
    for locale in LOCALES[1:]:
        current = resources[locale]
        for path in [
            ("tabs", "racePlan"),
            ("tabs", "stagePlans"),
            ("stagePlans", "title"),
            ("screen", "allStagePlansSaved"),
            ("screen", "allStagePlansReady"),
            ("screen", "stageSupplyEffects"),
            ("screen", "stageSupplyEffectsDesc"),
            ("screen", "enginePreview"),
            ("screen", "energySaving"),
            ("screen", "fatigueReduction"),
            ("screen", "postStageRecovery"),
            ("screen", "equipmentDefaultFallbackHelp"),
        ]:
            group, key = path
            value = str(current.get(group, {}).get(key, "")).strip()
            en_value = str(en.get(group, {}).get(key, "")).strip()
            if value == en_value:
                errors.append(f"{locale}: untranslated {group}.{key}: {value!r}")

    src = SOURCE.read_text(encoding="utf-8")
    for literal in FORBIDDEN_SCREENSHOT_LITERALS:
        if literal in src:
            errors.append(f"RacePreparation.tsx still contains screenshot English literal: {literal}")

    required_hooks = [
        'label={racePrepText("screen.date")}',
        'label={racePrepText("screen.route")}',
        'label={racePrepText("screen.profile")}',
        'label={racePrepText("screen.distance")}',
        'racePrepText("screen.stageWeather")',
        'racePrepText("screen.equipmentDefaultFallbackHelp")',
        'racePrepText("screen.stageSaveOnly")',
        'racePrepText("screen.stageSupplyEffects")',
        'racePrepText("screen.stageSupplyEffectsDesc")',
        'racePrepText("screen.enginePreview")',
        'racePrepText("screen.powerGelsSummary"',
        '"All Stage Plans Saved": "screen.allStagePlansSaved"',
        '"Conserve Energy": "tactics.conserveEnergy"',
        '"Fight for KOM Points": "tactics.fightKomPoints"',
        '"Final Sprint": "tactics.finalSprint"',
        'toLocaleUpperCase(locale)',
    ]
    for hook in required_hooks:
        if hook not in src:
            errors.append(f"RacePreparation.tsx missing screenshot localization hook: {hook}")

    if errors:
        print("Race Preparation screenshot localization audit FAILED")
        for error in errors:
            print(" -", error)
        raise SystemExit(1)

    print("Race Preparation screenshot localization audit PASSED")
    print("Locales checked:", ", ".join(LOCALES))
    print("Screenshot screen keys:", len(REQUIRED_SCREEN_KEYS))
    print("Tactic labels:", len(REQUIRED_TACTIC_KEYS))
    print("Month display capitalization: enabled")
    print("Stage Plan hardcoded screenshot strings: removed")


if __name__ == "__main__":
    main()
