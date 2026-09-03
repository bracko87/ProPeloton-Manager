from pathlib import Path
import json

ROOT = Path('.')
LOCALES = ['en','sr-Latn','de','hr','es','it','fr','ru']
VALUES = {
    'en': {
        'save': 'Save Stage Plan',
        'saveShort': 'Save',
        'saving': 'Saving…',
        'viewOnly': 'View only',
    },
    'sr-Latn': {
        'save': 'Sačuvaj plan etape',
        'saveShort': 'Sačuvaj',
        'saving': 'Čuvanje…',
        'viewOnly': 'Samo pregled',
    },
    'de': {
        'save': 'Etappenplan speichern',
        'saveShort': 'Speichern',
        'saving': 'Wird gespeichert…',
        'viewOnly': 'Nur ansehen',
    },
    'hr': {
        'save': 'Spremi plan etape',
        'saveShort': 'Spremi',
        'saving': 'Spremanje…',
        'viewOnly': 'Samo pregled',
    },
    'es': {
        'save': 'Guardar plan de etapa',
        'saveShort': 'Guardar',
        'saving': 'Guardando…',
        'viewOnly': 'Solo lectura',
    },
    'it': {
        'save': 'Salva piano di tappa',
        'saveShort': 'Salva',
        'saving': 'Salvataggio…',
        'viewOnly': 'Sola visualizzazione',
    },
    'fr': {
        'save': 'Enregistrer le plan d’étape',
        'saveShort': 'Enregistrer',
        'saving': 'Enregistrement…',
        'viewOnly': 'Lecture seule',
    },
    'ru': {
        'save': 'Сохранить план этапа',
        'saveShort': 'Сохранить',
        'saving': 'Сохранение…',
        'viewOnly': 'Только просмотр',
    },
}

for locale in LOCALES:
    path = ROOT / 'src/i18n/locales' / locale / 'racePreparation.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    stage_plans = data.setdefault('stagePlans', {})
    stage_plans.update(VALUES[locale])
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

bridge_path = ROOT / 'src/components/i18n/RacePreparationLegacyLocalizationBridge.tsx'
bridge = bridge_path.read_text(encoding='utf-8')

anchor = "    'Save Stage Plan': 'stagePlans.save',\n"
insert = (
    "    'Save Stage Plan': 'stagePlans.save',\n"
    "    'Save': 'stagePlans.saveShort',\n"
    "    'Saving…': 'stagePlans.saving',\n"
)
if "'Save': 'stagePlans.saveShort'" not in bridge:
    if anchor not in bridge:
        raise SystemExit('Save Stage Plan alias anchor not found')
    bridge = bridge.replace(anchor, insert, 1)

# Keep both ellipsis forms explicit because the page currently uses both.
if "'Saving...': 'stagePlans.saving'" not in bridge:
    anchor2 = "    'Saving…': 'stagePlans.saving',\n"
    bridge = bridge.replace(anchor2, anchor2 + "    'Saving...': 'stagePlans.saving',\n", 1)

bridge_path.write_text(bridge, encoding='utf-8')

print('Applied explicit Stage Plan save labels for all 8 locales')
