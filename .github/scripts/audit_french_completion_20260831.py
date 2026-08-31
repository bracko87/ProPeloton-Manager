from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
FR_DIR = ROOT / 'src/i18n/locales/fr'
PLACEHOLDER = re.compile(r'\{\{[^{}]+\}\}')
CORRUPTION = re.compile(r'(?:\ufffd|Ã|Â|â€|ZXQ|QXml)')
CYRILLIC = re.compile(r'[\u0400-\u04ff]')

PROTECTED = [
    'ProPeloton Manager', 'Startlist', 'Race Engine', 'Replay Engine', 'Team Policy',
    'Race Sharpness', 'Race Plans', 'Race Plan', 'Stage Plans', 'Stage Plan',
    'WorldTeam', 'WorldTour', 'ProTeam', 'ProSeries', 'Continental', 'Supabase',
    'Discord', 'Edge Function', 'RPC', 'KPI', 'GC', 'KOM', 'U23', 'UCI', 'Coins',
    'Premium', 'FTP', 'VO2', 'DNF', 'DNS', 'OTL', 'ITT', 'TTT', 'JPG', 'JPEG',
    'PNG', 'WEBP', 'PDF', 'CSV',
]

ALLOWED_IDENTICAL_PATHS = {
    'calendar.json.gameTimeWithWeekday',
    'calendar.json.gameTimeWithoutWeekday',
    'calendarPage.json.dates.compact',
}

BAD_GLOBAL = [
    (re.compile(r'\bcavalier(?:s|e|es)?\b', re.I), 'rider mistranslated as horse rider/cavalier'),
    (re.compile(r'\bpilote(?:s)?\b', re.I), 'cycling rider rendered as pilote'),
    (re.compile(r'\bagent(?:s)?\s+gratuit(?:s|e|es)?\b', re.I), 'free agent mistranslated as agent gratuit'),
    (re.compile(r'\bscène(?:s)?\b', re.I), 'cycling stage mistranslated as theatre scene'),
    (re.compile(r'\bétage(?:s)?\b', re.I), 'cycling stage mistranslated as building floor'),
    (re.compile(r'\béconomis(?:er|e|ez|ons|ent|é|ée|és|ées|ant)\b', re.I), 'Save mistranslated as financial saving'),
]


def phrase(text: str, value: str, *, ignore_case: bool = True) -> bool:
    flags = re.I if ignore_case else 0
    return re.search(rf'(?<!\w){re.escape(value)}(?!\w)', text, flags) is not None


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def strip_protected(text: str) -> str:
    out = text
    for term in sorted(PROTECTED, key=len, reverse=True):
        out = re.sub(rf'(?<!\w){re.escape(term)}(?!\w)', ' ', out, flags=re.I)
    return out


def stripe_is_product_context(source: str) -> bool:
    return bool(re.search(r'\bStripe\b', source) and re.search(r'\b(?:payment|billing|checkout|webhook|subscription|invoice)\b', source, re.I))


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

    for term in PROTECTED:
        if phrase(source, term) and not phrase(target, term):
            blockers.append(f'{path}: protected term {term!r} changed: {target!r}')
    if stripe_is_product_context(source) and not phrase(target, 'Stripe'):
        blockers.append(f'{path}: protected product term Stripe changed: {target!r}')

    semantic_target = strip_protected(target)
    low_source = source.lower()

    for pattern, reason in BAD_GLOBAL:
        if pattern.search(semantic_target):
            if 'cavalier' in reason or 'pilote' in reason:
                if not re.search(r'\briders?\b', low_source):
                    continue
            if 'stage' in reason:
                if not re.search(r'\bstages?\b', low_source):
                    continue
            if 'free agent' in reason:
                if not re.search(r'\bfree agents?\b', low_source):
                    continue
            if 'Save' in reason:
                if not re.search(r'\bsav(?:e|es|ed|ing)\b', low_source):
                    continue
            blockers.append(f'{path}: {reason}: {target!r}')
            break

    if re.search(r'\briders?\b', low_source) and re.search(r'\bcavalier(?:s|e|es)?\b|\bpilote(?:s)?\b', semantic_target, re.I):
        blockers.append(f'{path}: cycling rider terminology must use coureur/coureurs: {target!r}')

    if re.search(r'\braces?\b', low_source):
        # French cycling uses course/course(s), not the English/French breed word race.
        if re.search(r'(?<!\w)races?(?!\w)', semantic_target, re.I):
            blockers.append(f'{path}: cycling race left/mistranslated as race instead of course: {target!r}')

    if re.search(r'\bstages?\b', low_source):
        if re.search(r'\bscène(?:s)?\b|\bétage(?:s)?\b', semantic_target, re.I):
            blockers.append(f'{path}: cycling stage must use étape/étapes: {target!r}')

    if re.search(r'\btime trial\b', low_source) and not phrase(target, 'ITT') and not phrase(target, 'TTT'):
        if re.search(r'\bessai(?:s)?\s+(?:de\s+)?temps\b|\bcontre\s+le\s+temps\b', semantic_target, re.I):
            blockers.append(f'{path}: time trial should use contre-la-montre: {target!r}')

    source_mentions_manager = re.search(r'\bmanagers?\b', low_source) is not None
    source_mentions_admin = re.search(r'\badmins?|administrators?\b', low_source) is not None
    if source_mentions_manager and not source_mentions_admin and re.search(r'\badministrateur(?:s|rice|rices)?\b', semantic_target, re.I):
        blockers.append(f'{path}: game manager rendered as generic administrator: {target!r}')

    if source.strip() == target.strip() and len(source.split()) >= 4 and path not in ALLOWED_IDENTICAL_PATHS:
        residual = strip_protected(source)
        if re.search(r'\b(?:the|and|you|your|with|from|this|that|for|are|is|can|will|should|must|please|choose|team|rider|race|stage|save|loading|open|close)\b', residual, re.I):
            blockers.append(f'{path}: unchanged English sentence: {source!r}')
        elif residual.strip(' &/·–—-.,:()'):
            warnings.append(f'{path}: identical multi-word value, review whether intentional: {source!r}')


def main() -> None:
    blockers: list[str] = []
    warnings: list[str] = []

    en_files = sorted(p.name for p in EN_DIR.glob('*.json'))
    fr_files = sorted(p.name for p in FR_DIR.glob('*.json'))
    if en_files != fr_files:
        blockers.append(f'French locale filenames do not mirror English exactly: en={len(en_files)}, fr={len(fr_files)}')

    for name in en_files:
        target = FR_DIR / name
        if target.exists():
            walk(load(EN_DIR / name), load(target), name, blockers, warnings)

    languages = (ROOT / 'src/i18n/languages.ts').read_text(encoding='utf-8')
    index = (ROOT / 'src/i18n/index.ts').read_text(encoding='utf-8')
    bridge = (ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx').read_text(encoding='utf-8')
    selector = (ROOT / 'src/components/i18n/LanguageSelector.tsx').read_text(encoding='utf-8')

    for needle in ["code: 'fr'", "label: 'Français'", "flag: '🇫🇷'", "countryCode: 'FR'", "htmlLang: 'fr'", "locale: 'fr-FR'"]:
        if needle not in languages:
            blockers.append(f'French language metadata incomplete: {needle}')
    supported = re.search(r"supportedLngs:\s*\[([^\]]+)\]", index)
    if not supported or not re.search(r"['\"]fr['\"]", supported.group(1)):
        blockers.append('French missing from supportedLngs')
    if "language?.startsWith('fr')" not in bridge or "return 'fr-FR'" not in bridge:
        blockers.append('French locale date formatting missing')
    if "fr: 'fr'" not in selector:
        blockers.append('French flag mapping missing')

    print(f'English resources: {len(en_files)}')
    print(f'French resources: {len(fr_files)}')
    print(f'French completion blockers: {len(blockers)}')
    for item in blockers[:1500]:
        print('BLOCKER:', item)
    print(f'French completion warnings: {len(warnings)}')
    for item in warnings[:500]:
        print('WARNING:', item)

    if blockers:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
