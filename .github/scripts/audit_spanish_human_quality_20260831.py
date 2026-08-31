from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
ES = ROOT / 'src/i18n/locales/es'

# High-confidence residual defects. This complements audit_spanish_final_20260831.py.
PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'\b(?:actuales?|antiguos?|jóvenes?|varios?|algunos?|mejores?|primeros?)\s+ciclista\b', re.I), 'plural/adjective agreement around ciclista'),
    (re.compile(r'\b\d+\s+ciclista\b', re.I), 'numeric plural agreement around ciclista'),
    (re.compile(r'\bciclista\s+(?:asignados|disponibles|participantes|reservados|protegidos|heridos)\b', re.I), 'plural agreement around ciclista'),
    (re.compile(r'\b(?:los|las|unos|algunos|varios|tus|sus)\s+ciclista\b', re.I), 'determiner agreement around ciclista'),
    (re.compile(r'\bagentes?\s+gratuitos?\b', re.I), 'free agent must be agente libre'),
    (re.compile(r'\bequipo de venta\b', re.I), 'literal selling-team translation'),
    (re.compile(r'\bmercado de gratis agente\b', re.I), 'broken free-agent wording'),
    (re.compile(r'\bPase por un bar\b', re.I), 'chart bar mistranslated as venue/bar'),
    (re.compile(r'\bAtraviesa un punto\b', re.I), 'hover-dot mistranslation'),
    (re.compile(r'\bEquipo de autobús Garaje\b', re.I), 'machine-translated asset name'),
    (re.compile(r'\bActivos cerrados modal\b', re.I), 'machine-translated aria label'),
    (re.compile(r'\bRecuperación La planificación\b', re.I), 'broken training sentence'),
    (re.compile(r'\bSobreseer el\b', re.I), 'override mistranslation'),
    (re.compile(r'No hay actividad de ciclista registrada está disponible', re.I), 'broken rider activity sentence'),
    (re.compile(r'\bRace Pready\b', re.I), 'corrupted Race Ready wording'),
    (re.compile(r'\bEquipo Jersey\b|\bCarrera Jersey\b|\bRace Jersey\b', re.I), 'Jersey literal/mixed translation'),
    (re.compile(r'\bapoyo domestico\b', re.I), 'domestique mistranslation'),
    (re.compile(r'\bcontrarreloj completo\b', re.I), 'time-trial agreement/wording'),
    (re.compile(r'\briesgoso\b', re.I), 'awkward offer outlook wording'),
    (re.compile(r'\bcaja-club\b', re.I), 'literal club-cash wording'),
    (re.compile(r'\bsponsor de nombres-derechos\b', re.I), 'literal naming-rights wording'),
    (re.compile(r'\bfalló al\b', re.I), 'unnatural system error; use No se pudo'),
    (re.compile(r'\bSalvando\b|\bSalvar\b', re.I), 'save mistranslation'),
    (re.compile(r'\breproductor(?:es)?\b', re.I), 'player/rider mistranslation'),
    (re.compile(r'\brazas?\b|\bjinetes?\b', re.I), 'race/rider mistranslation'),
    (re.compile(r'\bplanes? de etapas?\b|\bplanos? de etapas?\b', re.I), 'Stage Plan(s) vocabulary changed'),
    (re.compile(r'\bplanes? de carreras?\b', re.I), 'Race Plan(s) vocabulary changed'),
    (re.compile(r'\bHoy en día las carreras\b', re.I), 'literal Today races wording'),
    (re.compile(r'\bDiseño interior y colores actualizar en vivo\b', re.I), 'broken live-preview sentence'),
    (re.compile(r'\bEnviar contraseña Cambiar correo electrónico\b', re.I), 'merged account UI text'),
]

# In game UI/tutorial/manual copy we use informal second-person Spanish. Legal/public policy copy is excluded.
FORMAL = re.compile(r'\b(?:usted|ustedes|Sírvase)\b', re.I)
FORMAL_EXCLUDED = {'publicInfo.json'}


def walk(value: Any, path: str = ''):
    if isinstance(value, dict):
        for k, v in value.items():
            yield from walk(v, f'{path}.{k}' if path else k)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from walk(v, f'{path}[{i}]')
    elif isinstance(value, str):
        yield path, value


def main() -> None:
    blockers: list[str] = []
    for file in sorted(ES.glob('*.json')):
        data = json.loads(file.read_text(encoding='utf-8'))
        for path, text in walk(data):
            for pattern, reason in PATTERNS:
                if pattern.search(text):
                    blockers.append(f'{file.name}.{path}: {reason}: {text!r}')
                    break
            if file.name not in FORMAL_EXCLUDED and FORMAL.search(text):
                blockers.append(f'{file.name}.{path}: inconsistent formal register: {text!r}')

    print(f'Human Spanish quality blockers: {len(blockers)}')
    for item in blockers[:1000]:
        print('BLOCKER:', item)
    if blockers:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
