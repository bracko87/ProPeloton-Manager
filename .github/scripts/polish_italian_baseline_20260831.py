from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
IT_DIR = ROOT / 'src/i18n/locales/it'
PH = re.compile(r'\{\{[^{}]+\}\}')

# Exact source-text overrides are intentionally reused across duplicated manual resources.
# They also repair strings where the MT model damaged en-dashes/numeric ranges.
SOURCE_OVERRIDES: dict[str, str] = {
    '{{race}} · Stage {{stage}}': '{{race}} · Tappa {{stage}}',
    'Stage results – Stage {{stage}}': 'Risultati di tappa – Tappa {{stage}}',
    'Startlist & Stage Plans': 'Startlist e Stage Plans',
    'Activate Developing Team — {{cost}} Coins': 'Attiva Developing Team — {{cost}} Coins',
    'You need {{cost}} coins to activate Developing Team access. Current balance: {{balance}} coins.': "Ti servono {{cost}} Coins per attivare l'accesso a Developing Team. Saldo attuale: {{balance}} Coins.",
    'Free and Premium players can purchase additional coins for optional features and expansions. Buying coins does not activate Premium membership.': "I giocatori Free e Premium possono acquistare Coins aggiuntivi per funzioni ed espansioni opzionali. L'acquisto di Coins non attiva l'abbonamento Premium.",
    'Team-level stage setup: 1–4 bidons per rider.': 'Configurazione di squadra per la tappa: 1–4 borracce per ciclista.',
    'Team-level stage setup: 0–4 gels per rider.': 'Configurazione di squadra per la tappa: 0–4 gel energetici per ciclista.',
    'Team-level stage setup: 0–2 nutrition packs per rider.': 'Configurazione di squadra per la tappa: 0–2 pacchetti nutrizionali per ciclista.',
    'Durable reusable item. Each jacket has 25 stage uses. One use is counted whenever the jacket is assigned/used for a stage.': 'Articolo durevole e riutilizzabile. Ogni giacca ha 25 utilizzi di tappa. Un utilizzo viene conteggiato ogni volta che la giacca viene assegnata o usata in una tappa.',
    'Missing jersey kit: blocks stage setup': 'Kit maglia mancante: blocca la configurazione della tappa',
    '{{name}} stage plan rule': 'Regola Stage Plan di {{name}}',
    'Bidons use 1–4 per rider in stage setup. They are one-use consumables and support hydration and fatigue control. Below minimum can increase fatigue risk.': 'Le borracce si usano in quantità da 1 a 4 per ciclista nella configurazione della tappa. Sono consumabili monouso e aiutano idratazione e controllo della fatica. Restare sotto il minimo può aumentare il rischio di fatica.',
    'Energy Gels use 0–4 per rider. They support stamina and final effort efficiency. There is no extra benefit after four gels per rider.': 'I gel energetici si usano in quantità da 0 a 4 per ciclista. Supportano la resistenza e l’efficacia dello sforzo finale. Oltre quattro gel per ciclista non ci sono benefici aggiuntivi.',
    'Nutrition Packs use 0–2 per rider. They support stamina stability and post-stage recovery. Long stages without nutrition can increase fatigue pressure.': 'I pacchetti nutrizionali si usano in quantità da 0 a 2 per ciclista. Aiutano la stabilità della resistenza e il recupero dopo la tappa. Le tappe lunghe senza nutrizione possono aumentare la pressione della fatica.',
    'Open Finance → Transactions.': 'Apri Finanze → Transazioni.',
    '2nd-4th enter promotion playoff': 'Dal 2° al 4° posto: playoff promozione',
    '2nd-4th enter World playoff': 'Dal 2° al 4° posto: playoff World',
    'Continental Asia/Africa/Oceania feed Pro East playoff.': 'Continental Asia/Africa/Oceania alimentano il playoff Pro East.',
    'Save up to four preferred equipment type setups. The setup capacity shows how many riders can use that exact configuration in one stage.': 'Salva fino a quattro configurazioni preferite di tipi di equipaggiamento. La capacità indica quanti ciclisti possono usare esattamente quella configurazione in una singola tappa.',
    'Riders Unknown': 'Ciclisti sconosciuti',
    'Stage Race': 'Corsa a tappe',
    'Accepted Races': 'Gare accettate',
    'All Races': 'Tutte le gare',
    'Last 5 Races': 'Ultime 5 gare',
    'Races used': 'Gare considerate',
    'Rider / Team': 'Ciclista / Squadra',
    'Best young rider': 'Miglior giovane ciclista',
}

# A few paths need wording that is clearer than a generic lexical repair.
PATH_OVERRIDES: dict[str, str] = {
    'equipment.json.presets.description': 'Salva fino a quattro configurazioni preferite di tipi di equipaggiamento. La capacità indica quanti ciclisti possono usare esattamente quella configurazione in una singola tappa.',
    'raceDetail.json.report.ridersUnknown': 'Ciclisti sconosciuti',
    'preferences.json.advisorCategories.startlistStagePlans.label': 'Startlist e Stage Plans',
}


def has(source: str, value: str) -> bool:
    return re.search(rf'(?<!\w){re.escape(value)}(?!\w)', source, re.I) is not None


def replace_ci(text: str, pattern: str, replacement: str) -> str:
    return re.sub(pattern, replacement, text, flags=re.I)


def canonicalize_protected(source: str, target: str) -> str:
    # Race Plan / Race Plans
    if has(source, 'Race Plans') and not has(target, 'Race Plans'):
        candidates = [
            r'\bpiani\s+(?:della\s+|di\s+)?(?:gara|corsa)\b',
            r'\bprogrammi\s+(?:della\s+|di\s+)?gara\b',
            r'\bracing\s+plans?\b',
            r'\brace\s+plans?\b',
        ]
        for pat in candidates:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Race Plans', target, count=1, flags=re.I)
                break
    elif has(source, 'Race Plan') and not has(target, 'Race Plan'):
        candidates = [
            r'\bpiano\s+(?:della\s+|di\s+)?(?:gara|corsa)\b',
            r'\bprogramma\s+(?:della\s+|di\s+)?gara\b',
            r'\bracing\s+plan\b',
            r'\brace\s+plan\b',
        ]
        for pat in candidates:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Race Plan', target, count=1, flags=re.I)
                break

    # Stage Plan / Stage Plans. Include the most common MT renderings.
    if has(source, 'Stage Plans') and not has(target, 'Stage Plans'):
        candidates = [
            r'\bpiani\s+(?:della\s+|di\s+)?(?:fase|fasi|scena|scene|palco|palchi|tappa|tappe)\b',
            r'\bpiani\s+di\s+stage\b',
            r'\bstage\s+plans?\b',
        ]
        for pat in candidates:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Stage Plans', target, count=1, flags=re.I)
                break
    elif has(source, 'Stage Plan') and not has(target, 'Stage Plan'):
        candidates = [
            r'\bpiano\s+(?:della\s+|di\s+)?(?:fase|scena|palco|tappa)\b',
            r'\bpiano\s+di\s+stage\b',
            r'\bstage\s+plan\b',
        ]
        for pat in candidates:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Stage Plan', target, count=1, flags=re.I)
                break

    if has(source, 'Startlist') and not has(target, 'Startlist'):
        candidates = [
            r'\blista\s+di\s+partenza(?:\s+del\s+ciclista)?\b',
            r'\belenco\s+(?:iniziale|di\s+partenza)\b',
            r'\blista\s+iniziale\b',
            r'\bstart\s*list\b',
        ]
        for pat in candidates:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Startlist', target, count=1, flags=re.I)
                break

    if has(source, 'Race Engine') and not has(target, 'Race Engine'):
        candidates = [
            r'\bmotore\s+(?:della\s+|di\s+)?(?:gara|corsa)\b',
            r'\bengine\s+(?:della\s+|di\s+)?gara\b',
        ]
        for pat in candidates:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Race Engine', target, count=1, flags=re.I)
                break
        # A recurring MT form for “race engine and season systems”.
        target = re.sub(r'\bsistemi\s+di\s+motore\s+e\s+stagione\s+di\s+gara\b', 'Race Engine e sistemi stagionali', target, flags=re.I)

    if has(source, 'Replay Engine') and not has(target, 'Replay Engine'):
        candidates = [
            r'\bmotore\s+di\s+riproduzione\b',
            r'\bmotore\s+(?:del\s+|di\s+)?replay\b',
            r'\breplay\s+engine\b',
        ]
        for pat in candidates:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Replay Engine', target, count=1, flags=re.I)
                break

    if has(source, 'Race Sharpness') and not has(target, 'Race Sharpness'):
        candidates = [
            r'\b(?:nitidezza|acutezza|precisione|affilatezza)\s+(?:della\s+|di\s+)?(?:gara|corsa|razza)\b',
            r'\b(?:nitidezza|acutezza|precisione)\s+gara\b',
            r'\baffilato\b',
            r'\baffilata\b',
        ]
        for pat in candidates:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Race Sharpness', target, count=1, flags=re.I)
                break

    if has(source, 'Team Policy') and not has(target, 'Team Policy'):
        candidates = [r'\bpolitica\s+(?:del\s+team|della\s+squadra)\b', r'\bteam\s+policy\b']
        for pat in candidates:
            if re.search(pat, target, re.I):
                target = re.sub(pat, 'Team Policy', target, count=1, flags=re.I)
                break

    if has(source, 'Premium') and not has(target, 'Premium'):
        target = re.sub(r'\bpremio\b', 'Premium', target, count=1, flags=re.I)
        target = re.sub(r'\bpremium\b', 'Premium', target, flags=re.I)

    if has(source, 'Coins') and not has(target, 'Coins'):
        target = re.sub(r'\bmonete?\b', 'Coins', target, flags=re.I)
        target = re.sub(r'\bcoins\b', 'Coins', target, flags=re.I)

    return target


def lexical_repair(source: str, target: str) -> str:
    low = source.lower()

    # Cycling rider terminology.
    if re.search(r'\briders?\b', low):
        replacements = [
            (r'\bCavalieri\b', 'Ciclisti'), (r'\bcavalieri\b', 'ciclisti'),
            (r'\bCavaliere\b', 'Ciclista'), (r'\bcavaliere\b', 'ciclista'),
            (r'\bPiloti\b', 'Ciclisti'), (r'\bpiloti\b', 'ciclisti'),
            (r'\bPilota\b', 'Ciclista'), (r'\bpilota\b', 'ciclista'),
        ]
        for pat, repl in replacements:
            target = re.sub(pat, repl, target)

    # “Race” must never become razza in cycling context.
    if re.search(r'\braces?\b', low):
        target = re.sub(r'\bRazze\b', 'Gare', target)
        target = re.sub(r'\brazze\b', 'gare', target)
        target = re.sub(r'\bRazza\b', 'Gara', target)
        target = re.sub(r'\brazza\b', 'gara', target)

    # “Stage” is a cycling tappa, never a theatre stage. If the English source has
    # no “phase”, repair the common MT “fase/fasi” rendering as well.
    if re.search(r'\bstages?\b', low):
        pairs = [
            (r'\bPalcoscenici\b', 'Tappe'), (r'\bpalcoscenici\b', 'tappe'),
            (r'\bPalcoscenico\b', 'Tappa'), (r'\bpalcoscenico\b', 'tappa'),
            (r'\bPalchi\b', 'Tappe'), (r'\bpalchi\b', 'tappe'),
            (r'\bPalco\b', 'Tappa'), (r'\bpalco\b', 'tappa'),
        ]
        for pat, repl in pairs:
            target = re.sub(pat, repl, target)
        if not re.search(r'\bphases?\b', low):
            target = re.sub(r'\bFasi\b', 'Tappe', target)
            target = re.sub(r'\bfasi\b', 'tappe', target)
            target = re.sub(r'\bFase\b', 'Tappa', target)
            target = re.sub(r'\bfase\b', 'tappa', target)

        # Normalize common stage-race phrases after lexical replacement.
        target = re.sub(r'\b(?:gara|corsa)\s+di\s+tappa\b', 'corsa a tappe', target, flags=re.I)
        target = re.sub(r'\b(?:gare|corse)\s+di\s+tappe\b', 'corse a tappe', target, flags=re.I)
        target = re.sub(r'\b(?:gara|corsa)\s+a\s+tappa\b', 'corsa a tappe', target, flags=re.I)

    if re.search(r'\bfree agents?\b', low):
        target = re.sub(r'\bagenti\s+gratuiti\b', 'svincolati', target, flags=re.I)
        target = re.sub(r'\bagente\s+gratuito\b', 'svincolato', target, flags=re.I)

    if re.search(r'\bmanagers?\b', low) and not re.search(r'\badmins?|administrators?\b', low):
        target = re.sub(r'\bamministratori\b', 'manager', target, flags=re.I)
        target = re.sub(r'\bamministratore\b', 'manager', target, flags=re.I)

    if re.search(r'\breviews?\b', low):
        target = re.sub(r'\besami\b', 'recensioni', target, flags=re.I)
        target = re.sub(r'\besame\b', 'recensione', target, flags=re.I)

    # Common corruption in one generated token family.
    target = re.sub(r'\bRace Pready\b', 'Race Ready', target, flags=re.I)
    return target


def repair_text(source: str, target: str, full_path: str) -> str:
    if source in SOURCE_OVERRIDES:
        return SOURCE_OVERRIDES[source]
    if full_path in PATH_OVERRIDES:
        return PATH_OVERRIDES[full_path]

    target = lexical_repair(source, target)
    target = canonicalize_protected(source, target)

    # If lexical stage repair changed the phrase around a protected Stage Plan,
    # run protected canonicalization once more.
    target = canonicalize_protected(source, target)

    # A few natural-language repairs that are safe only when the source clearly
    # expresses the corresponding game concept.
    if source.startswith('Save up to four preferred equipment type setups.'):
        target = SOURCE_OVERRIDES[source]

    target = re.sub(r'\s+([,.;:!?])', r'\1', target)
    target = re.sub(r' {2,}', ' ', target).strip()
    return target


def walk(source: Any, target: Any, file_name: str, path: str = '') -> Any:
    if type(source) is not type(target):
        raise RuntimeError(f'Type mismatch at {file_name}.{path}')
    if isinstance(source, dict):
        if list(source) != list(target):
            raise RuntimeError(f'Key/order mismatch at {file_name}.{path}')
        return {
            key: walk(source[key], target[key], file_name, f'{path}.{key}' if path else key)
            for key in source
        }
    if isinstance(source, list):
        if len(source) != len(target):
            raise RuntimeError(f'List mismatch at {file_name}.{path}')
        return [walk(a, b, file_name, f'{path}[{idx}]') for idx, (a, b) in enumerate(zip(source, target))]
    if isinstance(source, str):
        full_path = f'{file_name}.{path}'
        fixed = repair_text(source, target, full_path)
        if sorted(PH.findall(source)) != sorted(PH.findall(fixed)):
            raise RuntimeError(f'Placeholder mismatch after polish at {full_path}: {source!r} -> {fixed!r}')
        return fixed
    return target


def main() -> None:
    changed_files = 0
    changed_strings = 0

    for en_path in sorted(EN_DIR.glob('*.json')):
        it_path = IT_DIR / en_path.name
        if not it_path.exists():
            raise RuntimeError(f'Missing Italian locale file: {it_path.name}')
        source = json.loads(en_path.read_text(encoding='utf-8'))
        target = json.loads(it_path.read_text(encoding='utf-8'))

        before = json.dumps(target, ensure_ascii=False, sort_keys=True)
        polished = walk(source, target, en_path.name)
        after = json.dumps(polished, ensure_ascii=False, sort_keys=True)

        if before != after:
            # Count changed leaf strings for a useful workflow summary.
            def count_diff(a: Any, b: Any) -> int:
                if isinstance(a, dict):
                    return sum(count_diff(a[k], b[k]) for k in a)
                if isinstance(a, list):
                    return sum(count_diff(x, y) for x, y in zip(a, b))
                return int(isinstance(a, str) and a != b)

            changed_strings += count_diff(target, polished)
            changed_files += 1
            it_path.write_text(json.dumps(polished, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'Italian baseline polish changed {changed_strings} strings across {changed_files} files.')


if __name__ == '__main__':
    main()
