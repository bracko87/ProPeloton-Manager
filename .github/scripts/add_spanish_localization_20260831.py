from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
ES_DIR = ROOT / 'src/i18n/locales/es'
MODEL_NAME = 'Helsinki-NLP/opus-mt-en-es'
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
    'JPG', 'JPEG', 'PNG', 'WEBP', 'PDF', 'CSV', 'Coins', 'Premium',
]

EXACT_OVERRIDES = {
    'Home': 'Inicio',
    'Overview': 'Resumen',
    'Squad': 'Plantilla',
    'Staff': 'Personal',
    'Calendar': 'Calendario',
    'Race Preparation': 'Preparación de carrera',
    'Team Ranking': 'Clasificación por equipos',
    'Training': 'Entrenamiento',
    'Equipment': 'Equipamiento',
    'Infrastructure': 'Infraestructura',
    'Finance': 'Finanzas',
    'Transfers': 'Fichajes',
    'Scouting': 'Ojeo',
    'Statistics': 'Estadísticas',
    'Inbox': 'Bandeja de entrada',
    'My Profile': 'Mi perfil',
    'Preferences': 'Preferencias',
    'Help': 'Ayuda',
    'Sign In': 'Iniciar sesión',
    'Sign Out': 'Cerrar sesión',
    'Logout': 'Cerrar sesión',
    'Save': 'Guardar',
    'Cancel': 'Cancelar',
    'Close': 'Cerrar',
    'Open': 'Abrir',
    'Loading…': 'Cargando…',
    'Loading...': 'Cargando...',
    'Rider': 'Ciclista',
    'Riders': 'Ciclistas',
    'Team': 'Equipo',
    'Teams': 'Equipos',
    'Race': 'Carrera',
    'Races': 'Carreras',
    'Stage': 'Etapa',
    'Stages': 'Etapas',
    'Season': 'Temporada',
    'Report': 'Informe',
    'Reports': 'Informes',
    'History': 'Historial',
    'Comparison': 'Comparación',
    'Current': 'Actual',
    'Next': 'Siguiente',
    'Country': 'País',
    'Team Country': 'País del equipo',
    'Team Name': 'Nombre del equipo',
    'Team Motto (optional)': 'Lema del equipo (opcional)',
    'Primary Color': 'Color principal',
    'Secondary Color': 'Color secundario',
    'Create Your Team': 'Crea tu equipo',
    'Team Preview': 'Vista previa del equipo',
    'Game language': 'Idioma del juego',
    'English': 'English',
    'Srpski': 'Srpski',
    'Deutsch': 'Deutsch',
    'Hrvatski': 'Hrvatski',
    'Español': 'Español',
    'Training Camp': 'Concentración de entrenamiento',
    'Training Camps': 'Concentraciones de entrenamiento',
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
        (r'\bjinete(?:s)?\b', 'ciclista'),
        (r'\bpiloto(?:s)?\b', 'ciclista'),
        (r'\betapa de carrera\b', 'etapa'),
        (r'\bmonedas\b', 'Coins'),
        (r'\bmoneda\b', 'Coins'),
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
                    # Safety fallback: never corrupt placeholders or protected game terms.
                    self.cache[source] = source
                else:
                    self.cache[source] = postprocess(restored)
            print(f'Translated {min(start + len(batch), len(pending))}/{len(pending)} Spanish strings')

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


def validate_shape(en: Any, es: Any, path: str = '') -> None:
    if type(en) is not type(es):
        raise RuntimeError(f'Type mismatch at {path or "<root>"}')
    if isinstance(en, dict):
        if list(en.keys()) != list(es.keys()):
            raise RuntimeError(f'Key/order mismatch at {path or "<root>"}')
        for key in en:
            validate_shape(en[key], es[key], f'{path}.{key}' if path else key)
    elif isinstance(en, list):
        if len(en) != len(es):
            raise RuntimeError(f'List length mismatch at {path}')
        for idx, (a, b) in enumerate(zip(en, es)):
            validate_shape(a, b, f'{path}[{idx}]')
    elif isinstance(en, str):
        if sorted(placeholders(en)) != sorted(placeholders(es)):
            raise RuntimeError(f'Placeholder mismatch at {path}: {placeholders(en)} != {placeholders(es)}')


def wire_languages() -> None:
    path = ROOT / 'src/i18n/languages.ts'
    text = path.read_text(encoding='utf-8')
    if "code: 'es'" not in text:
        block = """  {\n    code: 'es',\n    label: 'Español',\n    shortLabel: 'ES',\n    flag: '🇪🇸',\n    countryCode: 'ES',\n    htmlLang: 'es',\n    locale: 'es-ES',\n  },\n"""
        text = text.replace('] as const', block + '] as const', 1)
        path.write_text(text, encoding='utf-8')

    bridge = ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx'
    text = bridge.read_text(encoding='utf-8')
    if "startsWith('es')" not in text:
        text = text.replace(
            "  if (language?.startsWith('hr')) return 'hr-HR'\n",
            "  if (language?.startsWith('hr')) return 'hr-HR'\n  if (language?.startsWith('es')) return 'es-ES'\n",
            1,
        )
        bridge.write_text(text, encoding='utf-8')


def wire_i18n_index() -> None:
    path = ROOT / 'src/i18n/index.ts'
    text = path.read_text(encoding='utf-8')

    if "./locales/es/accountPages.json" not in text:
        imports = '\n'.join(
            f"import es{name[0].upper() + name[1:]} from './locales/es/{name}.json'"
            for name in REGISTERED_NAMESPACES
        ) + '\n\n'
        marker = "import {\n  DEFAULT_LANGUAGE,"
        text = text.replace(marker, imports + marker, 1)

    if '\n  es: {\n' not in text:
        resource_lines = '\n'.join(
            f"    {name}: es{name[0].upper() + name[1:]}," for name in REGISTERED_NAMESPACES
        )
        block = f"  es: {{\n{resource_lines}\n  }},\n"
        text = text.replace('\n} as const\n\nconst initialLanguage', '\n' + block + '} as const\n\nconst initialLanguage', 1)

    text = text.replace(
        "supportedLngs: ['en', 'sr-Latn', 'de', 'hr'],",
        "supportedLngs: ['en', 'sr-Latn', 'de', 'hr', 'es'],",
    )
    path.write_text(text, encoding='utf-8')


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

    ES_DIR.mkdir(parents=True, exist_ok=True)
    for file in en_files:
        translated = translate_tree(loaded[file.name], translator)
        validate_shape(loaded[file.name], translated, file.name)
        save_json(ES_DIR / file.name, translated)

    wire_languages()
    wire_i18n_index()

    print(f'Created {len(en_files)} Spanish locale resources in {ES_DIR}')


if __name__ == '__main__':
    main()
