#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / "src/pages/dashboard/RacePreparation.tsx"
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]

# These strings are intentionally small because React often renders interpolated
# text as separate text nodes (for example: "Saved " + count + " stages").
# The Race Preparation legacy bridge can translate those nodes only when the
# fragments themselves exist in the English reverse map.
EXTRA_SCREEN_COPY = {
    "en": {
        "anotherRace": "another race",
        "assignedTo": "Already assigned to {{race}}",
        "assignedToRange": "Already assigned to {{race}} ({{range}})",
        "ageYears": "{{count}} years",
        "beforeSplit": "Before split",
        "afterSplit": "After split",
        "phaseLabel": "Phase {{phase}}",
        "statusLabel": "Status:",
        "savedLabel": "Saved",
        "missingLabel": "Missing",
        "noSuppliesLabel": "No supplies",
        "stagesLower": "stages",
        "rawEffectLabel": "Raw effect:",
        "breakdownLabel": "breakdown",
        "minLabel": "Min",
        "maxLabel": "Max",
        "perRiderLower": "per rider",
        "ridersSelectedSuffix": "riders selected",
        "neededSuffix": "needed",
        "autoNeededSuffix": "auto-needed",
        "sourcesCount": "{{count}} sources",
        "teamCars": "Team Cars",
        "bonusSource": "Bonus source",
    },
    "sr-Latn": {
        "anotherRace": "druga trka",
        "assignedTo": "Već dodeljen trci {{race}}",
        "assignedToRange": "Već dodeljen trci {{race}} ({{range}})",
        "ageYears": "{{count}} godina",
        "beforeSplit": "Pre prolaznog vremena",
        "afterSplit": "Posle prolaznog vremena",
        "phaseLabel": "Faza {{phase}}",
        "statusLabel": "Status:",
        "savedLabel": "Sačuvano",
        "missingLabel": "Nedostaje",
        "noSuppliesLabel": "Bez zaliha",
        "stagesLower": "etapa",
        "rawEffectLabel": "Izvorni efekat:",
        "breakdownLabel": "razrada",
        "minLabel": "Min",
        "maxLabel": "Maks",
        "perRiderLower": "po vozaču",
        "ridersSelectedSuffix": "vozača izabrano",
        "neededSuffix": "potrebno",
        "autoNeededSuffix": "automatski potrebno",
        "sourcesCount": "{{count}} izvora",
        "teamCars": "Timski automobili",
        "bonusSource": "Izvor bonusa",
    },
    "de": {
        "anotherRace": "ein anderes Rennen",
        "assignedTo": "Bereits {{race}} zugeordnet",
        "assignedToRange": "Bereits {{race}} zugeordnet ({{range}})",
        "ageYears": "{{count}} Jahre",
        "beforeSplit": "Vor der Zwischenzeit",
        "afterSplit": "Nach der Zwischenzeit",
        "phaseLabel": "Phase {{phase}}",
        "statusLabel": "Status:",
        "savedLabel": "Gespeichert",
        "missingLabel": "Fehlend",
        "noSuppliesLabel": "Keine Vorräte",
        "stagesLower": "Etappen",
        "rawEffectLabel": "Roheffekt:",
        "breakdownLabel": "Aufschlüsselung",
        "minLabel": "Min",
        "maxLabel": "Max",
        "perRiderLower": "pro Fahrer",
        "ridersSelectedSuffix": "Fahrer ausgewählt",
        "neededSuffix": "benötigt",
        "autoNeededSuffix": "automatisch benötigt",
        "sourcesCount": "{{count}} Quellen",
        "teamCars": "Teamfahrzeuge",
        "bonusSource": "Bonusquelle",
    },
    "hr": {
        "anotherRace": "druga utrka",
        "assignedTo": "Već dodijeljen utrci {{race}}",
        "assignedToRange": "Već dodijeljen utrci {{race}} ({{range}})",
        "ageYears": "{{count}} godina",
        "beforeSplit": "Prije prolaznog vremena",
        "afterSplit": "Nakon prolaznog vremena",
        "phaseLabel": "Faza {{phase}}",
        "statusLabel": "Status:",
        "savedLabel": "Spremljeno",
        "missingLabel": "Nedostaje",
        "noSuppliesLabel": "Bez zaliha",
        "stagesLower": "etapa",
        "rawEffectLabel": "Izvorni učinak:",
        "breakdownLabel": "raščlamba",
        "minLabel": "Min",
        "maxLabel": "Maks",
        "perRiderLower": "po vozaču",
        "ridersSelectedSuffix": "vozača odabrano",
        "neededSuffix": "potrebno",
        "autoNeededSuffix": "automatski potrebno",
        "sourcesCount": "{{count}} izvora",
        "teamCars": "Timski automobili",
        "bonusSource": "Izvor bonusa",
    },
    "es": {
        "anotherRace": "otra carrera",
        "assignedTo": "Ya asignado a {{race}}",
        "assignedToRange": "Ya asignado a {{race}} ({{range}})",
        "ageYears": "{{count}} años",
        "beforeSplit": "Antes del punto intermedio",
        "afterSplit": "Después del punto intermedio",
        "phaseLabel": "Fase {{phase}}",
        "statusLabel": "Estado:",
        "savedLabel": "Guardado",
        "missingLabel": "Falta",
        "noSuppliesLabel": "Sin suministros",
        "stagesLower": "etapas",
        "rawEffectLabel": "Efecto bruto:",
        "breakdownLabel": "desglose",
        "minLabel": "Mín",
        "maxLabel": "Máx",
        "perRiderLower": "por ciclista",
        "ridersSelectedSuffix": "ciclistas seleccionados",
        "neededSuffix": "necesarios",
        "autoNeededSuffix": "necesarios automáticamente",
        "sourcesCount": "{{count}} fuentes",
        "teamCars": "Coches de equipo",
        "bonusSource": "Fuente del bonus",
    },
    "it": {
        "anotherRace": "un'altra gara",
        "assignedTo": "Già assegnato a {{race}}",
        "assignedToRange": "Già assegnato a {{race}} ({{range}})",
        "ageYears": "{{count}} anni",
        "beforeSplit": "Prima dell'intermedio",
        "afterSplit": "Dopo l'intermedio",
        "phaseLabel": "Fase {{phase}}",
        "statusLabel": "Stato:",
        "savedLabel": "Salvato",
        "missingLabel": "Mancante",
        "noSuppliesLabel": "Senza rifornimenti",
        "stagesLower": "tappe",
        "rawEffectLabel": "Effetto grezzo:",
        "breakdownLabel": "scomposizione",
        "minLabel": "Min",
        "maxLabel": "Max",
        "perRiderLower": "per ciclista",
        "ridersSelectedSuffix": "ciclisti selezionati",
        "neededSuffix": "necessari",
        "autoNeededSuffix": "necessari automaticamente",
        "sourcesCount": "{{count}} fonti",
        "teamCars": "Auto della squadra",
        "bonusSource": "Fonte bonus",
    },
    "fr": {
        "anotherRace": "une autre course",
        "assignedTo": "Déjà affecté à {{race}}",
        "assignedToRange": "Déjà affecté à {{race}} ({{range}})",
        "ageYears": "{{count}} ans",
        "beforeSplit": "Avant l'intermédiaire",
        "afterSplit": "Après l'intermédiaire",
        "phaseLabel": "Phase {{phase}}",
        "statusLabel": "Statut :",
        "savedLabel": "Enregistré",
        "missingLabel": "Manquant",
        "noSuppliesLabel": "Sans ravitaillement",
        "stagesLower": "étapes",
        "rawEffectLabel": "Effet brut :",
        "breakdownLabel": "détail",
        "minLabel": "Min",
        "maxLabel": "Max",
        "perRiderLower": "par coureur",
        "ridersSelectedSuffix": "coureurs sélectionnés",
        "neededSuffix": "nécessaires",
        "autoNeededSuffix": "nécessaires automatiquement",
        "sourcesCount": "{{count}} sources",
        "teamCars": "Voitures d'équipe",
        "bonusSource": "Source du bonus",
    },
    "ru": {
        "anotherRace": "другая гонка",
        "assignedTo": "Уже назначен на {{race}}",
        "assignedToRange": "Уже назначен на {{race}} ({{range}})",
        "ageYears": "{{count}} лет",
        "beforeSplit": "До отсечки",
        "afterSplit": "После отсечки",
        "phaseLabel": "Фаза {{phase}}",
        "statusLabel": "Статус:",
        "savedLabel": "Сохранено",
        "missingLabel": "Отсутствует",
        "noSuppliesLabel": "Без запасов",
        "stagesLower": "этапов",
        "rawEffectLabel": "Исходный эффект:",
        "breakdownLabel": "детализация",
        "minLabel": "Мин",
        "maxLabel": "Макс",
        "perRiderLower": "на гонщика",
        "ridersSelectedSuffix": "гонщиков выбрано",
        "neededSuffix": "требуется",
        "autoNeededSuffix": "требуется автоматически",
        "sourcesCount": "{{count}} источников",
        "teamCars": "Машины команды",
        "bonusSource": "Источник бонуса",
    },
}


def replace_once_or_already(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new)
    if new in text:
        return text
    raise SystemExit(f"RacePreparation source shape changed; cannot patch {label}")


def main() -> None:
    src = COMPONENT.read_text(encoding="utf-8")

    src = replace_once_or_already(
        src,
        'const weekday = date.toLocaleDateString(locale, {',
        'const weekday = date.toLocaleDateString(locale || getRacePrepLocale(), {',
        'compact stage weekday locale',
    )
    src = replace_once_or_already(
        src,
        'const monthLabel = monthLabels[parts.month - 1] ?? `M${parts.month}`;',
        'const monthLabel = localizedGameMonth(parts.month, "short");',
        'compact stage month locale',
    )
    src = src.replace(
        'monthLabels[startParts!.month - 1]',
        'localizedGameMonth(startParts!.month, "short")',
    )
    src = src.replace(
        'monthLabels[endParts!.month - 1]',
        'localizedGameMonth(endParts!.month, "short")',
    )
    src = src.replace(
        '.toLocaleString(undefined, {',
        '.toLocaleString(getRacePrepLocale(), {',
    )
    src = src.replace(
        '.toLocaleDateString(undefined, {',
        '.toLocaleDateString(getRacePrepLocale(), {',
    )

    COMPONENT.write_text(src, encoding="utf-8")

    for locale in LOCALES:
        path = ROOT / "src/i18n/locales" / locale / "racePreparation.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        screen = data.setdefault("screen", {})
        screen.update(EXTRA_SCREEN_COPY[locale])
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print("Applied Race Preparation runtime localization fixes")


if __name__ == "__main__":
    main()
