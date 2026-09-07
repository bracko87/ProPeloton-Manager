from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]


def set_path(obj: dict, path: str, value: str) -> None:
    parts = path.split('.')
    cur = obj
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = value


TRANSLATIONS = {
    "en": {
        "templateLocalization.feed.sportsDirector.titles.raceProgramme": "Sports Director Advisory — Race Programme",
        "templateLocalization.feed.sportsDirector.titles.raceProgrammeGap": "Sports Director Advisory — Race Programme Gap",
        "templateLocalization.feed.sportsDirector.titles.programmeContinuity": "Sports Director Advisory — Programme Continuity",
        "templateLocalization.feed.sportsDirector.titles.longProgrammeBreak": "Sports Director Advisory — Long Programme Break",
        "templateLocalization.feed.sportsDirector.titles.programmeEmpty": "Sports Director Advisory — Programme Empty",
        "templateLocalization.feed.sportsDirector.titles.startlistDeadlineAlert": "Sports Director Advisory — Startlist Deadline Alert",
        "templateLocalization.feed.sportsDirector.titles.stagePlansMissing": "Sports Director Advisory — Stage Plans Missing",
        "templateLocalization.feed.sportsDirector.titles.stagePlansIncomplete": "Sports Director Advisory — Stage Plans Incomplete",
        "templateLocalization.feed.sportsDirector.titles.racePreparationMissing": "Sports Director Advisory — Race Preparation Missing",
        "templateLocalization.feed.sportsDirector.titles.racePreparationReady": "Sports Director Advisory — Race Preparation Ready",
        "templateLocalization.feed.sportsDirector.stagePlansMissingMessage": "{{count}} stage plans are still missing for {{raceName}}. Stage {{stage}} is today at {{time}} ({{date}}) and is the most urgent missing plan.",
        "templateLocalization.feed.sportsDirector.raceProgrammeMessage": "Current race: {{raceName}} ({{start}}–{{end}}). Next accepted future race: {{nextRace}}. {{count}} management priority item(s) require review.",
        "templateLocalization.feed.sportsDirector.noneScheduled": "none currently scheduled",
        "templateLocalization.feed.sportsDirector.genericMessage": "Your Sports Director has prepared a new race-programme advisory. Open the notification to review the full details.",
        "templateLocalization.feed.sportsDirector.reviewRecommendation": "Review the current race programme, preparation package, startlist and stage-plan status.",
        "templateLocalization.feed.raceJerseysRemoval.title": "Team removed from {{raceName}}",
        "templateLocalization.feed.raceJerseysRemoval.message": "{{teamName}} did not have enough mandatory Race Jersey Kits for Stage {{stage}}. Required: {{required}}; available: {{available}}. The team has been removed from Stage {{stage}} and every remaining stage of {{raceName}}. Riders can no longer place or score in this race.",
        "templateLocalization.feed.raceJerseysRemoval.genericMessage": "The team was removed from {{raceName}} because it did not have enough mandatory Race Jersey Kits.",
    },
    "sr-Latn": {
        "templateLocalization.feed.sportsDirector.titles.raceProgramme": "Savet sportskog direktora — Program trka",
        "templateLocalization.feed.sportsDirector.titles.raceProgrammeGap": "Savet sportskog direktora — Praznina u programu trka",
        "templateLocalization.feed.sportsDirector.titles.programmeContinuity": "Savet sportskog direktora — Kontinuitet programa",
        "templateLocalization.feed.sportsDirector.titles.longProgrammeBreak": "Savet sportskog direktora — Duga pauza u programu",
        "templateLocalization.feed.sportsDirector.titles.programmeEmpty": "Savet sportskog direktora — Program je prazan",
        "templateLocalization.feed.sportsDirector.titles.startlistDeadlineAlert": "Savet sportskog direktora — Upozorenje za rok startne liste",
        "templateLocalization.feed.sportsDirector.titles.stagePlansMissing": "Savet sportskog direktora — Nedostaju planovi etapa",
        "templateLocalization.feed.sportsDirector.titles.stagePlansIncomplete": "Savet sportskog direktora — Planovi etapa su nepotpuni",
        "templateLocalization.feed.sportsDirector.titles.racePreparationMissing": "Savet sportskog direktora — Nedostaje priprema trke",
        "templateLocalization.feed.sportsDirector.titles.racePreparationReady": "Savet sportskog direktora — Priprema trke je spremna",
        "templateLocalization.feed.sportsDirector.stagePlansMissingMessage": "Još nedostaje {{count}} planova etapa za {{raceName}}. Etapa {{stage}} je danas u {{time}} ({{date}}) i predstavlja najhitniji plan koji nedostaje.",
        "templateLocalization.feed.sportsDirector.raceProgrammeMessage": "Trenutna trka: {{raceName}} ({{start}}–{{end}}). Sledeća prihvaćena buduća trka: {{nextRace}}. Potrebno je pregledati {{count}} stavki prioriteta upravljanja.",
        "templateLocalization.feed.sportsDirector.noneScheduled": "trenutno nema zakazane trke",
        "templateLocalization.feed.sportsDirector.genericMessage": "Vaš sportski direktor je pripremio novi savet o programu trka. Otvorite obaveštenje da pregledate sve detalje.",
        "templateLocalization.feed.sportsDirector.reviewRecommendation": "Pregledajte trenutni program trka, paket pripreme, startnu listu i status planova etapa.",
        "templateLocalization.feed.raceJerseysRemoval.title": "Tim uklonjen sa trke {{raceName}}",
        "templateLocalization.feed.raceJerseysRemoval.message": "{{teamName}} nije imao dovoljno obaveznih kompleta trkačkih dresova za etapu {{stage}}. Potrebno: {{required}}; dostupno: {{available}}. Tim je uklonjen sa etape {{stage}} i svih preostalih etapa trke {{raceName}}. Vozači više ne mogu da ostvare plasman niti osvoje bodove u ovoj trci.",
        "templateLocalization.feed.raceJerseysRemoval.genericMessage": "Tim je uklonjen sa trke {{raceName}} jer nije imao dovoljno obaveznih kompleta trkačkih dresova.",
    },
    "hr": {
        "templateLocalization.feed.sportsDirector.titles.raceProgramme": "Savjet sportskog direktora — Program utrka",
        "templateLocalization.feed.sportsDirector.titles.raceProgrammeGap": "Savjet sportskog direktora — Praznina u programu utrka",
        "templateLocalization.feed.sportsDirector.titles.programmeContinuity": "Savjet sportskog direktora — Kontinuitet programa",
        "templateLocalization.feed.sportsDirector.titles.longProgrammeBreak": "Savjet sportskog direktora — Duga pauza u programu",
        "templateLocalization.feed.sportsDirector.titles.programmeEmpty": "Savjet sportskog direktora — Program je prazan",
        "templateLocalization.feed.sportsDirector.titles.startlistDeadlineAlert": "Savjet sportskog direktora — Upozorenje za rok startne liste",
        "templateLocalization.feed.sportsDirector.titles.stagePlansMissing": "Savjet sportskog direktora — Nedostaju planovi etapa",
        "templateLocalization.feed.sportsDirector.titles.stagePlansIncomplete": "Savjet sportskog direktora — Planovi etapa su nepotpuni",
        "templateLocalization.feed.sportsDirector.titles.racePreparationMissing": "Savjet sportskog direktora — Nedostaje priprema utrke",
        "templateLocalization.feed.sportsDirector.titles.racePreparationReady": "Savjet sportskog direktora — Priprema utrke je spremna",
        "templateLocalization.feed.sportsDirector.stagePlansMissingMessage": "Još nedostaje {{count}} planova etapa za {{raceName}}. Etapa {{stage}} je danas u {{time}} ({{date}}) i najhitniji je plan koji nedostaje.",
        "templateLocalization.feed.sportsDirector.raceProgrammeMessage": "Trenutna utrka: {{raceName}} ({{start}}–{{end}}). Sljedeća prihvaćena buduća utrka: {{nextRace}}. Potrebno je pregledati {{count}} stavki prioriteta upravljanja.",
        "templateLocalization.feed.sportsDirector.noneScheduled": "trenutačno nema zakazane utrke",
        "templateLocalization.feed.sportsDirector.genericMessage": "Vaš sportski direktor pripremio je novi savjet o programu utrka. Otvorite obavijest kako biste pregledali sve detalje.",
        "templateLocalization.feed.sportsDirector.reviewRecommendation": "Pregledajte trenutačni program utrka, paket pripreme, startnu listu i status planova etapa.",
        "templateLocalization.feed.raceJerseysRemoval.title": "Momčad uklonjena iz utrke {{raceName}}",
        "templateLocalization.feed.raceJerseysRemoval.message": "{{teamName}} nije imao dovoljno obaveznih kompleta trkaćih dresova za etapu {{stage}}. Potrebno: {{required}}; dostupno: {{available}}. Momčad je uklonjena iz etape {{stage}} i svih preostalih etapa utrke {{raceName}}. Vozači više ne mogu ostvariti plasman ni osvajati bodove u ovoj utrci.",
        "templateLocalization.feed.raceJerseysRemoval.genericMessage": "Momčad je uklonjena iz utrke {{raceName}} jer nije imala dovoljno obaveznih kompleta trkaćih dresova.",
    },
    "de": {
        "templateLocalization.feed.sportsDirector.titles.raceProgramme": "Hinweis des Sportdirektors — Rennprogramm",
        "templateLocalization.feed.sportsDirector.titles.raceProgrammeGap": "Hinweis des Sportdirektors — Lücke im Rennprogramm",
        "templateLocalization.feed.sportsDirector.titles.programmeContinuity": "Hinweis des Sportdirektors — Programmkontinuität",
        "templateLocalization.feed.sportsDirector.titles.longProgrammeBreak": "Hinweis des Sportdirektors — Lange Programmpause",
        "templateLocalization.feed.sportsDirector.titles.programmeEmpty": "Hinweis des Sportdirektors — Leeres Programm",
        "templateLocalization.feed.sportsDirector.titles.startlistDeadlineAlert": "Hinweis des Sportdirektors — Fristwarnung für die Startliste",
        "templateLocalization.feed.sportsDirector.titles.stagePlansMissing": "Hinweis des Sportdirektors — Fehlende Etappenpläne",
        "templateLocalization.feed.sportsDirector.titles.stagePlansIncomplete": "Hinweis des Sportdirektors — Unvollständige Etappenpläne",
        "templateLocalization.feed.sportsDirector.titles.racePreparationMissing": "Hinweis des Sportdirektors — Rennvorbereitung fehlt",
        "templateLocalization.feed.sportsDirector.titles.racePreparationReady": "Hinweis des Sportdirektors — Rennvorbereitung bereit",
        "templateLocalization.feed.sportsDirector.stagePlansMissingMessage": "Für {{raceName}} fehlen noch {{count}} Etappenpläne. Etappe {{stage}} findet heute um {{time}} ({{date}}) statt und ist der dringendste fehlende Plan.",
        "templateLocalization.feed.sportsDirector.raceProgrammeMessage": "Aktuelles Rennen: {{raceName}} ({{start}}–{{end}}). Nächstes angenommenes zukünftiges Rennen: {{nextRace}}. Es müssen {{count}} Management-Prioritäten geprüft werden.",
        "templateLocalization.feed.sportsDirector.noneScheduled": "derzeit kein Rennen geplant",
        "templateLocalization.feed.sportsDirector.genericMessage": "Ihr Sportdirektor hat einen neuen Hinweis zum Rennprogramm erstellt. Öffnen Sie die Benachrichtigung, um alle Details zu prüfen.",
        "templateLocalization.feed.sportsDirector.reviewRecommendation": "Prüfen Sie das aktuelle Rennprogramm, das Vorbereitungspaket, die Startliste und den Status der Etappenpläne.",
        "templateLocalization.feed.raceJerseysRemoval.title": "Team aus {{raceName}} entfernt",
        "templateLocalization.feed.raceJerseysRemoval.message": "{{teamName}} hatte für Etappe {{stage}} nicht genügend vorgeschriebene Renntrikot-Sets. Benötigt: {{required}}; verfügbar: {{available}}. Das Team wurde aus Etappe {{stage}} und allen verbleibenden Etappen von {{raceName}} entfernt. Die Fahrer können in diesem Rennen keine Platzierungen oder Punkte mehr erzielen.",
        "templateLocalization.feed.raceJerseysRemoval.genericMessage": "Das Team wurde aus {{raceName}} entfernt, weil nicht genügend vorgeschriebene Renntrikot-Sets verfügbar waren.",
    },
    "es": {
        "templateLocalization.feed.sportsDirector.titles.raceProgramme": "Aviso del director deportivo — Programa de carreras",
        "templateLocalization.feed.sportsDirector.titles.raceProgrammeGap": "Aviso del director deportivo — Hueco en el programa de carreras",
        "templateLocalization.feed.sportsDirector.titles.programmeContinuity": "Aviso del director deportivo — Continuidad del programa",
        "templateLocalization.feed.sportsDirector.titles.longProgrammeBreak": "Aviso del director deportivo — Pausa larga en el programa",
        "templateLocalization.feed.sportsDirector.titles.programmeEmpty": "Aviso del director deportivo — Programa vacío",
        "templateLocalization.feed.sportsDirector.titles.startlistDeadlineAlert": "Aviso del director deportivo — Alerta de plazo de la lista de salida",
        "templateLocalization.feed.sportsDirector.titles.stagePlansMissing": "Aviso del director deportivo — Faltan planes de etapa",
        "templateLocalization.feed.sportsDirector.titles.stagePlansIncomplete": "Aviso del director deportivo — Planes de etapa incompletos",
        "templateLocalization.feed.sportsDirector.titles.racePreparationMissing": "Aviso del director deportivo — Falta la preparación de carrera",
        "templateLocalization.feed.sportsDirector.titles.racePreparationReady": "Aviso del director deportivo — Preparación de carrera lista",
        "templateLocalization.feed.sportsDirector.stagePlansMissingMessage": "Todavía faltan {{count}} planes de etapa para {{raceName}}. La etapa {{stage}} es hoy a las {{time}} ({{date}}) y es el plan pendiente más urgente.",
        "templateLocalization.feed.sportsDirector.raceProgrammeMessage": "Carrera actual: {{raceName}} ({{start}}–{{end}}). Próxima carrera futura aceptada: {{nextRace}}. Hay {{count}} prioridades de gestión que requieren revisión.",
        "templateLocalization.feed.sportsDirector.noneScheduled": "no hay ninguna programada actualmente",
        "templateLocalization.feed.sportsDirector.genericMessage": "Tu director deportivo ha preparado un nuevo aviso sobre el programa de carreras. Abre la notificación para revisar todos los detalles.",
        "templateLocalization.feed.sportsDirector.reviewRecommendation": "Revisa el programa de carreras actual, el paquete de preparación, la lista de salida y el estado de los planes de etapa.",
        "templateLocalization.feed.raceJerseysRemoval.title": "Equipo retirado de {{raceName}}",
        "templateLocalization.feed.raceJerseysRemoval.message": "{{teamName}} no tenía suficientes kits obligatorios de maillot de carrera para la etapa {{stage}}. Necesarios: {{required}}; disponibles: {{available}}. El equipo ha sido retirado de la etapa {{stage}} y de todas las etapas restantes de {{raceName}}. Los corredores ya no pueden clasificarse ni puntuar en esta carrera.",
        "templateLocalization.feed.raceJerseysRemoval.genericMessage": "El equipo fue retirado de {{raceName}} porque no tenía suficientes kits obligatorios de maillot de carrera.",
    },
    "it": {
        "templateLocalization.feed.sportsDirector.titles.raceProgramme": "Avviso del direttore sportivo — Programma gare",
        "templateLocalization.feed.sportsDirector.titles.raceProgrammeGap": "Avviso del direttore sportivo — Interruzione nel programma gare",
        "templateLocalization.feed.sportsDirector.titles.programmeContinuity": "Avviso del direttore sportivo — Continuità del programma",
        "templateLocalization.feed.sportsDirector.titles.longProgrammeBreak": "Avviso del direttore sportivo — Lunga pausa nel programma",
        "templateLocalization.feed.sportsDirector.titles.programmeEmpty": "Avviso del direttore sportivo — Programma vuoto",
        "templateLocalization.feed.sportsDirector.titles.startlistDeadlineAlert": "Avviso del direttore sportivo — Scadenza della lista di partenza",
        "templateLocalization.feed.sportsDirector.titles.stagePlansMissing": "Avviso del direttore sportivo — Mancano i piani di tappa",
        "templateLocalization.feed.sportsDirector.titles.stagePlansIncomplete": "Avviso del direttore sportivo — Piani di tappa incompleti",
        "templateLocalization.feed.sportsDirector.titles.racePreparationMissing": "Avviso del direttore sportivo — Manca la preparazione gara",
        "templateLocalization.feed.sportsDirector.titles.racePreparationReady": "Avviso del direttore sportivo — Preparazione gara pronta",
        "templateLocalization.feed.sportsDirector.stagePlansMissingMessage": "Mancano ancora {{count}} piani di tappa per {{raceName}}. La tappa {{stage}} è oggi alle {{time}} ({{date}}) ed è il piano mancante più urgente.",
        "templateLocalization.feed.sportsDirector.raceProgrammeMessage": "Gara attuale: {{raceName}} ({{start}}–{{end}}). Prossima gara futura accettata: {{nextRace}}. Ci sono {{count}} priorità gestionali da rivedere.",
        "templateLocalization.feed.sportsDirector.noneScheduled": "nessuna attualmente in programma",
        "templateLocalization.feed.sportsDirector.genericMessage": "Il tuo direttore sportivo ha preparato un nuovo avviso sul programma gare. Apri la notifica per esaminare tutti i dettagli.",
        "templateLocalization.feed.sportsDirector.reviewRecommendation": "Controlla il programma gare attuale, il pacchetto di preparazione, la lista di partenza e lo stato dei piani di tappa.",
        "templateLocalization.feed.raceJerseysRemoval.title": "Squadra rimossa da {{raceName}}",
        "templateLocalization.feed.raceJerseysRemoval.message": "{{teamName}} non disponeva di abbastanza kit obbligatori di maglia da gara per la tappa {{stage}}. Necessari: {{required}}; disponibili: {{available}}. La squadra è stata rimossa dalla tappa {{stage}} e da tutte le tappe rimanenti di {{raceName}}. I corridori non possono più ottenere piazzamenti o punti in questa gara.",
        "templateLocalization.feed.raceJerseysRemoval.genericMessage": "La squadra è stata rimossa da {{raceName}} perché non disponeva di abbastanza kit obbligatori di maglia da gara.",
    },
    "fr": {
        "templateLocalization.feed.sportsDirector.titles.raceProgramme": "Avis du directeur sportif — Programme de courses",
        "templateLocalization.feed.sportsDirector.titles.raceProgrammeGap": "Avis du directeur sportif — Écart dans le programme de courses",
        "templateLocalization.feed.sportsDirector.titles.programmeContinuity": "Avis du directeur sportif — Continuité du programme",
        "templateLocalization.feed.sportsDirector.titles.longProgrammeBreak": "Avis du directeur sportif — Longue pause dans le programme",
        "templateLocalization.feed.sportsDirector.titles.programmeEmpty": "Avis du directeur sportif — Programme vide",
        "templateLocalization.feed.sportsDirector.titles.startlistDeadlineAlert": "Avis du directeur sportif — Alerte d’échéance de la liste de départ",
        "templateLocalization.feed.sportsDirector.titles.stagePlansMissing": "Avis du directeur sportif — Plans d’étape manquants",
        "templateLocalization.feed.sportsDirector.titles.stagePlansIncomplete": "Avis du directeur sportif — Plans d’étape incomplets",
        "templateLocalization.feed.sportsDirector.titles.racePreparationMissing": "Avis du directeur sportif — Préparation de course manquante",
        "templateLocalization.feed.sportsDirector.titles.racePreparationReady": "Avis du directeur sportif — Préparation de course prête",
        "templateLocalization.feed.sportsDirector.stagePlansMissingMessage": "Il manque encore {{count}} plans d’étape pour {{raceName}}. L’étape {{stage}} a lieu aujourd’hui à {{time}} ({{date}}) et constitue le plan manquant le plus urgent.",
        "templateLocalization.feed.sportsDirector.raceProgrammeMessage": "Course actuelle : {{raceName}} ({{start}}–{{end}}). Prochaine course future acceptée : {{nextRace}}. {{count}} priorités de gestion doivent être examinées.",
        "templateLocalization.feed.sportsDirector.noneScheduled": "aucune n’est actuellement programmée",
        "templateLocalization.feed.sportsDirector.genericMessage": "Votre directeur sportif a préparé un nouvel avis sur le programme de courses. Ouvrez la notification pour consulter tous les détails.",
        "templateLocalization.feed.sportsDirector.reviewRecommendation": "Examinez le programme de courses actuel, le dossier de préparation, la liste de départ et l’état des plans d’étape.",
        "templateLocalization.feed.raceJerseysRemoval.title": "Équipe retirée de {{raceName}}",
        "templateLocalization.feed.raceJerseysRemoval.message": "{{teamName}} ne disposait pas d’assez de kits obligatoires de maillot de course pour l’étape {{stage}}. Requis : {{required}} ; disponibles : {{available}}. L’équipe a été retirée de l’étape {{stage}} et de toutes les étapes restantes de {{raceName}}. Les coureurs ne peuvent plus obtenir de classement ni marquer de points dans cette course.",
        "templateLocalization.feed.raceJerseysRemoval.genericMessage": "L’équipe a été retirée de {{raceName}} faute d’un nombre suffisant de kits obligatoires de maillot de course.",
    },
    "ru": {
        "templateLocalization.feed.sportsDirector.titles.raceProgramme": "Совет спортивного директора — Гоночная программа",
        "templateLocalization.feed.sportsDirector.titles.raceProgrammeGap": "Совет спортивного директора — Пробел в гоночной программе",
        "templateLocalization.feed.sportsDirector.titles.programmeContinuity": "Совет спортивного директора — Непрерывность программы",
        "templateLocalization.feed.sportsDirector.titles.longProgrammeBreak": "Совет спортивного директора — Длинный перерыв в программе",
        "templateLocalization.feed.sportsDirector.titles.programmeEmpty": "Совет спортивного директора — Пустая программа",
        "templateLocalization.feed.sportsDirector.titles.startlistDeadlineAlert": "Совет спортивного директора — Срок подачи стартового списка",
        "templateLocalization.feed.sportsDirector.titles.stagePlansMissing": "Совет спортивного директора — Отсутствуют планы этапов",
        "templateLocalization.feed.sportsDirector.titles.stagePlansIncomplete": "Совет спортивного директора — Планы этапов не завершены",
        "templateLocalization.feed.sportsDirector.titles.racePreparationMissing": "Совет спортивного директора — Нет подготовки к гонке",
        "templateLocalization.feed.sportsDirector.titles.racePreparationReady": "Совет спортивного директора — Подготовка к гонке завершена",
        "templateLocalization.feed.sportsDirector.stagePlansMissingMessage": "Для {{raceName}} всё ещё отсутствуют {{count}} планов этапов. Этап {{stage}} проходит сегодня в {{time}} ({{date}}) и является самым срочным из отсутствующих планов.",
        "templateLocalization.feed.sportsDirector.raceProgrammeMessage": "Текущая гонка: {{raceName}} ({{start}}–{{end}}). Следующая принятая будущая гонка: {{nextRace}}. Требуется проверить {{count}} приоритетов управления.",
        "templateLocalization.feed.sportsDirector.noneScheduled": "сейчас ничего не запланировано",
        "templateLocalization.feed.sportsDirector.genericMessage": "Ваш спортивный директор подготовил новый обзор гоночной программы. Откройте уведомление, чтобы просмотреть все подробности.",
        "templateLocalization.feed.sportsDirector.reviewRecommendation": "Проверьте текущую гоночную программу, пакет подготовки, стартовый список и состояние планов этапов.",
        "templateLocalization.feed.raceJerseysRemoval.title": "Команда снята с {{raceName}}",
        "templateLocalization.feed.raceJerseysRemoval.message": "У {{teamName}} не было достаточного количества обязательных комплектов гоночной формы для этапа {{stage}}. Требуется: {{required}}; доступно: {{available}}. Команда снята с этапа {{stage}} и всех оставшихся этапов {{raceName}}. Гонщики больше не могут занимать места или получать очки в этой гонке.",
        "templateLocalization.feed.raceJerseysRemoval.genericMessage": "Команда снята с {{raceName}}, потому что обязательных комплектов гоночной формы было недостаточно.",
    },
}

TERM_FIXES = {
    "de": {
        "reportVariants.stage_plans_missing": "Etappenpläne fehlen",
        "reportVariants.stage_plans_incomplete": "Etappenpläne unvollständig",
        "reportVariants.startlist_deadline_alert": "Fristwarnung für die Startliste",
        "sportDirector.startlist": "Startliste",
        "sportDirector.missingStagePlans": "Fehlende Etappenpläne",
        "sportDirector.incompleteStagePlans": "Unvollständige Etappenpläne",
        "sportDirector.missingPlans": "Fehlende oder unvollständige Etappenpläne",
    },
    "es": {
        "reportVariants.stage_plans_missing": "Faltan planes de etapa",
        "reportVariants.stage_plans_incomplete": "Planes de etapa incompletos",
        "reportVariants.startlist_deadline_alert": "Alerta de plazo de la lista de salida",
        "sportDirector.startlist": "Lista de salida",
        "sportDirector.missingStagePlans": "Planes de etapa pendientes",
        "sportDirector.incompleteStagePlans": "Planes de etapa incompletos",
        "sportDirector.missingPlans": "Planes de etapa pendientes o incompletos",
    },
    "it": {
        "reportVariants.stage_plans_missing": "Mancano i piani di tappa",
        "reportVariants.stage_plans_incomplete": "Piani di tappa incompleti",
        "reportVariants.startlist_deadline_alert": "Avviso scadenza lista di partenza",
        "sportDirector.startlist": "Lista di partenza",
        "sportDirector.missingStagePlans": "Piani di tappa mancanti",
        "sportDirector.incompleteStagePlans": "Piani di tappa incompleti",
        "sportDirector.missingPlans": "Piani di tappa mancanti o incompleti",
    },
    "fr": {
        "reportVariants.stage_plans_missing": "Plans d’étape manquants",
        "reportVariants.stage_plans_incomplete": "Plans d’étape incomplets",
        "reportVariants.startlist_deadline_alert": "Alerte d’échéance de la liste de départ",
        "sportDirector.startlist": "Liste de départ",
        "sportDirector.missingStagePlans": "Plans d’étape manquants",
        "sportDirector.incompleteStagePlans": "Plans d’étape incomplets",
        "sportDirector.missingPlans": "Plans d’étape manquants ou incomplets",
    },
    "ru": {
        "reportVariants.stage_plans_missing": "Отсутствуют планы этапов",
        "reportVariants.stage_plans_incomplete": "Планы этапов не завершены",
        "reportVariants.startlist_deadline_alert": "Предупреждение о сроке стартового списка",
        "sportDirector.startlist": "Стартовый список",
        "sportDirector.missingStagePlans": "Отсутствующие планы этапов",
        "sportDirector.incompleteStagePlans": "Незавершённые планы этапов",
        "sportDirector.missingPlans": "Отсутствующие или незавершённые планы этапов",
    },
}

for locale in LOCALES:
    path = ROOT / 'src' / 'i18n' / 'locales' / locale / 'notifications.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    for key, value in TRANSLATIONS[locale].items():
        set_path(data, key, value)
    for key, value in TERM_FIXES.get(locale, {}).items():
        set_path(data, key, value)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

loc_path = ROOT / 'src' / 'features' / 'notifications' / 'notificationLocalization.ts'
text = loc_path.read_text(encoding='utf-8')

anchor = "type EnglishResourceHit = { namespace: string; keyPath: string }\nlet englishResourceIndex: Map<string, EnglishResourceHit[]> | null = null\n"
replacement = """type EnglishResourceHit = { namespace: string; keyPath: string }\ntype EnglishTemplateResourceHit = {\n  namespace: string\n  keyPath: string\n  parameterNames: string[]\n  pattern: RegExp\n}\nlet englishResourceIndex: Map<string, EnglishResourceHit[]> | null = null\nlet englishTemplateResourceIndex: EnglishTemplateResourceHit[] | null = null\n"""
if anchor not in text:
    raise SystemExit('notificationLocalization.ts: resource index anchor not found')
text = text.replace(anchor, replacement, 1)

anchor = """function localizeExistingGamePhrase(value: string): string | null {\n  if (!shouldLocalizeNotifications() || !value.trim()) return null\n  const hits = getEnglishResourceIndex().get(normalizePhrase(value)) ?? []\n  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined\n  if (!languageData) return null\n\n  for (const hit of hits) {\n    const localized = readResourceString(languageData[hit.namespace], hit.keyPath)\n    if (localized && !localized.includes('{{')) return localized\n  }\n  return null\n}\n"""
replacement = anchor + """\nfunction escapeTemplateLiteral(value: string): string {\n  return value\n    .replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')\n    .replace(/\\s+/g, '\\\\s+')\n    .replace(/[–—-]/g, '[–—-]')\n}\n\nfunction getEnglishTemplateResourceIndex(): EnglishTemplateResourceHit[] {\n  if (englishTemplateResourceIndex) return englishTemplateResourceIndex\n\n  const hits: EnglishTemplateResourceHit[] = []\n  const englishData = i18n.getDataByLanguage('en') as Record<string, unknown> | undefined\n\n  const visit = (namespace: string, value: unknown, keyPath = ''): void => {\n    if (typeof value === 'string') {\n      if (!value.includes('{{')) return\n\n      const placeholderPattern = /{{\\s*([A-Za-z0-9_]+)\\s*}}/g\n      const parameterNames: string[] = []\n      let cursor = 0\n      let regexSource = '^'\n      let match: RegExpExecArray | null\n\n      while ((match = placeholderPattern.exec(value)) !== null) {\n        regexSource += escapeTemplateLiteral(value.slice(cursor, match.index))\n        regexSource += '(.+?)'\n        parameterNames.push(match[1])\n        cursor = match.index + match[0].length\n      }\n\n      regexSource += escapeTemplateLiteral(value.slice(cursor)) + '$'\n      hits.push({ namespace, keyPath, parameterNames, pattern: new RegExp(regexSource, 'i') })\n      return\n    }\n\n    if (!value || typeof value !== 'object' || Array.isArray(value)) return\n    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {\n      visit(namespace, child, keyPath ? `${keyPath}.${key}` : key)\n    })\n  }\n\n  if (englishData) {\n    Object.entries(englishData).forEach(([namespace, bundle]) => visit(namespace, bundle))\n  }\n\n  englishTemplateResourceIndex = hits\n  return hits\n}\n\nfunction localizeExistingGameTemplate(value: string): string | null {\n  if (!shouldLocalizeNotifications() || !value.trim()) return null\n\n  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined\n  if (!languageData) return null\n\n  for (const hit of getEnglishTemplateResourceIndex()) {\n    const localizedTemplate = readResourceString(languageData[hit.namespace], hit.keyPath)\n    if (!localizedTemplate) continue\n\n    const match = hit.pattern.exec(value.trim())\n    if (!match) continue\n\n    const params: Record<string, unknown> = {}\n    hit.parameterNames.forEach((name, index) => {\n      params[name] = match[index + 1]\n    })\n\n    const localized = String(i18n.t(hit.keyPath, {\n      ns: hit.namespace,\n      ...params,\n      defaultValue: '',\n    }))\n\n    if (localized && localized !== hit.keyPath) return localized\n  }\n\n  return null\n}\n"""
if anchor not in text:
    raise SystemExit('notificationLocalization.ts: phrase localizer anchor not found')
text = text.replace(anchor, replacement, 1)

old_looks = "return /\\b(the|your|you|has|have|is|are|was|were|will|can|could|should|joined|available|review|open|staff|rider|sponsor|race|stage|contract|offer|team|club|week|season|completed|required|selected|selection|transfer|warning|reward|results|report|new|for|from|with|without|this|that|as|to|of|and)\\b/.test(text)"
new_looks = "return /\\b(the|your|you|has|have|is|are|was|were|will|can|could|should|joined|available|review|open|staff|rider|sponsor|race|stage|contract|offer|team|club|week|season|completed|required|selected|selection|transfer|warning|reward|results|report|new|for|from|with|without|this|that|as|to|of|and|startlist|missed|missing|advisory|sports|director|programme|program|plans|current|next|accepted|future|priority|priorities|items|require|removed|enough|mandatory|jersey|kits|remaining|riders|score|place)\\b/.test(text)"
if old_looks not in text:
    raise SystemExit('notificationLocalization.ts: looksEnglish anchor not found')
text = text.replace(old_looks, new_looks, 1)

anchor = """  const cleanTitle = String(title ?? '').trim()\n  const cleanMessage = String(message ?? '').trim()\n\n  if (!shouldLocalizeNotifications()) {\n    return { title: cleanTitle, message: cleanMessage }\n  }\n"""
replacement = anchor + """\n  const resourceTitle =\n    localizeExistingGamePhrase(cleanTitle) || localizeExistingGameTemplate(cleanTitle)\n  let resourceMessage =\n    localizeExistingGamePhrase(cleanMessage) || localizeExistingGameTemplate(cleanMessage)\n\n  const raceProgrammeMatch = /^Current race:\\s*(.+?)\\s*\\((\\d{4}-\\d{2}-\\d{2})[–—-](\\d{4}-\\d{2}-\\d{2})\\)\\.\\s*Next accepted future race:\\s*(.+?)\\.\\s*(\\d+) management priority item\\(s\\) require review\\.?$/i.exec(cleanMessage)\n  if (raceProgrammeMatch) {\n    const nextRaceRaw = raceProgrammeMatch[4].trim()\n    const nextRace = /^none currently scheduled$/i.test(nextRaceRaw)\n      ? nt('templateLocalization.feed.sportsDirector.noneScheduled')\n      : nextRaceRaw\n    resourceMessage = nt('templateLocalization.feed.sportsDirector.raceProgrammeMessage', {\n      raceName: raceProgrammeMatch[1].trim(),\n      start: raceProgrammeMatch[2],\n      end: raceProgrammeMatch[3],\n      nextRace,\n      count: Number(raceProgrammeMatch[5]),\n    })\n  }\n\n  if (resourceTitle && resourceMessage) {\n    return { title: resourceTitle, message: resourceMessage }\n  }\n"""
if anchor not in text:
    raise SystemExit('notificationLocalization.ts: feed start anchor not found')
text = text.replace(anchor, replacement, 1)

old = """  if (options?.genericFallback !== false && (looksEnglish(cleanTitle) || looksEnglish(cleanMessage))) {\n    return {\n      title: looksEnglish(cleanTitle) ? nt('templateLocalization.feed.teamUpdateTitle') : cleanTitle,\n      message: looksEnglish(cleanMessage) ? nt('templateLocalization.feed.teamUpdateMessage') : cleanMessage,\n    }\n  }\n\n  return { title: cleanTitle, message: cleanMessage }\n"""
new = """  if (options?.genericFallback !== false && (looksEnglish(cleanTitle) || looksEnglish(cleanMessage))) {\n    return {\n      title: resourceTitle || (looksEnglish(cleanTitle) ? nt('templateLocalization.feed.teamUpdateTitle') : cleanTitle),\n      message: resourceMessage || (looksEnglish(cleanMessage) ? nt('templateLocalization.feed.teamUpdateMessage') : cleanMessage),\n    }\n  }\n\n  return {\n    title: resourceTitle || cleanTitle,\n    message: resourceMessage || cleanMessage,\n  }\n"""
if old not in text:
    raise SystemExit('notificationLocalization.ts: feed fallback anchor not found')
text = text.replace(old, new, 1)

old = """  const feedCopy = localizeNotificationFeedCopy(item.title, item.message, { genericFallback: false })\n  if (feedCopy.title !== String(item.title ?? '').trim() || feedCopy.message !== String(item.message ?? '').trim()) {\n    return { ...item, title: feedCopy.title, message: feedCopy.message }\n  }\n\n  if (typeCode === 'STAFF_HIRED') {\n"""
new = """  const feedCopy = localizeNotificationFeedCopy(item.title, item.message, { genericFallback: false })\n\n  if (typeCode === 'STAFF_HIRED') {\n"""
if old not in text:
    raise SystemExit('notificationLocalization.ts: feed early return anchor not found')
text = text.replace(old, new, 1)

old = """  // Unknown/legacy notification types must remain readable. If the type code\n  // cannot be localized from our template-word dictionary, keep the persisted\n  // backend title/message unchanged instead of inventing a misleading label.\n  const localizedType = localizeTypeCode(item.type_code)\n  if (typeCode && !localizedType) return item\n\n  // Preserve already-localized/non-English admin or backend copy. Otherwise do\n"""
new = """  // Unknown/legacy notification types must never leak hardcoded English into\n  // translated locales. Prefer a localized semantic/type/category fallback while\n  // preserving dynamic entity names from payload_json.\n  const localizedType = localizeTypeCode(item.type_code)\n\n  // Preserve already-localized/non-English admin or backend copy. Otherwise do\n"""
if old not in text:
    raise SystemExit('notificationLocalization.ts: unknown type anchor not found')
text = text.replace(old, new, 1)

old = """  const localizedTitle = item.title && !looksEnglish(item.title)\n    ? item.title\n    : semanticEntityTitle || semanticType || nt('templateLocalization.genericTitle', { topic })\n  const localizedMessage = item.message && !looksEnglish(item.message)\n    ? item.message\n    : semanticMessage || (entity\n      ? nt('templateLocalization.genericEntityMessage', { topic, entity })\n      : nt('templateLocalization.genericMessage', { topic }))\n"""
new = """  const localizedTitle = feedCopy.title && !looksEnglish(feedCopy.title)\n    ? feedCopy.title\n    : semanticEntityTitle || semanticType || nt('templateLocalization.genericTitle', { topic })\n  const localizedMessage = feedCopy.message && !looksEnglish(feedCopy.message)\n    ? feedCopy.message\n    : semanticMessage || (entity\n      ? nt('templateLocalization.genericEntityMessage', { topic, entity })\n      : nt('templateLocalization.genericMessage', { topic }))\n"""
if old not in text:
    raise SystemExit('notificationLocalization.ts: title/message fallback anchor not found')
text = text.replace(old, new, 1)

old = """  if (!looksEnglish(value)) return value\n  return nt('templateLocalization.moreDetails')\n}\n"""
new = """  const resourceLocalized =\n    localizeExistingGamePhrase(value) || localizeExistingGameTemplate(value)\n  if (resourceLocalized) return resourceLocalized\n\n  if (item) {\n    const localizedFeed = localizeNotificationFeedCopy(item.title, value, { genericFallback: false })\n    if (localizedFeed.message && localizedFeed.message !== value) {\n      return localizedFeed.message\n    }\n  }\n\n  if (!looksEnglish(value)) return value\n  return nt('templateLocalization.moreDetails')\n}\n"""
if old not in text:
    raise SystemExit('notificationLocalization.ts: narrative fallback anchor not found')
text = text.replace(old, new, 1)

old = """  const existingGamePhrase = localizeExistingGamePhrase(value)\n  if (existingGamePhrase) return existingGamePhrase\n"""
new = """  const existingGamePhrase =\n    localizeExistingGamePhrase(value) || localizeExistingGameTemplate(value)\n  if (existingGamePhrase) return existingGamePhrase\n"""
if old not in text:
    raise SystemExit('notificationLocalization.ts: value phrase anchor not found')
text = text.replace(old, new, 1)

loc_path.write_text(text, encoding='utf-8')

page_path = ROOT / 'src' / 'pages' / 'dashboard' / 'NotificationsPage.tsx'
page = page_path.read_text(encoding='utf-8')
old = "  const allActiveItems = activeTab === 'unread' ? unreadItems : readItems\n"
new = """  const allActiveItems = useMemo(\n    () => applyNotificationTemplates(activeTab === 'unread' ? unreadItems : readItems),\n    [activeTab, unreadItems, readItems, i18n.language, i18n.resolvedLanguage]\n  )\n"""
if old not in page:
    raise SystemExit('NotificationsPage.tsx: allActiveItems anchor not found')
page = page.replace(old, new, 1)
page_path.write_text(page, encoding='utf-8')

print('Notification localization fix applied to all 8 locales and runtime feed normalization.')
