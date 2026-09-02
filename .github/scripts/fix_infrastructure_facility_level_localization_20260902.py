from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FACILITIES_TSX = ROOT / "src/pages/dashboard/infrastructure/FacilitiesSection.tsx"
HELPERS_TS = ROOT / "src/pages/dashboard/infrastructure/infrastructureHelpers.ts"
LOCALE_ROOT = ROOT / "src/i18n/locales"
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]

GUIDE = {
    "en": {
        "title": "Facility level guide",
        "whatEveryLevelProvides": "What every level provides",
        "currentPanelTitle": "Current Level {{level}}",
        "nextPanelTitle": "Next Level {{level}}",
        "activeNow": "Active now",
        "unlocks": "Unlocks:",
        "effects": "Effects:",
        "monthlyMaintenance": "Monthly maintenance:",
        "perGameMonth": "/ game month",
        "upgradeCost": "Upgrade cost",
        "constructionTime": "Construction time",
        "estimatedCompletion": "Est. completion",
        "levelLabel": "Level {{level}}",
        "currentLevel": "Current level",
        "unlocked": "Unlocked",
        "futureLevel": "Future level",
        "upgradeToThisLevel": "Upgrade to this level: {{cost}} · {{duration}}",
        "maximumReached": "Maximum facility level reached.",
        "levelBadge": "Level {{level}} / {{max}}",
        "imageAlt": "{{name}} — Level {{level}} of {{max}}",
        "noAdditionalUnlock": "No additional unlock at this level.",
        "noAdditionalEffect": "No additional effect is configured for this level."
    },
    "sr-Latn": {
        "title": "Vodič kroz nivoe objekta",
        "whatEveryLevelProvides": "Šta pruža svaki nivo",
        "currentPanelTitle": "Trenutni nivo {{level}}",
        "nextPanelTitle": "Sledeći nivo {{level}}",
        "activeNow": "Trenutno aktivno",
        "unlocks": "Otključava:",
        "effects": "Efekti:",
        "monthlyMaintenance": "Mesečno održavanje:",
        "perGameMonth": "/ mesec igre",
        "upgradeCost": "Cena nadogradnje",
        "constructionTime": "Vreme izgradnje",
        "estimatedCompletion": "Proc. završetak",
        "levelLabel": "Nivo {{level}}",
        "currentLevel": "Trenutni nivo",
        "unlocked": "Otključano",
        "futureLevel": "Budući nivo",
        "upgradeToThisLevel": "Nadogradnja na ovaj nivo: {{cost}} · {{duration}}",
        "maximumReached": "Dostignut je maksimalni nivo objekta.",
        "levelBadge": "Nivo {{level}} / {{max}}",
        "imageAlt": "{{name}} — nivo {{level}} od {{max}}",
        "noAdditionalUnlock": "Na ovom nivou nema dodatnog otključavanja.",
        "noAdditionalEffect": "Za ovaj nivo nije podešen dodatni efekat."
    },
    "de": {
        "title": "Übersicht der Einrichtungslevel",
        "whatEveryLevelProvides": "Leistungen aller Level",
        "currentPanelTitle": "Aktuelles Level {{level}}",
        "nextPanelTitle": "Nächstes Level {{level}}",
        "activeNow": "Aktuell aktiv",
        "unlocks": "Freischaltungen:",
        "effects": "Effekte:",
        "monthlyMaintenance": "Monatliche Wartung:",
        "perGameMonth": "/ Spielmonat",
        "upgradeCost": "Ausbaukosten",
        "constructionTime": "Bauzeit",
        "estimatedCompletion": "Vorauss. Abschluss",
        "levelLabel": "Level {{level}}",
        "currentLevel": "Aktuelles Level",
        "unlocked": "Freigeschaltet",
        "futureLevel": "Zukünftiges Level",
        "upgradeToThisLevel": "Ausbau auf dieses Level: {{cost}} · {{duration}}",
        "maximumReached": "Maximales Einrichtungslevel erreicht.",
        "levelBadge": "Level {{level}} / {{max}}",
        "imageAlt": "{{name}} — Level {{level}} von {{max}}",
        "noAdditionalUnlock": "Keine zusätzliche Freischaltung auf diesem Level.",
        "noAdditionalEffect": "Für dieses Level ist kein zusätzlicher Effekt konfiguriert."
    },
    "hr": {
        "title": "Vodič kroz razine objekta",
        "whatEveryLevelProvides": "Što pruža svaka razina",
        "currentPanelTitle": "Trenutačna razina {{level}}",
        "nextPanelTitle": "Sljedeća razina {{level}}",
        "activeNow": "Trenutačno aktivno",
        "unlocks": "Otključava:",
        "effects": "Učinci:",
        "monthlyMaintenance": "Mjesečno održavanje:",
        "perGameMonth": "/ mjesec igre",
        "upgradeCost": "Cijena nadogradnje",
        "constructionTime": "Vrijeme izgradnje",
        "estimatedCompletion": "Procj. završetak",
        "levelLabel": "Razina {{level}}",
        "currentLevel": "Trenutačna razina",
        "unlocked": "Otključano",
        "futureLevel": "Buduća razina",
        "upgradeToThisLevel": "Nadogradnja na ovu razinu: {{cost}} · {{duration}}",
        "maximumReached": "Dosegnuta je maksimalna razina objekta.",
        "levelBadge": "Razina {{level}} / {{max}}",
        "imageAlt": "{{name}} — razina {{level}} od {{max}}",
        "noAdditionalUnlock": "Na ovoj razini nema dodatnog otključavanja.",
        "noAdditionalEffect": "Za ovu razinu nije postavljen dodatni učinak."
    },
    "es": {
        "title": "Guía de niveles de la instalación",
        "whatEveryLevelProvides": "Qué ofrece cada nivel",
        "currentPanelTitle": "Nivel actual {{level}}",
        "nextPanelTitle": "Siguiente nivel {{level}}",
        "activeNow": "Activo ahora",
        "unlocks": "Desbloquea:",
        "effects": "Efectos:",
        "monthlyMaintenance": "Mantenimiento mensual:",
        "perGameMonth": "/ mes de juego",
        "upgradeCost": "Coste de mejora",
        "constructionTime": "Tiempo de construcción",
        "estimatedCompletion": "Finalización est.",
        "levelLabel": "Nivel {{level}}",
        "currentLevel": "Nivel actual",
        "unlocked": "Desbloqueado",
        "futureLevel": "Nivel futuro",
        "upgradeToThisLevel": "Mejorar a este nivel: {{cost}} · {{duration}}",
        "maximumReached": "Se ha alcanzado el nivel máximo de la instalación.",
        "levelBadge": "Nivel {{level}} / {{max}}",
        "imageAlt": "{{name}} — nivel {{level}} de {{max}}",
        "noAdditionalUnlock": "No hay desbloqueos adicionales en este nivel.",
        "noAdditionalEffect": "No hay ningún efecto adicional configurado para este nivel."
    },
    "it": {
        "title": "Guida ai livelli della struttura",
        "whatEveryLevelProvides": "Cosa offre ogni livello",
        "currentPanelTitle": "Livello attuale {{level}}",
        "nextPanelTitle": "Livello successivo {{level}}",
        "activeNow": "Attivo ora",
        "unlocks": "Sblocca:",
        "effects": "Effetti:",
        "monthlyMaintenance": "Manutenzione mensile:",
        "perGameMonth": "/ mese di gioco",
        "upgradeCost": "Costo miglioramento",
        "constructionTime": "Tempo di costruzione",
        "estimatedCompletion": "Completamento stim.",
        "levelLabel": "Livello {{level}}",
        "currentLevel": "Livello attuale",
        "unlocked": "Sbloccato",
        "futureLevel": "Livello futuro",
        "upgradeToThisLevel": "Migliora a questo livello: {{cost}} · {{duration}}",
        "maximumReached": "Raggiunto il livello massimo della struttura.",
        "levelBadge": "Livello {{level}} / {{max}}",
        "imageAlt": "{{name}} — livello {{level}} di {{max}}",
        "noAdditionalUnlock": "Nessuno sblocco aggiuntivo a questo livello.",
        "noAdditionalEffect": "Nessun effetto aggiuntivo configurato per questo livello."
    },
    "fr": {
        "title": "Guide des niveaux de l'installation",
        "whatEveryLevelProvides": "Ce que chaque niveau apporte",
        "currentPanelTitle": "Niveau actuel {{level}}",
        "nextPanelTitle": "Niveau suivant {{level}}",
        "activeNow": "Actif actuellement",
        "unlocks": "Débloque :",
        "effects": "Effets :",
        "monthlyMaintenance": "Entretien mensuel :",
        "perGameMonth": "/ mois de jeu",
        "upgradeCost": "Coût de l'amélioration",
        "constructionTime": "Temps de construction",
        "estimatedCompletion": "Fin estimée",
        "levelLabel": "Niveau {{level}}",
        "currentLevel": "Niveau actuel",
        "unlocked": "Débloqué",
        "futureLevel": "Niveau futur",
        "upgradeToThisLevel": "Améliorer vers ce niveau : {{cost}} · {{duration}}",
        "maximumReached": "Niveau maximal de l'installation atteint.",
        "levelBadge": "Niveau {{level}} / {{max}}",
        "imageAlt": "{{name}} — niveau {{level}} sur {{max}}",
        "noAdditionalUnlock": "Aucun déblocage supplémentaire à ce niveau.",
        "noAdditionalEffect": "Aucun effet supplémentaire n'est configuré pour ce niveau."
    },
    "ru": {
        "title": "Справочник по уровням объекта",
        "whatEveryLevelProvides": "Что дает каждый уровень",
        "currentPanelTitle": "Текущий уровень {{level}}",
        "nextPanelTitle": "Следующий уровень {{level}}",
        "activeNow": "Активно сейчас",
        "unlocks": "Открывает:",
        "effects": "Эффекты:",
        "monthlyMaintenance": "Ежемесячное обслуживание:",
        "perGameMonth": "/ игровой месяц",
        "upgradeCost": "Стоимость улучшения",
        "constructionTime": "Время строительства",
        "estimatedCompletion": "Ожид. завершение",
        "levelLabel": "Уровень {{level}}",
        "currentLevel": "Текущий уровень",
        "unlocked": "Открыто",
        "futureLevel": "Будущий уровень",
        "upgradeToThisLevel": "Улучшить до этого уровня: {{cost}} · {{duration}}",
        "maximumReached": "Достигнут максимальный уровень объекта.",
        "levelBadge": "Уровень {{level}} / {{max}}",
        "imageAlt": "{{name}} — уровень {{level}} из {{max}}",
        "noAdditionalUnlock": "На этом уровне нет дополнительных открытий.",
        "noAdditionalEffect": "Для этого уровня не настроен дополнительный эффект."
    },
}

TBD = {
    "en": "TBD",
    "sr-Latn": "Naknadno",
    "de": "Noch offen",
    "hr": "Naknadno",
    "es": "Por determinar",
    "it": "Da definire",
    "fr": "À définir",
    "ru": "Уточняется",
}

DETAILS = {
    "en": {
        "club_house": {
            "level0": {"unlock": "Basic club administration only.", "effect": "No Club House financial bonus is active."},
            "level1": {"unlock": "No new staff role.", "effect": "Staff payroll -2%. Eligible recurring operating costs receive 1% cost-optimization rebate."},
            "level2": {"unlock": "Unlocks Sport Director slot.", "effect": "Staff payroll -4%. Rider payroll -1%. Eligible recurring operating costs receive 2% cost-optimization rebate. Monthly tax rebate 2%."},
            "level3": {"unlock": "No new unlock.", "effect": "Staff payroll -6%. Rider payroll -2%. Eligible recurring operating costs receive 3% cost-optimization rebate. Monthly tax rebate 4%."},
            "level4": {"unlock": "No new unlock.", "effect": "Staff payroll -8%. Rider payroll -3%. Eligible recurring operating costs receive 5% cost-optimization rebate. Monthly tax rebate 6%."},
            "level5": {"unlock": "No new unlock.", "effect": "Staff payroll -10%. Rider payroll -4%. Eligible recurring operating costs receive 7% cost-optimization rebate. Monthly tax rebate 10%."},
        },
        "training_center": {
            "level0": {"unlock": "Basic training facilities only.", "effect": "No Training Center development, coaching-effectiveness, fatigue-load or training-risk bonus is active."},
            "level1": {"unlock": "No new unlock.", "effect": "Regular training development +3%; training overload and accident risk -5%; applies to First Team and U23 riders."},
            "level2": {"unlock": "No new unlock.", "effect": "Regular training development +6%; Head Coach and Trainer training bonus +5% effectiveness; training overload and accident risk -10%; applies to First Team and U23 riders."},
            "level3": {"unlock": "Unlocks second Trainer slot.", "effect": "Regular training development +9%; Head Coach and Trainer training bonus +10% effectiveness; regular-training fatigue load -1 point; training overload and accident risk -15%; applies to First Team and U23 riders."},
            "level4": {"unlock": "No new unlock.", "effect": "Regular training development +12%; Head Coach and Trainer training bonus +15% effectiveness; regular-training fatigue load -1 point; training overload and accident risk -20%; applies to First Team and U23 riders."},
            "level5": {"unlock": "Unlocks third Trainer slot.", "effect": "Regular training development +15%; Head Coach and Trainer training bonus +20% effectiveness; regular-training fatigue load -2 points; training overload and accident risk -25%; applies to First Team and U23 riders."},
        },
        "medical_center": {
            "level0": {"unlock": "Base medical facility; one Team Doctor and one Physio slot are available once staff operations are unlocked.", "effect": "No Medical Center prevention, recovery-duration or rehabilitation fatigue-floor bonus is active."},
            "level1": {"unlock": "Unlocks second Physio slot.", "effect": "Preventable injury and illness risk -3%; health-case recovery duration -4%; rehabilitation fatigue floor -1 point; applies to First Team and U23 riders."},
            "level2": {"unlock": "Unlocks Nutritionist slot.", "effect": "Preventable injury and illness risk -6%; health-case recovery duration -8%; rehabilitation fatigue floor -2 points; applies to First Team and U23 riders."},
            "level3": {"unlock": "Unlocks second Team Doctor slot and third Physio slot.", "effect": "Preventable injury and illness risk -9%; health-case recovery duration -12%; rehabilitation fatigue floor -3 points; applies to First Team and U23 riders."},
            "level4": {"unlock": "Unlocks fourth Physio slot.", "effect": "Preventable injury and illness risk -12%; health-case recovery duration -16%; rehabilitation fatigue floor -4 points; applies to First Team and U23 riders."},
            "level5": {"unlock": "Unlocks fifth Physio slot.", "effect": "Preventable injury and illness risk -15%; health-case recovery duration -20%; rehabilitation fatigue floor -5 points; applies to First Team and U23 riders."},
        },
        "youth_academy": {
            "level0": {"unlock": "No dedicated U23 academy infrastructure or U23 Head Coach slot.", "effect": "No academy-specific U23 training or development bonus is active."},
            "level1": {"unlock": "Unlocks U23 Head Coach slot.", "effect": "U23 regular-training development +6%; U23 race-development progress +5%; applies only to riders in the Developing Team."},
            "level2": {"unlock": "Elite academy development program; no additional staff slot.", "effect": "U23 regular-training development +12%; U23 race-development progress +10%; U23 Head Coach development effect +10% effectiveness; U23 off-focus training decay -20%; applies only to riders in the Developing Team."},
        },
        "mechanics_workshop": {
            "level0": {"unlock": "Basic technical support only; additional mechanic capacity remains locked.", "effect": "No workshop-based repair speed or maintenance-cost bonus is active."},
            "level1": {"unlock": "Unlocks second Mechanic slot.", "effect": "Mechanic capacity 2; equipment repair speed +5%; equipment condition loss -3%; mechanical risk -2%"},
            "level2": {"unlock": "Unlocks third Mechanic slot.", "effect": "Mechanic capacity 3; equipment repair speed +12%; equipment repair cost -8%; equipment condition loss -6%; mechanical risk -4%"},
            "level3": {"unlock": "Unlocks fourth Mechanic slot.", "effect": "Mechanic capacity 4; equipment repair speed +22%; equipment repair cost -16%; equipment condition loss -10%; mechanical risk -7%"},
            "level4": {"unlock": "Unlocks fifth Mechanic slot.", "effect": "Mechanic capacity 5; equipment repair speed +35%; equipment repair cost -25%; equipment condition loss -15%; mechanical risk -10%"},
        },
        "scouting_office": {
            "level0": {"unlock": "Basic scouting setup only; additional scout capacity and higher report tiers remain locked.", "effect": "Scouting report quality remains at the basic facility cap."},
            "level1": {"unlock": "Unlocks second Scout / Analyst slot.", "effect": "Scout capacity 2; Basic report-quality cap; attributes are shown in approximately 10-point ranges"},
            "level2": {"unlock": "Unlocks third Scout / Analyst slot plus Solid report quality.", "effect": "Scout capacity 3; Solid report-quality cap; attributes are shown in approximately 5-point ranges"},
            "level3": {"unlock": "Unlocks fourth Scout / Analyst slot plus Strong report quality.", "effect": "Scout capacity 4; Strong report-quality cap; attributes are shown in approximately 3-point ranges"},
            "level4": {"unlock": "Unlocks fifth Scout / Analyst slot plus Elite report quality.", "effect": "Scout capacity 5; Elite report-quality cap; elite-quality scouts can reveal exact values"},
        },
    },
    "de": {
        "club_house": {
            "level0": {"unlock": "Nur grundlegende Clubverwaltung.", "effect": "Kein finanzieller Bonus des Clubhauses ist aktiv."},
            "level1": {"unlock": "Keine neue Personalrolle.", "effect": "Personalkosten -2%. Berechtigte wiederkehrende Betriebskosten erhalten 1% Kostenoptimierungsrabatt."},
            "level2": {"unlock": "Schaltet einen Platz für den Sportdirektor frei.", "effect": "Personalkosten -4%. Fahrergehälter -1%. Berechtigte wiederkehrende Betriebskosten erhalten 2% Kostenoptimierungsrabatt. Monatlicher Steuerrabatt 2%."},
            "level3": {"unlock": "Keine neue Freischaltung.", "effect": "Personalkosten -6%. Fahrergehälter -2%. Berechtigte wiederkehrende Betriebskosten erhalten 3% Kostenoptimierungsrabatt. Monatlicher Steuerrabatt 4%."},
            "level4": {"unlock": "Keine neue Freischaltung.", "effect": "Personalkosten -8%. Fahrergehälter -3%. Berechtigte wiederkehrende Betriebskosten erhalten 5% Kostenoptimierungsrabatt. Monatlicher Steuerrabatt 6%."},
            "level5": {"unlock": "Keine neue Freischaltung.", "effect": "Personalkosten -10%. Fahrergehälter -4%. Berechtigte wiederkehrende Betriebskosten erhalten 7% Kostenoptimierungsrabatt. Monatlicher Steuerrabatt 10%."},
        },
        "training_center": {
            "level0": {"unlock": "Nur grundlegende Trainingseinrichtungen.", "effect": "Kein Bonus des Trainingszentrums für Entwicklung, Trainerwirksamkeit, Ermüdungsbelastung oder Trainingsrisiko ist aktiv."},
            "level1": {"unlock": "Keine neue Freischaltung.", "effect": "Reguläre Trainingsentwicklung +3%; Risiko von Trainingsüberlastung und Unfällen -5%; gilt für Erste Mannschaft und U23-Fahrer."},
            "level2": {"unlock": "Keine neue Freischaltung.", "effect": "Reguläre Trainingsentwicklung +6%; Trainingsbonus von Cheftrainer und Trainer +5% Wirksamkeit; Risiko von Trainingsüberlastung und Unfällen -10%; gilt für Erste Mannschaft und U23-Fahrer."},
            "level3": {"unlock": "Schaltet einen zweiten Trainerplatz frei.", "effect": "Reguläre Trainingsentwicklung +9%; Trainingsbonus von Cheftrainer und Trainer +10% Wirksamkeit; Ermüdungsbelastung durch reguläres Training -1 Punkt; Risiko von Trainingsüberlastung und Unfällen -15%; gilt für Erste Mannschaft und U23-Fahrer."},
            "level4": {"unlock": "Keine neue Freischaltung.", "effect": "Reguläre Trainingsentwicklung +12%; Trainingsbonus von Cheftrainer und Trainer +15% Wirksamkeit; Ermüdungsbelastung durch reguläres Training -1 Punkt; Risiko von Trainingsüberlastung und Unfällen -20%; gilt für Erste Mannschaft und U23-Fahrer."},
            "level5": {"unlock": "Schaltet einen dritten Trainerplatz frei.", "effect": "Reguläre Trainingsentwicklung +15%; Trainingsbonus von Cheftrainer und Trainer +20% Wirksamkeit; Ermüdungsbelastung durch reguläres Training -2 Punkte; Risiko von Trainingsüberlastung und Unfällen -25%; gilt für Erste Mannschaft und U23-Fahrer."},
        },
        "medical_center": {
            "level0": {"unlock": "Medizinische Basiseinrichtung; ein Platz für Teamarzt und ein Platz für Physiotherapeut sind verfügbar, sobald der Personalbetrieb freigeschaltet ist.", "effect": "Kein Bonus des Medizinzentrums für Prävention, Erholungsdauer oder Rehabilitations-Ermüdungsuntergrenze ist aktiv."},
            "level1": {"unlock": "Schaltet einen zweiten Physiotherapeutenplatz frei.", "effect": "Vermeidbares Verletzungs- und Krankheitsrisiko -3%; Erholungsdauer bei Gesundheitsfällen -4%; Ermüdungsuntergrenze in der Rehabilitation -1 Punkt; gilt für Erste Mannschaft und U23-Fahrer."},
            "level2": {"unlock": "Schaltet einen Platz für den Ernährungsberater frei.", "effect": "Vermeidbares Verletzungs- und Krankheitsrisiko -6%; Erholungsdauer bei Gesundheitsfällen -8%; Ermüdungsuntergrenze in der Rehabilitation -2 Punkte; gilt für Erste Mannschaft und U23-Fahrer."},
            "level3": {"unlock": "Schaltet einen zweiten Teamarztplatz und einen dritten Physiotherapeutenplatz frei.", "effect": "Vermeidbares Verletzungs- und Krankheitsrisiko -9%; Erholungsdauer bei Gesundheitsfällen -12%; Ermüdungsuntergrenze in der Rehabilitation -3 Punkte; gilt für Erste Mannschaft und U23-Fahrer."},
            "level4": {"unlock": "Schaltet einen vierten Physiotherapeutenplatz frei.", "effect": "Vermeidbares Verletzungs- und Krankheitsrisiko -12%; Erholungsdauer bei Gesundheitsfällen -16%; Ermüdungsuntergrenze in der Rehabilitation -4 Punkte; gilt für Erste Mannschaft und U23-Fahrer."},
            "level5": {"unlock": "Schaltet einen fünften Physiotherapeutenplatz frei.", "effect": "Vermeidbares Verletzungs- und Krankheitsrisiko -15%; Erholungsdauer bei Gesundheitsfällen -20%; Ermüdungsuntergrenze in der Rehabilitation -5 Punkte; gilt für Erste Mannschaft und U23-Fahrer."},
        },
        "youth_academy": {
            "level0": {"unlock": "Keine eigene U23-Akademieinfrastruktur und kein Platz für einen U23-Cheftrainer.", "effect": "Kein akademiespezifischer Bonus für U23-Training oder -Entwicklung ist aktiv."},
            "level1": {"unlock": "Schaltet einen Platz für den U23-Cheftrainer frei.", "effect": "Reguläre U23-Trainingsentwicklung +6%; U23-Rennentwicklungsfortschritt +5%; gilt nur für Fahrer des Entwicklungsteams."},
            "level2": {"unlock": "Elite-Entwicklungsprogramm der Akademie; kein zusätzlicher Personalplatz.", "effect": "Reguläre U23-Trainingsentwicklung +12%; U23-Rennentwicklungsfortschritt +10%; Entwicklungseffekt des U23-Cheftrainers +10% Wirksamkeit; Abbau bei U23-Training außerhalb des Fokus -20%; gilt nur für Fahrer des Entwicklungsteams."},
        },
        "mechanics_workshop": {
            "level0": {"unlock": "Nur grundlegende technische Unterstützung; zusätzliche Mechanikerkapazität bleibt gesperrt.", "effect": "Kein werkstattbasierter Bonus auf Reparaturgeschwindigkeit oder Wartungskosten ist aktiv."},
            "level1": {"unlock": "Schaltet einen zweiten Mechanikerplatz frei.", "effect": "Mechanikerkapazität 2; Reparaturgeschwindigkeit der Ausrüstung +5%; Zustandsverlust der Ausrüstung -3%; mechanisches Risiko -2%"},
            "level2": {"unlock": "Schaltet einen dritten Mechanikerplatz frei.", "effect": "Mechanikerkapazität 3; Reparaturgeschwindigkeit der Ausrüstung +12%; Reparaturkosten der Ausrüstung -8%; Zustandsverlust der Ausrüstung -6%; mechanisches Risiko -4%"},
            "level3": {"unlock": "Schaltet einen vierten Mechanikerplatz frei.", "effect": "Mechanikerkapazität 4; Reparaturgeschwindigkeit der Ausrüstung +22%; Reparaturkosten der Ausrüstung -16%; Zustandsverlust der Ausrüstung -10%; mechanisches Risiko -7%"},
            "level4": {"unlock": "Schaltet einen fünften Mechanikerplatz frei.", "effect": "Mechanikerkapazität 5; Reparaturgeschwindigkeit der Ausrüstung +35%; Reparaturkosten der Ausrüstung -25%; Zustandsverlust der Ausrüstung -15%; mechanisches Risiko -10%"},
        },
        "scouting_office": {
            "level0": {"unlock": "Nur grundlegendes Scouting; zusätzliche Scout-Kapazität und höhere Berichtsstufen bleiben gesperrt.", "effect": "Die Qualität von Scouting-Berichten bleibt auf die Basisgrenze der Einrichtung begrenzt."},
            "level1": {"unlock": "Schaltet einen zweiten Scout-/Analystenplatz frei.", "effect": "Scout-Kapazität 2; Basisgrenze für Berichtsqualität; Attribute werden in Bereichen von ungefähr 10 Punkten angezeigt"},
            "level2": {"unlock": "Schaltet einen dritten Scout-/Analystenplatz sowie solide Berichtsqualität frei.", "effect": "Scout-Kapazität 3; Obergrenze für solide Berichtsqualität; Attribute werden in Bereichen von ungefähr 5 Punkten angezeigt"},
            "level3": {"unlock": "Schaltet einen vierten Scout-/Analystenplatz sowie starke Berichtsqualität frei.", "effect": "Scout-Kapazität 4; Obergrenze für starke Berichtsqualität; Attribute werden in Bereichen von ungefähr 3 Punkten angezeigt"},
            "level4": {"unlock": "Schaltet einen fünften Scout-/Analystenplatz sowie Elite-Berichtsqualität frei.", "effect": "Scout-Kapazität 5; Obergrenze für Elite-Berichtsqualität; Scouts mit Elite-Qualität können exakte Werte anzeigen"},
        },
    },
    "sr-Latn": {
        "club_house": {
            "level0": {"unlock": "Samo osnovna administracija kluba.", "effect": "Nijedan finansijski bonus klupske kuće nije aktivan."},
            "level1": {"unlock": "Nema nove uloge osoblja.", "effect": "Troškovi plata osoblja -2%. Prihvatljivi ponavljajući operativni troškovi dobijaju 1% popusta kroz optimizaciju troškova."},
            "level2": {"unlock": "Otključava mesto za sportskog direktora.", "effect": "Troškovi plata osoblja -4%. Plate vozača -1%. Prihvatljivi ponavljajući operativni troškovi dobijaju 2% popusta kroz optimizaciju troškova. Mesečni poreski povraćaj 2%."},
            "level3": {"unlock": "Nema novog otključavanja.", "effect": "Troškovi plata osoblja -6%. Plate vozača -2%. Prihvatljivi ponavljajući operativni troškovi dobijaju 3% popusta kroz optimizaciju troškova. Mesečni poreski povraćaj 4%."},
            "level4": {"unlock": "Nema novog otključavanja.", "effect": "Troškovi plata osoblja -8%. Plate vozača -3%. Prihvatljivi ponavljajući operativni troškovi dobijaju 5% popusta kroz optimizaciju troškova. Mesečni poreski povraćaj 6%."},
            "level5": {"unlock": "Nema novog otključavanja.", "effect": "Troškovi plata osoblja -10%. Plate vozača -4%. Prihvatljivi ponavljajući operativni troškovi dobijaju 7% popusta kroz optimizaciju troškova. Mesečni poreski povraćaj 10%."},
        },
        "training_center": {
            "level0": {"unlock": "Samo osnovni objekti za trening.", "effect": "Nije aktivan bonus Trening centra za razvoj, efikasnost trenera, opterećenje umorom ili rizik treninga."},
            "level1": {"unlock": "Nema novog otključavanja.", "effect": "Razvoj kroz redovan trening +3%; rizik od preopterećenja i nezgoda na treningu -5%; važi za Prvi tim i U23 vozače."},
            "level2": {"unlock": "Nema novog otključavanja.", "effect": "Razvoj kroz redovan trening +6%; bonus treninga glavnog trenera i trenera +5% efikasnosti; rizik od preopterećenja i nezgoda na treningu -10%; važi za Prvi tim i U23 vozače."},
            "level3": {"unlock": "Otključava drugo mesto za trenera.", "effect": "Razvoj kroz redovan trening +9%; bonus treninga glavnog trenera i trenera +10% efikasnosti; opterećenje umorom iz redovnog treninga -1 poen; rizik od preopterećenja i nezgoda na treningu -15%; važi za Prvi tim i U23 vozače."},
            "level4": {"unlock": "Nema novog otključavanja.", "effect": "Razvoj kroz redovan trening +12%; bonus treninga glavnog trenera i trenera +15% efikasnosti; opterećenje umorom iz redovnog treninga -1 poen; rizik od preopterećenja i nezgoda na treningu -20%; važi za Prvi tim i U23 vozače."},
            "level5": {"unlock": "Otključava treće mesto za trenera.", "effect": "Razvoj kroz redovan trening +15%; bonus treninga glavnog trenera i trenera +20% efikasnosti; opterećenje umorom iz redovnog treninga -2 poena; rizik od preopterećenja i nezgoda na treningu -25%; važi za Prvi tim i U23 vozače."},
        },
        "medical_center": {
            "level0": {"unlock": "Osnovni medicinski objekat; jedno mesto za timskog doktora i jedno za fizioterapeuta dostupni su kada se otključaju operacije osoblja.", "effect": "Nije aktivan bonus Medicinskog centra za prevenciju, trajanje oporavka ili donju granicu umora tokom rehabilitacije."},
            "level1": {"unlock": "Otključava drugo mesto za fizioterapeuta.", "effect": "Rizik od povreda i bolesti koje se mogu sprečiti -3%; trajanje oporavka zdravstvenog slučaja -4%; donja granica umora tokom rehabilitacije -1 poen; važi za Prvi tim i U23 vozače."},
            "level2": {"unlock": "Otključava mesto za nutricionistu.", "effect": "Rizik od povreda i bolesti koje se mogu sprečiti -6%; trajanje oporavka zdravstvenog slučaja -8%; donja granica umora tokom rehabilitacije -2 poena; važi za Prvi tim i U23 vozače."},
            "level3": {"unlock": "Otključava drugo mesto za timskog doktora i treće mesto za fizioterapeuta.", "effect": "Rizik od povreda i bolesti koje se mogu sprečiti -9%; trajanje oporavka zdravstvenog slučaja -12%; donja granica umora tokom rehabilitacije -3 poena; važi za Prvi tim i U23 vozače."},
            "level4": {"unlock": "Otključava četvrto mesto za fizioterapeuta.", "effect": "Rizik od povreda i bolesti koje se mogu sprečiti -12%; trajanje oporavka zdravstvenog slučaja -16%; donja granica umora tokom rehabilitacije -4 poena; važi za Prvi tim i U23 vozače."},
            "level5": {"unlock": "Otključava peto mesto za fizioterapeuta.", "effect": "Rizik od povreda i bolesti koje se mogu sprečiti -15%; trajanje oporavka zdravstvenog slučaja -20%; donja granica umora tokom rehabilitacije -5 poena; važi za Prvi tim i U23 vozače."},
        },
        "youth_academy": {
            "level0": {"unlock": "Nema posebne U23 akademijske infrastrukture niti mesta za U23 glavnog trenera.", "effect": "Nije aktivan poseban akademijski bonus za U23 trening ili razvoj."},
            "level1": {"unlock": "Otključava mesto za U23 glavnog trenera.", "effect": "Razvoj kroz redovan U23 trening +6%; napredak razvoja kroz U23 trke +5%; važi samo za vozače Razvojnog tima."},
            "level2": {"unlock": "Elitni program razvoja akademije; nema dodatnog mesta za osoblje.", "effect": "Razvoj kroz redovan U23 trening +12%; napredak razvoja kroz U23 trke +10%; razvojni efekat U23 glavnog trenera +10% efikasnosti; pad treninga van fokusa za U23 -20%; važi samo za vozače Razvojnog tima."},
        },
        "mechanics_workshop": {
            "level0": {"unlock": "Samo osnovna tehnička podrška; dodatni kapacitet mehaničara ostaje zaključan.", "effect": "Nije aktivan bonus radionice za brzinu popravke ili troškove održavanja."},
            "level1": {"unlock": "Otključava drugo mesto za mehaničara.", "effect": "Kapacitet mehaničara 2; brzina popravke opreme +5%; gubitak stanja opreme -3%; mehanički rizik -2%"},
            "level2": {"unlock": "Otključava treće mesto za mehaničara.", "effect": "Kapacitet mehaničara 3; brzina popravke opreme +12%; trošak popravke opreme -8%; gubitak stanja opreme -6%; mehanički rizik -4%"},
            "level3": {"unlock": "Otključava četvrto mesto za mehaničara.", "effect": "Kapacitet mehaničara 4; brzina popravke opreme +22%; trošak popravke opreme -16%; gubitak stanja opreme -10%; mehanički rizik -7%"},
            "level4": {"unlock": "Otključava peto mesto za mehaničara.", "effect": "Kapacitet mehaničara 5; brzina popravke opreme +35%; trošak popravke opreme -25%; gubitak stanja opreme -15%; mehanički rizik -10%"},
        },
        "scouting_office": {
            "level0": {"unlock": "Samo osnovni skauting; dodatni kapacitet skauta i viši nivoi izveštaja ostaju zaključani.", "effect": "Kvalitet skauting izveštaja ostaje na osnovnom limitu objekta."},
            "level1": {"unlock": "Otključava drugo mesto za skauta / analitičara.", "effect": "Kapacitet skauta 2; osnovni limit kvaliteta izveštaja; atributi se prikazuju u rasponima od približno 10 poena"},
            "level2": {"unlock": "Otključava treće mesto za skauta / analitičara i solidan kvalitet izveštaja.", "effect": "Kapacitet skauta 3; limit solidnog kvaliteta izveštaja; atributi se prikazuju u rasponima od približno 5 poena"},
            "level3": {"unlock": "Otključava četvrto mesto za skauta / analitičara i jak kvalitet izveštaja.", "effect": "Kapacitet skauta 4; limit jakog kvaliteta izveštaja; atributi se prikazuju u rasponima od približno 3 poena"},
            "level4": {"unlock": "Otključava peto mesto za skauta / analitičara i elitni kvalitet izveštaja.", "effect": "Kapacitet skauta 5; limit elitnog kvaliteta izveštaja; skauti elitnog kvaliteta mogu otkriti tačne vrednosti"},
        },
    },
    "hr": {
        "club_house": {
            "level0": {"unlock": "Samo osnovna administracija kluba.", "effect": "Nijedan financijski bonus klupske kuće nije aktivan."},
            "level1": {"unlock": "Nema nove uloge osoblja.", "effect": "Troškovi plaća osoblja -2%. Prihvatljivi ponavljajući operativni troškovi dobivaju 1% popusta kroz optimizaciju troškova."},
            "level2": {"unlock": "Otključava mjesto za sportskog direktora.", "effect": "Troškovi plaća osoblja -4%. Plaće vozača -1%. Prihvatljivi ponavljajući operativni troškovi dobivaju 2% popusta kroz optimizaciju troškova. Mjesečni porezni povrat 2%."},
            "level3": {"unlock": "Nema novog otključavanja.", "effect": "Troškovi plaća osoblja -6%. Plaće vozača -2%. Prihvatljivi ponavljajući operativni troškovi dobivaju 3% popusta kroz optimizaciju troškova. Mjesečni porezni povrat 4%."},
            "level4": {"unlock": "Nema novog otključavanja.", "effect": "Troškovi plaća osoblja -8%. Plaće vozača -3%. Prihvatljivi ponavljajući operativni troškovi dobivaju 5% popusta kroz optimizaciju troškova. Mjesečni porezni povrat 6%."},
            "level5": {"unlock": "Nema novog otključavanja.", "effect": "Troškovi plaća osoblja -10%. Plaće vozača -4%. Prihvatljivi ponavljajući operativni troškovi dobivaju 7% popusta kroz optimizaciju troškova. Mjesečni porezni povrat 10%."},
        },
        "training_center": {
            "level0": {"unlock": "Samo osnovni objekti za trening.", "effect": "Nije aktivan bonus Trening centra za razvoj, učinkovitost trenera, opterećenje umorom ili rizik treninga."},
            "level1": {"unlock": "Nema novog otključavanja.", "effect": "Razvoj kroz redovni trening +3%; rizik od preopterećenja i nezgoda na treningu -5%; primjenjuje se na Prvu momčad i U23 vozače."},
            "level2": {"unlock": "Nema novog otključavanja.", "effect": "Razvoj kroz redovni trening +6%; bonus treninga glavnog trenera i trenera +5% učinkovitosti; rizik od preopterećenja i nezgoda na treningu -10%; primjenjuje se na Prvu momčad i U23 vozače."},
            "level3": {"unlock": "Otključava drugo mjesto za trenera.", "effect": "Razvoj kroz redovni trening +9%; bonus treninga glavnog trenera i trenera +10% učinkovitosti; opterećenje umorom iz redovnog treninga -1 bod; rizik od preopterećenja i nezgoda na treningu -15%; primjenjuje se na Prvu momčad i U23 vozače."},
            "level4": {"unlock": "Nema novog otključavanja.", "effect": "Razvoj kroz redovni trening +12%; bonus treninga glavnog trenera i trenera +15% učinkovitosti; opterećenje umorom iz redovnog treninga -1 bod; rizik od preopterećenja i nezgoda na treningu -20%; primjenjuje se na Prvu momčad i U23 vozače."},
            "level5": {"unlock": "Otključava treće mjesto za trenera.", "effect": "Razvoj kroz redovni trening +15%; bonus treninga glavnog trenera i trenera +20% učinkovitosti; opterećenje umorom iz redovnog treninga -2 boda; rizik od preopterećenja i nezgoda na treningu -25%; primjenjuje se na Prvu momčad i U23 vozače."},
        },
        "medical_center": {
            "level0": {"unlock": "Osnovni medicinski objekt; jedno mjesto za timskog liječnika i jedno za fizioterapeuta dostupni su kada se otključaju operacije osoblja.", "effect": "Nije aktivan bonus Medicinskog centra za prevenciju, trajanje oporavka ili donju granicu umora tijekom rehabilitacije."},
            "level1": {"unlock": "Otključava drugo mjesto za fizioterapeuta.", "effect": "Rizik od ozljeda i bolesti koje se mogu spriječiti -3%; trajanje oporavka zdravstvenog slučaja -4%; donja granica umora tijekom rehabilitacije -1 bod; primjenjuje se na Prvu momčad i U23 vozače."},
            "level2": {"unlock": "Otključava mjesto za nutricionista.", "effect": "Rizik od ozljeda i bolesti koje se mogu spriječiti -6%; trajanje oporavka zdravstvenog slučaja -8%; donja granica umora tijekom rehabilitacije -2 boda; primjenjuje se na Prvu momčad i U23 vozače."},
            "level3": {"unlock": "Otključava drugo mjesto za timskog liječnika i treće mjesto za fizioterapeuta.", "effect": "Rizik od ozljeda i bolesti koje se mogu spriječiti -9%; trajanje oporavka zdravstvenog slučaja -12%; donja granica umora tijekom rehabilitacije -3 boda; primjenjuje se na Prvu momčad i U23 vozače."},
            "level4": {"unlock": "Otključava četvrto mjesto za fizioterapeuta.", "effect": "Rizik od ozljeda i bolesti koje se mogu spriječiti -12%; trajanje oporavka zdravstvenog slučaja -16%; donja granica umora tijekom rehabilitacije -4 boda; primjenjuje se na Prvu momčad i U23 vozače."},
            "level5": {"unlock": "Otključava peto mjesto za fizioterapeuta.", "effect": "Rizik od ozljeda i bolesti koje se mogu spriječiti -15%; trajanje oporavka zdravstvenog slučaja -20%; donja granica umora tijekom rehabilitacije -5 bodova; primjenjuje se na Prvu momčad i U23 vozače."},
        },
        "youth_academy": {
            "level0": {"unlock": "Nema posebne U23 akademijske infrastrukture niti mjesta za U23 glavnog trenera.", "effect": "Nije aktivan poseban akademijski bonus za U23 trening ili razvoj."},
            "level1": {"unlock": "Otključava mjesto za U23 glavnog trenera.", "effect": "Razvoj kroz redovni U23 trening +6%; napredak razvoja kroz U23 utrke +5%; primjenjuje se samo na vozače Razvojne momčadi."},
            "level2": {"unlock": "Elitni program razvoja akademije; nema dodatnog mjesta za osoblje.", "effect": "Razvoj kroz redovni U23 trening +12%; napredak razvoja kroz U23 utrke +10%; razvojni učinak U23 glavnog trenera +10% učinkovitosti; pad treninga izvan fokusa za U23 -20%; primjenjuje se samo na vozače Razvojne momčadi."},
        },
        "mechanics_workshop": {
            "level0": {"unlock": "Samo osnovna tehnička podrška; dodatni kapacitet mehaničara ostaje zaključan.", "effect": "Nije aktivan bonus radionice za brzinu popravka ili troškove održavanja."},
            "level1": {"unlock": "Otključava drugo mjesto za mehaničara.", "effect": "Kapacitet mehaničara 2; brzina popravka opreme +5%; gubitak stanja opreme -3%; mehanički rizik -2%"},
            "level2": {"unlock": "Otključava treće mjesto za mehaničara.", "effect": "Kapacitet mehaničara 3; brzina popravka opreme +12%; trošak popravka opreme -8%; gubitak stanja opreme -6%; mehanički rizik -4%"},
            "level3": {"unlock": "Otključava četvrto mjesto za mehaničara.", "effect": "Kapacitet mehaničara 4; brzina popravka opreme +22%; trošak popravka opreme -16%; gubitak stanja opreme -10%; mehanički rizik -7%"},
            "level4": {"unlock": "Otključava peto mjesto za mehaničara.", "effect": "Kapacitet mehaničara 5; brzina popravka opreme +35%; trošak popravka opreme -25%; gubitak stanja opreme -15%; mehanički rizik -10%"},
        },
        "scouting_office": {
            "level0": {"unlock": "Samo osnovni scouting; dodatni kapacitet scouta i više razine izvještaja ostaju zaključani.", "effect": "Kvaliteta scouting izvještaja ostaje na osnovnom ograničenju objekta."},
            "level1": {"unlock": "Otključava drugo mjesto za scouta / analitičara.", "effect": "Kapacitet scouta 2; osnovno ograničenje kvalitete izvještaja; atributi se prikazuju u rasponima od približno 10 bodova"},
            "level2": {"unlock": "Otključava treće mjesto za scouta / analitičara i solidnu kvalitetu izvještaja.", "effect": "Kapacitet scouta 3; ograničenje solidne kvalitete izvještaja; atributi se prikazuju u rasponima od približno 5 bodova"},
            "level3": {"unlock": "Otključava četvrto mjesto za scouta / analitičara i snažnu kvalitetu izvještaja.", "effect": "Kapacitet scouta 4; ograničenje snažne kvalitete izvještaja; atributi se prikazuju u rasponima od približno 3 boda"},
            "level4": {"unlock": "Otključava peto mjesto za scouta / analitičara i elitnu kvalitetu izvještaja.", "effect": "Kapacitet scouta 5; ograničenje elitne kvalitete izvještaja; scouti elitne kvalitete mogu otkriti točne vrijednosti"},
        },
    },
    "es": {
        "club_house": {
            "level0": {"unlock": "Solo administración básica del club.", "effect": "No hay ningún bonus financiero del Club House activo."},
            "level1": {"unlock": "No hay un nuevo rol de personal.", "effect": "Costes salariales del personal -2%. Los costes operativos recurrentes elegibles reciben un 1% de descuento por optimización de costes."},
            "level2": {"unlock": "Desbloquea una plaza de Director Deportivo.", "effect": "Costes salariales del personal -4%. Salarios de ciclistas -1%. Los costes operativos recurrentes elegibles reciben un 2% de descuento por optimización de costes. Bonificación fiscal mensual 2%."},
            "level3": {"unlock": "No hay un nuevo desbloqueo.", "effect": "Costes salariales del personal -6%. Salarios de ciclistas -2%. Los costes operativos recurrentes elegibles reciben un 3% de descuento por optimización de costes. Bonificación fiscal mensual 4%."},
            "level4": {"unlock": "No hay un nuevo desbloqueo.", "effect": "Costes salariales del personal -8%. Salarios de ciclistas -3%. Los costes operativos recurrentes elegibles reciben un 5% de descuento por optimización de costes. Bonificación fiscal mensual 6%."},
            "level5": {"unlock": "No hay un nuevo desbloqueo.", "effect": "Costes salariales del personal -10%. Salarios de ciclistas -4%. Los costes operativos recurrentes elegibles reciben un 7% de descuento por optimización de costes. Bonificación fiscal mensual 10%."},
        },
        "training_center": {
            "level0": {"unlock": "Solo instalaciones básicas de entrenamiento.", "effect": "No hay ningún bonus activo del Centro de Entrenamiento para desarrollo, eficacia del cuerpo técnico, carga de fatiga o riesgo de entrenamiento."},
            "level1": {"unlock": "No hay un nuevo desbloqueo.", "effect": "Desarrollo mediante entrenamiento regular +3%; riesgo de sobrecarga y accidentes en entrenamiento -5%; se aplica al Primer Equipo y a ciclistas U23."},
            "level2": {"unlock": "No hay un nuevo desbloqueo.", "effect": "Desarrollo mediante entrenamiento regular +6%; bonus de entrenamiento del Entrenador Principal y entrenadores +5% de eficacia; riesgo de sobrecarga y accidentes en entrenamiento -10%; se aplica al Primer Equipo y a ciclistas U23."},
            "level3": {"unlock": "Desbloquea una segunda plaza de entrenador.", "effect": "Desarrollo mediante entrenamiento regular +9%; bonus de entrenamiento del Entrenador Principal y entrenadores +10% de eficacia; carga de fatiga del entrenamiento regular -1 punto; riesgo de sobrecarga y accidentes en entrenamiento -15%; se aplica al Primer Equipo y a ciclistas U23."},
            "level4": {"unlock": "No hay un nuevo desbloqueo.", "effect": "Desarrollo mediante entrenamiento regular +12%; bonus de entrenamiento del Entrenador Principal y entrenadores +15% de eficacia; carga de fatiga del entrenamiento regular -1 punto; riesgo de sobrecarga y accidentes en entrenamiento -20%; se aplica al Primer Equipo y a ciclistas U23."},
            "level5": {"unlock": "Desbloquea una tercera plaza de entrenador.", "effect": "Desarrollo mediante entrenamiento regular +15%; bonus de entrenamiento del Entrenador Principal y entrenadores +20% de eficacia; carga de fatiga del entrenamiento regular -2 puntos; riesgo de sobrecarga y accidentes en entrenamiento -25%; se aplica al Primer Equipo y a ciclistas U23."},
        },
        "medical_center": {
            "level0": {"unlock": "Instalación médica básica; una plaza de Médico de Equipo y una de Fisioterapeuta están disponibles cuando se desbloquean las operaciones de personal.", "effect": "No hay ningún bonus activo del Centro Médico para prevención, duración de recuperación o mínimo de fatiga de rehabilitación."},
            "level1": {"unlock": "Desbloquea una segunda plaza de Fisioterapeuta.", "effect": "Riesgo prevenible de lesiones y enfermedades -3%; duración de recuperación de casos médicos -4%; mínimo de fatiga de rehabilitación -1 punto; se aplica al Primer Equipo y a ciclistas U23."},
            "level2": {"unlock": "Desbloquea una plaza de Nutricionista.", "effect": "Riesgo prevenible de lesiones y enfermedades -6%; duración de recuperación de casos médicos -8%; mínimo de fatiga de rehabilitación -2 puntos; se aplica al Primer Equipo y a ciclistas U23."},
            "level3": {"unlock": "Desbloquea una segunda plaza de Médico de Equipo y una tercera de Fisioterapeuta.", "effect": "Riesgo prevenible de lesiones y enfermedades -9%; duración de recuperación de casos médicos -12%; mínimo de fatiga de rehabilitación -3 puntos; se aplica al Primer Equipo y a ciclistas U23."},
            "level4": {"unlock": "Desbloquea una cuarta plaza de Fisioterapeuta.", "effect": "Riesgo prevenible de lesiones y enfermedades -12%; duración de recuperación de casos médicos -16%; mínimo de fatiga de rehabilitación -4 puntos; se aplica al Primer Equipo y a ciclistas U23."},
            "level5": {"unlock": "Desbloquea una quinta plaza de Fisioterapeuta.", "effect": "Riesgo prevenible de lesiones y enfermedades -15%; duración de recuperación de casos médicos -20%; mínimo de fatiga de rehabilitación -5 puntos; se aplica al Primer Equipo y a ciclistas U23."},
        },
        "youth_academy": {
            "level0": {"unlock": "No hay infraestructura específica de academia U23 ni plaza de Entrenador Principal U23.", "effect": "No hay ningún bonus específico de academia para entrenamiento o desarrollo U23 activo."},
            "level1": {"unlock": "Desbloquea una plaza de Entrenador Principal U23.", "effect": "Desarrollo mediante entrenamiento regular U23 +6%; progreso de desarrollo en carreras U23 +5%; se aplica solo a ciclistas del Equipo de Desarrollo."},
            "level2": {"unlock": "Programa élite de desarrollo de la academia; no añade otra plaza de personal.", "effect": "Desarrollo mediante entrenamiento regular U23 +12%; progreso de desarrollo en carreras U23 +10%; efecto de desarrollo del Entrenador Principal U23 +10% de eficacia; pérdida por entrenamiento U23 fuera de foco -20%; se aplica solo a ciclistas del Equipo de Desarrollo."},
        },
        "mechanics_workshop": {
            "level0": {"unlock": "Solo soporte técnico básico; la capacidad adicional de mecánicos permanece bloqueada.", "effect": "No hay bonus activo del taller para velocidad de reparación o costes de mantenimiento."},
            "level1": {"unlock": "Desbloquea una segunda plaza de Mecánico.", "effect": "Capacidad de mecánicos 2; velocidad de reparación del equipo +5%; pérdida de condición del equipo -3%; riesgo mecánico -2%"},
            "level2": {"unlock": "Desbloquea una tercera plaza de Mecánico.", "effect": "Capacidad de mecánicos 3; velocidad de reparación del equipo +12%; coste de reparación del equipo -8%; pérdida de condición del equipo -6%; riesgo mecánico -4%"},
            "level3": {"unlock": "Desbloquea una cuarta plaza de Mecánico.", "effect": "Capacidad de mecánicos 4; velocidad de reparación del equipo +22%; coste de reparación del equipo -16%; pérdida de condición del equipo -10%; riesgo mecánico -7%"},
            "level4": {"unlock": "Desbloquea una quinta plaza de Mecánico.", "effect": "Capacidad de mecánicos 5; velocidad de reparación del equipo +35%; coste de reparación del equipo -25%; pérdida de condición del equipo -15%; riesgo mecánico -10%"},
        },
        "scouting_office": {
            "level0": {"unlock": "Solo configuración básica de scouting; la capacidad adicional y los niveles superiores de informe permanecen bloqueados.", "effect": "La calidad de los informes de scouting permanece en el límite básico de la instalación."},
            "level1": {"unlock": "Desbloquea una segunda plaza de Ojeador / Analista.", "effect": "Capacidad de ojeadores 2; límite Básico de calidad de informe; los atributos se muestran en rangos de aproximadamente 10 puntos"},
            "level2": {"unlock": "Desbloquea una tercera plaza de Ojeador / Analista y calidad de informe Sólida.", "effect": "Capacidad de ojeadores 3; límite Sólido de calidad de informe; los atributos se muestran en rangos de aproximadamente 5 puntos"},
            "level3": {"unlock": "Desbloquea una cuarta plaza de Ojeador / Analista y calidad de informe Fuerte.", "effect": "Capacidad de ojeadores 4; límite Fuerte de calidad de informe; los atributos se muestran en rangos de aproximadamente 3 puntos"},
            "level4": {"unlock": "Desbloquea una quinta plaza de Ojeador / Analista y calidad de informe Élite.", "effect": "Capacidad de ojeadores 5; límite Élite de calidad de informe; los ojeadores de calidad élite pueden revelar valores exactos"},
        },
    },
    "it": {
        "club_house": {
            "level0": {"unlock": "Solo amministrazione di base del club.", "effect": "Nessun bonus finanziario della Club House è attivo."},
            "level1": {"unlock": "Nessun nuovo ruolo dello staff.", "effect": "Costo stipendi staff -2%. I costi operativi ricorrenti idonei ricevono l'1% di sconto per ottimizzazione dei costi."},
            "level2": {"unlock": "Sblocca uno slot per il Direttore Sportivo.", "effect": "Costo stipendi staff -4%. Stipendi corridori -1%. I costi operativi ricorrenti idonei ricevono il 2% di sconto per ottimizzazione dei costi. Rimborso fiscale mensile 2%."},
            "level3": {"unlock": "Nessun nuovo sblocco.", "effect": "Costo stipendi staff -6%. Stipendi corridori -2%. I costi operativi ricorrenti idonei ricevono il 3% di sconto per ottimizzazione dei costi. Rimborso fiscale mensile 4%."},
            "level4": {"unlock": "Nessun nuovo sblocco.", "effect": "Costo stipendi staff -8%. Stipendi corridori -3%. I costi operativi ricorrenti idonei ricevono il 5% di sconto per ottimizzazione dei costi. Rimborso fiscale mensile 6%."},
            "level5": {"unlock": "Nessun nuovo sblocco.", "effect": "Costo stipendi staff -10%. Stipendi corridori -4%. I costi operativi ricorrenti idonei ricevono il 7% di sconto per ottimizzazione dei costi. Rimborso fiscale mensile 10%."},
        },
        "training_center": {
            "level0": {"unlock": "Solo strutture di allenamento di base.", "effect": "Nessun bonus del Centro di Allenamento per sviluppo, efficacia dello staff tecnico, carico di fatica o rischio di allenamento è attivo."},
            "level1": {"unlock": "Nessun nuovo sblocco.", "effect": "Sviluppo tramite allenamento regolare +3%; rischio di sovraccarico e incidenti in allenamento -5%; si applica alla Prima Squadra e ai corridori U23."},
            "level2": {"unlock": "Nessun nuovo sblocco.", "effect": "Sviluppo tramite allenamento regolare +6%; bonus allenamento di Capo Allenatore e Allenatore +5% efficacia; rischio di sovraccarico e incidenti in allenamento -10%; si applica alla Prima Squadra e ai corridori U23."},
            "level3": {"unlock": "Sblocca un secondo slot Allenatore.", "effect": "Sviluppo tramite allenamento regolare +9%; bonus allenamento di Capo Allenatore e Allenatore +10% efficacia; carico di fatica da allenamento regolare -1 punto; rischio di sovraccarico e incidenti in allenamento -15%; si applica alla Prima Squadra e ai corridori U23."},
            "level4": {"unlock": "Nessun nuovo sblocco.", "effect": "Sviluppo tramite allenamento regolare +12%; bonus allenamento di Capo Allenatore e Allenatore +15% efficacia; carico di fatica da allenamento regolare -1 punto; rischio di sovraccarico e incidenti in allenamento -20%; si applica alla Prima Squadra e ai corridori U23."},
            "level5": {"unlock": "Sblocca un terzo slot Allenatore.", "effect": "Sviluppo tramite allenamento regolare +15%; bonus allenamento di Capo Allenatore e Allenatore +20% efficacia; carico di fatica da allenamento regolare -2 punti; rischio di sovraccarico e incidenti in allenamento -25%; si applica alla Prima Squadra e ai corridori U23."},
        },
        "medical_center": {
            "level0": {"unlock": "Struttura medica di base; uno slot Medico di Squadra e uno Fisioterapista sono disponibili quando vengono sbloccate le operazioni dello staff.", "effect": "Nessun bonus del Centro Medico per prevenzione, durata del recupero o soglia minima di fatica riabilitativa è attivo."},
            "level1": {"unlock": "Sblocca un secondo slot Fisioterapista.", "effect": "Rischio prevenibile di infortuni e malattie -3%; durata del recupero dei casi sanitari -4%; soglia minima di fatica in riabilitazione -1 punto; si applica alla Prima Squadra e ai corridori U23."},
            "level2": {"unlock": "Sblocca uno slot Nutrizionista.", "effect": "Rischio prevenibile di infortuni e malattie -6%; durata del recupero dei casi sanitari -8%; soglia minima di fatica in riabilitazione -2 punti; si applica alla Prima Squadra e ai corridori U23."},
            "level3": {"unlock": "Sblocca un secondo slot Medico di Squadra e un terzo slot Fisioterapista.", "effect": "Rischio prevenibile di infortuni e malattie -9%; durata del recupero dei casi sanitari -12%; soglia minima di fatica in riabilitazione -3 punti; si applica alla Prima Squadra e ai corridori U23."},
            "level4": {"unlock": "Sblocca un quarto slot Fisioterapista.", "effect": "Rischio prevenibile di infortuni e malattie -12%; durata del recupero dei casi sanitari -16%; soglia minima di fatica in riabilitazione -4 punti; si applica alla Prima Squadra e ai corridori U23."},
            "level5": {"unlock": "Sblocca un quinto slot Fisioterapista.", "effect": "Rischio prevenibile di infortuni e malattie -15%; durata del recupero dei casi sanitari -20%; soglia minima di fatica in riabilitazione -5 punti; si applica alla Prima Squadra e ai corridori U23."},
        },
        "youth_academy": {
            "level0": {"unlock": "Nessuna infrastruttura dedicata all'accademia U23 né slot per il Capo Allenatore U23.", "effect": "Nessun bonus specifico dell'accademia per allenamento o sviluppo U23 è attivo."},
            "level1": {"unlock": "Sblocca uno slot Capo Allenatore U23.", "effect": "Sviluppo tramite allenamento regolare U23 +6%; progresso di sviluppo nelle gare U23 +5%; si applica solo ai corridori della Squadra di Sviluppo."},
            "level2": {"unlock": "Programma élite di sviluppo dell'accademia; nessuno slot staff aggiuntivo.", "effect": "Sviluppo tramite allenamento regolare U23 +12%; progresso di sviluppo nelle gare U23 +10%; effetto di sviluppo del Capo Allenatore U23 +10% efficacia; decadimento dell'allenamento U23 fuori focus -20%; si applica solo ai corridori della Squadra di Sviluppo."},
        },
        "mechanics_workshop": {
            "level0": {"unlock": "Solo supporto tecnico di base; la capacità aggiuntiva dei meccanici resta bloccata.", "effect": "Nessun bonus dell'officina per velocità di riparazione o costi di manutenzione è attivo."},
            "level1": {"unlock": "Sblocca un secondo slot Meccanico.", "effect": "Capacità meccanici 2; velocità riparazione attrezzatura +5%; perdita condizione attrezzatura -3%; rischio meccanico -2%"},
            "level2": {"unlock": "Sblocca un terzo slot Meccanico.", "effect": "Capacità meccanici 3; velocità riparazione attrezzatura +12%; costo riparazione attrezzatura -8%; perdita condizione attrezzatura -6%; rischio meccanico -4%"},
            "level3": {"unlock": "Sblocca un quarto slot Meccanico.", "effect": "Capacità meccanici 4; velocità riparazione attrezzatura +22%; costo riparazione attrezzatura -16%; perdita condizione attrezzatura -10%; rischio meccanico -7%"},
            "level4": {"unlock": "Sblocca un quinto slot Meccanico.", "effect": "Capacità meccanici 5; velocità riparazione attrezzatura +35%; costo riparazione attrezzatura -25%; perdita condizione attrezzatura -15%; rischio meccanico -10%"},
        },
        "scouting_office": {
            "level0": {"unlock": "Solo scouting di base; capacità scout aggiuntiva e livelli di rapporto superiori restano bloccati.", "effect": "La qualità dei rapporti di scouting resta al limite base della struttura."},
            "level1": {"unlock": "Sblocca un secondo slot Scout / Analista.", "effect": "Capacità scout 2; limite qualità rapporto Base; gli attributi sono mostrati in intervalli di circa 10 punti"},
            "level2": {"unlock": "Sblocca un terzo slot Scout / Analista e qualità rapporto Solida.", "effect": "Capacità scout 3; limite qualità rapporto Solida; gli attributi sono mostrati in intervalli di circa 5 punti"},
            "level3": {"unlock": "Sblocca un quarto slot Scout / Analista e qualità rapporto Forte.", "effect": "Capacità scout 4; limite qualità rapporto Forte; gli attributi sono mostrati in intervalli di circa 3 punti"},
            "level4": {"unlock": "Sblocca un quinto slot Scout / Analista e qualità rapporto Élite.", "effect": "Capacità scout 5; limite qualità rapporto Élite; gli scout di qualità élite possono rivelare valori esatti"},
        },
    },
    "fr": {
        "club_house": {
            "level0": {"unlock": "Administration de base du club uniquement.", "effect": "Aucun bonus financier du Club House n'est actif."},
            "level1": {"unlock": "Aucun nouveau rôle de personnel.", "effect": "Masse salariale du personnel -2 %. Les coûts d'exploitation récurrents éligibles bénéficient d'une remise d'optimisation des coûts de 1 %."},
            "level2": {"unlock": "Débloque un poste de Directeur Sportif.", "effect": "Masse salariale du personnel -4 %. Salaires des coureurs -1 %. Les coûts d'exploitation récurrents éligibles bénéficient d'une remise d'optimisation des coûts de 2 %. Remise fiscale mensuelle 2 %."},
            "level3": {"unlock": "Aucun nouveau déblocage.", "effect": "Masse salariale du personnel -6 %. Salaires des coureurs -2 %. Les coûts d'exploitation récurrents éligibles bénéficient d'une remise d'optimisation des coûts de 3 %. Remise fiscale mensuelle 4 %."},
            "level4": {"unlock": "Aucun nouveau déblocage.", "effect": "Masse salariale du personnel -8 %. Salaires des coureurs -3 %. Les coûts d'exploitation récurrents éligibles bénéficient d'une remise d'optimisation des coûts de 5 %. Remise fiscale mensuelle 6 %."},
            "level5": {"unlock": "Aucun nouveau déblocage.", "effect": "Masse salariale du personnel -10 %. Salaires des coureurs -4 %. Les coûts d'exploitation récurrents éligibles bénéficient d'une remise d'optimisation des coûts de 7 %. Remise fiscale mensuelle 10 %."},
        },
        "training_center": {
            "level0": {"unlock": "Installations d'entraînement de base uniquement.", "effect": "Aucun bonus du Centre d'entraînement pour le développement, l'efficacité de l'encadrement, la charge de fatigue ou le risque d'entraînement n'est actif."},
            "level1": {"unlock": "Aucun nouveau déblocage.", "effect": "Développement par entraînement régulier +3 % ; risque de surcharge et d'accident à l'entraînement -5 % ; s'applique à l'Équipe première et aux coureurs U23."},
            "level2": {"unlock": "Aucun nouveau déblocage.", "effect": "Développement par entraînement régulier +6 % ; bonus d'entraînement de l'Entraîneur principal et des Entraîneurs +5 % d'efficacité ; risque de surcharge et d'accident à l'entraînement -10 % ; s'applique à l'Équipe première et aux coureurs U23."},
            "level3": {"unlock": "Débloque un deuxième poste d'Entraîneur.", "effect": "Développement par entraînement régulier +9 % ; bonus d'entraînement de l'Entraîneur principal et des Entraîneurs +10 % d'efficacité ; charge de fatigue de l'entraînement régulier -1 point ; risque de surcharge et d'accident à l'entraînement -15 % ; s'applique à l'Équipe première et aux coureurs U23."},
            "level4": {"unlock": "Aucun nouveau déblocage.", "effect": "Développement par entraînement régulier +12 % ; bonus d'entraînement de l'Entraîneur principal et des Entraîneurs +15 % d'efficacité ; charge de fatigue de l'entraînement régulier -1 point ; risque de surcharge et d'accident à l'entraînement -20 % ; s'applique à l'Équipe première et aux coureurs U23."},
            "level5": {"unlock": "Débloque un troisième poste d'Entraîneur.", "effect": "Développement par entraînement régulier +15 % ; bonus d'entraînement de l'Entraîneur principal et des Entraîneurs +20 % d'efficacité ; charge de fatigue de l'entraînement régulier -2 points ; risque de surcharge et d'accident à l'entraînement -25 % ; s'applique à l'Équipe première et aux coureurs U23."},
        },
        "medical_center": {
            "level0": {"unlock": "Installation médicale de base ; un poste de Médecin d'équipe et un de Kinésithérapeute sont disponibles une fois les opérations du personnel débloquées.", "effect": "Aucun bonus du Centre médical pour la prévention, la durée de récupération ou le seuil minimal de fatigue en rééducation n'est actif."},
            "level1": {"unlock": "Débloque un deuxième poste de Kinésithérapeute.", "effect": "Risque évitable de blessure et de maladie -3 % ; durée de récupération des cas médicaux -4 % ; seuil minimal de fatigue en rééducation -1 point ; s'applique à l'Équipe première et aux coureurs U23."},
            "level2": {"unlock": "Débloque un poste de Nutritionniste.", "effect": "Risque évitable de blessure et de maladie -6 % ; durée de récupération des cas médicaux -8 % ; seuil minimal de fatigue en rééducation -2 points ; s'applique à l'Équipe première et aux coureurs U23."},
            "level3": {"unlock": "Débloque un deuxième poste de Médecin d'équipe et un troisième poste de Kinésithérapeute.", "effect": "Risque évitable de blessure et de maladie -9 % ; durée de récupération des cas médicaux -12 % ; seuil minimal de fatigue en rééducation -3 points ; s'applique à l'Équipe première et aux coureurs U23."},
            "level4": {"unlock": "Débloque un quatrième poste de Kinésithérapeute.", "effect": "Risque évitable de blessure et de maladie -12 % ; durée de récupération des cas médicaux -16 % ; seuil minimal de fatigue en rééducation -4 points ; s'applique à l'Équipe première et aux coureurs U23."},
            "level5": {"unlock": "Débloque un cinquième poste de Kinésithérapeute.", "effect": "Risque évitable de blessure et de maladie -15 % ; durée de récupération des cas médicaux -20 % ; seuil minimal de fatigue en rééducation -5 points ; s'applique à l'Équipe première et aux coureurs U23."},
        },
        "youth_academy": {
            "level0": {"unlock": "Aucune infrastructure dédiée à l'académie U23 ni poste d'Entraîneur principal U23.", "effect": "Aucun bonus spécifique à l'académie pour l'entraînement ou le développement U23 n'est actif."},
            "level1": {"unlock": "Débloque un poste d'Entraîneur principal U23.", "effect": "Développement par entraînement régulier U23 +6 % ; progression du développement en course U23 +5 % ; s'applique uniquement aux coureurs de l'Équipe de développement."},
            "level2": {"unlock": "Programme de développement élite de l'académie ; aucun poste de personnel supplémentaire.", "effect": "Développement par entraînement régulier U23 +12 % ; progression du développement en course U23 +10 % ; effet de développement de l'Entraîneur principal U23 +10 % d'efficacité ; déclin de l'entraînement U23 hors priorité -20 % ; s'applique uniquement aux coureurs de l'Équipe de développement."},
        },
        "mechanics_workshop": {
            "level0": {"unlock": "Support technique de base uniquement ; la capacité supplémentaire de mécaniciens reste verrouillée.", "effect": "Aucun bonus d'atelier sur la vitesse de réparation ou les coûts d'entretien n'est actif."},
            "level1": {"unlock": "Débloque un deuxième poste de Mécanicien.", "effect": "Capacité de mécaniciens 2 ; vitesse de réparation de l'équipement +5 % ; perte d'état de l'équipement -3 % ; risque mécanique -2 %"},
            "level2": {"unlock": "Débloque un troisième poste de Mécanicien.", "effect": "Capacité de mécaniciens 3 ; vitesse de réparation de l'équipement +12 % ; coût de réparation de l'équipement -8 % ; perte d'état de l'équipement -6 % ; risque mécanique -4 %"},
            "level3": {"unlock": "Débloque un quatrième poste de Mécanicien.", "effect": "Capacité de mécaniciens 4 ; vitesse de réparation de l'équipement +22 % ; coût de réparation de l'équipement -16 % ; perte d'état de l'équipement -10 % ; risque mécanique -7 %"},
            "level4": {"unlock": "Débloque un cinquième poste de Mécanicien.", "effect": "Capacité de mécaniciens 5 ; vitesse de réparation de l'équipement +35 % ; coût de réparation de l'équipement -25 % ; perte d'état de l'équipement -15 % ; risque mécanique -10 %"},
        },
        "scouting_office": {
            "level0": {"unlock": "Scouting de base uniquement ; la capacité de scouts supplémentaire et les niveaux de rapport supérieurs restent verrouillés.", "effect": "La qualité des rapports de scouting reste limitée au plafond de base de l'installation."},
            "level1": {"unlock": "Débloque un deuxième poste de Scout / Analyste.", "effect": "Capacité de scouts 2 ; plafond de qualité de rapport Basique ; les attributs sont affichés par plages d'environ 10 points"},
            "level2": {"unlock": "Débloque un troisième poste de Scout / Analyste et une qualité de rapport Solide.", "effect": "Capacité de scouts 3 ; plafond de qualité de rapport Solide ; les attributs sont affichés par plages d'environ 5 points"},
            "level3": {"unlock": "Débloque un quatrième poste de Scout / Analyste et une qualité de rapport Forte.", "effect": "Capacité de scouts 4 ; plafond de qualité de rapport Fort ; les attributs sont affichés par plages d'environ 3 points"},
            "level4": {"unlock": "Débloque un cinquième poste de Scout / Analyste et une qualité de rapport Élite.", "effect": "Capacité de scouts 5 ; plafond de qualité de rapport Élite ; les scouts de qualité élite peuvent révéler les valeurs exactes"},
        },
    },
    "ru": {
        "club_house": {
            "level0": {"unlock": "Только базовое администрирование клуба.", "effect": "Финансовый бонус клубного дома не активен."},
            "level1": {"unlock": "Новая роль персонала не открывается.", "effect": "Расходы на зарплаты персонала -2%. Подходящие регулярные операционные расходы получают скидку 1% за оптимизацию затрат."},
            "level2": {"unlock": "Открывает место Спортивного директора.", "effect": "Расходы на зарплаты персонала -4%. Зарплаты гонщиков -1%. Подходящие регулярные операционные расходы получают скидку 2% за оптимизацию затрат. Ежемесячная налоговая скидка 2%."},
            "level3": {"unlock": "Новых открытий нет.", "effect": "Расходы на зарплаты персонала -6%. Зарплаты гонщиков -2%. Подходящие регулярные операционные расходы получают скидку 3% за оптимизацию затрат. Ежемесячная налоговая скидка 4%."},
            "level4": {"unlock": "Новых открытий нет.", "effect": "Расходы на зарплаты персонала -8%. Зарплаты гонщиков -3%. Подходящие регулярные операционные расходы получают скидку 5% за оптимизацию затрат. Ежемесячная налоговая скидка 6%."},
            "level5": {"unlock": "Новых открытий нет.", "effect": "Расходы на зарплаты персонала -10%. Зарплаты гонщиков -4%. Подходящие регулярные операционные расходы получают скидку 7% за оптимизацию затрат. Ежемесячная налоговая скидка 10%."},
        },
        "training_center": {
            "level0": {"unlock": "Только базовые тренировочные объекты.", "effect": "Бонус Тренировочного центра к развитию, эффективности тренеров, нагрузке усталости или риску тренировок не активен."},
            "level1": {"unlock": "Новых открытий нет.", "effect": "Развитие от обычных тренировок +3%; риск перегрузки и несчастных случаев на тренировках -5%; действует для Первой команды и гонщиков U23."},
            "level2": {"unlock": "Новых открытий нет.", "effect": "Развитие от обычных тренировок +6%; бонус тренировок Главного тренера и Тренера +5% эффективности; риск перегрузки и несчастных случаев на тренировках -10%; действует для Первой команды и гонщиков U23."},
            "level3": {"unlock": "Открывает второе место Тренера.", "effect": "Развитие от обычных тренировок +9%; бонус тренировок Главного тренера и Тренера +10% эффективности; нагрузка усталости от обычной тренировки -1 очко; риск перегрузки и несчастных случаев на тренировках -15%; действует для Первой команды и гонщиков U23."},
            "level4": {"unlock": "Новых открытий нет.", "effect": "Развитие от обычных тренировок +12%; бонус тренировок Главного тренера и Тренера +15% эффективности; нагрузка усталости от обычной тренировки -1 очко; риск перегрузки и несчастных случаев на тренировках -20%; действует для Первой команды и гонщиков U23."},
            "level5": {"unlock": "Открывает третье место Тренера.", "effect": "Развитие от обычных тренировок +15%; бонус тренировок Главного тренера и Тренера +20% эффективности; нагрузка усталости от обычной тренировки -2 очка; риск перегрузки и несчастных случаев на тренировках -25%; действует для Первой команды и гонщиков U23."},
        },
        "medical_center": {
            "level0": {"unlock": "Базовый медицинский объект; одно место Врача команды и одно место Физиотерапевта доступны после открытия работы с персоналом.", "effect": "Бонус Медицинского центра к профилактике, длительности восстановления или минимальному уровню усталости при реабилитации не активен."},
            "level1": {"unlock": "Открывает второе место Физиотерапевта.", "effect": "Предотвратимый риск травм и заболеваний -3%; длительность восстановления медицинских случаев -4%; минимальный уровень усталости при реабилитации -1 очко; действует для Первой команды и гонщиков U23."},
            "level2": {"unlock": "Открывает место Диетолога.", "effect": "Предотвратимый риск травм и заболеваний -6%; длительность восстановления медицинских случаев -8%; минимальный уровень усталости при реабилитации -2 очка; действует для Первой команды и гонщиков U23."},
            "level3": {"unlock": "Открывает второе место Врача команды и третье место Физиотерапевта.", "effect": "Предотвратимый риск травм и заболеваний -9%; длительность восстановления медицинских случаев -12%; минимальный уровень усталости при реабилитации -3 очка; действует для Первой команды и гонщиков U23."},
            "level4": {"unlock": "Открывает четвертое место Физиотерапевта.", "effect": "Предотвратимый риск травм и заболеваний -12%; длительность восстановления медицинских случаев -16%; минимальный уровень усталости при реабилитации -4 очка; действует для Первой команды и гонщиков U23."},
            "level5": {"unlock": "Открывает пятое место Физиотерапевта.", "effect": "Предотвратимый риск травм и заболеваний -15%; длительность восстановления медицинских случаев -20%; минимальный уровень усталости при реабилитации -5 очков; действует для Первой команды и гонщиков U23."},
        },
        "youth_academy": {
            "level0": {"unlock": "Нет отдельной инфраструктуры академии U23 и места Главного тренера U23.", "effect": "Специальный бонус академии к тренировкам или развитию U23 не активен."},
            "level1": {"unlock": "Открывает место Главного тренера U23.", "effect": "Развитие от обычных тренировок U23 +6%; прогресс развития в гонках U23 +5%; действует только для гонщиков Развивающей команды."},
            "level2": {"unlock": "Элитная программа развития академии; дополнительное место персонала не открывается.", "effect": "Развитие от обычных тренировок U23 +12%; прогресс развития в гонках U23 +10%; эффект развития Главного тренера U23 +10% эффективности; спад тренировки U23 вне фокуса -20%; действует только для гонщиков Развивающей команды."},
        },
        "mechanics_workshop": {
            "level0": {"unlock": "Только базовая техническая поддержка; дополнительная вместимость механиков остается закрытой.", "effect": "Бонус мастерской к скорости ремонта или стоимости обслуживания не активен."},
            "level1": {"unlock": "Открывает второе место Механика.", "effect": "Вместимость механиков 2; скорость ремонта оборудования +5%; потеря состояния оборудования -3%; механический риск -2%"},
            "level2": {"unlock": "Открывает третье место Механика.", "effect": "Вместимость механиков 3; скорость ремонта оборудования +12%; стоимость ремонта оборудования -8%; потеря состояния оборудования -6%; механический риск -4%"},
            "level3": {"unlock": "Открывает четвертое место Механика.", "effect": "Вместимость механиков 4; скорость ремонта оборудования +22%; стоимость ремонта оборудования -16%; потеря состояния оборудования -10%; механический риск -7%"},
            "level4": {"unlock": "Открывает пятое место Механика.", "effect": "Вместимость механиков 5; скорость ремонта оборудования +35%; стоимость ремонта оборудования -25%; потеря состояния оборудования -15%; механический риск -10%"},
        },
        "scouting_office": {
            "level0": {"unlock": "Только базовый скаутинг; дополнительная вместимость скаутов и более высокие уровни отчетов остаются закрытыми.", "effect": "Качество скаутинговых отчетов остается на базовом пределе объекта."},
            "level1": {"unlock": "Открывает второе место Скаута / Аналитика.", "effect": "Вместимость скаутов 2; базовый предел качества отчета; характеристики показываются диапазонами примерно по 10 очков"},
            "level2": {"unlock": "Открывает третье место Скаута / Аналитика и уровень качества отчета «Надежный».", "effect": "Вместимость скаутов 3; предел качества отчета «Надежный»; характеристики показываются диапазонами примерно по 5 очков"},
            "level3": {"unlock": "Открывает четвертое место Скаута / Аналитика и уровень качества отчета «Сильный».", "effect": "Вместимость скаутов 4; предел качества отчета «Сильный»; характеристики показываются диапазонами примерно по 3 очка"},
            "level4": {"unlock": "Открывает пятое место Скаута / Аналитика и элитное качество отчета.", "effect": "Вместимость скаутов 5; элитный предел качества отчета; скауты элитного качества могут показывать точные значения"},
        },
    },
}

# Ensure all locales use the same complete English key shape before patching files.
for locale in LOCALES:
    if locale not in DETAILS:
        raise SystemExit(f"Missing facility-level translations for {locale}")

for locale in LOCALES:
    path = LOCALE_ROOT / locale / "infrastructure.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("common", {})["tbd"] = TBD[locale]
    data["facilityGuide"] = GUIDE[locale]
    data["facilityLevelDetails"] = DETAILS[locale]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

src = FACILITIES_TSX.read_text(encoding="utf-8")

if "import type { TFunction } from 'i18next'" not in src:
    src = src.replace(
        "import { useTranslation } from 'react-i18next'\n",
        "import { useTranslation } from 'react-i18next'\nimport type { TFunction } from 'i18next'\n",
        1,
    )

src = src.replace(
    "  formatCash,\n  formatGameDays,",
    "  formatCash,\n  formatGameDate,\n  formatGameDays,",
    1,
)

src, count = re.subn(
    r"function formatSeasonDate\(raw: string \| null \| undefined\): string \{.*?\n\}\n\n(?=const fallbackMonthlyMaintenance)",
    "function formatSeasonDate(raw: string | null | undefined): string {\n  return formatGameDate(raw)\n}\n\n",
    src,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("Could not replace formatSeasonDate")

src, count = re.subn(
    r"const levelZeroDetails: Record<FacilityKey, \{ unlock: string; effect: string \}> = \{.*?\n\}\n\n(?=function configForLevel)",
    "",
    src,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("Could not remove levelZeroDetails")

level_detail = '''type InfrastructureT = TFunction<'infrastructure'>

function levelDetail(
  item: InfrastructureItem,
  level: number,
  configs: FacilityLevelConfig[],
  t: InfrastructureT,
): { unlock: string; effect: string; maintenance: number } {
  const key = item.id as FacilityKey
  const config = configForLevel(configs, item, level)
  const baseKey = `facilityLevelDetails.${key}.level${level}`
  const fallbackUnlock = config?.unlock_summary || t('facilityGuide.noAdditionalUnlock')
  const fallbackEffect = config?.effect_summary || t('facilityGuide.noAdditionalEffect')

  return {
    unlock: t(`${baseKey}.unlock`, { defaultValue: fallbackUnlock }),
    effect: t(`${baseKey}.effect`, { defaultValue: fallbackEffect }),
    maintenance: level === 0 ? 0 : maintenanceFor(item, level, configs),
  }
}

'''
src, count = re.subn(
    r"function levelDetail\(.*?\n\}\n\n(?=function EffectList)",
    level_detail,
    src,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("Could not replace levelDetail")

facility_visual = '''function FacilityVisual({
  item,
  className,
  eager = false,
}: {
  item: InfrastructureItem
  className: string
  eager?: boolean
}): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const level = facilityLevel(item)
  const maxLevel = facilityMaxLevel(item)
  const key = item.id as FacilityKey
  const fallback = getFacilityFallbackImage(key, level, maxLevel)

  return (
    <img
      src={getFacilityLevelImage(key, level, maxLevel)}
      alt={t('facilityGuide.imageAlt', { name: item.name, level, max: maxLevel })}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
      onError={event => {
        const image = event.currentTarget
        if (image.dataset.levelFallback === 'true') return
        image.dataset.levelFallback = 'true'
        image.src = fallback
      }}
    />
  )
}

'''
src, count = re.subn(
    r"function FacilityVisual\(\{.*?\n\}\n\n(?=function LevelBadge)",
    facility_visual,
    src,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("Could not replace FacilityVisual")

level_badge = '''function LevelBadge({ item, dark = false }: { item: InfrastructureItem; dark?: boolean }): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const level = facilityLevel(item)
  const max = facilityMaxLevel(item)

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${dark ? 'bg-black/65 text-white backdrop-blur-sm' : 'bg-gray-100 text-gray-700'}`}>
      {t('facilityGuide.levelBadge', { level, max })}
    </span>
  )
}

'''
src, count = re.subn(
    r"function LevelBadge\(\{.*?\n\}\n\n(?=function ActiveJobsPanel)",
    level_badge,
    src,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("Could not replace LevelBadge")

level_info = '''function LevelInfoPanel({
  item,
  level,
  configs,
  tone,
  active,
  showUpgradeMeta = false,
}: {
  item: InfrastructureItem
  level: number
  configs: FacilityLevelConfig[]
  tone: 'current' | 'next'
  active?: boolean
  showUpgradeMeta?: boolean
}): JSX.Element {
  const { t } = useTranslation('infrastructure')
  const detail = levelDetail(item, level, configs, t)
  const isCurrent = tone === 'current'

  return (
    <div className={`flex h-[272px] flex-col overflow-y-auto rounded-lg border p-3 ${isCurrent ? 'border-blue-100 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`text-sm font-semibold ${isCurrent ? 'text-blue-950' : 'text-gray-900'}`}>
          {t(isCurrent ? 'facilityGuide.currentPanelTitle' : 'facilityGuide.nextPanelTitle', { level })}
        </div>
        {active && <span className="text-xs font-medium text-blue-700">{t('facilityGuide.activeNow')}</span>}
      </div>

      <div className="mt-3 space-y-2 text-sm leading-5 text-gray-700">
        <div><span className="font-semibold text-gray-900">{t('facilityGuide.unlocks')}</span> {detail.unlock}</div>
        <div>
          <span className="font-semibold text-gray-900">{t('facilityGuide.effects')}</span>{' '}
          <EffectList text={detail.effect} />
        </div>
        <div>
          <span className="font-semibold text-gray-900">{t('facilityGuide.monthlyMaintenance')}</span>{' '}
          {formatUsd(detail.maintenance)} {t('facilityGuide.perGameMonth')}
        </div>
      </div>

      {showUpgradeMeta && (
        <div className="mt-auto grid grid-cols-1 gap-2 border-t border-gray-200 pt-3 text-xs text-gray-600 sm:grid-cols-3">
          <div>
            <span className="block text-gray-400">{t('facilityGuide.upgradeCost')}</span>
            <span className="font-medium text-gray-900">{formatUsd(item.previewCostCash)}</span>
          </div>
          <div>
            <span className="block text-gray-400">{t('facilityGuide.constructionTime')}</span>
            <span className="font-medium text-gray-900">{formatGameDays(item.previewDurationGameDays)}</span>
          </div>
          <div>
            <span className="block whitespace-nowrap text-gray-400">{t('facilityGuide.estimatedCompletion')}</span>
            <span className="whitespace-nowrap font-medium text-gray-900">{formatSeasonDate(item.previewCompleteGameDate)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

'''
src, count = re.subn(
    r"function LevelInfoPanel\(\{.*?\n\}\n\n(?=function FacilityDetailsModal)",
    level_info,
    src,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("Could not replace LevelInfoPanel")

replacements = {
    '<div className="text-xs uppercase tracking-wide text-gray-400">Facility level guide</div>': '<div className="text-xs uppercase tracking-wide text-gray-400">{t(\'facilityGuide.title\')}</div>',
    '<div className="text-sm text-gray-500">Current status</div>': '<div className="text-sm text-gray-500">{t(\'facilities.currentStatus\')}</div>',
    'Status: <span className="font-medium text-gray-700">{item.badgeLabel}</span>': '{t(\'facilities.status\')} <span className="font-medium text-gray-700">{item.badgeLabel}</span>',
    '<div className="text-sm font-semibold text-gray-900">What every level provides</div>': '<div className="text-sm font-semibold text-gray-900">{t(\'facilityGuide.whatEveryLevelProvides\')}</div>',
    'const detail = levelDetail(item, level, configs)': 'const detail = levelDetail(item, level, configs, t)',
    '<div className="font-semibold text-gray-900">Level {level}</div>': '<div className="font-semibold text-gray-900">{t(\'facilityGuide.levelLabel\', { level })}</div>',
    "{level === currentLevel ? 'Current level' : level < currentLevel ? 'Unlocked' : 'Future level'}": "{level === currentLevel ? t('facilityGuide.currentLevel') : level < currentLevel ? t('facilityGuide.unlocked') : t('facilityGuide.futureLevel')}",
    '<div><span className="font-semibold">Unlocks:</span> {detail.unlock}</div>': '<div><span className="font-semibold">{t(\'facilityGuide.unlocks\')}</span> {detail.unlock}</div>',
    '<span className="font-semibold">Effects:</span>{\' \'}': '<span className="font-semibold">{t(\'facilityGuide.effects\')}</span>{\' \'}',
    '<span className="font-semibold">Monthly maintenance:</span>{\' \'}': '<span className="font-semibold">{t(\'facilityGuide.monthlyMaintenance\')}</span>{\' \'}',
    '{formatUsd(detail.maintenance)} / game month': '{formatUsd(detail.maintenance)} {t(\'facilityGuide.perGameMonth\')}',
    'Upgrade to this level: {formatUsd(cfg.cost_cash)} · {formatGameDays(cfg.duration_game_days)}': "{t('facilityGuide.upgradeToThisLevel', { cost: formatUsd(cfg.cost_cash), duration: formatGameDays(cfg.duration_game_days) })}",
    "{item.pendingJob ? item.pendingSummary : 'Maximum facility level reached.'}": "{item.pendingJob ? item.pendingSummary : t('facilityGuide.maximumReached')}",
}

for old, new in replacements.items():
    if old not in src:
        raise SystemExit(f"Expected FacilitiesSection source fragment not found: {old}")
    src = src.replace(old, new, 1)

FACILITIES_TSX.write_text(src, encoding="utf-8")

helpers = HELPERS_TS.read_text(encoding="utf-8")

locale_block = '''const infrastructureLocales: Record<string, string> = {
  en: 'en-GB',
  'sr-Latn': 'sr-Latn-RS',
  de: 'de-DE',
  hr: 'hr-HR',
  es: 'es-ES',
  it: 'it-IT',
  fr: 'fr-FR',
  ru: 'ru-RU',
}

function getInfrastructureLocale(): string {
  const language = i18n.resolvedLanguage || i18n.language || 'en'
  const normalized = language.startsWith('sr') ? 'sr-Latn' : language.split('-')[0]
  return infrastructureLocales[normalized] || 'en-GB'
}

function localizedInfrastructureMonth(month: number): string {
  const safeMonth = Math.min(12, Math.max(1, Number(month) || 1))
  const locale = getInfrastructureLocale()
  const label = new Intl.DateTimeFormat(locale, {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, safeMonth - 1, 1)))

  return label
    ? `${label.charAt(0).toLocaleUpperCase(locale)}${label.slice(1)}`
    : label
}
'''

helpers, count = re.subn(
    r"const infrastructureMonthLabels = \[.*?\n\]\n",
    locale_block,
    helpers,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("Could not replace infrastructure month labels")

helpers = helpers.replace(
    "    return 'TBD'",
    "    return String(i18n.t('common.tbd', { ns: 'infrastructure' }))",
    1,
)
helpers = helpers.replace(
    "  const monthLabel = infrastructureMonthLabels[month - 1]",
    "  const monthLabel = localizedInfrastructureMonth(month)",
    1,
)

HELPERS_TS.write_text(helpers, encoding="utf-8")

print("Applied infrastructure facility-card and level-guide localization fixes")
