from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
DE_DIR = ROOT / 'src/i18n/locales/de'
MODEL_NAME = 'Helsinki-NLP/opus-mt-en-de'
BATCH_SIZE = 48

# Intentional product/cycling/technical vocabulary that must remain unchanged.
PROTECTED_PHRASES = [
    'ProPeloton Manager',
    'Stage Plans',
    'Stage Plan',
    'Race Plans',
    'Race Plan',
    'Startlist',
    'Race Engine',
    'Replay Engine',
    'Team Policy',
    'Race Sharpness',
    'WorldTeam',
    'WorldTour',
    'ProTeam',
    'ProSeries',
    'Continental',
    'Supabase',
    'Stripe',
    'Discord',
    'Edge Function',
    'RPC',
    'KPI',
    'GC',
    'KOM',
    'U23',
    'UCI',
    'JPG',
    'JPEG',
    'PNG',
    'WEBP',
    'PDF',
    'CSV',
    'Coins',
    'Premium',
]

CODE_PATTERNS = [
    re.compile(r'https?://[^\s)\]}]+'),
    re.compile(r'/[A-Za-z0-9?=&/_\-.#:]+'),
    re.compile(r'\{\{[^{}]+\}\}'),
    re.compile(r'\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b(?:\(\))?'),
    re.compile(r'\b[A-Za-z_][A-Za-z0-9_]*\(\)'),
    re.compile(r"\breason\s*=\s*['\"][^'\"]+['\"]"),
]

# Exact UI strings where consistent game vocabulary is more important than MT choice.
EXACT_OVERRIDES = {
    'Home': 'Startseite',
    'Overview': 'Übersicht',
    'Squad': 'Team',
    'Staff': 'Personal',
    'Calendar': 'Kalender',
    'Race Preparation': 'Rennvorbereitung',
    'Team Ranking': 'Team-Rangliste',
    'Training': 'Training',
    'Equipment': 'Ausrüstung',
    'Infrastructure': 'Infrastruktur',
    'Finance': 'Finanzen',
    'Transfers': 'Transfers',
    'Scouting': 'Scouting',
    'Statistics': 'Statistiken',
    'Inbox': 'Posteingang',
    'My Profile': 'Mein Profil',
    'Preferences': 'Einstellungen',
    'Help': 'Hilfe',
    'Sign In': 'Anmelden',
    'Sign Out': 'Abmelden',
    'Logout': 'Abmelden',
    'Save': 'Speichern',
    'Cancel': 'Abbrechen',
    'Close': 'Schließen',
    'Open': 'Öffnen',
    'Loading…': 'Wird geladen…',
    'Loading...': 'Wird geladen...',
    'Rider': 'Fahrer',
    'Riders': 'Fahrer',
    'Team': 'Team',
    'Teams': 'Teams',
    'Race': 'Rennen',
    'Races': 'Rennen',
    'Stage': 'Etappe',
    'Stages': 'Etappen',
    'Report': 'Bericht',
    'Reports': 'Berichte',
    'History': 'Verlauf',
    'Comparison': 'Vergleich',
    'Current': 'Aktuell',
    'Next': 'Nächste',
}

BAD_MARKERS = ('\ufffd', 'Ã', 'Â', 'â€', 'ZXQ', 'QXml')
CYRILLIC_RE = re.compile(r'[\u0400-\u04ff]')
SERBIAN_WORD_RE = re.compile(
    r'\b(?:vozač|vozači|vozača|vozaču|vozačima|ekipa|podešavanja|izveštaj|izveštaji|'
    r'smeštaj|sledeći|trenutni|mesec|nedeljni|takmičenje|poređenje|osoblje|trka|trke)\b',
    flags=re.IGNORECASE,
)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def should_translate_chunk(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return False
    if not re.search(r'[A-Za-z]', stripped):
        return False
    if re.fullmatch(r'[A-Z0-9 .+/_:#-]+', stripped):
        return False
    return True


def collect_protected_spans(value: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []

    for phrase in sorted(PROTECTED_PHRASES, key=len, reverse=True):
        for match in re.finditer(rf'(?<!\w){re.escape(phrase)}(?!\w)', value):
            spans.append(match.span())

    for pattern in CODE_PATTERNS:
        spans.extend(match.span() for match in pattern.finditer(value))

    if not spans:
        return []

    spans.sort()
    merged: list[tuple[int, int]] = []
    for start, end in spans:
        if merged and start < merged[-1][1]:
            if end > merged[-1][1]:
                merged[-1] = (merged[-1][0], end)
            continue
        merged.append((start, end))
    return merged


def split_protected(value: str) -> list[tuple[bool, str]]:
    spans = collect_protected_spans(value)
    if not spans:
        return [(False, value)]

    parts: list[tuple[bool, str]] = []
    cursor = 0
    for start, end in spans:
        if start > cursor:
            parts.append((False, value[cursor:start]))
        parts.append((True, value[start:end]))
        cursor = end
    if cursor < len(value):
        parts.append((False, value[cursor:]))
    return parts


def preserve_whitespace(source: str, translated: str) -> str:
    leading = re.match(r'^\s*', source).group(0)
    trailing = re.search(r'\s*$', source).group(0)
    core = translated.strip()
    return f'{leading}{core}{trailing}'


def postprocess(value: str) -> str:
    # Cycling-specific corrections for common generic MT choices.
    replacements = [
        (r'\bReiter\b', 'Fahrer'),
        (r'\bReiterin\b', 'Fahrerin'),
        (r'\bReiterinnen\b', 'Fahrerinnen'),
        (r'\bReitern\b', 'Fahrern'),
        (r'\bReiters\b', 'Fahrers'),
        (r'\bRadsportler\b', 'Fahrer'),
        (r'\bRadsportlern\b', 'Fahrern'),
        (r'\bBühnen\b', 'Etappen'),
        (r'\bBühne\b', 'Etappe'),
        (r'\bEtappenplan\b', 'Stage Plan'),
        (r'\bEtappenpläne\b', 'Stage Plans'),
        (r'\bRennplan\b', 'Race Plan'),
        (r'\bRennpläne\b', 'Race Plans'),
        (r'\bStartliste\b', 'Startlist'),
        (r'\bMünzen\b', 'Coins'),
        (r'\bMünze\b', 'Coins'),
    ]
    for pattern, replacement in replacements:
        value = re.sub(pattern, replacement, value)
    value = re.sub(r'\s+([,.;:!?])', r'\1', value)
    value = re.sub(r' {2,}', ' ', value)
    return value.strip()


class Translator:
    def __init__(self) -> None:
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
        self.model.eval()
        torch.set_num_threads(max(1, min(4, torch.get_num_threads())))
        self.cache: dict[str, str] = {}

    def translate_chunks(self, chunks: list[str]) -> None:
        unique = [chunk for chunk in dict.fromkeys(chunks) if chunk not in self.cache]
        pending = [chunk for chunk in unique if should_translate_chunk(chunk)]

        for chunk in unique:
            if chunk in self.cache:
                continue
            stripped = chunk.strip()
            if stripped in EXACT_OVERRIDES:
                self.cache[chunk] = preserve_whitespace(chunk, EXACT_OVERRIDES[stripped])
            elif not should_translate_chunk(chunk):
                self.cache[chunk] = chunk

        pending = [chunk for chunk in pending if chunk not in self.cache]

        for start in range(0, len(pending), BATCH_SIZE):
            batch = pending[start:start + BATCH_SIZE]
            cores = [item.strip() for item in batch]
            encoded = self.tokenizer(
                cores,
                return_tensors='pt',
                padding=True,
                truncation=True,
                max_length=512,
            )
            with torch.inference_mode():
                output = self.model.generate(
                    **encoded,
                    max_new_tokens=512,
                    num_beams=1,
                )
            decoded = self.tokenizer.batch_decode(output, skip_special_tokens=True)
            for source, translated in zip(batch, decoded):
                self.cache[source] = preserve_whitespace(source, postprocess(translated))
            print(f'Translated {min(start + len(batch), len(pending))}/{len(pending)} German chunks')

    def translate_string(self, source: str) -> str:
        if source in EXACT_OVERRIDES:
            return EXACT_OVERRIDES[source]
        parts = split_protected(source)
        rebuilt = ''.join(text if protected else self.cache.get(text, text) for protected, text in parts)
        return postprocess(rebuilt)


def iter_strings(value: Any):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from iter_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_strings(child)


def translate_value(value: Any, translator: Translator) -> Any:
    if isinstance(value, str):
        return translator.translate_string(value)
    if isinstance(value, dict):
        return {key: translate_value(child, translator) for key, child in value.items()}
    if isinstance(value, list):
        return [translate_value(child, translator) for child in value]
    return value


def shape_problems(source: Any, target: Any, path: str = '') -> list[str]:
    problems: list[str] = []
    if type(source) is not type(target):
        return [f'{path}: type differs ({type(source).__name__} != {type(target).__name__})']
    if isinstance(source, dict):
        if list(source.keys()) != list(target.keys()):
            problems.append(f'{path}: object keys/order differ')
        for key in source:
            if key in target:
                child = f'{path}.{key}' if path else key
                problems.extend(shape_problems(source[key], target[key], child))
    elif isinstance(source, list):
        if len(source) != len(target):
            problems.append(f'{path}: list length differs')
        for index, (src, dst) in enumerate(zip(source, target)):
            problems.extend(shape_problems(src, dst, f'{path}[{index}]'))
    elif isinstance(source, str):
        source_vars = sorted(re.findall(r'\{\{[^{}]+\}\}', source))
        target_vars = sorted(re.findall(r'\{\{[^{}]+\}\}', target))
        if source_vars != target_vars:
            problems.append(f'{path}: i18n placeholders differ {source_vars} != {target_vars}')
        for phrase in PROTECTED_PHRASES:
            if phrase in source and phrase not in target:
                problems.append(f'{path}: protected term lost: {phrase}')
    return problems


def validate_all() -> None:
    en_files = sorted(path.name for path in EN_DIR.glob('*.json'))
    de_files = sorted(path.name for path in DE_DIR.glob('*.json'))
    problems: list[str] = []

    if en_files != de_files:
        problems.append(f'German filenames differ from English: en={en_files}, de={de_files}')

    long_unchanged: list[str] = []
    length_warnings: list[str] = []

    for name in en_files:
        en_path = EN_DIR / name
        de_path = DE_DIR / name
        if not de_path.exists():
            continue
        source = load_json(en_path)
        target = load_json(de_path)
        problems.extend(f'{name}:{item}' for item in shape_problems(source, target))

        def walk(src: Any, dst: Any, path: str = '') -> None:
            if isinstance(src, dict) and isinstance(dst, dict):
                for key in src:
                    if key in dst:
                        walk(src[key], dst[key], f'{path}.{key}' if path else key)
            elif isinstance(src, list) and isinstance(dst, list):
                for index, (a, b) in enumerate(zip(src, dst)):
                    walk(a, b, f'{path}[{index}]')
            elif isinstance(src, str) and isinstance(dst, str):
                lowered = dst.lower()
                if any(marker.lower() in lowered for marker in BAD_MARKERS):
                    problems.append(f'{name}:{path}: corrupt marker in {dst!r}')
                if CYRILLIC_RE.search(dst):
                    problems.append(f'{name}:{path}: Cyrillic/Serbian script remained')
                if SERBIAN_WORD_RE.search(dst):
                    problems.append(f'{name}:{path}: Serbian vocabulary remained in {dst!r}')
                if re.search(r'\b(?:Reiter|Reitern|Reiters|Bühne|Bühnen)\b', dst):
                    problems.append(f'{name}:{path}: non-cycling MT terminology in {dst!r}')
                if src == dst and len(src) >= 28 and len(src.split()) >= 5 and should_translate_chunk(src):
                    if not any(phrase in src for phrase in PROTECTED_PHRASES):
                        long_unchanged.append(f'{name}:{path}: {src}')
                if len(src) <= 32 and len(src) >= 5 and len(dst) > max(42, int(len(src) * 2.15)):
                    length_warnings.append(f'{name}:{path}: {src!r} -> {dst!r}')

        walk(source, target)

    if len(long_unchanged) > 10:
        problems.extend(f'Likely English fallback: {item}' for item in long_unchanged[:25])

    if problems:
        raise SystemExit('German localization validation failed:\n' + '\n'.join(problems[:100]))

    print(f'Validated {len(en_files)} German locale files against English.')
    print(f'Long unchanged strings allowed: {len(long_unchanged)}')
    print(f'German text-length warnings: {len(length_warnings)}')
    for warning in length_warnings[:40]:
        print('LENGTH WARNING:', warning)


def main() -> None:
    en_paths = sorted(EN_DIR.glob('*.json'))
    if not en_paths:
        raise SystemExit('No English locale JSON files found.')

    sources = {path.name: load_json(path) for path in en_paths}
    translator = Translator()

    chunks: list[str] = []
    for data in sources.values():
        for value in iter_strings(data):
            if value in EXACT_OVERRIDES:
                continue
            for protected, chunk in split_protected(value):
                if not protected:
                    chunks.append(chunk)

    translator.translate_chunks(chunks)

    DE_DIR.mkdir(parents=True, exist_ok=True)
    for old in DE_DIR.glob('*.json'):
        old.unlink()

    for name, source in sources.items():
        translated = translate_value(source, translator)
        save_json(DE_DIR / name, translated)
        print('Wrote', name)

    validate_all()


if __name__ == '__main__':
    main()
