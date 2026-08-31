from __future__ import annotations

import html
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
TARGETS = [ROOT / 'src/pages', ROOT / 'src/components']
EN = ROOT / 'src/i18n/locales/en'
OUT = ROOT / 'spanish_hardcoded_ui_audit.tsv'

# Directly visible JSX/prop/system-message candidates. After collection, exact
# values already present in the English locale package are considered covered by
# the project's direct i18n calls or legacy localization bridges.
ENGLISH = re.compile(
    r'\b(?:save|saving|saved|cancel|close|continue|confirm|back|skip|loading|error|failed|team|rider|riders|race|races|stage|stages|profile|settings|preferences|notifications|training|equipment|infrastructure|finance|transfers|scouting|statistics|help|support|account|password|email|country|city|season|manager|sponsor|contract|salary|staff|report|history|overview|calendar|next|previous|today|tomorrow|free agent|active|pending|completed|available|unavailable|choose|select|create|delete|remove|upgrade|purchase|apply|open|view|details|result|results|points|ranking|classification|submit|retry|refresh|search|filter)\b',
    re.I,
)
JSX_TEXT = re.compile(r'>([^<>{}\n][^<>{}]*)<')
ATTR = re.compile(r'\b(?:title|placeholder|aria-label|alt|label|description)=(["\'])(.*?)\1', re.S)
MESSAGE_CALL = re.compile(r'\b(?:alert|confirm|setError|setMessage|setStatus|toast\.(?:error|success|info|warning))\s*\(\s*(["\'])(.*?)\1', re.S)

IGNORE_FRAGMENTS = (
    'data-testid', 'console.', 'http://', 'https://', 'localhost', 'application/',
    'image/', 'text/', 'font-', 'grid-', 'flex-', 'hover:', 'focus:', 'sm:', 'md:',
    'lg:', 'xl:', 'dark:', 'aria-hidden',
)
CODE_MARKERS = (
    'const ', 'let ', 'return (', 'useState', 'useMemo', 'useEffect', 'Record<',
    ' as Record', '.filter(', '.map(', '.reduce(', '=>', ' as const', 'setState',
    'setError', 'setLoading', 'Promise<', 'Math.', 'String(', 'Boolean(', 'new Map',
    'new Set', 'async function', '&&', '||', '...',
)
INTENTIONAL = {
    'ProPeloton Manager',
}


def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(text)).strip()


def looks_like_code_spill(text: str) -> bool:
    if any(x in text for x in CODE_MARKERS):
        return True
    if text[:1] in '()[]{}=;,.':
        return True
    punctuation = sum(text.count(ch) for ch in '()[]{}=;')
    if punctuation >= 2:
        return True
    if re.search(r'\b(?:if|for|while|function|async)\s*\(', text):
        return True
    if re.search(r'\b[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\)?,', text):
        return True
    return False


def candidate(text: str) -> bool:
    text = clean(text)
    if len(text) < 5 or not ENGLISH.search(text):
        return False
    if text in INTENTIONAL:
        return False
    if any(x in text for x in IGNORE_FRAGMENTS):
        return False
    if looks_like_code_spill(text):
        return False
    if text == 'error' or re.fullmatch(r'[a-z][A-Za-z0-9_]*', text):
        return False
    # CSS/class strings and identifiers are not user-visible copy.
    if re.fullmatch(r'[A-Za-z0-9_./:#@%+\- ]+', text) and ('-' in text or ':' in text) and len(text.split()) > 5:
        return False
    return True


def walk_strings(value: Any):
    if isinstance(value, dict):
        for child in value.values():
            yield from walk_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_strings(child)
    elif isinstance(value, str):
        yield clean(value)


def english_locale_values() -> set[str]:
    values: set[str] = set()
    for path in sorted(EN.glob('*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        values.update(v for v in walk_strings(data) if v)
    return values


def main() -> None:
    locale_values = english_locale_values()
    rows: list[tuple[str, str, str, str]] = []
    blockers: list[tuple[str, str, str]] = []

    for base in TARGETS:
        if not base.exists():
            continue
        for path in sorted(base.rglob('*.tsx')):
            rel = path.relative_to(ROOT).as_posix()
            # Bridge implementation files and developer diagnostics intentionally contain English source copy.
            if rel.startswith('src/components/i18n/') or rel.startswith('src/pages/dev/'):
                continue

            text = path.read_text(encoding='utf-8')
            scrub = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
            scrub = re.sub(r'//[^\n]*', ' ', scrub)
            found: list[tuple[str, str]] = []

            for m in JSX_TEXT.finditer(scrub):
                value = clean(m.group(1))
                if candidate(value):
                    found.append(('jsx_text', value))
            for m in ATTR.finditer(scrub):
                value = clean(m.group(2))
                if candidate(value):
                    found.append(('visible_attribute', value))
            for m in MESSAGE_CALL.finditer(scrub):
                value = clean(m.group(2))
                if candidate(value):
                    found.append(('message_literal', value))

            for kind, value in found:
                status = 'covered_by_locale_resource' if value in locale_values else 'UNMAPPED'
                rows.append((rel, kind, status, value))
                if status == 'UNMAPPED':
                    blockers.append((rel, kind, value))

    # Deduplicate while preserving order.
    unique: list[tuple[str, str, str, str]] = []
    seen = set()
    for row in rows:
        if row not in seen:
            seen.add(row)
            unique.append(row)

    unique_blockers: list[tuple[str, str, str]] = []
    seen_blockers = set()
    for row in blockers:
        if row not in seen_blockers:
            seen_blockers.add(row)
            unique_blockers.append(row)

    with OUT.open('w', encoding='utf-8') as f:
        f.write('file\tkind\tstatus\ttext\n')
        for row in unique:
            f.write('\t'.join(x.replace('\t', ' ').replace('\n', ' ') for x in row) + '\n')

    print(f'Hardcoded English UI candidates after parser cleanup: {len(unique)}')
    print(f'Unmapped visible English candidates: {len(unique_blockers)}')
    for row in unique_blockers[:300]:
        print('BLOCKER:', ' | '.join(row))
    print(f'Report: {OUT}')

    if unique_blockers:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
