from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
DE_DIR = ROOT / 'src/i18n/locales/de'

POLISHED_BASE = {
    'common.json', 'auth.json', 'calendarPage.json', 'navigation.json', 'home.json',
    'overview.json', 'squad.json', 'developingTeam.json', 'racePreparation.json',
    'raceDetail.json', 'training.json', 'equipment.json', 'infrastructure.json',
}
TARGET_FILES = {
    'accountPages.json', 'appShell.json', 'calendar.json', 'club.json', 'createClub.json',
    'customizeTeam.json', 'finance.json', 'help.json', 'manual.json', 'manualCore.json',
    'manualDeepA.json', 'manualDeepB1.json', 'manualDeepB2.json', 'manualDynamic.json',
    'manualFaq.json', 'manualLegacyDynamic.json', 'notifications.json', 'preferences.json',
    'preferencesDynamic.json', 'proPackages.json', 'profile.json', 'publicInfo.json',
    'riderProfile.json', 'scouting.json', 'seasonReset.json', 'sharedRiderModal.json',
    'staff.json', 'statistics.json', 'teamRanking.json', 'transfers.json', 'tutorials.json',
}

PROTECTED_TERMS = {
    'ProPeloton Manager', 'Race Plan', 'Race Plans', 'Stage Plan', 'Stage Plans', 'Startlist',
    'Race Engine', 'Replay Engine', 'Race Sharpness', 'WorldTeam', 'WorldTour', 'ProTeam',
    'ProSeries', 'Continental', 'Supabase', 'Stripe', 'Discord', 'RPC', 'KPI', 'GC', 'KOM',
    'U23', 'UCI', 'Coins', 'Premium',
}

BAD_PATTERNS = {
    r'\bJahreszeiten?\b': 'game season must be Saison',
    r'\bSchulungslager\b': 'training camp must be Trainingslager',
    r'\bPfadfinder(?:n|s)?\b': 'scouting context must use Scout/Scouting',
    r'\bRassen?\b': 'race must be Rennen',
    r'\bReiter(?:in(?:nen)?|n|s)?\b': 'rider must be Fahrer',
    r'\bBühnen?\b': 'stage must be Etappe',
    r'\bÜbertragungsgebühr\b': 'transfer fee must be Ablösesumme',
    r'\bSignierbonus\b': 'signing bonus must use natural contract terminology',
    r'\bHauptfach\b': 'principal was translated as academic major',
    r'\bVertragsglück\b': 'contract happiness is unnatural literal German',
    r'\bSaisonbeschäftigte\b': 'seasonal cost was mistranslated as seasonal workers',
    r'\bVermißt\b': 'missed status must not be Vermißt',
    r'\bFahrrad-Vermächtnis\b': 'bad product/cycling translation',
    r'\bIch unterschreibe\b': 'bad sign-in translation',
    r'L 347 vom': 'unrelated legal citation',
    r'Ich lege eine Bar': 'bad hover instruction',
    r'kostenlose Vermittlung von Agenten': 'free agent mistranslation',
}

INFORMAL = re.compile(r'\b(?:du|dich|dir|dein|deine|deinen|deinem|deiner|deines)\b', re.IGNORECASE)
CYRILLIC = re.compile(r'[\u0400-\u04ff]')
PLACEHOLDER = re.compile(r'\{\{[^{}]+\}\}')

CRITICAL_EXACT = {
    'Season': {'Saison'},
    'Seasons': {'Saisons'},
    'Race': {'Rennen'},
    'Races': {'Rennen'},
    'Stage': {'Etappe'},
    'Stages': {'Etappen'},
    'Rider': {'Fahrer'},
    'Riders': {'Fahrer'},
    'Training Camp': {'Trainingslager'},
    'Training Camps': {'Trainingslager'},
    'Sponsor': {'Sponsor'},
    'Main Sponsor': {'Hauptsponsor'},
    'General Classification': {'Gesamtwertung'},
    'Mountain Classification': {'Bergwertung'},
    'Team Ranking': {'Team-Rangliste', 'Teamrangliste'},
}


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def shape(source: Any, target: Any, path: str, problems: list[str]) -> None:
    if type(source) is not type(target):
        problems.append(f'{path}: type mismatch')
        return
    if isinstance(source, dict):
        if list(source) != list(target):
            problems.append(f'{path}: keys/order mismatch')
        for key in source:
            if key in target:
                shape(source[key], target[key], f'{path}.{key}', problems)
    elif isinstance(source, list):
        if len(source) != len(target):
            problems.append(f'{path}: list length mismatch')
        for index, (left, right) in enumerate(zip(source, target)):
            shape(left, right, f'{path}[{index}]', problems)
    elif isinstance(source, str):
        if sorted(PLACEHOLDER.findall(source)) != sorted(PLACEHOLDER.findall(target)):
            problems.append(f'{path}: placeholders changed')


def pairs(source: Any, target: Any, path: str):
    if isinstance(source, dict):
        for key in source:
            if key in target:
                yield from pairs(source[key], target[key], f'{path}.{key}')
    elif isinstance(source, list):
        for index, (left, right) in enumerate(zip(source, target)):
            yield from pairs(left, right, f'{path}[{index}]')
    elif isinstance(source, str):
        yield path, source, target


def main() -> None:
    en_files = sorted(p.name for p in EN_DIR.glob('*.json'))
    de_files = sorted(p.name for p in DE_DIR.glob('*.json'))
    problems: list[str] = []
    warnings: list[str] = []

    if en_files != de_files:
        problems.append('German locale filenames must mirror English exactly')
    if POLISHED_BASE | TARGET_FILES != set(en_files):
        problems.append('German audit coverage does not account for every English locale file')

    for name in en_files:
        source = load(EN_DIR / name)
        target = load(DE_DIR / name)
        shape(source, target, name, problems)

        for path, src, dst in pairs(source, target, name):
            if not isinstance(dst, str):
                continue
            if CYRILLIC.search(dst):
                problems.append(f'{path}: Cyrillic/Serbian script remains: {dst!r}')
            if INFORMAL.search(dst):
                problems.append(f'{path}: informal German tone; game uses Sie/Ihr: {dst!r}')
            for marker in ('�', 'Ã', 'Â', 'ZXQ', 'QXml'):
                if marker in dst:
                    problems.append(f'{path}: corrupt text marker {marker!r}: {dst!r}')
            for pattern, reason in BAD_PATTERNS.items():
                if re.search(pattern, dst, re.IGNORECASE):
                    problems.append(f'{path}: {reason}: {dst!r}')
            for term in PROTECTED_TERMS:
                if re.search(rf'(?<!\w){re.escape(term)}(?!\w)', src) and not re.search(rf'(?<!\w){re.escape(term)}(?!\w)', dst):
                    problems.append(f'{path}: protected game term lost: {term}')

            stripped_src = src.strip()
            stripped_dst = dst.strip()
            if stripped_src in CRITICAL_EXACT and stripped_dst not in CRITICAL_EXACT[stripped_src]:
                problems.append(
                    f'{path}: critical game term {stripped_src!r} -> {stripped_dst!r}; '
                    f'expected one of {sorted(CRITICAL_EXACT[stripped_src])}'
                )

            if name in TARGET_FILES and src == dst and len(src) >= 38 and len(src.split()) >= 7:
                if not any(term in src for term in PROTECTED_TERMS):
                    problems.append(f'{path}: likely untranslated English: {src!r}')
            elif name in TARGET_FILES and src == dst and len(src) >= 18 and len(src.split()) >= 3:
                if not any(term in src for term in PROTECTED_TERMS):
                    warnings.append(f'{path}: review unchanged text: {src!r}')

    if warnings:
        print(f'German semantic review warnings: {len(warnings)}')
        for item in warnings[:80]:
            print('WARNING:', item)

    if problems:
        raise SystemExit('German localization audit failed:\n' + '\n'.join(problems[:200]))

    print(f'German localization audit passed: {len(en_files)} files, {len(TARGET_FILES)} newly reviewed resources.')


if __name__ == '__main__':
    main()
