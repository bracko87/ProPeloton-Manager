from __future__ import annotations

import re

import polish_french_human_quality_20260831 as base

base.REPLACEMENTS.extend([
    (re.compile(r'^Sauver\.\.\.$', re.I), 'Enregistrement...'),
    (re.compile(r'^Rafraîchissant\.\.\.$', re.I), 'Actualisation...'),
    (re.compile(r'\bVanne d’équipement\b|\bVanne d\'équipement\b', re.I), 'Fourgon d’équipement'),
    (re.compile(r'\bVan d’équipement\b|\bVan d\'équipement\b', re.I), 'fourgon d’équipement'),
    (re.compile(r'\bhier, aujourd\'hui et demain courses\b', re.I), 'les courses d’hier, d’aujourd’hui et de demain'),
])

base.OVERRIDES.update({
    'infrastructure.json.assets.equipmentVanPotential': 'Niveau maximal de fourgon d’équipement actuellement configuré et disponible à l’acquisition via le garage.',
    'infrastructure.json.assetTiers.equipment_van.level1.name': 'Fourgon d’équipement de base',
    'infrastructure.json.assetTiers.equipment_van.level2.name': 'Fourgon d’équipement de service',
    'infrastructure.json.assetTiers.equipment_van.level3.name': 'Fourgon d’équipement Pro',
    'manual.json.sections.race-preparation.facts[2].value': 'Bus d’équipe, fourgon d’équipement, atelier mobile, fourgon médical, voitures d’équipe 1–3',
    'manualCore.json.sections.racePreparation.facts[5]': 'Bus d’équipe, fourgon d’équipement, atelier mobile, fourgon médical, voitures d’équipe 1–3',
    'manual.json.sections.public-home-beta.details[3]': 'Les widgets de la page d’accueil peuvent afficher les courses d’hier, d’aujourd’hui et de demain.',
    'manualDeepA.json.sections.publicHomeBeta.details[3]': 'Les widgets de la page d’accueil peuvent afficher les courses d’hier, d’aujourd’hui et de demain.',
})

if __name__ == '__main__':
    base.main()
