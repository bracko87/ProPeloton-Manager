from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
IT_DIR = ROOT / 'src/i18n/locales/it'
MODEL_NAME = 'Helsinki-NLP/opus-mt-en-it'
BATCH_SIZE = 32

REGISTERED_NAMESPACES = [
    'accountPages', 'appShell', 'auth', 'calendar', 'calendarPage', 'club', 'common',
    'createClub', 'customizeTeam', 'developingTeam', 'equipment', 'finance', 'help',
    'manual', 'home', 'infrastructure', 'navigation', 'notifications', 'overview',
    'preferences', 'preferencesDynamic', 'proPackages', 'profile', 'publicInfo',
    'raceDetail', 'racePreparation', 'riderProfile', 'scouting', 'seasonReset',
    'sharedRiderModal', 'squad', 'staff', 'statistics', 'teamRanking', 'training',
    'transfers', 'tutorials',
]

PROTECTED_PHRASES = [
    'ProPeloton Manager', 'Stage Plans', 'Stage Plan', 'Race Plans', 'Race Plan',
    'Startlist', 'Race Engine', 'Replay Engine', 'Team Policy', 'Race Sharpness',
    'WorldTeam', 'WorldTour', 'ProTeam', 'ProSeries', 'Continental', 'Supabase',
    'Stripe', 'Discord', 'Edge Function', 'RPC', 'KPI', 'GC', 'KOM', 'U23', 'UCI',
    'JPG', 'JPEG', 'PNG', 'WEBP', 'PDF', 'CSV', 'Coins', 'Premium', 'FTP', 'VO2',
    'DNF', 'DNS', 'OTL', 'ITT', 'TTT',
]

EXACT_OVERRIDES = {
    'Home': 'Home',
    'Overview': 'Panoramica',
    'Squad': 'Rosa',
    'Staff': 'Staff',
    'Calendar': 'Calendario',
    'Race Preparation': 'Preparazione gara',
    'Team Ranking': 'Classifica squadre',
    'Training': 'Allenamento',
    'Equipment': 'Equipaggiamento',
    'Infrastructure': 'Infrastrutture',
    'Finance': 'Finanze',
    'Transfers': 'Mercato',
    'Scouting': 'Scouting',
    'Statistics': 'Statistiche',
    'Inbox': 'Posta in arrivo',
    'My Profile': 'Il mio profilo',
    'Preferences': 'Preferenze',
    'Help': 'Aiuto',
    'Sign In': 'Accedi',
    'Sign Out': 'Esci',
    'Logout': 'Esci',
    'Save': 'Salva',
    'Cancel': 'Annulla',
    'Close': 'Chiudi',
    'Continue': 'Continua',
    'Confirm': 'Conferma',
    'Back': 'Indietro',
    'Open': 'Apri',
    'Loading…': 'Caricamento…',
    'Loading...': 'Caricamento...',
    'Rider': 'Ciclista',
    'Riders': 'Ciclisti',
    'Team': 'Squadra',
    'Teams': 'Squadre',
    'Race': 'Gara',
    'Races': 'Gare',
    'Stage': 'Tappa',
    'Stages': 'Tappe',
    'Season': 'Stagione',
    'Report': 'Rapporto',
    'Reports': 'Rapporti',
    'History': 'Storico',
    'Comparison': 'Confronto',
    'Current': 'Attuale',
    'Next': 'Successivo',
    'Previous': 'Precedente',
    'Country': 'Paese',
    'Team Country': 'Paese della squadra',
    'Team Name': 'Nome della squadra',
    'Team Motto (optional)': 'Motto della squadra (facoltativo)',
    'Primary Color': 'Colore principale',
    'Secondary Color': 'Colore secondario',
    'Create Your Team': 'Crea la tua squadra',
    'Team Preview': 'Anteprima squadra',
    'Game language': 'Lingua del gioco',
    'English': 'English',
    'Srpski': 'Srpski',
    'Deutsch': 'Deutsch',
    'Hrvatski': 'Hrvatski',
    'Español': 'Español',
    'Italiano': 'Italiano',
    'Training Camp': 'Ritiro di allenamento',
    'Training Camps': 'Ritiri di allenamento',
    'AI': 'IA',
    'Active': 'Attivo',
    'Inactive': 'Inattivo',
    'Yes': 'Sì',
    'No': 'No',
}

PLACEHOLDER_RE = re.compile(r'\{\{[^{}]+\}\}')
URL_RE = re.compile(r'https?://[^\s)\]}]+')
CODE_RE = re.compile(r'\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b(?:\(\))?')
FUNC_RE = re.compile(r'\b[A-Za-z_][A-Za-z0-9_]*\(\)')


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def placeholders(value: str) -> list[str]:
    return PLACEHOLDER_RE.findall(value)


def should_translate(value: str) -> bool:
    text = value.strip()
    if not text or not re.search(r'[A-Za-z]', text):
        return False
    if re.fullmatch(r'[A-Z0-9 .+/_:#-]+', text):
        return False
    return True


def protected_spans(value: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for phrase in sorted(PROTECTED_PHRASES, key=len, reverse=True):
        spans.extend(match.span() for match in re.finditer(rf'(?<!\w){re.escape(phrase)}(?!\w)', value))
    for pattern in (PLACEHOLDER_RE, URL_RE, CODE_RE, FUNC_RE):
        spans.extend(match.span() for match in pattern.finditer(value))
    if not spans:
        return []
    spans.sort()
    merged: list[tuple[int, int]] = []
    for start, end in spans:
        if merged and start < merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def mask_protected(value: str) -> tuple[str, list[str]]:
    spans = protected_spans(value)
    if not spans:
        return value, []
    out: list[str] = []
    saved: list[str] = []
    cursor = 0
    for idx, (start, end) in enumerate(spans):
        out.append(value[cursor:start])
        token = f'PpMtOkEn{idx}Xx'
        out.append(token)
        saved.append(value[start:end])
        cursor = end
    out.append(value[cursor:])
    return ''.join(out), saved


def restore_protected(value: str, saved: list[str]) -> str | None:
    result = value
    for idx, original in enumerate(saved):
        token = f'PpMtOkEn{idx}Xx'
        pattern = re.compile(re.escape(token), flags=re.IGNORECASE)
        if not pattern.search(result):
            return None
        result = pattern.sub(original, result, count=1)
    return result


def postprocess(value: str) -> str:
    replacements = [
        (r'\bcorridore\b', 'ciclista'),
        (r'\bcorridori\b', 'ciclisti'),
        (r'\bpilota\b', 'ciclista'),
        (r'\bpiloti\b', 'ciclisti'),
        (r'\bmonete\b', 'Coins'),
        (r'\bmoneta\b', 'Coins'),
        (r'\bintelligenza artificiale\b', 'IA'),
    ]
    for pattern, replacement in replacements:
        value = re.sub(pattern, replacement, value, flags=re.IGNORECASE)
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

    def translate_many(self, sources: list[str]) -> None:
        pending: list[str] = []
        for source in dict.fromkeys(sources):
            if source in self.cache:
                continue
            stripped = source.strip()
            if stripped in EXACT_OVERRIDES:
                self.cache[source] = EXACT_OVERRIDES[stripped]
            elif not should_translate(source):
                self.cache[source] = source
            else:
                pending.append(source)

        for start in range(0, len(pending), BATCH_SIZE):
            batch = pending[start:start + BATCH_SIZE]
            masked_batch: list[str] = []
            saved_batch: list[list[str]] = []
            for source in batch:
                masked, saved = mask_protected(source)
                masked_batch.append(masked)
                saved_batch.append(saved)

            encoded = self.tokenizer(
                masked_batch,
                return_tensors='pt',
                padding=True,
                truncation=True,
                max_length=512,
            )
            with torch.inference_mode():
                output = self.model.generate(**encoded, max_new_tokens=512, num_beams=1)
            decoded = self.tokenizer.batch_decode(output, skip_special_tokens=True)

            for source, translated, saved in zip(batch, decoded, saved_batch):
                restored = restore_protected(translated, saved)
                if restored is None:
                    self.cache[source] = source
                else:
                    self.cache[source] = postprocess(restored)
            print(f'Translated {min(start + len(batch), len(pending))}/{len(pending)} Italian strings')

    def translate(self, source: str) -> str:
        return self.cache.get(source, source)


def collect_strings(value: Any, output: list[str]) -> None:
    if isinstance(value, str):
        output.append(value)
    elif isinstance(value, list):
        for item in value:
            collect_strings(item, output)
    elif isinstance(value, dict):
        for item in value.values():
            collect_strings(item, output)


def translate_tree(value: Any, translator: Translator) -> Any:
    if isinstance(value, str):
        return translator.translate(value)
    if isinstance(value, list):
        return [translate_tree(item, translator) for item in value]
    if isinstance(value, dict):
        return {key: translate_tree(item, translator) for key, item in value.items()}
    return value


def overlay_existing(source: Any, generated: Any, existing: Any) -> Any:
    if type(source) is not type(generated):
        return generated
    if isinstance(source, dict):
        out = dict(generated)
        if isinstance(existing, dict):
            for key in source:
                if key in existing:
                    out[key] = overlay_existing(source[key], generated[key], existing[key])
        return out
    if isinstance(source, list):
        out = list(generated)
        if isinstance(existing, list):
            for idx in range(min(len(source), len(existing))):
                out[idx] = overlay_existing(source[idx], generated[idx], existing[idx])
        return out
    if isinstance(source, str) and isinstance(existing, str):
        if sorted(placeholders(source)) == sorted(placeholders(existing)):
            return existing
    return generated


def validate_shape(en: Any, it: Any, path: str = '') -> None:
    if type(en) is not type(it):
        raise RuntimeError(f'Type mismatch at {path or "<root>"}')
    if isinstance(en, dict):
        if list(en.keys()) != list(it.keys()):
            raise RuntimeError(f'Key/order mismatch at {path or "<root>"}')
        for key in en:
            validate_shape(en[key], it[key], f'{path}.{key}' if path else key)
    elif isinstance(en, list):
        if len(en) != len(it):
            raise RuntimeError(f'List length mismatch at {path}')
        for idx, (a, b) in enumerate(zip(en, it)):
            validate_shape(a, b, f'{path}[{idx}]')
    elif isinstance(en, str):
        if sorted(placeholders(en)) != sorted(placeholders(it)):
            raise RuntimeError(f'Placeholder mismatch at {path}: {placeholders(en)} != {placeholders(it)}')


def wire_i18n_index() -> None:
    path = ROOT / 'src/i18n/index.ts'
    text = path.read_text(encoding='utf-8')

    missing_imports = []
    for name in REGISTERED_NAMESPACES:
        symbol = f"it{name[0].upper() + name[1:]}"
        import_line = f"import {symbol} from './locales/it/{name}.json'"
        if import_line not in text:
            missing_imports.append(import_line)
    if missing_imports:
        marker = "import {\n  DEFAULT_LANGUAGE,"
        text = text.replace(marker, '\n'.join(missing_imports) + '\n\n' + marker, 1)

    resource_lines = '\n'.join(
        f"    {name}: it{name[0].upper() + name[1:]}," for name in REGISTERED_NAMESPACES
    )
    full_block = f"\n  it: {{\n{resource_lines}\n  }},\n"
    pattern = re.compile(r"\n  it: \{\n(?:    [^\n]*\n)*  \},\n(?=\} as const)")
    if pattern.search(text):
        text = pattern.sub(full_block, text, count=1)
    else:
        text = text.replace('\n} as const\n\nconst initialLanguage', full_block + '} as const\n\nconst initialLanguage', 1)

    supported_match = re.search(r"supportedLngs:\s*\[([^\]]*)\]", text)
    if supported_match and not re.search(r"['\"]it['\"]", supported_match.group(1)):
        inner = supported_match.group(1).rstrip()
        replacement = f"supportedLngs: [{inner}, 'it']"
        text = text[:supported_match.start()] + replacement + text[supported_match.end():]

    path.write_text(text, encoding='utf-8')


def validate_wiring() -> None:
    languages = (ROOT / 'src/i18n/languages.ts').read_text(encoding='utf-8')
    index = (ROOT / 'src/i18n/index.ts').read_text(encoding='utf-8')
    bridge = (ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx').read_text(encoding='utf-8')
    selector = (ROOT / 'src/components/i18n/LanguageSelector.tsx').read_text(encoding='utf-8')

    required = ["code: 'it'", "label: 'Italiano'", "countryCode: 'IT'", "htmlLang: 'it'", "locale: 'it-IT'"]
    for needle in required:
        if needle not in languages:
            raise RuntimeError(f'Missing Italian language metadata: {needle}')
    if "language?.startsWith('it')" not in bridge or "return 'it-IT'" not in bridge:
        raise RuntimeError('Italian date locale formatting is not wired')
    if "it: 'it'" not in selector:
        raise RuntimeError('Italian flag mapping is missing')
    for name in REGISTERED_NAMESPACES:
        if f"./locales/it/{name}.json" not in index:
            raise RuntimeError(f'Missing Italian i18n import: {name}')
        if f"    {name}: it{name[0].upper() + name[1:]}," not in index:
            raise RuntimeError(f'Missing Italian i18n resource: {name}')
    supported_match = re.search(r"supportedLngs:\s*\[([^\]]+)\]", index)
    if not supported_match or not re.search(r"['\"]it['\"]", supported_match.group(1)):
        raise RuntimeError('Italian is missing from supportedLngs')


def main() -> None:
    en_files = sorted(EN_DIR.glob('*.json'))
    if not en_files:
        raise RuntimeError('No English locale resources found')

    sources: list[str] = []
    loaded: dict[str, Any] = {}
    for file in en_files:
        data = load_json(file)
        loaded[file.name] = data
        collect_strings(data, sources)

    translator = Translator()
    translator.translate_many(sources)

    IT_DIR.mkdir(parents=True, exist_ok=True)
    for file in en_files:
        generated = translate_tree(loaded[file.name], translator)
        target_path = IT_DIR / file.name
        if target_path.exists():
            try:
                generated = overlay_existing(loaded[file.name], generated, load_json(target_path))
            except Exception as exc:
                print(f'Could not preserve existing {target_path.name}: {exc}')
        validate_shape(loaded[file.name], generated, file.name)
        save_json(target_path, generated)

    wire_i18n_index()
    validate_wiring()

    it_files = sorted(IT_DIR.glob('*.json'))
    if [p.name for p in en_files] != [p.name for p in it_files]:
        raise RuntimeError('Italian locale filenames do not mirror English exactly')

    print(f'Created complete Italian locale package: {len(it_files)} resources')
    print('Existing Italian preview translations were preserved where structurally compatible.')


if __name__ == '__main__':
    main()
