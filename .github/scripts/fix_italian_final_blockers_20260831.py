from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IT = ROOT / 'src/i18n/locales/it'


def load(name: str):
    return json.loads((IT / name).read_text(encoding='utf-8'))


def save(name: str, data) -> None:
    (IT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main() -> None:
    help_data = load('help.json')
    help_data['faq']['a3'] = (
        'Un giorno di gioco equivale a 12 ore di vita reale. Due giorni di gioco equivalgono '
        'a un giorno di vita reale. Questo è importante per le finestre dei Race Plan, le '
        'scadenze di invio dei ciclisti, le scadenze degli Stage Plan, i ritiri di allenamento '
        'e gli altri sistemi di gioco basati sul tempo.'
    )
    save('help.json', help_data)

    manual = load('manual.json')
    manual['sections']['race-preparation']['details'][5] = (
        'La prontezza degli Stage Plan tiene traccia dei piani salvati, utilizzabili, mancanti '
        'o vuoti, delle forniture mancanti, della completezza tattica e dell’azione consigliata.'
    )
    manual['sections']['staff-roles-deep']['details'][2] = (
        'Il Direttore Sportivo supporta le tattiche, gli Stage Plans e i suggerimenti per la '
        'preparazione della gara.'
    )
    save('manual.json', manual)

    manual_core = load('manualCore.json')
    manual_core['sections']['racePreparation']['details'][5] = (
        'La prontezza degli Stage Plan tiene traccia dei piani salvati, utilizzabili, mancanti '
        'o vuoti, delle forniture mancanti, della completezza tattica e dell’azione consigliata.'
    )
    save('manualCore.json', manual_core)

    manual_deep = load('manualDeepB1.json')
    manual_deep['sections']['stageReadinessDeep']['details'][4] = (
        'Tutti gli Stage Plans richiesti devono essere salvati prima del giorno della gara.'
    )
    save('manualDeepB1.json', manual_deep)

    preferences = load('preferences.json')
    preferences['groups']['races']['description'] = (
        'Mostra gli aggiornamenti relativi a Startlist, Startlist mancata, giorno di gara e penalità di gara.'
    )
    save('preferences.json', preferences)

    race_detail = load('raceDetail.json')
    race_detail['participants']['noneConfirmed'] = (
        'Non è stata ancora confermata alcuna squadra accettata. Le squadre accettate appariranno '
        'qui quando verrà pubblicata la Startlist ufficiale.'
    )
    # Preserve the original meaning of the compact fallback label.
    race_detail['report']['ridersUnknown'] = 'Ciclisti —'
    save('raceDetail.json', race_detail)

    print('Fixed final Italian semantic blockers and one fidelity cleanup.')


if __name__ == '__main__':
    main()
