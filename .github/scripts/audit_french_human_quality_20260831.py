from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FR = ROOT / 'src/i18n/locales/fr'

BAD_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'langue de la demande', re.I), 'application language literal MT'),
    (re.compile(r'gestion de vélo|gestion du vélo', re.I), 'cycling management literal MT'),
    (re.compile(r'\bSnaphot\b', re.I), 'English typo remains'),
    (re.compile(r'Régime d.?assurance-chômage', re.I), 'UI mistranslated as unemployment insurance'),
    (re.compile(r'\bSauvages utilisés\b', re.I), 'rescues mistranslated'),
    (re.compile(r'\bClub liquide\b', re.I), 'liquidated club mistranslated'),
    (re.compile(r'\brenversement(?: de la saison)?\b', re.I), 'season rollover literal MT'),
    (re.compile(r'\bVannes? (?:médicales?|d.?équipement)\b', re.I), 'van mistranslated as valve'),
    (re.compile(r'\bVans? (?:médicaux?|d.?équipement)\b', re.I), 'English van remains'),
    (re.compile(r'\bPorte-photo\b', re.I), 'image placeholder literal MT'),
    (re.compile(r'\bFentes? (?:pleines|vides)?\b', re.I), 'slot mistranslated as slit'),
    (re.compile(r'\bOwned\s+\{\{|\bPending\s+\{\{', re.I), 'English owned/pending remains'),
    (re.compile(r'\bIl a échoué à\b', re.I), 'unnatural failure construction'),
    (re.compile(r'\bMaître la saison\b', re.I), 'Master the season literal MT'),
    (re.compile(r'\bDemain Courses\b|\bTotal Courses\b', re.I), 'mixed English/French race wording'),
    (re.compile(r'\bScout, soumission\b', re.I), 'transfer market literal MT'),
    (re.compile(r'\bRafraîchissant\.\.\.', re.I), 'refresh loading literal MT'),
    (re.compile(r'\bSauver\.\.\.', re.I), 'save loading literal MT'),
]

EXPECTED = {
    ('common.json', ('language', 'applicationLanguage')): 'Langue de l’application',
    ('profile.json', ('dropdown', 'signedInAs')): 'Connecté en tant que',
    ('home.json', ('hero', 'titleLine3')): 'Dominez la saison.',
    ('navigation.json', ('subtitle',)): 'Gestion cycliste multijoueur',
    ('infrastructure.json', ('assets', 'ownedPending')): 'Possédés {{owned}} · En attente {{pending}}',
}


def walk(value: Any, path: str, issues: list[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            walk(item, f'{path}.{key}' if path else key, issues)
    elif isinstance(value, list):
        for idx, item in enumerate(value):
            walk(item, f'{path}[{idx}]', issues)
    elif isinstance(value, str):
        for pattern, reason in BAD_PATTERNS:
            if pattern.search(value):
                issues.append(f'{path}: {reason}: {value!r}')
                break


def get_path(data: Any, tokens: tuple[str, ...]) -> Any:
    cursor = data
    for token in tokens:
        cursor = cursor[token]
    return cursor


def main() -> None:
    issues: list[str] = []
    files = sorted(FR.glob('*.json'))
    for file in files:
        data = json.loads(file.read_text(encoding='utf-8'))
        walk(data, file.name, issues)

    for (file_name, tokens), expected in EXPECTED.items():
        data = json.loads((FR / file_name).read_text(encoding='utf-8'))
        actual = get_path(data, tokens)
        if actual != expected:
            issues.append(f'{file_name}.{".".join(tokens)}: expected polished French {expected!r}, got {actual!r}')

    print(f'French human-quality files checked: {len(files)}')
    print(f'French human-quality blockers: {len(issues)}')
    for item in issues[:1000]:
        print('BLOCKER:', item)
    if issues:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
