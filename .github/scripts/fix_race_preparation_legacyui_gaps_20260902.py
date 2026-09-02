#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

LEGACY_UI = {
    "sr-Latn": {
        "stagePlanLock": "Zaključavanje Stage Plan-a",
        "notSavedYet": "Još nije sačuvano",
        "roadRolesDisabled": "Standardne drumske uloge su onemogućene na prologu, ITT i TTT etapama.",
        "tttRidersExplainer": "Svaki vozač se tretira kao vozač timskog hronometra. Race Engine računa vozače koji ulaze u obračun, otpale vozače, timsku uigranost, pomoćni rad i zvanično vreme tima.",
        "equipmentCapacityProblem": "Problem sa kapacitetom podešavanja opreme",
        "noEquipmentPresets": "Nema pronađenih unapred podešenih postavki opreme",
        "raceJerseysNeeded": "Potrebni trkački dresovi",
        "rider": "Vozač",
        "racePagePreview": "Pregled stranice trke",
        "stages": "Etape",
        "bonusPreview": "Pregled Race Plan bonusa",
        "profile": "Profil",
        "stageProfileChart": "Grafik profila etape",
        "ttHelp": "Pomoć za taktiku hronometra i uloge vozača",
        "teamTacticHelp": "Pomoć za timsku taktiku i uloge vozača",
        "equipmentPackagePreview": "Pregled bonusa paketa opreme",
        "riderEquipmentHelp": "Pomoć za paket opreme vozača",
        "raceJerseyKit": "Komplet trkačkog dresa",
        "finalCalculationHelp": "Pomoć za konačni obračun etape",
        "ttEquipmentEffect": "Efekat TT opreme",
        "equipmentCondition": "Stanje opreme",
        "raceSupport": "Podrška na trci",
        "recoverySupport": "Podrška oporavku",
        "teamCohesion": "Timska uigranost",
        "countingRiderGroup": "Grupa vozača koja ulazi u obračun",
        "droppedRiderRisk": "Rizik od otpadanja vozača",
        "racePlanBonusTotal": "Ukupan Race Plan bonus",
        "equipmentBonusDirection": "Smer bonusa opreme",
        "quoteRefreshed": "Obračun Race Plan-a je osvežen.",
    },
    "de": {
        "stagePlanLock": "Stage-Plan-Sperre",
        "notSavedYet": "Noch nicht gespeichert",
        "roadRolesDisabled": "Normale Straßenrollen sind bei Prolog-, ITT- und TTT-Etappen deaktiviert.",
        "tttRidersExplainer": "Jeder Fahrer wird als Mannschaftszeitfahr-Fahrer behandelt. Die Race Engine berechnet wertende Fahrer, zurückgefallene Fahrer, Teamzusammenhalt, Unterstützungsarbeit und die offizielle Teamzeit.",
        "equipmentCapacityProblem": "Kapazitätsproblem bei der Ausrüstungskonfiguration",
        "noEquipmentPresets": "Keine Ausrüstungs-Presets gefunden",
        "raceJerseysNeeded": "Benötigte Renndressen",
        "rider": "Fahrer",
        "racePagePreview": "Vorschau der Rennseite",
        "stages": "Etappen",
        "bonusPreview": "Race-Plan-Bonusvorschau",
        "profile": "Profil",
        "stageProfileChart": "Etappenprofil-Diagramm",
        "ttHelp": "Hilfe zu Zeitfahr-Taktik und Fahrerrollen",
        "teamTacticHelp": "Hilfe zu Teamtaktik und Fahrerrollen",
        "equipmentPackagePreview": "Vorschau des Ausrüstungspaket-Bonus",
        "riderEquipmentHelp": "Hilfe zum Ausrüstungspaket des Fahrers",
        "raceJerseyKit": "Renntrikot-Set",
        "finalCalculationHelp": "Hilfe zur finalen Etappenberechnung",
        "ttEquipmentEffect": "TT-Ausrüstungseffekt",
        "equipmentCondition": "Ausrüstungszustand",
        "raceSupport": "Rennunterstützung",
        "recoverySupport": "Regenerationsunterstützung",
        "teamCohesion": "Teamzusammenhalt",
        "countingRiderGroup": "Gruppe der gewerteten Fahrer",
        "droppedRiderRisk": "Risiko abgehängter Fahrer",
        "racePlanBonusTotal": "Race-Plan-Bonus gesamt",
        "equipmentBonusDirection": "Richtung des Ausrüstungsbonus",
        "quoteRefreshed": "Race-Plan-Berechnung aktualisiert.",
    },
    "hr": {
        "stagePlanLock": "Zaključavanje Stage Plan-a",
        "notSavedYet": "Još nije spremljeno",
        "roadRolesDisabled": "Uobičajene cestovne uloge onemogućene su na prologu, ITT i TTT etapama.",
        "tttRidersExplainer": "Svaki vozač tretira se kao vozač timskog kronometra. Race Engine računa vozače koji ulaze u obračun, otpale vozače, timsku koheziju, pomoćni rad i službeno vrijeme momčadi.",
        "equipmentCapacityProblem": "Problem s kapacitetom postavke opreme",
        "noEquipmentPresets": "Nema pronađenih unaprijed postavljenih postavki opreme",
        "raceJerseysNeeded": "Potrebni trkaći dresovi",
        "rider": "Vozač",
        "racePagePreview": "Pregled stranice utrke",
        "stages": "Etape",
        "bonusPreview": "Pregled Race Plan bonusa",
        "profile": "Profil",
        "stageProfileChart": "Graf profila etape",
        "ttHelp": "Pomoć za kronometarsku taktiku i uloge vozača",
        "teamTacticHelp": "Pomoć za timsku taktiku i uloge vozača",
        "equipmentPackagePreview": "Pregled bonusa paketa opreme",
        "riderEquipmentHelp": "Pomoć za paket opreme vozača",
        "raceJerseyKit": "Komplet trkaćeg dresa",
        "finalCalculationHelp": "Pomoć za konačni izračun etape",
        "ttEquipmentEffect": "Učinak TT opreme",
        "equipmentCondition": "Stanje opreme",
        "raceSupport": "Podrška u utrci",
        "recoverySupport": "Podrška oporavku",
        "teamCohesion": "Timska kohezija",
        "countingRiderGroup": "Skupina vozača koja ulazi u obračun",
        "droppedRiderRisk": "Rizik od otpadanja vozača",
        "racePlanBonusTotal": "Ukupan Race Plan bonus",
        "equipmentBonusDirection": "Smjer bonusa opreme",
        "quoteRefreshed": "Obračun Race Plan-a je osvježen.",
    },
}


def main() -> None:
    for locale, values in LEGACY_UI.items():
        path = ROOT / "src/i18n/locales" / locale / "racePreparation.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data.setdefault("legacyUi", {}).update(values)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # This was a real Italian cycling-terminology leak discovered by the runtime audit.
    it_path = ROOT / "src/i18n/locales/it/racePreparation.json"
    it_data = json.loads(it_path.read_text(encoding="utf-8"))
    it_data.setdefault("riderRoles", {})["climber"] = "Scalatore"
    it_path.write_text(json.dumps(it_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("Filled missing Race Preparation legacyUi translations and fixed Italian climber terminology")


if __name__ == "__main__":
    main()
