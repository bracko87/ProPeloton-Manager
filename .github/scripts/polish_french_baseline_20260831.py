from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
FR_DIR = ROOT / 'src/i18n/locales/fr'
PH = re.compile(r'\{\{[^{}]+\}\}')

SOURCE_OVERRIDES: dict[str, str] = {
    '{{race}} · Stage {{stage}}': '{{race}} · Étape {{stage}}',
    'Stage results – Stage {{stage}}': 'Résultats de l’étape – Étape {{stage}}',
    'Startlist & Stage Plans': 'Startlist et Stage Plans',
    'Activate Developing Team — {{cost}} Coins': 'Activer Developing Team — {{cost}} Coins',
    'You need {{cost}} coins to activate Developing Team access. Current balance: {{balance}} coins.': "Il vous faut {{cost}} Coins pour activer l’accès à Developing Team. Solde actuel : {{balance}} Coins.",
    'Free and Premium players can purchase additional coins for optional features and expansions. Buying coins does not activate Premium membership.': "Les joueurs Free et Premium peuvent acheter des Coins supplémentaires pour des fonctionnalités et extensions optionnelles. L’achat de Coins n’active pas l’abonnement Premium.",
    'Team-level stage setup: 1–4 bidons per rider.': 'Configuration d’équipe pour l’étape : 1 à 4 bidons par coureur.',
    'Team-level stage setup: 0–4 gels per rider.': 'Configuration d’équipe pour l’étape : 0 à 4 gels énergétiques par coureur.',
    'Team-level stage setup: 0–2 nutrition packs per rider.': 'Configuration d’équipe pour l’étape : 0 à 2 packs nutritionnels par coureur.',
    'Durable reusable item. Each jacket has 25 stage uses. One use is counted whenever the jacket is assigned/used for a stage.': 'Objet durable et réutilisable. Chaque veste dispose de 25 utilisations d’étape. Une utilisation est comptée chaque fois que la veste est attribuée ou utilisée pour une étape.',
    'Missing jersey kit: blocks stage setup': 'Tenue de course manquante : bloque la configuration de l’étape',
    '{{name}} stage plan rule': 'Règle Stage Plan de {{name}}',
    'Bidons use 1–4 per rider in stage setup. They are one-use consumables and support hydration and fatigue control. Below minimum can increase fatigue risk.': 'Les bidons sont utilisés à raison de 1 à 4 par coureur dans la configuration de l’étape. Ils sont à usage unique et améliorent l’hydratation ainsi que la gestion de la fatigue. Passer sous le minimum peut augmenter le risque de fatigue.',
    'Energy Gels use 0–4 per rider. They support stamina and final effort efficiency. There is no extra benefit after four gels per rider.': 'Les gels énergétiques sont utilisés à raison de 0 à 4 par coureur. Ils soutiennent l’endurance et l’efficacité de l’effort final. Au-delà de quatre gels par coureur, il n’y a aucun bénéfice supplémentaire.',
    'Nutrition Packs use 0–2 per rider. They support stamina stability and post-stage recovery. Long stages without nutrition can increase fatigue pressure.': 'Les packs nutritionnels sont utilisés à raison de 0 à 2 par coureur. Ils stabilisent l’endurance et favorisent la récupération après l’étape. Les longues étapes sans nutrition peuvent augmenter la fatigue.',
    'Open Finance → Transactions.': 'Ouvrez Finances → Transactions.',
    '2nd-4th enter promotion playoff': 'Les 2e à 4e places accèdent au playoff de promotion',
    '2nd-4th enter World playoff': 'Les 2e à 4e places accèdent au playoff World',
    'Continental Asia/Africa/Oceania feed Pro East playoff.': 'Continental Asia/Africa/Oceania alimentent le playoff Pro East.',
    'Save up to four preferred equipment type setups. The setup capacity shows how many riders can use that exact configuration in one stage.': 'Enregistrez jusqu’à quatre configurations d’équipement préférées. La capacité indique combien de coureurs peuvent utiliser exactement cette configuration sur une même étape.',
    'Riders Unknown': 'Coureurs inconnus',
    'Stage Race': 'Course par étapes',
    'Accepted Races': 'Courses acceptées',
    'All Races': 'Toutes les courses',
    'Last 5 Races': '5 dernières courses',
    'Races used': 'Courses prises en compte',
    'Rider / Team': 'Coureur / Équipe',
    'Best young rider': 'Meilleur jeune coureur',
    'Race Supplies': 'Ravitaillement de course',
    'Race day updates': 'Mises à jour du jour de course',
}

PATH_OVERRIDES: dict[str, str] = {
    'equipment.json.presets.description': 'Enregistrez jusqu’à quatre configurations d’équipement préférées. La capacité indique combien de coureurs peuvent utiliser exactement cette configuration sur une même étape.',
    'raceDetail.json.report.ridersUnknown': 'Coureurs inconnus',
    'preferences.json.advisorCategories.startlistStagePlans.label': 'Startlist et Stage Plans',
}


def has(source: str, value: str) -> bool:
    return re.search(rf'(?<!\w){re.escape(value)}(?!\w)', source, re.I) is not None


def canonicalize_protected(source: str, target: str) -> str:
    if has(source, 'Race Plans') and not has(target, 'Race Plans'):
        for pat in [r'\bplans?\s+(?:de\s+|des\s+)?course\b', r'\bplans?\s+de\s+race\b']:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Race Plans', target, count=1, flags=re.I)
                break
    elif has(source, 'Race Plan') and not has(target, 'Race Plan'):
        for pat in [r'\bplan\s+(?:de\s+|des\s+)?course\b', r'\bplan\s+de\s+race\b']:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Race Plan', target, count=1, flags=re.I)
                break

    if has(source, 'Stage Plans') and not has(target, 'Stage Plans'):
        for pat in [r'\bplans?\s+(?:d[’\']|de\s+|des\s+)?(?:étape|étapes|stage|stages|phase|phases)\b']:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Stage Plans', target, count=1, flags=re.I)
                break
    elif has(source, 'Stage Plan') and not has(target, 'Stage Plan'):
        for pat in [r'\bplan\s+(?:d[’\']|de\s+|des\s+)?(?:étape|stage|phase)\b']:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Stage Plan', target, count=1, flags=re.I)
                break

    if has(source, 'Startlist') and not has(target, 'Startlist'):
        for pat in [r'\bliste\s+(?:officielle\s+)?de\s+départ\b', r'\bliste\s+des\s+partants\b', r'\bstart\s*list\b']:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Startlist', target, count=1, flags=re.I)
                break

    if has(source, 'Race Engine') and not has(target, 'Race Engine'):
        for pat in [r'\bmoteur\s+(?:de\s+|des\s+)?course\b', r'\bmoteur\s+de\s+la\s+course\b']:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Race Engine', target, count=1, flags=re.I)
                break

    if has(source, 'Replay Engine') and not has(target, 'Replay Engine'):
        for pat in [r'\bmoteur\s+(?:de\s+)?replay\b', r'\bmoteur\s+de\s+rediffusion\b', r'\bmoteur\s+de\s+relecture\b']:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Replay Engine', target, count=1, flags=re.I)
                break

    if has(source, 'Team Policy') and not has(target, 'Team Policy'):
        for pat in [r'\bpolitique\s+(?:de\s+|d[’\'])équipe\b', r'\bpolitique\s+du\s+team\b']:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Team Policy', target, count=1, flags=re.I)
                break

    if has(source, 'Race Sharpness') and not has(target, 'Race Sharpness'):
        for pat in [
            r'\b(?:acuité|forme|fraîcheur|rythme|affûtage)\s+(?:de\s+|en\s+)?course\b',
            r'\b(?:acuité|forme|fraîcheur|rythme)\s+de\s+la\s+course\b',
        ]:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Race Sharpness', target, count=1, flags=re.I)
                break

    if has(source, 'Premium') and not has(target, 'Premium'):
        target = re.sub(r'\bprime\b', 'Premium', target, count=1, flags=re.I)
    if has(source, 'Coins') and not has(target, 'Coins'):
        target = re.sub(r'\bpièces?\b', 'Coins', target, flags=re.I)

    return target


def lexical_repair(source: str, target: str) -> str:
    low = source.lower()

    if re.search(r'\briders?\b', low):
        replacements = [
            (r'\bCavaliers\b', 'Coureurs'), (r'\bcavaliers\b', 'coureurs'),
            (r'\bCavalier\b', 'Coureur'), (r'\bcavalier\b', 'coureur'),
            (r'\bPilotes\b', 'Coureurs'), (r'\bpilotes\b', 'coureurs'),
            (r'\bPilote\b', 'Coureur'), (r'\bpilote\b', 'coureur'),
        ]
        for pat, repl in replacements:
            target = re.sub(pat, repl, target)

    if re.search(r'\braces?\b', low):
        # Do not touch protected Race Plan / Race Engine tokens.
        protected: list[str] = []
        def mask(m: re.Match[str]) -> str:
            protected.append(m.group(0))
            return f'PPFRPROT{len(protected)-1}XX'
        masked = re.sub(r'\b(?:Race Plans?|Race Engine|Race Sharpness)\b', mask, target, flags=re.I)
        masked = re.sub(r'\bRaces\b', 'Courses', masked)
        masked = re.sub(r'\braces\b', 'courses', masked)
        masked = re.sub(r'\bRace\b', 'Course', masked)
        masked = re.sub(r'\brace\b', 'course', masked)
        for idx, value in enumerate(protected):
            masked = masked.replace(f'PPFRPROT{idx}XX', value)
        target = masked

    if re.search(r'\bstages?\b', low):
        pairs = [
            (r'\bScènes\b', 'Étapes'), (r'\bscènes\b', 'étapes'),
            (r'\bScène\b', 'Étape'), (r'\bscène\b', 'étape'),
            (r'\bÉtages\b', 'Étapes'), (r'\bétages\b', 'étapes'),
            (r'\bÉtage\b', 'Étape'), (r'\bétage\b', 'étape'),
        ]
        for pat, repl in pairs:
            target = re.sub(pat, repl, target)
        # English "stage" left by MT is usually the cycling step here, except protected Stage Plan.
        protected: list[str] = []
        def mask_stage(m: re.Match[str]) -> str:
            protected.append(m.group(0))
            return f'PPFRSTAGE{len(protected)-1}XX'
        masked = re.sub(r'\bStage Plans?\b', mask_stage, target, flags=re.I)
        masked = re.sub(r'\bStages\b', 'Étapes', masked)
        masked = re.sub(r'\bstages\b', 'étapes', masked)
        masked = re.sub(r'\bStage\b', 'Étape', masked)
        masked = re.sub(r'\bstage\b', 'étape', masked)
        for idx, value in enumerate(protected):
            masked = masked.replace(f'PPFRSTAGE{idx}XX', value)
        target = masked

    if re.search(r'\bfree agents?\b', low):
        target = re.sub(r'\bagents?\s+gratuits?\b', 'coureurs libres', target, flags=re.I)
        target = re.sub(r'\bagente?\s+gratuite?\b', 'coureuse libre', target, flags=re.I)

    if re.search(r'\bsav(?:e|es|ed|ing)\b', low):
        target = re.sub(r'\béconomis(?:er|e|ez|ons|ent|é|ée|és|ées|ant)\b', 'enregistrer', target, flags=re.I)

    if re.search(r'\btime trial\b', low):
        target = re.sub(r'\b(?:essai|épreuve)\s+(?:de\s+)?temps\b', 'contre-la-montre', target, flags=re.I)
        target = re.sub(r'\bcontre\s+le\s+temps\b', 'contre-la-montre', target, flags=re.I)

    if re.search(r'\bmanagers?\b', low) and not re.search(r'\badmins?|administrators?\b', low):
        target = re.sub(r'\badministrateurs?\b', 'manager', target, flags=re.I)
        target = re.sub(r'\badministratrices?\b', 'manager', target, flags=re.I)

    return target


def polish_string(source: str, target: str, path: str) -> str:
    if path in PATH_OVERRIDES:
        return PATH_OVERRIDES[path]
    if source in SOURCE_OVERRIDES:
        return SOURCE_OVERRIDES[source]
    out = canonicalize_protected(source, target)
    out = lexical_repair(source, out)
    out = re.sub(r'\s+([,.;!?])', r'\1', out)
    out = re.sub(r' {2,}', ' ', out)
    return out


def transform(source: Any, target: Any, path: str, stats: dict[str, int]) -> Any:
    if isinstance(source, dict) and isinstance(target, dict):
        return {key: transform(source[key], target[key], f'{path}.{key}' if path else key, stats) for key in source}
    if isinstance(source, list) and isinstance(target, list):
        return [transform(a, b, f'{path}[{idx}]', stats) for idx, (a, b) in enumerate(zip(source, target))]
    if isinstance(source, str) and isinstance(target, str):
        new = polish_string(source, target, path)
        if sorted(PH.findall(source)) != sorted(PH.findall(new)):
            return target
        if new != target:
            stats['strings'] += 1
        return new
    return target


def main() -> None:
    changed_files = 0
    stats = {'strings': 0}
    for en_path in sorted(EN_DIR.glob('*.json')):
        fr_path = FR_DIR / en_path.name
        if not fr_path.exists():
            continue
        source = json.loads(en_path.read_text(encoding='utf-8'))
        target = json.loads(fr_path.read_text(encoding='utf-8'))
        before = json.dumps(target, ensure_ascii=False, sort_keys=False)
        polished = transform(source, target, en_path.name, stats)
        after = json.dumps(polished, ensure_ascii=False, sort_keys=False)
        if before != after:
            fr_path.write_text(json.dumps(polished, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            changed_files += 1
    print(f'French baseline polish changed {stats["strings"]} strings across {changed_files} files.')


if __name__ == '__main__':
    main()
