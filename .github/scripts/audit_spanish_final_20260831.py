from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
ES_DIR = ROOT / 'src/i18n/locales/es'
PLACEHOLDER = re.compile(r'\{\{[^{}]+\}\}')
CORRUPTION = re.compile(r'(?:\ufffd|Ã|Â|â€|ZXQ|QXml)')
CYRILLIC = re.compile(r'[\u0400-\u04ff]')

# Exact product/game vocabulary. Race/Stage plan singular/plural are handled as families below.
PROTECTED = [
    'ProPeloton Manager', 'Startlist', 'Race Engine', 'Replay Engine', 'Team Policy',
    'Race Sharpness', 'WorldTeam', 'WorldTour', 'ProTeam', 'ProSeries', 'Continental',
    'Supabase', 'Discord', 'Edge Function', 'RPC', 'KPI', 'GC', 'KOM', 'U23', 'UCI',
    'JPG', 'JPEG', 'PNG', 'WEBP', 'PDF', 'CSV', 'Coins', 'FTP', 'VO2', 'DNF', 'DNS',
    'OTL', 'ITT', 'TTT',
]

BAD_GLOBAL = [
    r'\brazas?\b', r'\bjinetes?\b', r'\breproductor(?:es)?\b',
    r'\bsalvando\b', r'\bsalvar\b', r'\bsubstrato\b', r'\bInformer\b',
    r'\bTrampa\s*/\s*Explota\b', r'\bplanes? de etapas?\b',
    r'\bplanes? de carreras?\b', r'\bMotor de carreras?\b',
    r'\bMotor de repetici[oó]n\b', r'\bPol[ií]ticas? de equipo\b',
    r'\bNitidez de carrera\b', r'\bLista de salida\b',
    r'\blos ciclista\b', r'\bde los ciclista\b', r'\ba los ciclista\b',
    r'\bpara los ciclista\b', r'\btus ciclista\b', r'\bsus ciclista\b',
    r'\bEquipo Jersey\b', r'\bTablero de mando\b', r'\bDerechos de designaci[oó]n\b',
    r'\bSalvando el lenguaje\b', r'\bEl lenguaje del juego\b',
    r'\bEnviar contraseña Cambiar correo electr[oó]nico\b', r'\bWindows y los plazos\b',
]

ALLOWED_IDENTICAL_PATHS = {
    'calendar.json.gameTimeWithWeekday',
    'calendar.json.gameTimeWithoutWeekday',
    'calendarPage.json.dates.compact',
}


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

    # Race Plan(s) and Stage Plan(s) are one protected vocabulary family each; grammatical number may differ.
    if (phrase(source, 'Race Plan') or phrase(source, 'Race Plans')) and not (phrase(target, 'Race Plan') or phrase(target, 'Race Plans')):
        blockers.append(f'{path}: Race Plan vocabulary changed: {target!r}')
    if (phrase(source, 'Stage Plan') or phrase(source, 'Stage Plans')) and not (phrase(target, 'Stage Plan') or phrase(target, 'Stage Plans')):
        blockers.append(f'{path}: Stage Plan vocabulary changed: {target!r}')

    for term in PROTECTED:
        if phrase(source, term) and not phrase(target, term):
            blockers.append(f'{path}: protected term {term!r} changed: {target!r}')

    # Premium is protected only as the named product/tier, not lowercase descriptive "premium".
    if phrase(source, 'Premium', ignore_case=False) and not phrase(target, 'Premium', ignore_case=False):
        blockers.append(f'{path}: protected term \'Premium\' changed: {target!r}')

    for pattern in BAD_GLOBAL:
        if re.search(pattern, target, re.I):
            blockers.append(f'{path}: residual machine/bad Spanish: {target!r}')
            break

    low_source = source.lower()
    # "administrator" is valid where English also explicitly mentions admin; only reject it for manager-only copy.
    source_mentions_manager = re.search(r'\bmanagers?\b', low_source) is not None
    source_mentions_admin = re.search(r'\badmins?|administrators?\b', low_source) is not None
    if source_mentions_manager and not source_mentions_admin and re.search(r'\b(?:administrador(?:es)?|gerente(?:s)?)\b', target, re.I):
        blockers.append(f'{path}: cycling manager rendered as generic administrator/gerente: {target!r}')
    if re.search(r'\breviews?\b', low_source) and re.search(r'\bex[aá]men(?:es)?\b', target, re.I):
        blockers.append(f'{path}: review rendered as exam: {target!r}')
    if re.search(r'\bAI\b', source) and re.search(r'\binteligencia artificial\b', target, re.I):
        blockers.append(f'{path}: use concise Spanish IA for AI: {target!r}')

    if source.strip() == target.strip() and len(source.split()) >= 4 and path not in ALLOWED_IDENTICAL_PATHS:
        if re.search(r'\b(?:the|and|you|your|with|from|this|that|for|are|is|can|will|should|must)\b', source, re.I):
            blockers.append(f'{path}: unchanged English sentence: {source!r}')
        else:
            warnings.append(f'{path}: identical multi-word value reviewed as possible intentional text: {source!r}')


def main() -> None:
    blockers: list[str] = []
    warnings: list[str] = []
    en_files = sorted(p.name for p in EN_DIR.glob('*.json'))
    es_files = sorted(p.name for p in ES_DIR.glob('*.json'))
    if en_files != es_files:
        blockers.append('Spanish locale filenames do not mirror English exactly')
    for name in en_files:
        path = ES_DIR / name
        if path.exists():
            walk(load(EN_DIR / name), load(path), name, blockers, warnings)

    languages = (ROOT / 'src/i18n/languages.ts').read_text(encoding='utf-8')
    index = (ROOT / 'src/i18n/index.ts').read_text(encoding='utf-8')
    date_bridge = (ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx').read_text(encoding='utf-8')
    if "code: 'es'" not in languages or "countryCode: 'ES'" not in languages or "locale: 'es-ES'" not in languages:
        blockers.append('Spanish language metadata incomplete')
    if "supportedLngs: ['en', 'sr-Latn', 'de', 'hr', 'es']" not in index:
        blockers.append('Spanish missing from supportedLngs')
    if "language?.startsWith('es')" not in date_bridge or "return 'es-ES'" not in date_bridge:
        blockers.append('Spanish locale date formatting missing')

    print(f'English resources: {len(en_files)}')
    print(f'Spanish resources: {len(es_files)}')
    print(f'Final Spanish blockers: {len(blockers)}')
    for item in blockers:
        print('BLOCKER:', item)
    print(f'Final Spanish warnings: {len(warnings)}')
    for item in warnings:
        print('WARNING:', item)
    if blockers:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
