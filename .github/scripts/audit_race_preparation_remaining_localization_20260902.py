#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / "src/pages/dashboard/RacePreparation.tsx"
LANGUAGE_SELECTOR = ROOT / "src/components/i18n/LanguageSelector.tsx"
AUTH_PROVIDER = ROOT / "src/context/AuthProvider.tsx"
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]

NEW_KEYS = {
    "loadPageFailed", "loadSelectedRaceFailed", "choosePlannerDeveloping",
    "selectSportDirector", "maxRidersWarning", "maxStaffWarning",
    "maxAssetsWarning", "raceCanceledWeather", "stageCanceledWeather",
    "developingManagedByU23", "assignSportDirectorFirst", "u23HeadCoach",
    "existingManualViewOnly", "coachPlan", "scheduled", "manualPlan",
    "manualPlanViewOnlyHint", "generatedSavedByCoach",
    "coachWillGenerateAfterStage", "coachWillGenerateStage1",
    "managedViewOnlySwitch", "u23Schedule", "checkingStagePlans",
    "stagePlanReadiness", "u23ReadinessIntro", "stagePlanReadinessPending",
    "generatedStages", "scheduledCount", "existingManualCount",
    "loadingU23Status", "existingManualPlan", "managedByU23",
    "u23AutomationActiveTitle", "manualPlanViewOnlyBody", "generatedThisPlan",
    "adaptedAfterStage", "manualViewOnlyPeriod", "generatedAutomatically",
    "generatedAfterStage", "generatedImmediately",
}

FORBIDDEN_LITERALS = [
    'title="Race Plan Bonus Preview"',
    'Race staff, race assets, and team policies are converted into these',
    'Starting freshness combines fatigue and race sharpness',
    '"Race Plan quote refreshed."',
    '"Race Plan saved."',
    '"Race Plan submitted successfully."',
    '"Choose either a Sport Director or a U23 Head Coach."',
    '"Select a Sport Director."',
    'Maximum riders allowed:',
    'Maximum race staff slots:',
    'Maximum race asset slots:',
    '"Existing manual plan · view only"',
    '"Coach plan"',
    '"Manual plan"',
    '"U23 Head Coach Stage Plan schedule"',
    '"Checking Stage Plans…"',
    '"Stage Plan readiness"',
    '"Loading U23 Head Coach status…"',
    '"Managed by U23 Head Coach"',
    '"U23 Head Coach automation active"',
    '"Generated automatically by the U23 Head Coach."',
    '"Generated immediately when U23 automation is activated."',
]


def load_locale(locale: str) -> dict:
    path = ROOT / "src/i18n/locales" / locale / "racePreparation.json"
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    errors: list[str] = []
    resources = {locale: load_locale(locale) for locale in LOCALES}
    en_screen = resources["en"].get("screen")
    if not isinstance(en_screen, dict):
        raise SystemExit("English racePreparation.screen missing")

    en_keys = set(en_screen)
    for locale in LOCALES:
        screen = resources[locale].get("screen")
        if not isinstance(screen, dict):
            errors.append(f"{locale}: screen object missing")
            continue

        locale_keys = set(screen)
        if locale_keys != en_keys:
            errors.append(
                f"{locale}: screen key mismatch missing={sorted(en_keys-locale_keys)} "
                f"extra={sorted(locale_keys-en_keys)}"
            )

        for key in NEW_KEYS:
            value = screen.get(key)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{locale}: empty/missing screen.{key}")

        if locale != "en":
            for key in NEW_KEYS:
                value = str(screen.get(key, "")).strip()
                en_value = str(en_screen.get(key, "")).strip()
                # Longer user-facing strings should not silently fall back to English.
                if value == en_value and len(en_value) >= 8:
                    errors.append(f"{locale}: untranslated screen.{key}: {value!r}")

        locale_errors = resources[locale].get("errors")
        if not isinstance(locale_errors, dict):
            errors.append(f"{locale}: errors object missing")
        else:
            for key in ("submittedNoU23", "submittedU23GenerateFailed"):
                if not str(locale_errors.get(key, "")).strip():
                    errors.append(f"{locale}: missing errors.{key}")

    src = COMPONENT.read_text(encoding="utf-8")
    for literal in FORBIDDEN_LITERALS:
        if literal in src:
            errors.append(f"RacePreparation.tsx still contains English literal: {literal}")

    required_component_hooks = [
        'racePrepText("screen.bonusTitle")',
        'racePrepText("screen.bonusDescription")',
        'racePrepText("screen.startingFreshnessHelp")',
        'racePrepText("racePlan.quoteRefreshed")',
        'racePrepText("racePlan.saved")',
        'racePrepText("errors.selectRidersSubmit"',
        'racePrepText("screen.u23Schedule")',
        'racePrepText("screen.generatedStages"',
        'localizeRacePrepBackendText(stagePlanReadinessSummary.readiness_label)',
        'localizeRacePrepBackendText(stagePlanReadinessSummary.recommended_action)',
    ]
    for hook in required_component_hooks:
        if hook not in src:
            errors.append(f"RacePreparation.tsx missing localization hook: {hook}")

    selector = LANGUAGE_SELECTOR.read_text(encoding="utf-8")
    auth = AUTH_PROVIDER.read_text(encoding="utf-8")
    for required in [
        "ppm_language_handoff",
        "sessionStorage.setItem(LANGUAGE_HANDOFF_KEY, language)",
        "changeApplicationLanguage(language)",
    ]:
        if required not in selector:
            errors.append(f"LanguageSelector handoff missing: {required}")

    for required in [
        "ppm_language_handoff",
        "getPendingLanguageHandoff()",
        ".update({ preferred_language: handoffLanguage })",
        "clearPendingLanguageHandoff()",
    ]:
        if required not in auth:
            errors.append(f"AuthProvider handoff missing: {required}")

    if errors:
        print("Final Race Preparation / language handoff audit FAILED")
        for error in errors:
            print(" -", error)
        raise SystemExit(1)

    print("Final Race Preparation / language handoff audit PASSED")
    print("Locales checked:", ", ".join(LOCALES))
    print("Race Preparation screen keys:", len(en_keys))
    print("New final-audit keys:", len(NEW_KEYS))
    print("Login language handoff: present")


if __name__ == "__main__":
    main()
