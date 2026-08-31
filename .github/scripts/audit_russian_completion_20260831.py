from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
RU_DIR = ROOT / 'src/i18n/locales/ru'
PLACEHOLDER = re.compile(r'\{\{[^{}]+\}\}')
CORRUPTION = re.compile(r'(?:\ufffd|Ã.|â€|ZXQ|QXml)')
CYRILLIC = re.compile(r'[А-Яа-яЁё]')

PROTECTED = [
    'ProPeloton Manager', 'Startlist', 'Race Engine', 'Replay Engine', 'Team Policy',
    'Race Sharpness', 'Race Plans', 'Race Plan', 'Stage Plans', 'Stage Plan',
    'WorldTeam', 'WorldTour', 'ProTeam', 'ProSeries', 'Continental', 'Supabase',
    'Stripe', 'Discord', 'Edge Function', 'RPC', 'KPI', 'GC', 'KOM', 'U23', 'UCI',
    'Coins', 'Premium', 'FTP', 'VO2', 'DNF', 'DNS', 'OTL', 'ITT', 'TTT', 'JPG',
    'JPEG', 'PNG', 'WEBP', 'PDF', 'CSV',
]

ALLOWED_IDENTICAL_PATHS = {
    'calendar.json.gameTimeWithWeekday',
    'calendar.json.gameTimeWithoutWeekday',
    'calendarPage.json.dates.compact',
}

BAD_GLOBAL = [
    (re.compile(r'\bвсадник(?:а|у|ом|е|и|ов|ами|ах)?\b', re.I), 'cycling rider mistranslated as horse rider'),
    (re.compile(r'\bрайдер(?:а|у|ом|е|ы|ов|ами|ах)?\b', re.I), 'cycling rider left as anglicism райдер'),
    (re.compile(r'\bраса(?:х|ми|м|ы)?\b', re.I), 'cycling race mistranslated as biological race'),
    (re.compile(r'\bсцен(?:а|ы|е|у|ой|ах|ами)\b', re.I), 'cycling stage mistranslated as scene'),
    (re.compile(r'\bстади(?:я|и|ю|ей|ях|ями)\b', re.I), 'cycling stage mistranslated as generic stage/stadium-like wording'),
    (re.compile(r'\bсвободн(?:ый|ые|ого|ых)\s+агент', re.I), 'free agent should use свободный гонщик terminology'),
]


def phrase(text: str, value: str) -> bool:
    return re.search(rf'(?<!\w){re.escape(value)}(?!\w)', text, re.I) is not None


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def strip_nonsemantic(text: str) -> str:
    out = PLACEHOLDER.sub(' ', text)
    for term in sorted(PROTECTED, key=len, reverse=True):
        out = re.sub(rf'(?<!\w){re.escape(term)}(?!\w)', ' ', out, flags=re.I)
    return out


def walk(source: Any, target: Any, path: str, blockers: list[str], warnings: list[str], stats: dict[str, int]) -> None:
    if type(source) is not type(target):
        blockers.append(f'{path}: type mismatch')
        return
    if isinstance(source, dict):
        if list(source) != list(target): blockers.append(f'{path}: key/order mismatch')
        for key in source:
            if key in target: walk(source[key], target[key], f'{path}.{key}', blockers, warnings, stats)
        return
    if isinstance(source, list):
        if len(source) != len(target): blockers.append(f'{path}: list length mismatch')
        for i, (a, b) in enumerate(zip(source, target)): walk(a, b, f'{path}[{i}]', blockers, warnings, stats)
        return
    if not isinstance(source, str): return

    stats['strings'] += 1
    if CYRILLIC.search(target): stats['cyrillic'] += 1
    if sorted(PLACEHOLDER.findall(source)) != sorted(PLACEHOLDER.findall(target)):
        blockers.append(f'{path}: placeholder mismatch')
    if CORRUPTION.search(target): blockers.append(f'{path}: encoding/corruption marker: {target!r}')

    for term in PROTECTED:
        if phrase(source, term) and not phrase(target, term):
            blockers.append(f'{path}: protected term {term!r} changed: {target!r}')

    semantic_target = strip_nonsemantic(target)
    semantic_source = strip_nonsemantic(source)
    low_source = source.lower()

    for pattern, reason in BAD_GLOBAL:
        if not pattern.search(semantic_target): continue
        if ('rider' in reason or 'райдер' in reason) and not re.search(r'\briders?\b', low_source): continue
        if 'race' in reason and not re.search(r'\braces?\b', low_source): continue
        if 'stage' in reason and not re.search(r'\bstages?\b', low_source): continue
        if 'free agent' in reason and not re.search(r'\bfree agents?\b', low_source): continue
        blockers.append(f'{path}: {reason}: {target!r}')
        break

    if re.search(r'\btime trial\b', low_source):
        if re.search(r'\bиспытани[ея]\s+временем\b|\bгонка\s+на\s+время\b', semantic_target, re.I):
            blockers.append(f'{path}: time trial should use гонка с раздельным стартом wording: {target!r}')
    if re.search(r'\bsav(?:e|es|ed|ing)\b', low_source) and re.search(r'\bэконом(?:ить|ия|ьте)\b', semantic_target, re.I):
        blockers.append(f'{path}: Save rendered as financial saving instead of Сохранить: {target!r}')

    if source.strip() == target.strip() and len(source.split()) >= 4 and path not in ALLOWED_IDENTICAL_PATHS:
        if re.search(r'\b(?:the|and|you|your|with|from|this|that|for|are|is|can|will|should|must|please|choose|team|rider|race|stage|save|loading|open|close)\b', semantic_source, re.I):
            blockers.append(f'{path}: unchanged English sentence: {source!r}')
        elif semantic_source.strip(' &/·–—-.,:()'):
            warnings.append(f'{path}: identical multi-word value, review whether intentional: {source!r}')


def main() -> None:
    blockers: list[str] = []
    warnings: list[str] = []
    stats = {'strings': 0, 'cyrillic': 0}
    en_files = sorted(p.name for p in EN_DIR.glob('*.json'))
    ru_files = sorted(p.name for p in RU_DIR.glob('*.json'))
    if en_files != ru_files:
        blockers.append(f'Russian locale filenames do not mirror English exactly: en={len(en_files)}, ru={len(ru_files)}')
    for name in en_files:
        target = RU_DIR / name
        if target.exists(): walk(load(EN_DIR / name), load(target), name, blockers, warnings, stats)

    languages = (ROOT / 'src/i18n/languages.ts').read_text(encoding='utf-8')
    index = (ROOT / 'src/i18n/index.ts').read_text(encoding='utf-8')
    bridge = (ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx').read_text(encoding='utf-8')
    selector = (ROOT / 'src/components/i18n/LanguageSelector.tsx').read_text(encoding='utf-8')
    for needle in ["code: 'ru'", "label: 'Русский'", "flag: '🇷🇺'", "countryCode: 'RU'", "htmlLang: 'ru'", "locale: 'ru-RU'"]:
        if needle not in languages: blockers.append(f'Russian language metadata incomplete: {needle}')
    supported = re.search(r"supportedLngs:\s*\[([^\]]+)\]", index)
    if not supported or not re.search(r"['\"]ru['\"]", supported.group(1)): blockers.append('Russian missing from supportedLngs')
    if "language?.startsWith('ru')" not in bridge or "return 'ru-RU'" not in bridge: blockers.append('Russian locale date formatting missing')
    if "ru: 'ru'" not in selector: blockers.append('Russian flag mapping missing')
    if stats['cyrillic'] < 100:
        blockers.append(f'Russian package contains too little Cyrillic text: {stats["cyrillic"]} strings')

    print(f'English resources: {len(en_files)}')
    print(f'Russian resources: {len(ru_files)}')
    print(f'Russian strings checked: {stats["strings"]}')
    print(f'Russian strings containing Cyrillic: {stats["cyrillic"]}')
    print(f'Russian completion blockers: {len(blockers)}')
    for item in blockers[:1500]: print('BLOCKER:', item)
    print(f'Russian completion warnings: {len(warnings)}')
    for item in warnings[:500]: print('WARNING:', item)
    if blockers: raise SystemExit(1)


if __name__ == '__main__':
    main()
