from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
EN_PATH = ROOT / 'src/i18n/locales/en/manual.json'
SR_PATH = ROOT / 'src/i18n/locales/sr-Latn/manual.json'
EN_DIR = ROOT / 'src/i18n/locales/en'
SR_DIR = ROOT / 'src/i18n/locales/sr-Latn'

MODEL_NAME = 'facebook/nllb-200-distilled-600M'
SRC_LANG = 'eng_Latn'
TARGET_LANG = 'srp_Cyrl'
BATCH_SIZE = 12

CATEGORY_SR = {
    'Getting Started': 'Početak',
    'Coins and Account': 'Coins i nalog',
    'Club Identity': 'Identitet kluba',
    'Dashboard': 'Kontrolna tabla',
    'Riders': 'Vozači',
    'Training': 'Trening',
    'Equipment': 'Oprema',
    'Infrastructure': 'Infrastruktura',
    'Calendar and Races': 'Kalendar i trke',
    'Race Preparation': 'Priprema trke',
    'Rankings and Statistics': 'Rang-liste i statistika',
    'Transfers': 'Transferi',
    'Transfers and Scouting': 'Transferi i skauting',
    'Finance': 'Finansije',
    'Support and Account': 'Podrška i nalog',
    'FAQ': 'Česta pitanja',
}

# Game vocabulary and technical identifiers that must not be machine-translated.
# The restore value is deliberately the exact terminology already used elsewhere
# in the Serbian game UI.
GLOSSARY = {
    'ProPeloton Manager': 'ProPeloton Manager',
    'Stage Plans': 'Stage Plans',
    'Stage Plan': 'Stage Plan',
    'Race Plans': 'Race Plans',
    'Race Plan': 'Race Plan',
    'Startlist': 'Startlist',
    'Race Engine': 'Race Engine',
    'Replay Engine': 'Replay Engine',
    'Team Policy': 'Team Policy',
    'race sharpness': 'race sharpness',
    'Race Sharpness': 'Race Sharpness',
    'WorldTeam': 'WorldTeam',
    'WorldTour': 'WorldTour',
    'ProTeam': 'ProTeam',
    'ProSeries': 'ProSeries',
    'Continental': 'Continental',
    'Supabase': 'Supabase',
    'Stripe': 'Stripe',
    'Discord': 'Discord',
    'Edge Function': 'Edge Function',
    'RPC': 'RPC',
    'KPI': 'KPI',
    'GC': 'GC',
    'U23': 'U23',
    'UCI': 'UCI',
    'JPG': 'JPG',
    'JPEG': 'JPEG',
    'PNG': 'PNG',
    'WEBP': 'WEBP',
    'PDF': 'PDF',
    'CSV': 'CSV',
    'Coins': 'Coins',
    'coins': 'Coins',
}

CODE_PATTERNS = [
    re.compile(r'https?://[^\s)]+'),
    re.compile(r'/dashboard/[A-Za-z0-9?=&/_\-.]+'),
    re.compile(r'\{\{[^{}]+\}\}'),
    re.compile(r'\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b(?:\(\))?'),
    re.compile(r'\b[A-Za-z_][A-Za-z0-9_]*\(\)'),
]

BAD_MARKERS = (
    'ZXQ',
    'ZIK',
    'QXml',
    '\ufffd',
    'Ã',
    'Â',
    'â€',
    'è',
    'æ',
    'ð',
)
CYRILLIC_RE = re.compile(r'[\u0400-\u04ff]')

CYR_TO_LAT = {
    'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z','И':'I','Ј':'J',
    'К':'K','Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O','П':'P','Р':'R','С':'S','Т':'T',
    'Ћ':'Ć','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'Č','Џ':'Dž','Ш':'Š',
    'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'đ','е':'e','ж':'ž','з':'z','и':'i','ј':'j',
    'к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t',
    'ћ':'ć','у':'u','ф':'f','х':'h','ц':'c','ч':'č','џ':'dž','ш':'š',
}

POST_REPLACEMENTS = [
    # Avoid Croatian/Bosnian variants if the model emits them.
    (r'\bvrijeme\b', 'vreme'),
    (r'\bVrijeme\b', 'Vreme'),
    (r'\bprovjerite\b', 'proverite'),
    (r'\bProvjerite\b', 'Proverite'),
    (r'\bprovjera\b', 'provera'),
    (r'\bProvjera\b', 'Provera'),
    (r'\bcijena\b', 'cena'),
    (r'\bCijena\b', 'Cena'),
    (r'\bcijene\b', 'cene'),
    (r'\bplaća\b', 'plata'),
    (r'\bPlaća\b', 'Plata'),
    (r'\bplaće\b', 'plate'),
    (r'\btijekom\b', 'tokom'),
    (r'\bTijekom\b', 'Tokom'),
    (r'\buvjet\b', 'uslov'),
    (r'\bUvjet\b', 'Uslov'),
    (r'\buvjeti\b', 'uslovi'),
    (r'\bUvjeti\b', 'Uslovi'),
    (r'\butrka\b', 'trka'),
    (r'\bUtrka\b', 'Trka'),
    (r'\butrke\b', 'trke'),
    (r'\bUtrke\b', 'Trke'),
    (r'\butrku\b', 'trku'),
    (r'\bUtrku\b', 'Trku'),
    (r'\butrci\b', 'trci'),
    (r'\bUtrci\b', 'Trci'),
    # Cycling-specific terminology.
    (r'\bjahač\b', 'vozač'),
    (r'\bJahač\b', 'Vozač'),
    (r'\bjahača\b', 'vozača'),
    (r'\bJahača\b', 'Vozača'),
    (r'\bjahači\b', 'vozači'),
    (r'\bJahači\b', 'Vozači'),
    (r'\bjahače\b', 'vozače'),
    (r'\bJahače\b', 'Vozače'),
    (r'\bjahačima\b', 'vozačima'),
    (r'\bJahačima\b', 'Vozačima'),
    (r'\brasa\b', 'trka'),
    (r'\bRasa\b', 'Trka'),
    (r'\brase\b', 'trke'),
    (r'\bRase\b', 'Trke'),
    (r'\brasu\b', 'trku'),
    (r'\bRasu\b', 'Trku'),
    (r'\brasni\b', 'trkački'),
    (r'\bRasni\b', 'Trkački'),
]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def save_json(path: Path, data: Any) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )


def has_bad_marker(value: str) -> bool:
    return any(marker in value for marker in BAD_MARKERS)


def walk_translation_pairs(en_value: Any, sr_value: Any, bucket: dict[str, Counter[str]]) -> None:
    if isinstance(en_value, str) and isinstance(sr_value, str):
        if en_value.strip() and sr_value.strip() and not has_bad_marker(sr_value):
            bucket[en_value][sr_value] += 1
        return

    if isinstance(en_value, dict) and isinstance(sr_value, dict):
        for key, child in en_value.items():
            if key in sr_value:
                walk_translation_pairs(child, sr_value[key], bucket)
        return

    if isinstance(en_value, list) and isinstance(sr_value, list):
        for en_child, sr_child in zip(en_value, sr_value):
            walk_translation_pairs(en_child, sr_child, bucket)


def build_translation_memory() -> dict[str, str]:
    bucket: dict[str, Counter[str]] = defaultdict(Counter)

    for en_path in sorted(EN_DIR.glob('*.json')):
        if en_path.name == 'manual.json':
            continue

        sr_path = SR_DIR / en_path.name
        if not sr_path.exists():
            continue

        try:
            en_data = load_json(en_path)
            sr_data = load_json(sr_path)
        except Exception:
            continue

        walk_translation_pairs(en_data, sr_data, bucket)

    memory: dict[str, str] = {}
    for source, counts in bucket.items():
        target, _ = counts.most_common(1)[0]
        memory[source] = target

    return memory


def transliterate_serbian(value: str) -> str:
    return ''.join(CYR_TO_LAT.get(ch, ch) for ch in value)


def postprocess(value: str) -> str:
    value = transliterate_serbian(value)
    for pattern, replacement in POST_REPLACEMENTS:
        value = re.sub(pattern, replacement, value)
    value = re.sub(r'\s+([,.;:!?])', r'\1', value)
    value = re.sub(r'([(\[]) +', r'\1', value)
    value = re.sub(r' +([)\]])', r'\1', value)
    value = re.sub(r' {2,}', ' ', value)
    return value.strip()


def placeholder_for(index: int, style: int) -> str:
    if style == 0:
        return f'§{index}§'
    if style == 1:
        return f'[{index}]'
    return f'({index})'


def mask_text(value: str, style: int = 0) -> tuple[str, list[str]]:
    text = value
    restores: list[str] = []

    def add_placeholder(match_text: str, restore_value: str | None = None) -> str:
        index = len(restores)
        restores.append(restore_value if restore_value is not None else match_text)
        return placeholder_for(index, style)

    # Longest phrases first so "Stage Plans" wins over "Stage Plan".
    for source_phrase in sorted(GLOSSARY, key=len, reverse=True):
        target_phrase = GLOSSARY[source_phrase]
        pattern = re.compile(
            rf'(?<!\w){re.escape(source_phrase)}(?!\w)',
            flags=re.IGNORECASE if source_phrase.lower() == source_phrase else 0,
        )

        def replace_phrase(match: re.Match[str], target: str = target_phrase) -> str:
            return add_placeholder(match.group(0), target)

        text = pattern.sub(replace_phrase, text)

    for pattern in CODE_PATTERNS:
        def replace_code(match: re.Match[str]) -> str:
            return add_placeholder(match.group(0))
        text = pattern.sub(replace_code, text)

    return text, restores


def restore_placeholders(value: str, restores: list[str], style: int) -> str:
    result = value

    for index, restore_value in enumerate(restores):
        if style == 0:
            pattern = re.compile(rf'§\s*{index}\s*§')
        elif style == 1:
            pattern = re.compile(rf'\[\s*{index}\s*\]')
        else:
            pattern = re.compile(rf'\(\s*{index}\s*\)')

        result, count = pattern.subn(
            lambda _match, replacement=restore_value: replacement,
            result,
            count=1,
        )
        if count != 1:
            raise ValueError(f'placeholder {index} missing after translation: {value!r}')

    return result


def contains_english_words(value: str) -> bool:
    return bool(re.search(r'[A-Za-z]{3,}', value))


def should_translate(value: str) -> bool:
    if not value.strip():
        return False
    if not contains_english_words(value):
        return False
    if re.fullmatch(r'(?:[A-Z0-9][A-Z0-9 .+/_-]*|https?://\S+)', value.strip()):
        return False
    return True


class Translator:
    def __init__(self, memory: dict[str, str]) -> None:
        self.memory = memory
        self.cache: dict[str, str] = {}
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, src_lang=SRC_LANG)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
        self.model.eval()
        torch.set_num_threads(max(1, min(4, torch.get_num_threads())))
        self.forced_bos_token_id = self.tokenizer.convert_tokens_to_ids(TARGET_LANG)

    def _generate_batch(self, values: list[str]) -> list[str]:
        encoded = self.tokenizer(
            values,
            return_tensors='pt',
            padding=True,
            truncation=True,
            max_length=512,
        )

        with torch.inference_mode():
            output = self.model.generate(
                **encoded,
                forced_bos_token_id=self.forced_bos_token_id,
                max_new_tokens=512,
                num_beams=3,
                length_penalty=1.0,
            )

        return self.tokenizer.batch_decode(output, skip_special_tokens=True)

    def _translate_with_style(self, source: str, style: int) -> str:
        masked, restores = mask_text(source, style)
        raw = self._generate_batch([masked])[0]
        restored = restore_placeholders(raw, restores, style)
        return postprocess(restored)

    def translate_many(self, values: list[str]) -> dict[str, str]:
        unique = list(dict.fromkeys(values))
        pending: list[str] = []

        for source in unique:
            if source in self.cache:
                continue

            if source in self.memory:
                candidate = self.memory[source]
                if not has_bad_marker(candidate) and not CYRILLIC_RE.search(candidate):
                    self.cache[source] = candidate
                    continue

            if not should_translate(source):
                self.cache[source] = source
                continue

            pending.append(source)

        for start in range(0, len(pending), BATCH_SIZE):
            batch_sources = pending[start:start + BATCH_SIZE]
            masked_batch: list[str] = []
            restore_batch: list[list[str]] = []

            for source in batch_sources:
                masked, restores = mask_text(source, 0)
                masked_batch.append(masked)
                restore_batch.append(restores)

            raw_batch = self._generate_batch(masked_batch)

            for source, raw, restores in zip(batch_sources, raw_batch, restore_batch):
                translated: str | None = None

                try:
                    translated = postprocess(restore_placeholders(raw, restores, 0))
                except ValueError:
                    for style in (1, 2):
                        try:
                            translated = self._translate_with_style(source, style)
                            break
                        except ValueError:
                            continue

                if translated is None:
                    # A single untranslated English sentence is preferable to corrupt
                    # placeholders. The validation step reports this if it happens.
                    translated = source
                    print(f'WARNING placeholder fallback kept English: {source}')

                self.cache[source] = translated

            done = min(start + len(batch_sources), len(pending))
            print(f'Translated {done}/{len(pending)} new manual strings')

        return {source: self.cache[source] for source in unique}


def collect_section_strings(sections: dict[str, Any]) -> list[str]:
    values: list[str] = []

    for section in sections.values():
        for key in ('title', 'subtitle', 'overview'):
            if isinstance(section.get(key), str):
                values.append(section[key])

        for detail in section.get('details', []):
            if isinstance(detail, str):
                values.append(detail)

        for fact in section.get('facts', []):
            if isinstance(fact, dict):
                if isinstance(fact.get('label'), str):
                    values.append(fact['label'])
                if isinstance(fact.get('value'), str):
                    values.append(fact['value'])

        for tip in section.get('tips', []):
            if isinstance(tip, str):
                values.append(tip)

        for label in section.get('relatedLinks', []):
            if isinstance(label, str):
                values.append(label)

    return values


def translate_sections(
    en_sections: dict[str, Any],
    translator: Translator,
) -> dict[str, Any]:
    translations = translator.translate_many(collect_section_strings(en_sections))
    output: dict[str, Any] = {}

    for section_id, en_section in en_sections.items():
        section = deepcopy(en_section)
        source_category = en_section.get('category', '')
        section['category'] = CATEGORY_SR.get(source_category, source_category)

        for key in ('title', 'subtitle', 'overview'):
            if isinstance(en_section.get(key), str):
                section[key] = translations[en_section[key]]

        section['details'] = [
            translations[value] if isinstance(value, str) else value
            for value in en_section.get('details', [])
        ]

        section['facts'] = []
        for fact in en_section.get('facts', []):
            if not isinstance(fact, dict):
                section['facts'].append(fact)
                continue
            section['facts'].append({
                **fact,
                'label': translations.get(fact.get('label'), fact.get('label')),
                'value': translations.get(fact.get('value'), fact.get('value')),
            })

        section['tips'] = [
            translations[value] if isinstance(value, str) else value
            for value in en_section.get('tips', [])
        ]

        section['relatedLinks'] = [
            translations[value] if isinstance(value, str) else value
            for value in en_section.get('relatedLinks', [])
        ]

        output[section_id] = section

    return output


def iter_strings(value: Any, path: str = ''):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for key, child in value.items():
            child_path = f'{path}.{key}' if path else str(key)
            yield from iter_strings(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            child_path = f'{path}.{index}' if path else str(index)
            yield from iter_strings(child, child_path)


def validate(en_manual: dict[str, Any], sr_manual: dict[str, Any]) -> None:
    en_sections = en_manual['sections']
    sr_sections = sr_manual['sections']

    if len(en_sections) != 92 or len(sr_sections) != 92:
        raise SystemExit(f'Expected 92 manual sections, got en={len(en_sections)} sr={len(sr_sections)}')

    if set(en_sections) != set(sr_sections):
        raise SystemExit('Serbian manual section IDs do not match English.')

    problems: list[str] = []
    english_fallbacks: list[str] = []

    sr_strings = dict(iter_strings(sr_sections))
    en_strings = dict(iter_strings(en_sections))

    for path, value in sr_strings.items():
        if has_bad_marker(value):
            problems.append(f'{path}: corrupt marker in {value!r}')
        if CYRILLIC_RE.search(value):
            problems.append(f'{path}: Cyrillic remained in Latin resource: {value!r}')
        if re.search(r'§\s*\d+\s*§|\[\s*\d+\s*\]|\(\s*\d+\s*\)', value):
            problems.append(f'{path}: unresolved placeholder marker: {value!r}')

        source = en_strings.get(path)
        if isinstance(source, str):
            source_vars = sorted(re.findall(r'\{\{[^{}]+\}\}', source))
            target_vars = sorted(re.findall(r'\{\{[^{}]+\}\}', value))
            if source_vars != target_vars:
                problems.append(
                    f'{path}: i18n placeholders changed: source={source_vars}, target={target_vars}'
                )

            if source == value and should_translate(source):
                technical_only = bool(
                    re.fullmatch(
                        r'(?:ProPeloton Manager|Race Plan|Race Plans|Stage Plan|Stage Plans|Startlist|'
                        r'Race Engine|Replay Engine|Team Policy|Race Sharpness|Coins|U23|UCI|GC|KPI|'
                        r'JPG|JPEG|PNG|WEBP|PDF|CSV|Supabase|Stripe|Discord|RPC|WorldTeam|WorldTour|'
                        r'ProTeam|ProSeries|Continental)',
                        source.strip(),
                    )
                )
                if not technical_only:
                    english_fallbacks.append(f'{path}: {source}')

    if len(english_fallbacks) > 3:
        problems.extend(f'English fallback: {item}' for item in english_fallbacks[:20])

    # Explicitly reject the failure patterns seen in the first translation pass.
    full_text = '\n'.join(sr_strings.values()).lower()
    for bad_word in ('jahač', 'rasni svet', 'zxq', 'zik'):
        if bad_word in full_text:
            problems.append(f'Forbidden bad terminology remained: {bad_word}')

    if problems:
        raise SystemExit('Manual localization validation failed:\n' + '\n'.join(problems[:50]))

    print(f'Validated {len(sr_sections)} Serbian manual sections.')
    print(f'English fallbacks allowed: {len(english_fallbacks)}')


def main() -> None:
    en_manual = load_json(EN_PATH)
    current_sr = load_json(SR_PATH)

    memory = build_translation_memory()
    print(f'Loaded {len(memory)} exact translations from existing Serbian resources.')

    translator = Translator(memory)
    sr_manual = {
        'ui': current_sr['ui'],
        'categories': current_sr['categories'],
        'guide': current_sr['guide'],
        'sections': translate_sections(en_manual['sections'], translator),
    }

    validate(en_manual, sr_manual)
    save_json(SR_PATH, sr_manual)

    # Print representative samples into Actions logs for a human quality check.
    sample_ids = [
        'quick-start',
        'game-time',
        'coins',
        'club-identity',
        'overview',
        'notifications-inbox',
        'squad-riders',
        'rider-profile-skills',
        'race-preparation',
        'finance-overview',
        'tax',
        'faq-staff-hiring',
    ]
    for section_id in sample_ids:
        section = sr_manual['sections'].get(section_id)
        if not section:
            continue
        print(f'\n[{section_id}] {section["title"]}')
        print(section['overview'])
        if section.get('details'):
            print(' - ' + section['details'][0])


if __name__ == '__main__':
    main()
