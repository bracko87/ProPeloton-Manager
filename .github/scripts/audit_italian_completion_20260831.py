from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
IT_DIR = ROOT / 'src/i18n/locales/it'
PLACEHOLDER = re.compile(r'\{\{[^{}]+\}\}')
CORRUPTION = re.compile(r'(?:\ufffd|Ã|Â|â€|ZXQ|QXml)')
CYRILLIC = re.compile(r'[\u0400-\u04ff]')

PROTECTED = [
    'ProPeloton Manager', 'Startlist', 'Race Engine', 'Replay Engine', 'Team Policy',
    'Race Sharpness', 'WorldTeam', 'WorldTour', 'ProTeam', 'ProSeries', 'Continental',
    'Supabase', 'Stripe', 'Discord', 'Edge Function', 'RPC', 'KPI', 'GC', 'KOM', 'U23',
    'UCI', 'JPG', 'JPEG', 'PNG', 'WEBP', 'PDF', 'CSV', 'Coins', 'Premium', 'FTP',
    'VO2', 'DNF', 'DNS', 'OTL', 'ITT', 'TTT',
]

ALLOWED_IDENTICAL_PATHS = {
    'calendar.json.gameTimeWithWeekday',
    'calendar.json.gameTimeWithoutWeekday',
    'calendarPage.json.dates.compact',
}

BAD_GLOBAL = [
    (re.compile(r'\brazze?\b', re.I), 'race mistranslated as razza'),
    (re.compile(r'\bcavalier[ei]\b', re.I), 'rider mistranslated as horse rider/cavaliere'),
    (re.compile(r'\bagent[ei]\s+gratuit[oi]\b', re.I), 'free agent mistranslated as agente gratuito'),
    (re.compile(r'\brisparmi(?:a|are|ando|ato|ati|ata|ate)\b', re.I), 'Save mistranslated as financial saving'),
    (re.compile(r'\besam[ei]\b', re.I), 'review mistranslated as exam'),
    (re.compile(r'\bpalcoscenic[oi]\b', re.I), 'cycling stage mistranslated as theatre stage'),
    (re.compile(r'\bRace Pready\b', re.I), 'corrupted Race Ready wording'),
]


def phrase(text: str, value: str, *, ignore_case: bool = True) -> bool:
    flags = re.I if ignore_case else 0
    return re.search(rf'(?<!\w){re.escape(value)}(?!\w)', text, flags) is not None


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def walk(source: Any, target: Any, path: str, blockers: list[str], warnings: list[str]) -> None:
    if type(source) is not type(target):
        blockers.append(f'{path}: type mismatch')
        return
    if isinstance(source, dict):
        if list(source) != list(target):
            blockers.append(f'{path}: key/order mismatch')
        for key in source:
            if key in target:
                walk(source[key], target[key], f'{path}.{key}', blockers, warnings)
        return
    if isinstance(source, list):
        if len(source) != len(target):
            blockers.append(f'{path}: list length mismatch')
        for i, (a, b) in enumerate(zip(source, target)):
            walk(a, b, f'{path}[{i}]', blockers, warnings)
        return
    if not isinstance(source, str):
        return

    if sorted(PLACEHOLDER.findall(source)) != sorted(PLACEHOLDER.findall(target)):
        blockers.append(f'{path}: placeholder mismatch')
    if CORRUPTION.search(target):
        blockers.append(f'{path}: encoding/corruption marker: {target!r}')
    if CYRILLIC.search(target):
        blockers.append(f'{path}: Cyrillic text remains: {target!r}')

    if (phrase(source, 'Race Plan') or phrase(source, 'Race Plans')) and not (phrase(target, 'Race Plan') or phrase(target, 'Race Plans')):
        blockers.append(f'{path}: Race Plan vocabulary changed: {target!r}')
    if (phrase(source, 'Stage Plan') or phrase(source, 'Stage Plans')) and not (phrase(target, 'Stage Plan') or phrase(target, 'Stage Plans')):
        blockers.append(f'{path}: Stage Plan vocabulary changed: {target!r}')

    for term in PROTECTED:
        if phrase(source, term) and not phrase(target, term):
            blockers.append(f'{path}: protected term {term!r} changed: {target!r}')

    for pattern, reason in BAD_GLOBAL:
        if pattern.search(target):
            blockers.append(f'{path}: {reason}: {target!r}')
            break

    low_source = source.lower()
    if re.search(r'\briders?\b', low_source) and re.search(r'\bpilot[ai]\b|\bpiloti\b', target, re.I):
        blockers.append(f'{path}: cycling rider rendered as pilota: {target!r}')
    if re.search(r'\bstages?\b', low_source) and re.search(r'\bpalcoscenic[oi]\b', target, re.I):
        blockers.append(f'{path}: cycling stage rendered as theatre stage: {target!r}')
    source_mentions_manager = re.search(r'\bmanagers?\b', low_source) is not None
    source_mentions_admin = re.search(r'\badmins?|administrators?\b', low_source) is not None
    if source_mentions_manager and not source_mentions_admin and re.search(r'\bamministrator[ei]\b', target, re.I):
        blockers.append(f'{path}: game manager rendered as generic administrator: {target!r}')

    if source.strip() == target.strip() and len(source.split()) >= 4 and path not in ALLOWED_IDENTICAL_PATHS:
        if re.search(r'\b(?:the|and|you|your|with|from|this|that|for|are|is|can|will|should|must|please|choose|team|rider|race|stage)\b', source, re.I):
            blockers.append(f'{path}: unchanged English sentence: {source!r}')
        else:
            warnings.append(f'{path}: identical multi-word value, review whether intentional: {source!r}')


def main() -> None:
    blockers: list[str] = []
    warnings: list[str] = []

    en_files = sorted(p.name for p in EN_DIR.glob('*.json'))
    it_files = sorted(p.name for p in IT_DIR.glob('*.json'))
    if en_files != it_files:
        blockers.append(f'Italian locale filenames do not mirror English exactly: en={len(en_files)}, it={len(it_files)}')

    for name in en_files:
        target = IT_DIR / name
        if target.exists():
            walk(load(EN_DIR / name), load(target), name, blockers, warnings)

    languages = (ROOT / 'src/i18n/languages.ts').read_text(encoding='utf-8')
    index = (ROOT / 'src/i18n/index.ts').read_text(encoding='utf-8')
    bridge = (ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx').read_text(encoding='utf-8')
    selector = (ROOT / 'src/components/i18n/LanguageSelector.tsx').read_text(encoding='utf-8')

    for needle in ["code: 'it'", "label: 'Italiano'", "countryCode: 'IT'", "htmlLang: 'it'", "locale: 'it-IT'"]:
        if needle not in languages:
            blockers.append(f'Italian language metadata incomplete: {needle}')
    supported = re.search(r"supportedLngs:\s*\[([^\]]+)\]", index)
    if not supported or not re.search(r"['\"]it['\"]", supported.group(1)):
        blockers.append('Italian missing from supportedLngs')
    if "language?.startsWith('it')" not in bridge or "return 'it-IT'" not in bridge:
        blockers.append('Italian locale date formatting missing')
    if "it: 'it'" not in selector:
        blockers.append('Italian flag mapping missing')

    print(f'English resources: {len(en_files)}')
    print(f'Italian resources: {len(it_files)}')
    print(f'Italian completion blockers: {len(blockers)}')
    for item in blockers[:1500]:
        print('BLOCKER:', item)
    print(f'Italian completion warnings: {len(warnings)}')
    for item in warnings[:500]:
        print('WARNING:', item)

    if blockers:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
