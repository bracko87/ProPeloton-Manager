from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
FR_DIR = ROOT / 'src/i18n/locales/fr'
MODEL_NAME = 'Helsinki-NLP/opus-mt-en-fr'
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
    'Discord', 'Edge Function', 'RPC', 'KPI', 'GC', 'KOM', 'U23', 'UCI',
    'JPG', 'JPEG', 'PNG', 'WEBP', 'PDF', 'CSV', 'Coins', 'Premium', 'FTP', 'VO2',
    'DNF', 'DNS', 'OTL', 'ITT', 'TTT',
]

EXACT_OVERRIDES = {
    'Home': 'Accueil',
    'Overview': 'Vue d’ensemble',
    'Squad': 'Effectif',
    'Staff': 'Staff',
    'Calendar': 'Calendrier',
    'Race Preparation': 'Préparation de course',
    'Team Ranking': 'Classement des équipes',
    'Training': 'Entraînement',
    'Equipment': 'Équipement',
    'Infrastructure': 'Infrastructure',
    'Finance': 'Finances',
    'Transfers': 'Transferts',
    'Scouting': 'Scouting',
    'Statistics': 'Statistiques',
    'Inbox': 'Boîte de réception',
    'My Profile': 'Mon profil',
    'Preferences': 'Préférences',
    'Help': 'Aide',
    'Sign In': 'Se connecter',
    'Sign Out': 'Se déconnecter',
    'Logout': 'Se déconnecter',
    'Save': 'Enregistrer',
    'Cancel': 'Annuler',
    'Close': 'Fermer',
    'Continue': 'Continuer',
    'Confirm': 'Confirmer',
    'Back': 'Retour',
    'Open': 'Ouvrir',
    'Loading…': 'Chargement…',
    'Loading...': 'Chargement...',
    'Rider': 'Coureur',
    'Riders': 'Coureurs',
    'Team': 'Équipe',
    'Teams': 'Équipes',
    'Race': 'Course',
    'Races': 'Courses',
    'Stage': 'Étape',
    'Stages': 'Étapes',
    'Stage Race': 'Course par étapes',
    'Season': 'Saison',
    'Report': 'Rapport',
    'Reports': 'Rapports',
    'History': 'Historique',
    'Comparison': 'Comparaison',
    'Current': 'Actuel',
    'Next': 'Suivant',
    'Previous': 'Précédent',
    'Country': 'Pays',
    'Team Country': "Pays de l’équipe",
    'Team Name': "Nom de l’équipe",
    'Team Motto (optional)': "Devise de l’équipe (facultatif)",
    'Primary Color': 'Couleur principale',
    'Secondary Color': 'Couleur secondaire',
    'Create Your Team': 'Créez votre équipe',
    'Team Preview': "Aperçu de l’équipe",
    'Game language': 'Langue du jeu',
    'English': 'English',
    'Srpski': 'Srpski',
    'Deutsch': 'Deutsch',
    'Hrvatski': 'Hrvatski',
    'Español': 'Español',
    'Italiano': 'Italiano',
    'Français': 'Français',
    'Training Camp': "Stage d’entraînement",
    'Training Camps': "Stages d’entraînement",
    'Free Agent': 'Coureur libre',
    'Free Agents': 'Coureurs libres',
    'Time Trial': 'Contre-la-montre',
    'Individual Time Trial': 'Contre-la-montre individuel',
    'Team Time Trial': 'Contre-la-montre par équipes',
    'Breakaway': 'Échappée',
    'Climber': 'Grimpeur',
    'Sprinter': 'Sprinteur',
    'AI': 'IA',
    'Active': 'Actif',
    'Inactive': 'Inactif',
    'Yes': 'Oui',
    'No': 'Non',
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
    # Stripe is protected only in payment/product context, not visual design phrases such as Center Stripe.
    if re.search(r'\b(?:payment|billing|checkout|webhook|subscription)\b', value, re.I):
        spans.extend(match.span() for match in re.finditer(r'(?<!\w)Stripe(?!\w)', value))
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
        token = f'PpFrTk{idx}Xx'
        out.append(token)
        saved.append(value[start:end])
        cursor = end
    out.append(value[cursor:])
    return ''.join(out), saved


def restore_protected(value: str, saved: list[str]) -> str | None:
    result = value
    for idx, original in enumerate(saved):
        token = f'PpFrTk{idx}Xx'
        pattern = re.compile(re.escape(token), flags=re.IGNORECASE)
        if not pattern.search(result):
            return None
        result = pattern.sub(original, result, count=1)
    return result


def postprocess(value: str) -> str:
    replacements = [
        (r'\bcavalier\b', 'coureur'),
        (r'\bcavaliers\b', 'coureurs'),
        (r'\bpilote\b', 'coureur'),
        (r'\bpilotes\b', 'coureurs'),
        (r'\bagent gratuit\b', 'coureur libre'),
        (r'\bagents gratuits\b', 'coureurs libres'),
        (r'\bpièces\b', 'Coins'),
        (r'\bintelligence artificielle\b', 'IA'),
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
                self.cache[source] = source if restored is None else postprocess(restored)
            print(f'Translated {min(start + len(batch), len(pending))}/{len(pending)} French strings')

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


def validate_shape(en: Any, fr: Any, path: str = '') -> None:
    if type(en) is not type(fr):
        raise RuntimeError(f'Type mismatch at {path or "<root>"}')
    if isinstance(en, dict):
        if list(en.keys()) != list(fr.keys()):
            raise RuntimeError(f'Key/order mismatch at {path or "<root>"}')
        for key in en:
            validate_shape(en[key], fr[key], f'{path}.{key}' if path else key)
    elif isinstance(en, list):
        if len(en) != len(fr):
            raise RuntimeError(f'List length mismatch at {path}')
        for idx, (a, b) in enumerate(zip(en, fr)):
            validate_shape(a, b, f'{path}[{idx}]')
    elif isinstance(en, str):
        if sorted(placeholders(en)) != sorted(placeholders(fr)):
            raise RuntimeError(f'Placeholder mismatch at {path}: {placeholders(en)} != {placeholders(fr)}')


def wire_language_metadata() -> None:
    path = ROOT / 'src/i18n/languages.ts'
    text = path.read_text(encoding='utf-8')
    if "code: 'fr'" not in text:
        block = """  {\n    code: 'fr',\n    label: 'Français',\n    shortLabel: 'FR',\n    flag: '🇫🇷',\n    countryCode: 'FR',\n    htmlLang: 'fr',\n    locale: 'fr-FR',\n  },\n"""
        marker = '] as const\n\nexport type SupportedLanguage'
        if marker not in text:
            raise RuntimeError('Could not locate supported language array')
        text = text.replace(marker, block + marker, 1)
        path.write_text(text, encoding='utf-8')

    selector_path = ROOT / 'src/components/i18n/LanguageSelector.tsx'
    selector = selector_path.read_text(encoding='utf-8')
    if "fr: 'fr'" not in selector:
        marker = "  it: 'it',\n}"
        if marker not in selector:
            raise RuntimeError('Could not locate language flag mapping')
        selector = selector.replace(marker, "  it: 'it',\n  fr: 'fr',\n}", 1)
        selector_path.write_text(selector, encoding='utf-8')

    bridge_path = ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx'
    bridge = bridge_path.read_text(encoding='utf-8')
    if "language?.startsWith('fr')" not in bridge:
        marker = "  if (language?.startsWith('it')) return 'it-IT'\n"
        if marker not in bridge:
            raise RuntimeError('Could not locate date locale mapping')
        bridge = bridge.replace(marker, marker + "  if (language?.startsWith('fr')) return 'fr-FR'\n", 1)
        bridge_path.write_text(bridge, encoding='utf-8')


def wire_i18n_index() -> None:
    path = ROOT / 'src/i18n/index.ts'
    text = path.read_text(encoding='utf-8')

    missing_imports = []
    for name in REGISTERED_NAMESPACES:
        symbol = f"fr{name[0].upper() + name[1:]}"
        import_line = f"import {symbol} from './locales/fr/{name}.json'"
        if import_line not in text:
            missing_imports.append(import_line)
    if missing_imports:
        marker = "import {\n  DEFAULT_LANGUAGE,"
        if marker not in text:
            raise RuntimeError('Could not locate i18n language import marker')
        text = text.replace(marker, '\n'.join(missing_imports) + '\n\n' + marker, 1)

    resource_lines = '\n'.join(
        f"    {name}: fr{name[0].upper() + name[1:]}," for name in REGISTERED_NAMESPACES
    )
    full_block = f"\n  fr: {{\n{resource_lines}\n  }},\n"
    pattern = re.compile(r"\n  fr: \{\n(?:    [^\n]*\n)*  \},\n(?=\} as const)")
    if pattern.search(text):
        text = pattern.sub(full_block, text, count=1)
    else:
        marker = '\n} as const\n\nconst initialLanguage'
        if marker not in text:
            raise RuntimeError('Could not locate i18n resources terminator')
        text = text.replace(marker, full_block + '} as const\n\nconst initialLanguage', 1)

    supported_match = re.search(r"supportedLngs:\s*\[([^\]]*)\]", text)
    if not supported_match:
        raise RuntimeError('Could not locate supportedLngs')
    if not re.search(r"['\"]fr['\"]", supported_match.group(1)):
        inner = supported_match.group(1).rstrip()
        replacement = f"supportedLngs: [{inner}, 'fr']"
        text = text[:supported_match.start()] + replacement + text[supported_match.end():]

    path.write_text(text, encoding='utf-8')


def validate_wiring() -> None:
    languages = (ROOT / 'src/i18n/languages.ts').read_text(encoding='utf-8')
    index = (ROOT / 'src/i18n/index.ts').read_text(encoding='utf-8')
    bridge = (ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx').read_text(encoding='utf-8')
    selector = (ROOT / 'src/components/i18n/LanguageSelector.tsx').read_text(encoding='utf-8')

    for needle in ["code: 'fr'", "label: 'Français'", "flag: '🇫🇷'", "countryCode: 'FR'", "htmlLang: 'fr'", "locale: 'fr-FR'"]:
        if needle not in languages:
            raise RuntimeError(f'Missing French language metadata: {needle}')
    if "language?.startsWith('fr')" not in bridge or "return 'fr-FR'" not in bridge:
        raise RuntimeError('French date locale formatting is not wired')
    if "fr: 'fr'" not in selector:
        raise RuntimeError('French flag mapping is missing')
    for name in REGISTERED_NAMESPACES:
        if f"./locales/fr/{name}.json" not in index:
            raise RuntimeError(f'Missing French i18n import: {name}')
        if f"    {name}: fr{name[0].upper() + name[1:]}," not in index:
            raise RuntimeError(f'Missing French i18n resource: {name}')
    supported_match = re.search(r"supportedLngs:\s*\[([^\]]+)\]", index)
    if not supported_match or not re.search(r"['\"]fr['\"]", supported_match.group(1)):
        raise RuntimeError('French is missing from supportedLngs')


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

    FR_DIR.mkdir(parents=True, exist_ok=True)
    for file in en_files:
        generated = translate_tree(loaded[file.name], translator)
        validate_shape(loaded[file.name], generated, file.name)
        save_json(FR_DIR / file.name, generated)

    wire_language_metadata()
    wire_i18n_index()
    validate_wiring()

    fr_files = sorted(FR_DIR.glob('*.json'))
    if [p.name for p in en_files] != [p.name for p in fr_files]:
        raise RuntimeError('French locale filenames do not mirror English exactly')

    print(f'Created complete French locale package: {len(fr_files)} resources')


if __name__ == '__main__':
    main()
