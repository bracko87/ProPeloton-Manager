#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "src/pages/dashboard/RacePreparation.tsx"
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]

TERM_UPDATES = {
    "en": {
        "tabs.racePlan": "Race Plan",
        "tabs.stagePlans": "Stage Plans",
        "status.stagePlansOpen": "Stage Plans Open",
        "status.racePlanSubmitted": "Race Plan Submitted",
        "accepted.openRacePlan": "Open Race Plan",
        "accepted.openStagePlans": "Open Stage Plans",
        "accepted.stagePlansAfterSubmit": "Stage Plans open after the Race Plan is submitted",
        "header.racePlanOpens": "Race Plan opens",
        "stagePlans.title": "Stage Plans",
    },
    "sr-Latn": {
        "tabs.racePlan": "Plan trke",
        "tabs.stagePlans": "Planovi etapa",
        "status.stagePlansOpen": "Planovi etapa otvoreni",
        "status.racePlanSubmitted": "Plan trke je poslat",
        "accepted.openRacePlan": "Otvori Plan trke",
        "accepted.openStagePlans": "Otvori Planove etapa",
        "accepted.stagePlansAfterSubmit": "Planovi etapa se otvaraju nakon slanja Plana trke",
        "header.racePlanOpens": "Plan trke se otvara",
        "stagePlans.title": "Planovi etapa",
    },
    "de": {
        "tabs.racePlan": "Rennplan",
        "tabs.stagePlans": "Etappenpläne",
        "status.stagePlansOpen": "Etappenpläne geöffnet",
        "status.racePlanSubmitted": "Rennplan eingereicht",
        "accepted.openRacePlan": "Rennplan öffnen",
        "accepted.openStagePlans": "Etappenpläne öffnen",
        "accepted.stagePlansAfterSubmit": "Etappenpläne öffnen sich nach dem Einreichen des Rennplans",
        "header.racePlanOpens": "Rennplan öffnet",
        "stagePlans.title": "Etappenpläne",
    },
    "hr": {
        "tabs.racePlan": "Plan utrke",
        "tabs.stagePlans": "Planovi etapa",
        "status.stagePlansOpen": "Planovi etapa otvoreni",
        "status.racePlanSubmitted": "Plan utrke je poslan",
        "accepted.openRacePlan": "Otvori Plan utrke",
        "accepted.openStagePlans": "Otvori Planove etapa",
        "accepted.stagePlansAfterSubmit": "Planovi etapa otvaraju se nakon slanja Plana utrke",
        "header.racePlanOpens": "Plan utrke otvara se",
        "stagePlans.title": "Planovi etapa",
    },
    "es": {
        "tabs.racePlan": "Plan de carrera",
        "tabs.stagePlans": "Planes de etapa",
        "status.stagePlansOpen": "Planes de etapa abiertos",
        "status.racePlanSubmitted": "Plan de carrera enviado",
        "accepted.openRacePlan": "Abrir Plan de carrera",
        "accepted.openStagePlans": "Abrir Planes de etapa",
        "accepted.stagePlansAfterSubmit": "Los Planes de etapa se abren después de enviar el Plan de carrera",
        "header.racePlanOpens": "El Plan de carrera se abre",
        "stagePlans.title": "Planes de etapa",
    },
    "it": {
        "tabs.racePlan": "Piano gara",
        "tabs.stagePlans": "Piani di tappa",
        "status.stagePlansOpen": "Piani di tappa aperti",
        "status.racePlanSubmitted": "Piano gara inviato",
        "accepted.openRacePlan": "Apri Piano gara",
        "accepted.openStagePlans": "Apri Piani di tappa",
        "accepted.stagePlansAfterSubmit": "I Piani di tappa si aprono dopo l'invio del Piano gara",
        "header.racePlanOpens": "Il Piano gara si apre",
        "stagePlans.title": "Piani di tappa",
    },
    "fr": {
        "tabs.racePlan": "Plan de course",
        "tabs.stagePlans": "Plans d’étape",
        "status.stagePlansOpen": "Plans d’étape ouverts",
        "status.racePlanSubmitted": "Plan de course envoyé",
        "accepted.openRacePlan": "Ouvrir le Plan de course",
        "accepted.openStagePlans": "Ouvrir les Plans d’étape",
        "accepted.stagePlansAfterSubmit": "Les Plans d’étape s’ouvrent après l’envoi du Plan de course",
        "header.racePlanOpens": "Le Plan de course s’ouvre",
        "stagePlans.title": "Plans d’étape",
    },
    "ru": {
        "tabs.racePlan": "План гонки",
        "tabs.stagePlans": "Планы этапов",
        "status.stagePlansOpen": "Планы этапов открыты",
        "status.racePlanSubmitted": "План гонки отправлен",
        "accepted.openRacePlan": "Открыть План гонки",
        "accepted.openStagePlans": "Открыть Планы этапов",
        "accepted.stagePlansAfterSubmit": "Планы этапов открываются после отправки Плана гонки",
        "header.racePlanOpens": "План гонки открывается",
        "stagePlans.title": "Планы этапов",
    },
}

NEW_SCREEN = {
    "en": {
        "allStagePlansSaved": "All Stage Plans Saved",
        "allStagePlansReady": "All stage plans are saved and ready.",
        "equipmentDefaultFallbackHelp": "The dropdown also includes the Default Race Setup from the Equipment Overview page. If a selected equipment setup is no longer available before a stage because one of its equipment items is broken, worn out, assigned, or otherwise unavailable, the Race Engine automatically falls back to Default. If Default also cannot be used, the stage setup is blocked with a clear equipment warning.",
        "stageSupplyEffects": "Stage Supply Effects",
        "stageSupplyEffectsDesc": "Live preview from this stage plan and currently available stock. These effects are separate from the Race Plan bonus rows above.",
        "enginePreview": "Engine preview",
        "energySaving": "Energy saving",
        "fatigueReduction": "Fatigue reduction",
        "postStageRecovery": "Post-stage recovery",
        "powerGelsLabel": "Power gels",
        "powerGelsSummary": "{{count}} effective per rider for the separate live-energy effect · up to +{{energy}} live energy.",
        "weatherRiskLine": "Weather: {{reason}}. Missing jackets do not block the start, but increase illness exposure.",
        "weatherRiskNoneReason": "no strong weather risk detected",
        "weatherRiskRain": "rain risk",
        "weatherRiskCold": "cold below 15°C",
        "weatherRiskWind": "strong wind",
        "weatherRiskCondition": "bad-weather condition",
        "leaderShort": "Leader",
    },
    "sr-Latn": {
        "allStagePlansSaved": "Svi planovi etapa su sačuvani",
        "allStagePlansReady": "Svi planovi etapa su sačuvani i spremni.",
        "equipmentDefaultFallbackHelp": "Padajući meni uključuje i podrazumevanu postavku trke sa stranice Pregled opreme. Ako izabrana postavka opreme više nije dostupna pre etape zato što je neki deo opreme pokvaren, istrošen, dodeljen ili na drugi način nedostupan, Race Engine automatski prelazi na podrazumevanu postavku. Ako ni ona nije dostupna, podešavanje etape biće blokirano uz jasno upozorenje o opremi.",
        "stageSupplyEffects": "Efekti zaliha za etapu",
        "stageSupplyEffectsDesc": "Pregled uživo na osnovu ovog plana etape i trenutno dostupnih zaliha. Ovi efekti su odvojeni od bonusa Plana trke prikazanih iznad.",
        "enginePreview": "Pregled Race Engine-a",
        "energySaving": "Ušteda energije",
        "fatigueReduction": "Smanjenje umora",
        "postStageRecovery": "Oporavak nakon etape",
        "powerGelsLabel": "Energetski gelovi",
        "powerGelsSummary": "{{count}} efektivna po vozaču za poseban efekat energije uživo · do +{{energy}} energije uživo.",
        "weatherRiskLine": "Vreme: {{reason}}. Nedostatak jakni ne blokira start, ali povećava izloženost riziku od bolesti.",
        "weatherRiskNoneReason": "nema izraženog vremenskog rizika",
        "weatherRiskRain": "rizik od kiše",
        "weatherRiskCold": "hladnoća ispod 15°C",
        "weatherRiskWind": "jak vetar",
        "weatherRiskCondition": "nepovoljni vremenski uslovi",
        "leaderShort": "Vođa",
    },
    "de": {
        "allStagePlansSaved": "Alle Etappenpläne gespeichert",
        "allStagePlansReady": "Alle Etappenpläne sind gespeichert und bereit.",
        "equipmentDefaultFallbackHelp": "Das Auswahlmenü enthält auch das Standard-Rennsetup aus der Ausrüstungsübersicht. Ist ein gewähltes Ausrüstungssetup vor einer Etappe nicht mehr verfügbar, weil ein Teil defekt, verschlissen, zugewiesen oder anderweitig nicht verfügbar ist, wechselt die Race Engine automatisch auf Standard. Ist auch Standard nicht verfügbar, wird das Etappensetup mit einer eindeutigen Ausrüstungswarnung blockiert.",
        "stageSupplyEffects": "Effekte der Etappenversorgung",
        "stageSupplyEffectsDesc": "Live-Vorschau aus diesem Etappenplan und dem aktuell verfügbaren Bestand. Diese Effekte sind von den Rennplan-Bonuszeilen oben getrennt.",
        "enginePreview": "Engine-Vorschau",
        "energySaving": "Energieeinsparung",
        "fatigueReduction": "Ermüdungsreduktion",
        "postStageRecovery": "Erholung nach der Etappe",
        "powerGelsLabel": "Power-Gels",
        "powerGelsSummary": "{{count}} wirksame pro Fahrer für den separaten Live-Energieeffekt · bis zu +{{energy}} Live-Energie.",
        "weatherRiskLine": "Wetter: {{reason}}. Fehlende Jacken blockieren den Start nicht, erhöhen aber das Krankheitsrisiko.",
        "weatherRiskNoneReason": "kein starkes Wetterrisiko erkannt",
        "weatherRiskRain": "Regenrisiko",
        "weatherRiskCold": "Kälte unter 15°C",
        "weatherRiskWind": "starker Wind",
        "weatherRiskCondition": "schlechte Wetterbedingungen",
        "leaderShort": "Kapitän",
    },
    "hr": {
        "allStagePlansSaved": "Svi planovi etapa su spremljeni",
        "allStagePlansReady": "Svi planovi etapa su spremljeni i spremni.",
        "equipmentDefaultFallbackHelp": "Padajući izbornik uključuje i zadanu postavku utrke sa stranice Pregled opreme. Ako odabrana postavka opreme više nije dostupna prije etape zato što je neki dio opreme pokvaren, istrošen, dodijeljen ili na drugi način nedostupan, Race Engine automatski prelazi na zadanu postavku. Ako ni ona nije dostupna, postavka etape bit će blokirana uz jasno upozorenje o opremi.",
        "stageSupplyEffects": "Učinci zaliha za etapu",
        "stageSupplyEffectsDesc": "Pregled uživo na temelju ovog plana etape i trenutačno dostupnih zaliha. Ovi učinci odvojeni su od bonusa Plana utrke prikazanih iznad.",
        "enginePreview": "Pregled Race Engine-a",
        "energySaving": "Ušteda energije",
        "fatigueReduction": "Smanjenje umora",
        "postStageRecovery": "Oporavak nakon etape",
        "powerGelsLabel": "Energetski gelovi",
        "powerGelsSummary": "{{count}} učinkovita po vozaču za zaseban učinak energije uživo · do +{{energy}} energije uživo.",
        "weatherRiskLine": "Vrijeme: {{reason}}. Nedostatak jakni ne blokira start, ali povećava izloženost riziku od bolesti.",
        "weatherRiskNoneReason": "nije otkriven izražen vremenski rizik",
        "weatherRiskRain": "rizik od kiše",
        "weatherRiskCold": "hladnoća ispod 15°C",
        "weatherRiskWind": "jak vjetar",
        "weatherRiskCondition": "nepovoljni vremenski uvjeti",
        "leaderShort": "Vođa",
    },
    "es": {
        "allStagePlansSaved": "Todos los planes de etapa guardados",
        "allStagePlansReady": "Todos los planes de etapa están guardados y listos.",
        "equipmentDefaultFallbackHelp": "El desplegable también incluye la configuración de carrera predeterminada de la página Resumen de equipamiento. Si una configuración seleccionada deja de estar disponible antes de una etapa porque algún elemento está roto, desgastado, asignado o no disponible, el Race Engine cambia automáticamente a la configuración predeterminada. Si tampoco puede utilizarse, la configuración de la etapa queda bloqueada con una advertencia clara de equipamiento.",
        "stageSupplyEffects": "Efectos de suministros de etapa",
        "stageSupplyEffectsDesc": "Vista previa en vivo basada en este plan de etapa y las existencias disponibles. Estos efectos son independientes de las filas de bonificación del Plan de carrera mostradas arriba.",
        "enginePreview": "Vista previa del motor",
        "energySaving": "Ahorro de energía",
        "fatigueReduction": "Reducción de fatiga",
        "postStageRecovery": "Recuperación tras la etapa",
        "powerGelsLabel": "Geles energéticos",
        "powerGelsSummary": "{{count}} efectivos por ciclista para el efecto separado de energía en vivo · hasta +{{energy}} de energía en vivo.",
        "weatherRiskLine": "Tiempo: {{reason}}. La falta de chaquetas no bloquea la salida, pero aumenta la exposición a enfermedades.",
        "weatherRiskNoneReason": "no se detecta un riesgo meteorológico importante",
        "weatherRiskRain": "riesgo de lluvia",
        "weatherRiskCold": "frío por debajo de 15°C",
        "weatherRiskWind": "viento fuerte",
        "weatherRiskCondition": "condiciones meteorológicas adversas",
        "leaderShort": "Líder",
    },
    "it": {
        "allStagePlansSaved": "Tutti i piani di tappa salvati",
        "allStagePlansReady": "Tutti i piani di tappa sono salvati e pronti.",
        "equipmentDefaultFallbackHelp": "Il menu include anche la configurazione gara predefinita della pagina Panoramica equipaggiamento. Se una configurazione selezionata non è più disponibile prima di una tappa perché un elemento è rotto, usurato, assegnato o altrimenti non disponibile, il Race Engine passa automaticamente alla configurazione predefinita. Se neppure questa può essere usata, la configurazione della tappa viene bloccata con un chiaro avviso sull'equipaggiamento.",
        "stageSupplyEffects": "Effetti delle scorte di tappa",
        "stageSupplyEffectsDesc": "Anteprima in tempo reale basata su questo piano di tappa e sulle scorte attualmente disponibili. Questi effetti sono separati dalle righe bonus del Piano gara mostrate sopra.",
        "enginePreview": "Anteprima motore",
        "energySaving": "Risparmio energetico",
        "fatigueReduction": "Riduzione della fatica",
        "postStageRecovery": "Recupero dopo la tappa",
        "powerGelsLabel": "Gel energetici",
        "powerGelsSummary": "{{count}} efficaci per corridore per l'effetto separato di energia live · fino a +{{energy}} energia live.",
        "weatherRiskLine": "Meteo: {{reason}}. La mancanza di giacche non blocca la partenza, ma aumenta l'esposizione alle malattie.",
        "weatherRiskNoneReason": "nessun forte rischio meteo rilevato",
        "weatherRiskRain": "rischio pioggia",
        "weatherRiskCold": "freddo sotto i 15°C",
        "weatherRiskWind": "vento forte",
        "weatherRiskCondition": "condizioni meteo avverse",
        "leaderShort": "Leader",
    },
    "fr": {
        "allStagePlansSaved": "Tous les plans d’étape sont enregistrés",
        "allStagePlansReady": "Tous les plans d’étape sont enregistrés et prêts.",
        "equipmentDefaultFallbackHelp": "Le menu comprend également la configuration de course par défaut de la page Aperçu de l’équipement. Si une configuration sélectionnée n’est plus disponible avant une étape parce qu’un élément est cassé, usé, affecté ou indisponible, le Race Engine revient automatiquement à la configuration par défaut. Si celle-ci n’est pas utilisable non plus, la configuration de l’étape est bloquée avec un avertissement clair sur l’équipement.",
        "stageSupplyEffects": "Effets des provisions d’étape",
        "stageSupplyEffectsDesc": "Aperçu en direct basé sur ce plan d’étape et le stock actuellement disponible. Ces effets sont distincts des lignes de bonus du Plan de course affichées ci-dessus.",
        "enginePreview": "Aperçu du moteur",
        "energySaving": "Économie d’énergie",
        "fatigueReduction": "Réduction de la fatigue",
        "postStageRecovery": "Récupération après l’étape",
        "powerGelsLabel": "Gels énergétiques",
        "powerGelsSummary": "{{count}} efficaces par coureur pour l’effet séparé d’énergie en direct · jusqu’à +{{energy}} d’énergie en direct.",
        "weatherRiskLine": "Météo : {{reason}}. L’absence de vestes ne bloque pas le départ, mais augmente l’exposition aux maladies.",
        "weatherRiskNoneReason": "aucun risque météo important détecté",
        "weatherRiskRain": "risque de pluie",
        "weatherRiskCold": "froid sous 15°C",
        "weatherRiskWind": "vent fort",
        "weatherRiskCondition": "conditions météo défavorables",
        "leaderShort": "Leader",
    },
    "ru": {
        "allStagePlansSaved": "Все планы этапов сохранены",
        "allStagePlansReady": "Все планы этапов сохранены и готовы.",
        "equipmentDefaultFallbackHelp": "В списке также есть стандартная гоночная настройка со страницы обзора экипировки. Если выбранная настройка перестаёт быть доступна перед этапом из-за поломки, износа, назначения или другой недоступности элемента, Race Engine автоматически переключается на стандартную настройку. Если и она недоступна, настройка этапа блокируется с понятным предупреждением об экипировке.",
        "stageSupplyEffects": "Эффекты запасов на этапе",
        "stageSupplyEffectsDesc": "Предпросмотр в реальном времени на основе этого плана этапа и текущих запасов. Эти эффекты отделены от строк бонусов Плана гонки выше.",
        "enginePreview": "Предпросмотр движка",
        "energySaving": "Экономия энергии",
        "fatigueReduction": "Снижение усталости",
        "postStageRecovery": "Восстановление после этапа",
        "powerGelsLabel": "Энергетические гели",
        "powerGelsSummary": "{{count}} эффективных на гонщика для отдельного эффекта живой энергии · до +{{energy}} живой энергии.",
        "weatherRiskLine": "Погода: {{reason}}. Отсутствие курток не блокирует старт, но повышает риск заболевания.",
        "weatherRiskNoneReason": "существенного погодного риска не обнаружено",
        "weatherRiskRain": "риск дождя",
        "weatherRiskCold": "холод ниже 15°C",
        "weatherRiskWind": "сильный ветер",
        "weatherRiskCondition": "неблагоприятные погодные условия",
        "leaderShort": "Лидер",
    },
}

TACTICS = {
    "en": {
        "protectLeader": "Protect Leader", "conserveEnergy": "Conserve Energy", "stayNearFront": "Stay Near Front",
        "controlTempo": "Control Tempo", "chaseBreakaway": "Chase Breakaway", "attack": "Attack",
        "joinBreakaway": "Join Breakaway", "fightSprintPoints": "Fight for Sprint Points", "fightKomPoints": "Fight for KOM Points",
        "avoidRisks": "Avoid Risks", "sprintTrainRider": "Sprint Train Rider", "leadOutRider": "Lead-out Rider", "finalSprint": "Final Sprint",
    },
    "sr-Latn": {
        "protectLeader": "Zaštiti vođu", "conserveEnergy": "Štedi energiju", "stayNearFront": "Drži se pri čelu",
        "controlTempo": "Kontroliši tempo", "chaseBreakaway": "Juri beg", "attack": "Napad",
        "joinBreakaway": "Priključi se begu", "fightSprintPoints": "Bori se za sprint bodove", "fightKomPoints": "Bori se za KOM bodove",
        "avoidRisks": "Izbegavaj rizik", "sprintTrainRider": "Vozač sprint voza", "leadOutRider": "Lead-out vozač", "finalSprint": "Završni sprint",
    },
    "de": {
        "protectLeader": "Kapitän schützen", "conserveEnergy": "Energie sparen", "stayNearFront": "Vorne bleiben",
        "controlTempo": "Tempo kontrollieren", "chaseBreakaway": "Ausreißer verfolgen", "attack": "Attackieren",
        "joinBreakaway": "In die Fluchtgruppe gehen", "fightSprintPoints": "Um Sprintpunkte kämpfen", "fightKomPoints": "Um Bergpunkte kämpfen",
        "avoidRisks": "Risiken vermeiden", "sprintTrainRider": "Sprintzug-Fahrer", "leadOutRider": "Anfahrer", "finalSprint": "Finalsprint",
    },
    "hr": {
        "protectLeader": "Zaštiti vođu", "conserveEnergy": "Štedi energiju", "stayNearFront": "Drži se pri čelu",
        "controlTempo": "Kontroliraj tempo", "chaseBreakaway": "Lov na bijeg", "attack": "Napad",
        "joinBreakaway": "Priključi se bijegu", "fightSprintPoints": "Bori se za sprint bodove", "fightKomPoints": "Bori se za KOM bodove",
        "avoidRisks": "Izbjegavaj rizik", "sprintTrainRider": "Vozač sprint vlaka", "leadOutRider": "Lead-out vozač", "finalSprint": "Završni sprint",
    },
    "es": {
        "protectLeader": "Proteger al líder", "conserveEnergy": "Ahorrar energía", "stayNearFront": "Mantenerse delante",
        "controlTempo": "Controlar el ritmo", "chaseBreakaway": "Perseguir la escapada", "attack": "Atacar",
        "joinBreakaway": "Entrar en la escapada", "fightSprintPoints": "Luchar por puntos de sprint", "fightKomPoints": "Luchar por puntos KOM",
        "avoidRisks": "Evitar riesgos", "sprintTrainRider": "Ciclista del tren de sprint", "leadOutRider": "Lanzador", "finalSprint": "Sprint final",
    },
    "it": {
        "protectLeader": "Proteggi il leader", "conserveEnergy": "Risparmia energia", "stayNearFront": "Resta davanti",
        "controlTempo": "Controlla il ritmo", "chaseBreakaway": "Insegui la fuga", "attack": "Attacca",
        "joinBreakaway": "Entra nella fuga", "fightSprintPoints": "Lotta per i punti sprint", "fightKomPoints": "Lotta per i punti GPM",
        "avoidRisks": "Evita rischi", "sprintTrainRider": "Corridore del treno sprint", "leadOutRider": "Ultimo uomo", "finalSprint": "Sprint finale",
    },
    "fr": {
        "protectLeader": "Protéger le leader", "conserveEnergy": "Économiser l’énergie", "stayNearFront": "Rester à l’avant",
        "controlTempo": "Contrôler le tempo", "chaseBreakaway": "Chasser l’échappée", "attack": "Attaquer",
        "joinBreakaway": "Rejoindre l’échappée", "fightSprintPoints": "Disputer les points de sprint", "fightKomPoints": "Disputer les points de montagne",
        "avoidRisks": "Éviter les risques", "sprintTrainRider": "Coureur du train de sprint", "leadOutRider": "Lanceur", "finalSprint": "Sprint final",
    },
    "ru": {
        "protectLeader": "Защищать лидера", "conserveEnergy": "Экономить силы", "stayNearFront": "Держаться впереди",
        "controlTempo": "Контролировать темп", "chaseBreakaway": "Догонять отрыв", "attack": "Атаковать",
        "joinBreakaway": "Войти в отрыв", "fightSprintPoints": "Бороться за спринтерские очки", "fightKomPoints": "Бороться за горные очки",
        "avoidRisks": "Избегать риска", "sprintTrainRider": "Гонщик спринтерского поезда", "leadOutRider": "Развозящий", "finalSprint": "Финальный спринт",
    },
}


def set_path(data: dict, dotted: str, value: str) -> None:
    parts = dotted.split(".")
    cur = data
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = value


def replace_required(src: str, old: str, new: str, label: str) -> str:
    if old not in src:
        raise SystemExit(f"Missing expected RacePreparation source fragment: {label}")
    return src.replace(old, new, 1)


def main() -> None:
    for locale in LOCALES:
        path = ROOT / "src/i18n/locales" / locale / "racePreparation.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        for dotted, value in TERM_UPDATES[locale].items():
            set_path(data, dotted, value)
        data.setdefault("screen", {}).update(NEW_SCREEN[locale])
        data.setdefault("tactics", {}).update(TACTICS[locale])
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    src = SOURCE.read_text(encoding="utf-8")

    src = replace_required(
        src,
        '''function localizedGameMonth(month: number, style: "short" | "long" = "short"): string {\n  const safeMonth = Math.min(12, Math.max(1, Number(month) || 1));\n  return new Intl.DateTimeFormat(getRacePrepLocale(), {\n    month: style,\n    timeZone: "UTC",\n  }).format(new Date(Date.UTC(2026, safeMonth - 1, 1)));\n}''',
        '''function localizedGameMonth(month: number, style: "short" | "long" = "short"): string {\n  const safeMonth = Math.min(12, Math.max(1, Number(month) || 1));\n  const locale = getRacePrepLocale();\n  const label = new Intl.DateTimeFormat(locale, {\n    month: style,\n    timeZone: "UTC",\n  }).format(new Date(Date.UTC(2026, safeMonth - 1, 1)));\n\n  // CLDR/Intl correctly returns Serbian/Croatian month names in lowercase,\n  // but the Race Preparation UI presents month names as display labels.\n  // Title-case the first character for consistent visual treatment.\n  return label ? `${label.charAt(0).toLocaleUpperCase(locale)}${label.slice(1)}` : label;\n}''',
        "month display capitalization",
    )

    marker = '    "No race-level assets selected.": "screen.validationNoAssets",\n'
    additions = '''    "All Stage Plans Saved": "screen.allStagePlansSaved",\n    "All stage plans are saved and ready.": "screen.allStagePlansReady",\n    "Team Leader (GC)": "riderRoles.teamLeader",\n    "Helper / Domestique": "riderRoles.helper",\n    "Breakaway Chaser": "riderRoles.breakawayChaser",\n    "Time Trial Rider": "riderRoles.timeTrialRider",\n    "Team Time Trial Rider": "riderRoles.teamTimeTrialRider",\n    "Leader": "screen.leaderShort",\n    "Protect Leader": "tactics.protectLeader",\n    "Conserve Energy": "tactics.conserveEnergy",\n    "Stay Near Front": "tactics.stayNearFront",\n    "Control Tempo": "tactics.controlTempo",\n    "Chase Breakaway": "tactics.chaseBreakaway",\n    "Attack": "tactics.attack",\n    "Join Breakaway": "tactics.joinBreakaway",\n    "Fight for Sprint Points": "tactics.fightSprintPoints",\n    "Fight for KOM Points": "tactics.fightKomPoints",\n    "Avoid Risks": "tactics.avoidRisks",\n    "Sprint Train Rider": "tactics.sprintTrainRider",\n    "Lead-out Rider": "tactics.leadOutRider",\n    "Final Sprint": "tactics.finalSprint",\n    "rain risk": "screen.weatherRiskRain",\n    "cold below 15°C": "screen.weatherRiskCold",\n    "strong wind": "screen.weatherRiskWind",\n    "bad-weather condition text": "screen.weatherRiskCondition",\n    "no strong weather risk detected": "screen.weatherRiskNoneReason",\n'''
    if additions.strip() not in src:
        src = replace_required(src, marker, marker + additions, "backend/tactic translation mapping")

    replacements = [
        (
            '''            <h2 className="text-lg font-semibold text-slate-900">\n              Stage Plans\n            </h2>\n            <p className="mt-1 text-sm text-slate-600">\n              Select a stage below to review its profile, then configure\n              equipment, team tactics and optional individual tactics for that\n              stage.\n            </p>''',
            '''            <h2 className="text-lg font-semibold text-slate-900">\n              {racePrepText("stagePlans.title")}\n            </h2>\n            <p className="mt-1 text-sm text-slate-600">\n              {racePrepText("screen.stagePlansIntro")}\n            </p>''',
            "Stage Plans heading and intro",
        ),
        (
            '''          <div className="text-xs uppercase tracking-wide text-slate-500">\n            Selected stage profile\n          </div>\n\n          <h3 className="mt-1 text-lg font-semibold text-slate-900">\n            Stage {stageNumber}: {getStageDisplayName(stage, stageNumber)}\n          </h3>''',
            '''          <div className="text-xs uppercase tracking-wide text-slate-500">\n            {racePrepText("screen.selectedStageProfile")}\n          </div>\n\n          <h3 className="mt-1 text-lg font-semibold text-slate-900">\n            {racePrepText("common.stage")} {stageNumber}: {getStageDisplayName(stage, stageNumber)}\n          </h3>''',
            "selected stage profile heading",
        ),
        (
            '''            <CompactStageInfo\n              label="Date"\n              value={formatFullStageDateTime(stage)}\n            />\n            <CompactStageInfo label="Route" value={getStageRoute(stage)} />\n            <CompactStageInfo\n              label="Profile"''',
            '''            <CompactStageInfo\n              label={racePrepText("screen.date")}\n              value={formatFullStageDateTime(stage)}\n            />\n            <CompactStageInfo label={racePrepText("screen.route")} value={getStageRoute(stage)} />\n            <CompactStageInfo\n              label={racePrepText("screen.profile")}''',
            "date route profile labels",
        ),
        (
            '''            <CompactStageInfo\n              label="Distance"''',
            '''            <CompactStageInfo\n              label={racePrepText("screen.distance")}''',
            "distance label",
        ),
        (
            '''        Stage weather''',
            '''        {racePrepText("screen.stageWeather")}''',
            "stage weather heading",
        ),
        (
            '''      <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">\n        The dropdown also includes the Default Race Setup from the Equipment\n        Overview page. If a selected equipment setup is no longer available\n        before a stage because one of its equipment items is broken, worn out,\n        assigned, or otherwise unavailable, the race engine should automatically\n        fall back to Default. If Default also cannot be used, the stage setup\n        should be blocked with a clear equipment warning.\n      </div>''',
            '''      <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">\n        {racePrepText("screen.equipmentDefaultFallbackHelp")}\n      </div>''',
            "equipment fallback help",
        ),
        (
            '''      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">\n        Stage Plan save only stores the plan. Consumables and durable item usage\n        are applied later by the race engine when the stage is processed.\n      </div>''',
            '''      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">\n        {racePrepText("screen.stageSaveOnly")}\n      </div>''',
            "Stage Plan save-only help",
        ),
        (
            '''                      Stage Supply Effects''',
            '''                      {racePrepText("screen.stageSupplyEffects")}''',
            "stage supply effects heading",
        ),
        (
            '''                      Live preview from this stage plan and currently available\n                      stock. These effects are separate from the Race Plan bonus\n                      rows above.''',
            '''                      {racePrepText("screen.stageSupplyEffectsDesc")}''',
            "stage supply effects description",
        ),
        (
            '''                    Engine preview''',
            '''                    {racePrepText("screen.enginePreview")}''',
            "engine preview badge",
        ),
        (
            '''<span className="text-slate-600">Energy saving</span>''',
            '''<span className="text-slate-600">{racePrepText("screen.energySaving")}</span>''',
            "energy saving label",
        ),
        (
            '''<span className="text-slate-600">Fatigue reduction</span>''',
            '''<span className="text-slate-600">{racePrepText("screen.fatigueReduction")}</span>''',
            "fatigue reduction label",
        ),
        (
            '''<span className="text-slate-600">Race support</span>''',
            '''<span className="text-slate-600">{racePrepText("screen.raceSupport")}</span>''',
            "race support label",
        ),
        (
            '''<span className="text-slate-600">Post-stage recovery</span>''',
            '''<span className="text-slate-600">{racePrepText("screen.postStageRecovery")}</span>''',
            "post-stage recovery label",
        ),
        (
            '''                  <span className="font-semibold text-slate-800">Power gels:</span>{" "}\n                  {supplyEffects.powerGelsEffectivePerRider} effective per rider\n                  for the separate live-energy effect · up to +\n                  {formatStageSupplyEffectNumber(supplyEffects.powerGelLiveEnergyMax)}{" "}\n                  live energy.''',
            '''                  <span className="font-semibold text-slate-800">{racePrepText("screen.powerGelsLabel")}:</span>{" "}\n                  {racePrepText("screen.powerGelsSummary", {\n                    count: supplyEffects.powerGelsEffectivePerRider,\n                    energy: formatStageSupplyEffectNumber(supplyEffects.powerGelLiveEnergyMax),\n                  })}''',
            "power gels summary",
        ),
        (
            '''                  Weather: {needs.weatherRisk.reason}. Missing jackets do not\n                  block the start, but increase illness exposure.''',
            '''                  {needs.weatherRisk.reason === "no strong weather risk detected"\n                    ? racePrepText("screen.weatherNoRisk")\n                    : racePrepText("screen.weatherRiskLine", {\n                        reason: String(needs.weatherRisk.reason)\n                          .split(",")\n                          .map((part) => localizeRacePrepBackendText(part.trim()))\n                          .join(", "),\n                      })}''',
            "weather risk sentence",
        ),
        (
            '''                      Engine role: {engineRoleLabel}''',
            '''                      {racePrepText("screen.engineRole")}: {localizeRacePrepBackendText(engineRoleLabel)}''',
            "time trial engine role label",
        ),
        (
            '''                      Engine role: {STAGE_RIDER_ROLE_LABELS[role] ?? role}''',
            '''                      {racePrepText("screen.engineRole")}: {localizeRacePrepBackendText(STAGE_RIDER_ROLE_LABELS[role] ?? role)}''',
            "road engine role label",
        ),
    ]

    for old, new, label in replacements:
        src = replace_required(src, old, new, label)

    # Localize the two role labels used in the Individual Tactics rider subtitle.
    src = replace_required(
        src,
        '''            const riderBaseRoleLabel = getRiderRoleLabel(rider);''',
        '''            const riderBaseRoleLabel = localizeRacePrepBackendText(getRiderRoleLabel(rider));''',
        "individual tactics base rider role",
    )
    src = replace_required(
        src,
        '''              selectedStageRole as StageRiderRoleCode\n                ] ?? titleFromSnake(selectedStageRole))''',
        '''              selectedStageRole as StageRiderRoleCode\n                ] ?? titleFromSnake(selectedStageRole))''',
        "individual tactics selected stage role anchor",
    )
    # The selected stage role expression above stays structurally unchanged; wrap
    # its final value at the comparison/display point so all option labels are localized.
    src = replace_required(
        src,
        '''            const individualTacticsRoleLine =\n              riderBaseRoleLabel.toLowerCase() ===\n              selectedStageRoleLabel.toLowerCase()\n                ? riderBaseRoleLabel\n                : `${riderBaseRoleLabel} - ${selectedStageRoleLabel}`;''',
        '''            const localizedSelectedStageRoleLabel =\n              localizeRacePrepBackendText(selectedStageRoleLabel);\n            const individualTacticsRoleLine =\n              riderBaseRoleLabel.toLowerCase() ===\n              localizedSelectedStageRoleLabel.toLowerCase()\n                ? riderBaseRoleLabel\n                : `${riderBaseRoleLabel} - ${localizedSelectedStageRoleLabel}`;''',
        "individual tactics role subtitle",
    )

    SOURCE.write_text(src, encoding="utf-8")
    print("Applied screenshot-driven Race Preparation localization fixes")


if __name__ == "__main__":
    main()
