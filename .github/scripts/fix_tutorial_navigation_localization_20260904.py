from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALE_ROOT = ROOT / "src/i18n/locales"

COPY = {
    "en": {"previous": "Previous", "previousTutorial": "Previous tutorial"},
    "sr-Latn": {"previous": "Prethodno", "previousTutorial": "Prethodni vodič"},
    "de": {"previous": "Zurück", "previousTutorial": "Vorheriges Tutorial"},
    "hr": {"previous": "Natrag", "previousTutorial": "Prethodni vodič"},
    "es": {"previous": "Anterior", "previousTutorial": "Tutorial anterior"},
    "it": {"previous": "Indietro", "previousTutorial": "Tutorial precedente"},
    "fr": {"previous": "Précédent", "previousTutorial": "Tutoriel précédent"},
    "ru": {"previous": "Назад", "previousTutorial": "Предыдущее обучение"},
}

for locale, values in COPY.items():
    path = LOCALE_ROOT / locale / "tutorials.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    common = data.setdefault("common", {})
    common.update(values)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("Added Previous / Previous tutorial labels for all 8 tutorial locales")
