from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGETS = [ROOT / 'src/pages', ROOT / 'src/components']
OUT = ROOT / 'spanish_hardcoded_ui_audit.tsv'

# Directly visible JSX/prop/system-message candidates. This is intentionally conservative:
# it looks for common English UI vocabulary in literals outside translation resources.
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


def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip()


def candidate(text: str) -> bool:
    text = clean(text)
    if len(text) < 5 or not ENGLISH.search(text):
        return False
    if any(x in text for x in IGNORE_FRAGMENTS):
        return False
    # CSS/class strings and identifiers are not user-visible copy.
    if re.fullmatch(r'[A-Za-z0-9_./:#@%+\- ]+', text) and ('-' in text or ':' in text) and len(text.split()) > 5:
        return False
    return True


def main() -> None:
    rows: list[tuple[str, str, str]] = []
    for base in TARGETS:
        if not base.exists():
            continue
        for path in sorted(base.rglob('*.tsx')):
            rel = path.relative_to(ROOT).as_posix()
            text = path.read_text(encoding='utf-8')
            # Remove comments to reduce false positives.
            scrub = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
            scrub = re.sub(r'//[^\n]*', ' ', scrub)
            for m in JSX_TEXT.finditer(scrub):
                value = clean(m.group(1))
                if candidate(value):
                    rows.append((rel, 'jsx_text', value))
            for m in ATTR.finditer(scrub):
                value = clean(m.group(2))
                if candidate(value):
                    rows.append((rel, 'visible_attribute', value))
            for m in MESSAGE_CALL.finditer(scrub):
                value = clean(m.group(2))
                if candidate(value):
                    rows.append((rel, 'message_literal', value))

    # Deduplicate while preserving order.
    unique: list[tuple[str, str, str]] = []
    seen = set()
    for row in rows:
        if row not in seen:
            seen.add(row)
            unique.append(row)

    with OUT.open('w', encoding='utf-8') as f:
        f.write('file\tkind\ttext\n')
        for row in unique:
            f.write('\t'.join(x.replace('\t', ' ').replace('\n', ' ') for x in row) + '\n')

    print(f'Hardcoded English UI candidates: {len(unique)}')
    for row in unique[:300]:
        print('CANDIDATE:', ' | '.join(row))
    print(f'Report: {OUT}')


if __name__ == '__main__':
    main()
