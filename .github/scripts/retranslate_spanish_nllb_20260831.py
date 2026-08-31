from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
ES_DIR = ROOT / 'src/i18n/locales/es'
OUT_DIR = Path(os.environ.get('SPANISH_BATCH_OUTPUT', str(ROOT / '_spanish_batch')))
MODEL = 'facebook/nllb-200-distilled-600M'
BATCH_INDEX = int(os.environ.get('SPANISH_BATCH_INDEX', '0'))
TOTAL_BATCHES = int(os.environ.get('SPANISH_TOTAL_BATCHES', '8'))

# Already hand-polished visible Spanish preview pages.
PROTECTED_FILES = {
    'common.json',
    'accountPages.json',
    'navigation.json',
    'home.json',
    'createClub.json',
}

PROTECTED_TERMS = [
    'ProPeloton Manager', 'Stage Plans', 'Stage Plan', 'Race Plans', 'Race Plan',
    'Startlist', 'Race Engine', 'Replay Engine', 'Team Policy', 'Race Sharpness',
    'WorldTeam', 'WorldTour', 'ProTeam', 'ProSeries', 'Continental', 'Supabase',
    'Stripe', 'Discord', 'Edge Function', 'RPC', 'KPI', 'GC', 'KOM', 'U23', 'UCI',
    'JPG', 'JPEG', 'PNG', 'WEBP', 'PDF', 'CSV', 'Coins', 'Premium',
]

PLACEHOLDER_RE = re.compile(r'\{\{[^{}]+\}\}')
URL_RE = re.compile(r'https?://[^\s)\]}]+')
CODE_RE = re.compile(r'\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b(?:\(\))?|\b[A-Za-z_][A-Za-z0-9_]*\(\)')

EXACT = {
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
    'Support': 'Soporte',
    'Sign In': 'Iniciar sesión',
    'Sign Out': 'Cerrar sesión',
    'Logout': 'Cerrar sesión',
    'Save': 'Guardar',
    'Saving...': 'Guardando...',
    'Saving…': 'Guardando…',
    'Cancel': 'Cancelar',
    'Close': 'Cerrar',
    'Open': 'Abrir',
    'Continue': 'Continuar',
    'Confirm': 'Confirmar',
    'Loading...': 'Cargando...',
    'Loading…': 'Cargando…',
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
    'Previous': 'Anterior',
    'Free': 'Gratis',
    'Active': 'Activo',
    'Pending': 'Pendiente',
    'Completed': 'Completado',
    'Contract': 'Contrato',
    'Salary': 'Salario',
    'Sponsor': 'Patrocinador',
    'Sponsors': 'Patrocinadores',
    'Training Camp': 'Concentración de entrenamiento',
    'Training Camps': 'Concentraciones de entrenamiento',
}


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def save(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def should_translate(text: str) -> bool:
    s = text.strip()
    if not s or not re.search(r'[A-Za-z]', s):
        return False
    if s in PROTECTED_TERMS:
        return False
    if re.fullmatch(r'[A-Z0-9 .+/_:#-]+', s):
        return False
    if re.fullmatch(r'https?://\S+', s):
        return False
    return True


def protect(text: str) -> tuple[str, dict[str, str]]:
    spans: list[tuple[int, int]] = []
    for term in sorted(PROTECTED_TERMS, key=len, reverse=True):
        for m in re.finditer(rf'(?<!\w){re.escape(term)}(?!\w)', text):
            spans.append(m.span())
    for pattern in (PLACEHOLDER_RE, URL_RE, CODE_RE):
        spans.extend(m.span() for m in pattern.finditer(text))
    if not spans:
        return text, {}
    spans.sort()
    merged: list[tuple[int, int]] = []
    for start, end in spans:
        if merged and start < merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    out: list[str] = []
    mapping: dict[str, str] = {}
    cursor = 0
    for idx, (start, end) in enumerate(merged):
        token = f'{{{{PPMKEEP{idx}}}}}'
        out.append(text[cursor:start])
        out.append(token)
        mapping[token] = text[start:end]
        cursor = end
    out.append(text[cursor:])
    return ''.join(out), mapping


def restore(text: str, mapping: dict[str, str]) -> str:
    result = text
    for token, original in mapping.items():
        candidates = {
            token,
            token.replace('{{', '{ {').replace('}}', '} }'),
            token.replace('{{', '{{ ').replace('}}', ' }}'),
        }
        replaced = False
        for candidate in candidates:
            if candidate in result:
                result = result.replace(candidate, original)
                replaced = True
                break
        if not replaced:
            raise RuntimeError(f'Protected token lost during translation: {token} in {text!r}')
    return result


def postprocess(text: str) -> str:
    replacements = [
        (r'\blista de salida\b', 'Startlist'),
        (r'\blista de inicio\b', 'Startlist'),
        (r'\bplanes? de carrera\b', 'Race Plan'),
        (r'\bplanes? de etapa\b', 'Stage Plans'),
        (r'\bmonedas?\b', 'Coins'),
        (r'\bagudeza de carrera\b', 'Race Sharpness'),
        (r'\bafilado de carrera\b', 'Race Sharpness'),
        (r'\breproductor(?:es)?\b', 'jugador'),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    text = re.sub(r'\s+([,.;:!?])', r'\1', text)
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()


class Translator:
    def __init__(self, fallbacks: dict[str, str]) -> None:
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL, src_lang='eng_Latn')
        self.model = AutoModelForSeq2SeqLM.from_pretrained(MODEL)
        self.model.eval()
        self.target_id = self.tokenizer.convert_tokens_to_ids('spa_Latn')
        torch.set_num_threads(max(1, min(4, torch.get_num_threads())))
        self.cache: dict[str, str] = {}
        self.fallbacks = fallbacks

    def translate_many(self, sources: list[str]) -> None:
        unique = list(dict.fromkeys(sources))
        pending: list[tuple[str, str, dict[str, str]]] = []
        for source in unique:
            stripped = source.strip()
            if stripped in EXACT:
                self.cache[source] = EXACT[stripped]
            elif not should_translate(source):
                self.cache[source] = source
            else:
                protected, mapping = protect(source)
                pending.append((source, protected, mapping))

        batch_size = 10
        for start in range(0, len(pending), batch_size):
            batch = pending[start:start + batch_size]
            inputs = [item[1] for item in batch]
            enc = self.tokenizer(inputs, return_tensors='pt', padding=True, truncation=True, max_length=512)
            with torch.inference_mode():
                out = self.model.generate(
                    **enc,
                    forced_bos_token_id=self.target_id,
                    max_new_tokens=512,
                    num_beams=2,
                )
            decoded = self.tokenizer.batch_decode(out, skip_special_tokens=True)
            for (source, _, mapping), translated in zip(batch, decoded):
                try:
                    restored = restore(translated, mapping)
                except RuntimeError as exc:
                    fallback = self.fallbacks.get(source)
                    if fallback is None:
                        raise
                    self.cache[source] = fallback
                    print(f'batch {BATCH_INDEX}: protected-token fallback used: {exc}', flush=True)
                else:
                    self.cache[source] = postprocess(restored)
            print(f'batch {BATCH_INDEX}: translated {min(start + len(batch), len(pending))}/{len(pending)} unique strings', flush=True)

    def translate_value(self, value: Any) -> Any:
        if isinstance(value, str):
            return self.cache[value]
        if isinstance(value, list):
            return [self.translate_value(v) for v in value]
        if isinstance(value, dict):
            return {k: self.translate_value(v) for k, v in value.items()}
        return value


def collect_strings(value: Any, out: list[str]) -> None:
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, list):
        for v in value:
            collect_strings(v, out)
    elif isinstance(value, dict):
        for v in value.values():
            collect_strings(v, out)


def collect_fallbacks(source: Any, fallback: Any, out: dict[str, str]) -> None:
    if isinstance(source, str) and isinstance(fallback, str):
        out.setdefault(source, fallback)
    elif isinstance(source, dict) and isinstance(fallback, dict):
        for key, value in source.items():
            if key in fallback:
                collect_fallbacks(value, fallback[key], out)
    elif isinstance(source, list) and isinstance(fallback, list):
        for value, old in zip(source, fallback):
            collect_fallbacks(value, old, out)


def main() -> None:
    names = [p.name for p in sorted(EN_DIR.glob('*.json')) if p.name not in PROTECTED_FILES]
    mine = [name for idx, name in enumerate(names) if idx % TOTAL_BATCHES == BATCH_INDEX]
    print(f'batch {BATCH_INDEX}/{TOTAL_BATCHES}: {mine}', flush=True)

    values: dict[str, Any] = {name: load(EN_DIR / name) for name in mine}
    old_spanish: dict[str, Any] = {
        name: load(ES_DIR / name) for name in mine if (ES_DIR / name).exists()
    }
    fallbacks: dict[str, str] = {}
    for name, value in values.items():
        if name in old_spanish:
            collect_fallbacks(value, old_spanish[name], fallbacks)

    translator = Translator(fallbacks)
    strings: list[str] = []
    for value in values.values():
        collect_strings(value, strings)
    translator.translate_many(strings)
    for name, value in values.items():
        save(OUT_DIR / name, translator.translate_value(value))
        print(f'wrote {name}', flush=True)


if __name__ == '__main__':
    main()
