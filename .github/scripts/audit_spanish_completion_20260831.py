from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN = ROOT / 'src/i18n/locales/en'
ES = ROOT / 'src/i18n/locales/es'
OUT = ROOT / 'spanish_completion_audit.tsv'

PLACEHOLDER_RE = re.compile(r'\{\{\s*([^{}]+?)\s*\}\}')
URL_RE = re.compile(r'https?://|www\.')
CODE_LIKE_RE = re.compile(r'^(?:[A-Z0-9][A-Z0-9 .+/_:#-]*|[a-z0-9_]+\(\)|/[A-Za-z0-9?=&/_\-.#:]+)$')

PROTECTED = {
    'ProPeloton Manager', 'Race Plan', 'Race Plans', 'Stage Plan', 'Stage Plans',
    'Startlist', 'Race Engine', 'Replay Engine', 'Team Policy', 'Race Sharpness',
    'WorldTeam', 'WorldTour', 'ProTeam', 'ProSeries', 'Continental', 'Coins', 'Premium',
    'GC', 'KOM', 'U23', 'UCI', 'RPC', 'Supabase', 'Stripe', 'Discord', 'PNG', 'JPG',
    'JPEG', 'WEBP', 'PDF', 'CSV', 'KPI', 'UI', 'URL', 'ID', 'AI', 'XP', 'FTP',
}

# Known generic-MT choices that are wrong or poor for this game's Spanish UI.
BAD_PATTERNS: list[tuple[str, str]] = [
    (r'\bEquipo Jersey\b', 'machine literal for Team Jersey'),
    (r'\bJersey de equipo\b', 'use maillot/camiseta consistently'),
    (r'\bJersey\b', 'English jersey token leaked'),
    (r'\bplanos? de etapas\b', 'Stage Plans must stay Stage Plans'),
    (r'\bplanes? de etapas\b', 'Stage Plans must stay Stage Plans'),
    (r'\bplanes? de carreras\b', 'Race Plan(s) must stay protected'),
    (r'\blista de inicio\b', 'Startlist must stay Startlist'),
    (r'\blista inicial\b', 'Startlist must stay Startlist'),
    (r'\bmonedas?\b', 'Coins must stay Coins'),
    (r'\bafilado de carrera\b', 'Race Sharpness mistranslation'),
    (r'\bagudeza de carrera\b', 'Race Sharpness mistranslation'),
    (r'\breproductor(?:es)?\b', 'player mistranslated as media player'),
    (r'\bInformer\b', 'French/invalid Spanish verb'),
    (r'\bSalvando\b', 'use Guardando for save progress'),
    (r'\bSalvar\b', 'use Guardar in UI'),
    (r'\bsubstrato\b', 'underscore mistranslation'),
    (r'\bplanes? de raza\b', 'race mistranslation'),
    (r'\braza(?:s)?\b', 'race mistranslated as breed/race'),
    (r'\bescenarios?\b', 'stage likely mistranslated as scenario'),
    (r'\bpaseos\b', 'tour mistranslated as rides'),
    (r'\bengranajes\b', 'gear wording poor in equipment UI'),
    (r'\bTrimestral\b', 'quartered badge pattern mistranslated'),
    (r'\bDiagonal Sash\b', 'mixed English/Spanish pattern label'),
    (r'\bDiagonal Split\b', 'mixed English/Spanish pattern label'),
    (r'\bCentro Stripe\b', 'mixed English/Spanish pattern label'),
    (r'\bKits? de desplazamiento\b', 'scroll translated as physical scrolling kits'),
    (r'\bDerechos de designación\b', 'naming rights wording unnatural'),
    (r'\bTablero de mando\b', 'dashboard literal translation'),
    (r'\bApoyo\b', 'Support should be Soporte in product UI'),
    (r'\bLibre\b', 'Free account should be Gratis/Gratuita'),
    (r'\bExamen anterior\b', 'review mistranslated as exam'),
    (r'\bPróximo examen\b', 'review mistranslated as exam'),
    (r'\bprimer examen\b', 'review mistranslated as exam'),
    (r'\brevisión fue presentada\b', 'review submission wording literal'),
    (r'\bremisión\b', 'referral mistranslated as remisión'),
    (r'\breferencia\b', 'referral context likely mistranslated'),
    (r'\bgerentes?\b', 'manager wording should be checked in game context'),
    (r'\badministradores? activos\b', 'manager mistranslated as system administrator'),
    (r'\bclasificación y clasificación\b', 'duplicated machine translation'),
    (r'\blos ciclista\b', 'plural agreement error'),
    (r'\bde ciclista\b', 'likely plural/possessive agreement error'),
    (r'\bciclista con\b', 'check singular/plural machine output'),
    (r'\bactualizar en vivo\b', 'missing infinitive agreement'),
    (r'\bcorrectos\b', 'likely wrong scrollRight translation'),
    (r'\bfalló al\b', 'unnatural system-message register; prefer No se pudo'),
    (r'\bSírvase\b', 'overly formal/legalistic UI tone'),
    (r'\busted\b', 'formal register inconsistent with game UI'),
    (r'\bsu\b', 'potential formal register; inspect manually'),
    (r'\bjugadores verdaderos\b', 'literal real managers wording'),
    (r'\bgerentes en vivo\b', 'literal live managers wording'),
    (r'\bFoto en vivo\b', 'snapshot mistranslated as photo'),
    (r'\bCaptura de pantalla y actualizaciones del club\b', 'snapshot mistranslated as screenshot'),
]

ENGLISH_WORD_RE = re.compile(
    r'\b(?:save|saving|cancel|close|continue|confirm|back|skip|loading|error|team|rider|riders|race|races|stage|stages|'
    r'profile|settings|preferences|notifications|training|equipment|infrastructure|finance|transfers|scouting|statistics|'
    r'help|support|account|password|email|country|city|season|manager|sponsor|contract|salary|staff|report|history|overview|'
    r'calendar|next|previous|today|tomorrow|yesterday|free|active|pending|completed|failed|available|unavailable|choose|select|'
    r'create|delete|remove|upgrade|purchase|apply|open|view|details|result|results|points|ranking|rankings|classification)\b',
    re.IGNORECASE,
)

CORRUPTION = ('\ufffd', 'Ã', 'Â', 'â€', 'ZXQ', 'QXml')


def walk(value: Any, path: str = ''):
    if isinstance(value, dict):
        for k, v in value.items():
            p = f'{path}.{k}' if path else k
            yield from walk(v, p)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from walk(v, f'{path}[{i}]')
    else:
        yield path, value


def normalize_keys(value: Any):
    if isinstance(value, dict):
        return {k: normalize_keys(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize_keys(v) for v in value]
    return type(value).__name__


def placeholders(text: str) -> list[str]:
    return sorted(PLACEHOLDER_RE.findall(text))


def intentional_identical(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True
    if stripped in PROTECTED:
        return True
    if CODE_LIKE_RE.fullmatch(stripped):
        return True
    if URL_RE.search(stripped):
        return True
    if not re.search(r'[A-Za-z]', stripped):
        return True
    # Short acronyms/names are often intentionally identical.
    if len(stripped) <= 3:
        return True
    return False


def main() -> None:
    rows: list[tuple[str, str, str, str, str]] = []
    en_files = sorted(p.name for p in EN.glob('*.json'))
    es_files = sorted(p.name for p in ES.glob('*.json'))

    if en_files != es_files:
        rows.append(('GLOBAL', '', 'FILE_SET', ','.join(en_files), ','.join(es_files)))

    for name in en_files:
        ep = EN / name
        sp = ES / name
        if not sp.exists():
            rows.append((name, '', 'MISSING_FILE', '', ''))
            continue
        en = json.loads(ep.read_text(encoding='utf-8'))
        es = json.loads(sp.read_text(encoding='utf-8'))

        if normalize_keys(en) != normalize_keys(es):
            rows.append((name, '', 'STRUCTURE', 'English schema', 'Spanish schema differs'))

        en_map = dict(walk(en))
        es_map = dict(walk(es))
        for key, ev in en_map.items():
            sv = es_map.get(key)
            if isinstance(ev, str) and isinstance(sv, str):
                if placeholders(ev) != placeholders(sv):
                    rows.append((name, key, 'PLACEHOLDER', ev, sv))

                if ev == sv and not intentional_identical(ev):
                    rows.append((name, key, 'IDENTICAL_EN', ev, sv))

                for marker in CORRUPTION:
                    if marker in sv:
                        rows.append((name, key, 'CORRUPTION', ev, sv))
                        break

                protected_present = any(term in sv for term in PROTECTED)
                # English leakage, but ignore strings that are exactly protected product terms.
                cleaned = sv
                for term in sorted(PROTECTED, key=len, reverse=True):
                    cleaned = cleaned.replace(term, ' ')
                if ENGLISH_WORD_RE.search(cleaned):
                    rows.append((name, key, 'ENGLISH_LEAK', ev, sv))

                for pattern, reason in BAD_PATTERNS:
                    if re.search(pattern, sv, re.IGNORECASE):
                        rows.append((name, key, 'BAD_SPANISH', reason, sv))
                        break

    with OUT.open('w', encoding='utf-8') as f:
        f.write('file\tkey\ttype\tenglish_or_reason\tspanish\n')
        for row in rows:
            safe = [str(x).replace('\t', ' ').replace('\n', '\\n') for x in row]
            f.write('\t'.join(safe) + '\n')

    counts: dict[str, int] = {}
    for _, _, kind, _, _ in rows:
        counts[kind] = counts.get(kind, 0) + 1
    print(f'Spanish audit findings: {len(rows)}')
    for kind, count in sorted(counts.items()):
        print(f'{kind}: {count}')
    print(f'Report: {OUT}')


if __name__ == '__main__':
    main()
