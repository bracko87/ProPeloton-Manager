from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN = ROOT / 'src/i18n/locales/en'
RU = ROOT / 'src/i18n/locales/ru'

BLOCK_PATTERNS = [
    (re.compile(r'\bвсадник(?:а|у|ом|е|и|ов|ами|ах)?\b', re.I), 'horse-rider wording'),
    (re.compile(r'\bрайдер(?:а|у|ом|е|ы|ов|ами|ах)?\b', re.I), 'anglicism райдер'),
    (re.compile(r'\bраса(?:х|ми|м|ы)?\b', re.I), 'race translated as раса'),
    (re.compile(r'\bсцен(?:а|ы|е|у|ой|ах|ами)\b', re.I), 'stage translated as scene'),
    (re.compile(r'\bстади(?:я|и|ю|ей|ях|ями)\b', re.I), 'stage translated as generic стадия'),
    (re.compile(r'\bсвободн(?:ый|ые|ого|ых)\s+агент', re.I), 'free-agent wording should be свободный гонщик'),
    (re.compile(r'\bтренировочн(?:ый|ого|ом|ые|ых)\s+лагер', re.I), 'Training Camp should use тренировочный сбор'),
]

VISIBLE_EXPECTED = {
    'home.json.header.signIn': 'Войти',
    'home.json.hero.titleLine1': 'Создайте свою велосипедную легенду.',
    'home.json.hero.titleLine2': 'Управляйте командой.',
    'home.json.hero.titleLine3': 'Доминируйте в сезоне.',
    'home.json.stats.activeManagers': 'Активные менеджеры',
    'common.json.language.applicationLanguage': 'Язык приложения',
    'common.json.actions.save': 'Сохранить',
    'common.json.actions.cancel': 'Отмена',
    'profile.json.dropdown.signedInAs': 'Вы вошли как',
    'navigation.json.subtitle': 'Многопользовательский веломенеджер',
    'accountPages.json.profile.languageTitle': 'Язык игры',
    'accountPages.json.profile.languageSelect': 'Выберите язык',
}

PROTECTED = [
    'ProPeloton Manager', 'Next Quest Studio', 'Startlist', 'Race Engine', 'Replay Engine',
    'Team Policy', 'Race Sharpness', 'Race Plans', 'Race Plan', 'Stage Plans', 'Stage Plan',
    'WorldTeam', 'WorldTour', 'ProTeam', 'ProSeries', 'Continental', 'Supabase',
    'Stripe', 'Discord', 'Edge Function', 'RPC', 'KPI', 'GC', 'KOM', 'U23', 'UCI',
    'Coins', 'Premium', 'FTP', 'VO2', 'DNF', 'DNS', 'OTL', 'ITT', 'TTT', 'JPG',
    'JPEG', 'PNG', 'WEBP', 'PDF', 'CSV',
]


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def get_path(data: Any, dotted: str) -> Any:
    cursor = data
    for token in dotted.split('.'):
        cursor = cursor[token]
    return cursor


def walk(source: Any, target: Any, path: str, blockers: list[str]) -> None:
    if isinstance(source, dict) and isinstance(target, dict):
        for key in source:
            if key in target:
                walk(source[key], target[key], f'{path}.{key}' if path else key, blockers)
        return
    if isinstance(source, list) and isinstance(target, list):
        for i, (a, b) in enumerate(zip(source, target)):
            walk(a, b, f'{path}[{i}]', blockers)
        return
    if not isinstance(source, str) or not isinstance(target, str):
        return

    semantic = target
    for term in sorted(PROTECTED, key=len, reverse=True):
        semantic = re.sub(rf'(?<!\w){re.escape(term)}(?!\w)', ' ', semantic, flags=re.I)

    for pattern, reason in BLOCK_PATTERNS:
        if pattern.search(semantic):
            low = source.lower()
            if 'horse-rider' in reason or 'райдер' in reason:
                if not re.search(r'\briders?\b', low):
                    continue
            if 'race translated' in reason:
                if not re.search(r'\braces?\b', low):
                    continue
            if 'stage translated' in reason:
                if not re.search(r'\bstages?\b', low):
                    continue
            if 'free-agent' in reason:
                if not re.search(r'\bfree agents?\b', low):
                    continue
            if 'Training Camp' in reason:
                if 'training camp' not in low:
                    continue
            blockers.append(f'{path}: {reason}: {target!r}')
            break

    # High-confidence untranslated UI fragments outside protected vocabulary.
    if re.search(r'\b(?:Loading|Saving|Cancel|Close|Continue|Confirm|Previous|Next|Rider|Riders|Team|Teams|Race|Races|Stage|Stages)\b', semantic):
        blockers.append(f'{path}: visible English UI fragment remains: {target!r}')


def main() -> None:
    blockers: list[str] = []
    files = sorted(RU.glob('*.json'))
    for ru_path in files:
        en_path = EN / ru_path.name
        if not en_path.exists():
            continue
        walk(load(en_path), load(ru_path), ru_path.name, blockers)

    cache: dict[str, Any] = {}
    for full_path, expected in VISIBLE_EXPECTED.items():
        file_name, dotted = full_path.split('.json.', 1)
        file_name += '.json'
        if file_name not in cache:
            cache[file_name] = load(RU / file_name)
        actual = get_path(cache[file_name], dotted)
        if actual != expected:
            blockers.append(f'{full_path}: expected polished visible wording {expected!r}, got {actual!r}')

    print(f'Russian human-quality files checked: {len(files)}')
    print(f'Russian human-quality blockers: {len(blockers)}')
    for item in blockers[:1000]:
        print('BLOCKER:', item)
    if blockers:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
