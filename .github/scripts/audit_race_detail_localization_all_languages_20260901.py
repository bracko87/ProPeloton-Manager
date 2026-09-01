#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / 'src/pages/dashboard/RaceDetailPage.tsx'
LOCALES = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']
REQUIRED_KEYS = [
    'summary.raceDate', 'summary.raceDates', 'status.missedStartlist',
    'application.alreadySubmittedWaitingReview', 'application.submittedSuccess',
    'application.cancelledSuccess', 'application.applyFailed', 'application.cancelFailed',
    'application.previewLoadFailed', 'application.chanceVeryLow', 'application.chanceLow',
    'application.chanceMedium', 'application.chanceHigh', 'application.chanceVeryHigh',
    'application.competitionLow', 'application.competitionMedium', 'application.competitionHigh',
    'stage.start', 'stage.finish', 'stage.intermediateSprint', 'stage.bonusSprint',
    'stage.profileSprinter', 'stage.profilePuncheur', 'stage.profileClimber',
    'stage.profileAllRounder', 'stage.profileTimeTrialist', 'stage.localizedProfileSummary',
]


def get_path(data: dict, dotted: str):
    node = data
    for part in dotted.split('.'):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node

text = COMPONENT.read_text(encoding='utf-8')

forbidden = [
    "{isExpanded ? 'Hide' : 'Show'}",
    "{profile.terrain_type ? humanizeCode(profile.terrain_type) : '—'}",
    "{profile.profile_type ? humanizeCode(profile.profile_type) : '—'}",
    "{profile.stage_summary}",
    "{quote.chance_label ?? t('application.applicationEstimate')}",
    "{applicationQuote.chance_label ?? t('application.estimatedChance')}",
    "{applicationQuote.competition_pressure_label ?? t('application.competitionPressure')}",
    "setApplicationActionMessage(result.message ?? 'Application submitted.')",
    "setApplicationActionMessage(result.message ?? 'Application cancelled.')",
    "<div className=\"font-semibold text-slate-950\">🏁 Finish sprint</div>",
]
for needle in forbidden:
    if needle in text:
        raise SystemExit(f'Race Detail still contains forbidden localization bypass: {needle}')

required_component_tokens = [
    "if (language.startsWith('de')) return 'de-DE'",
    "if (language.startsWith('hr')) return 'hr-HR'",
    "if (language.startsWith('es')) return 'es-ES'",
    "if (language.startsWith('it')) return 'it-IT'",
    "if (language.startsWith('fr')) return 'fr-FR'",
    "if (language.startsWith('ru')) return 'ru-RU'",
    'getLocalizedStageSummary(profile)',
    'getLocalizedTerrainLabel(profile.terrain_type)',
    'getLocalizedRiderProfileLabel(profile.profile_type)',
    'getLocalizedApplicationChanceLabel(applicationQuote.chance_label)',
    'getLocalizedCompetitionPressure(applicationQuote.competition_pressure_label)',
    'getLocalizedApplicationChanceSummary(applicationQuote.chance_summary)',
    "t('participants.hide')",
    "t('participants.show')",
]
for needle in required_component_tokens:
    if needle not in text:
        raise SystemExit(f'Race Detail missing required localization path: {needle}')

english = json.loads((ROOT / 'src/i18n/locales/en/raceDetail.json').read_text(encoding='utf-8'))
for locale in LOCALES:
    path = ROOT / 'src/i18n/locales' / locale / 'raceDetail.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    for key in REQUIRED_KEYS:
        value = get_path(data, key)
        if not isinstance(value, str) or not value.strip():
            raise SystemExit(f'[{locale}] missing/empty raceDetail key: {key}')

    if locale != 'en':
        for key in [
            'summary.raceDate', 'application.alreadySubmittedWaitingReview',
            'application.chanceMedium', 'stage.finish', 'stage.profileClimber',
            'stage.localizedProfileSummary',
        ]:
            if get_path(data, key) == get_path(english, key):
                raise SystemExit(f'[{locale}] untranslated Race Detail value: {key}')

# Extra guard for the exact visible machine-translation leaks that prompted this fix.
for locale, forbidden_values in {
    'fr': {'stage.hilly': 'Hilly'},
    'it': {'stage.hilly': 'Hilly'},
    'ru': {'stage.hilly': 'Хили'},
}.items():
    data = json.loads((ROOT / 'src/i18n/locales' / locale / 'raceDetail.json').read_text(encoding='utf-8'))
    for key, bad in forbidden_values.items():
        if get_path(data, key) == bad:
            raise SystemExit(f'[{locale}] stale visible Race Detail translation: {key}={bad}')

print('Race Detail localization audit: OK')
print('Languages checked:', ', '.join(LOCALES))
print('Coverage: status badges, dates, show/hide, application feedback, chance labels, terrain/profile, markers, stage narrative')
