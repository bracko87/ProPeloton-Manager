from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALE_ROOT = ROOT / "src/i18n/locales"
NOTIFICATION_LOCALIZATION = ROOT / "src/features/notifications/notificationLocalization.ts"
NOTIFICATION_TEMPLATES = ROOT / "src/features/notifications/notificationTemplates.tsx"

TRANSLATIONS = {
    "en": {
        "typeLabel": "Season start",
        "title": "Season {{season}}: early January race deadlines",
        "titleGeneric": "Early January race deadlines",
        "feedMessage": "Season {{season}} starts with a compressed January race calendar. For races starting Jan 1–{{earlyEndDay}}, applications open on Jan 1 and close {{earlyApplicationCloseDays}} {{earlyApplicationCloseUnit}} before the race; the team list is announced the same day. Rider/startlist submission stays open until {{earlyStartlistHours}} {{earlyStartlistHourUnit}} before Stage 1. From Jan {{lateStartDay}}, this special {{earlyStartlistHours}} {{earlyStartlistHourUnit}} startlist window no longer applies; January still uses compressed deadlines, and the standard schedule applies from February. Check Calendar and Race Detail frequently so you do not miss a deadline.",
        "feedMessageGeneric": "The season starts with a compressed January race calendar. Early-January application, team-list and startlist deadlines are tighter than normal. Check Calendar and Race Detail frequently so you do not miss a deadline.",
        "intro": "Season {{season}} begins with a compressed January race calendar. Early-season application and startlist deadlines are intentionally tighter than normal, so plan the first race block carefully.",
        "introGeneric": "The season begins with a compressed January race calendar. Early-season application and startlist deadlines are intentionally tighter than normal, so plan the first race block carefully.",
        "warning": "January is intentionally more compressed than the normal calendar. Check Calendar and Race Detail frequently during the opening race block so you do not miss an application, team-list or startlist deadline.",
        "labels": {
            "season": "Season",
            "applicationsEarly": "Applications · Jan 1–{{earlyEndDay}}",
            "teamListEarly": "Team list · Jan 1–{{earlyEndDay}}",
            "startlistEarly": "Startlist · Jan 1–{{earlyEndDay}}",
            "lateJanuary": "Jan {{lateStartDay}}–31",
            "fromFebruary": "From February"
        },
        "values": {
            "season": "Season {{season}}",
            "newSeason": "New season",
            "applicationsEarly": "Open Jan 1 · close {{days}} {{dayUnit}} before the race",
            "teamListEarly": "Announced {{days}} {{dayUnit}} before the race, when applications close",
            "startlistEarly": "Open until {{hours}} {{hourUnit}} before Stage 1",
            "lateJanuary": "Applications close {{appDays}} {{appDayUnit}} before · startlist closes {{startDays}} {{startDayUnit}} before",
            "standard": "Standard schedule: applications open {{openDays}} {{openDayUnit}} before, close {{closeDays}} {{closeDayUnit}} before · startlist closes {{startDays}} {{startDayUnit}} before"
        },
        "actions": {
            "calendar": "Season calendar",
            "overview": "Season overview"
        },
        "units": {
            "gameDay_one": "game day",
            "gameDay_other": "game days",
            "gameHour_one": "game hour",
            "gameHour_other": "game hours",
            "day_one": "day",
            "day_other": "days"
        }
    },
    "sr-Latn": {
        "typeLabel": "Početak sezone",
        "title": "Sezona {{season}}: rokovi za trke početkom januara",
        "titleGeneric": "Rokovi za trke početkom januara",
        "feedMessage": "Sezona {{season}} počinje sa sažetim januarskim kalendarom trka. Za trke koje počinju od 1. do {{earlyEndDay}}. januara, prijave se otvaraju 1. januara i zatvaraju {{earlyApplicationCloseDays}} {{earlyApplicationCloseUnit}} pre trke; spisak timova se objavljuje istog dana. Prijava vozača/startne liste ostaje otvorena do {{earlyStartlistHours}} {{earlyStartlistHourUnit}} pre 1. etape. Od {{lateStartDay}}. januara više ne važi posebno pravilo koje dopušta predaju startne liste do {{earlyStartlistHours}} {{earlyStartlistHourUnit}} pre etape; u januaru i dalje važe skraćeni rokovi, a od februara se primenjuje standardni raspored. Redovno proveravajte Kalendar i Detalje trke kako ne biste propustili rok.",
        "feedMessageGeneric": "Sezona počinje sa sažetim januarskim kalendarom trka. Rokovi za prijavu, spisak timova i startnu listu početkom januara kraći su nego inače. Redovno proveravajte Kalendar i Detalje trke kako ne biste propustili rok.",
        "intro": "Sezona {{season}} počinje sa sažetim januarskim kalendarom trka. Rokovi za prijavu i startnu listu na početku sezone namerno su kraći nego inače, zato pažljivo isplanirajte prvi blok trka.",
        "introGeneric": "Sezona počinje sa sažetim januarskim kalendarom trka. Rokovi za prijavu i startnu listu na početku sezone namerno su kraći nego inače, zato pažljivo isplanirajte prvi blok trka.",
        "warning": "Januarski raspored je namerno sažetiji od uobičajenog kalendara. Tokom prvog bloka trka često proveravajte Kalendar i Detalje trke kako ne biste propustili rok za prijavu, spisak timova ili startnu listu.",
        "labels": {
            "season": "Sezona",
            "applicationsEarly": "Prijave · 1–{{earlyEndDay}}. januara",
            "teamListEarly": "Spisak timova · 1–{{earlyEndDay}}. januara",
            "startlistEarly": "Startna lista · 1–{{earlyEndDay}}. januara",
            "lateJanuary": "{{lateStartDay}}–31. januara",
            "fromFebruary": "Od februara"
        },
        "values": {
            "season": "Sezona {{season}}",
            "newSeason": "Nova sezona",
            "applicationsEarly": "Otvaraju se 1. januara · zatvaraju se {{days}} {{dayUnit}} pre trke",
            "teamListEarly": "Objavljuje se {{days}} {{dayUnit}} pre trke, kada se prijave zatvore",
            "startlistEarly": "Otvorena do {{hours}} {{hourUnit}} pre 1. etape",
            "lateJanuary": "Prijave se zatvaraju {{appDays}} {{appDayUnit}} pre trke · startna lista se zatvara {{startDays}} {{startDayUnit}} pre trke",
            "standard": "Standardni raspored: prijave se otvaraju {{openDays}} {{openDayUnit}} pre trke, zatvaraju {{closeDays}} {{closeDayUnit}} pre trke · startna lista se zatvara {{startDays}} {{startDayUnit}} pre trke"
        },
        "actions": {
            "calendar": "Kalendar sezone",
            "overview": "Pregled sezone"
        },
        "units": {
            "gameDay_one": "dan u igri",
            "gameDay_few": "dana u igri",
            "gameDay_other": "dana u igri",
            "gameHour_one": "sat u igri",
            "gameHour_few": "sata u igri",
            "gameHour_other": "sati u igri",
            "day_one": "dan",
            "day_few": "dana",
            "day_other": "dana"
        }
    },
    "de": {
        "typeLabel": "Saisonstart",
        "title": "Saison {{season}}: Rennfristen Anfang Januar",
        "titleGeneric": "Rennfristen Anfang Januar",
        "feedMessage": "Saison {{season}} beginnt mit einem komprimierten Rennkalender im Januar. Für Rennen mit Start vom 1. bis {{earlyEndDay}}. Januar öffnen die Anmeldungen am 1. Januar und schließen {{earlyApplicationCloseDays}} {{earlyApplicationCloseUnit}} vor dem Rennen; die Teamliste wird am selben Tag bekannt gegeben. Die Fahrer-/Startlistenmeldung bleibt bis {{earlyStartlistHours}} {{earlyStartlistHourUnit}} vor Etappe 1 geöffnet. Ab dem {{lateStartDay}}. Januar entfällt diese Sonderregel mit {{earlyStartlistHours}} {{earlyStartlistHourUnit}} vor Etappe 1; im Januar gelten weiterhin verkürzte Fristen, ab Februar der Standardzeitplan. Prüfe Kalender und Renndetails regelmäßig, damit du keine Frist verpasst.",
        "feedMessageGeneric": "Die Saison beginnt mit einem komprimierten Rennkalender im Januar. Die Fristen für Anmeldung, Teamliste und Startliste sind Anfang Januar kürzer als üblich. Prüfe Kalender und Renndetails regelmäßig, damit du keine Frist verpasst.",
        "intro": "Saison {{season}} beginnt mit einem komprimierten Rennkalender im Januar. Die Anmelde- und Startlistenfristen zu Saisonbeginn sind bewusst kürzer als üblich. Plane daher den ersten Rennblock sorgfältig.",
        "introGeneric": "Die Saison beginnt mit einem komprimierten Rennkalender im Januar. Die Anmelde- und Startlistenfristen zu Saisonbeginn sind bewusst kürzer als üblich. Plane daher den ersten Rennblock sorgfältig.",
        "warning": "Der Januar ist bewusst stärker komprimiert als der normale Kalender. Prüfe während des ersten Rennblocks regelmäßig Kalender und Renndetails, damit du keine Anmelde-, Teamlisten- oder Startlistenfrist verpasst.",
        "labels": {
            "season": "Saison",
            "applicationsEarly": "Anmeldungen · 1.–{{earlyEndDay}}. Januar",
            "teamListEarly": "Teamliste · 1.–{{earlyEndDay}}. Januar",
            "startlistEarly": "Startliste · 1.–{{earlyEndDay}}. Januar",
            "lateJanuary": "{{lateStartDay}}.–31. Januar",
            "fromFebruary": "Ab Februar"
        },
        "values": {
            "season": "Saison {{season}}",
            "newSeason": "Neue Saison",
            "applicationsEarly": "Öffnen am 1. Januar · schließen {{days}} {{dayUnit}} vor dem Rennen",
            "teamListEarly": "Wird {{days}} {{dayUnit}} vor dem Rennen bekannt gegeben, wenn die Anmeldung schließt",
            "startlistEarly": "Geöffnet bis {{hours}} {{hourUnit}} vor Etappe 1",
            "lateJanuary": "Anmeldeschluss {{appDays}} {{appDayUnit}} vorher · Startlistenschluss {{startDays}} {{startDayUnit}} vorher",
            "standard": "Standardzeitplan: Anmeldung öffnet {{openDays}} {{openDayUnit}} vorher, schließt {{closeDays}} {{closeDayUnit}} vorher · Startlistenschluss {{startDays}} {{startDayUnit}} vorher"
        },
        "actions": {
            "calendar": "Saisonkalender",
            "overview": "Saisonübersicht"
        },
        "units": {
            "gameDay_one": "Spieltag",
            "gameDay_other": "Spieltage",
            "gameHour_one": "Spielstunde",
            "gameHour_other": "Spielstunden",
            "day_one": "Tag",
            "day_other": "Tage"
        }
    },
    "hr": {
        "typeLabel": "Početak sezone",
        "title": "Sezona {{season}}: rokovi za utrke početkom siječnja",
        "titleGeneric": "Rokovi za utrke početkom siječnja",
        "feedMessage": "Sezona {{season}} počinje sa sažetim siječanjskim kalendarom utrka. Za utrke koje počinju od 1. do {{earlyEndDay}}. siječnja, prijave se otvaraju 1. siječnja i zatvaraju {{earlyApplicationCloseDays}} {{earlyApplicationCloseUnit}} prije utrke; popis momčadi objavljuje se istog dana. Predaja vozača/startne liste ostaje otvorena do {{earlyStartlistHours}} {{earlyStartlistHourUnit}} prije 1. etape. Od {{lateStartDay}}. siječnja više ne vrijedi posebno pravilo koje dopušta predaju startne liste do {{earlyStartlistHours}} {{earlyStartlistHourUnit}} prije etape; u siječnju i dalje vrijede skraćeni rokovi, a od veljače vrijedi standardni raspored. Često provjeravajte Kalendar i Detalje utrke kako ne biste propustili rok.",
        "feedMessageGeneric": "Sezona počinje sa sažetim siječanjskim kalendarom utrka. Rokovi za prijave, popis momčadi i startnu listu početkom siječnja kraći su nego inače. Često provjeravajte Kalendar i Detalje utrke kako ne biste propustili rok.",
        "intro": "Sezona {{season}} počinje sa sažetim siječanjskim kalendarom utrka. Rokovi za prijave i startne liste na početku sezone namjerno su kraći nego inače, stoga pažljivo planirajte prvi blok utrka.",
        "introGeneric": "Sezona počinje sa sažetim siječanjskim kalendarom utrka. Rokovi za prijave i startne liste na početku sezone namjerno su kraći nego inače, stoga pažljivo planirajte prvi blok utrka.",
        "warning": "Siječanjski raspored namjerno je sažetiji od uobičajenog kalendara. Tijekom prvog bloka utrka često provjeravajte Kalendar i Detalje utrke kako ne biste propustili rok za prijavu, popis momčadi ili startnu listu.",
        "labels": {
            "season": "Sezona",
            "applicationsEarly": "Prijave · 1–{{earlyEndDay}}. siječnja",
            "teamListEarly": "Popis momčadi · 1–{{earlyEndDay}}. siječnja",
            "startlistEarly": "Startna lista · 1–{{earlyEndDay}}. siječnja",
            "lateJanuary": "{{lateStartDay}}–31. siječnja",
            "fromFebruary": "Od veljače"
        },
        "values": {
            "season": "Sezona {{season}}",
            "newSeason": "Nova sezona",
            "applicationsEarly": "Otvaraju se 1. siječnja · zatvaraju se {{days}} {{dayUnit}} prije utrke",
            "teamListEarly": "Objavljuje se {{days}} {{dayUnit}} prije utrke, kada se prijave zatvore",
            "startlistEarly": "Otvorena do {{hours}} {{hourUnit}} prije 1. etape",
            "lateJanuary": "Prijave se zatvaraju {{appDays}} {{appDayUnit}} prije utrke · startna lista se zatvara {{startDays}} {{startDayUnit}} prije utrke",
            "standard": "Standardni raspored: prijave se otvaraju {{openDays}} {{openDayUnit}} prije utrke, zatvaraju {{closeDays}} {{closeDayUnit}} prije utrke · startna lista se zatvara {{startDays}} {{startDayUnit}} prije utrke"
        },
        "actions": {
            "calendar": "Kalendar sezone",
            "overview": "Pregled sezone"
        },
        "units": {
            "gameDay_one": "dan u igri",
            "gameDay_few": "dana u igri",
            "gameDay_other": "dana u igri",
            "gameHour_one": "sat u igri",
            "gameHour_few": "sata u igri",
            "gameHour_other": "sati u igri",
            "day_one": "dan",
            "day_few": "dana",
            "day_other": "dana"
        }
    },
    "es": {
        "typeLabel": "Inicio de temporada",
        "title": "Temporada {{season}}: plazos de carrera de principios de enero",
        "titleGeneric": "Plazos de carrera de principios de enero",
        "feedMessage": "La temporada {{season}} comienza con un calendario de carreras de enero más comprimido. Para las carreras que empiezan del 1 al {{earlyEndDay}} de enero, las inscripciones se abren el 1 de enero y se cierran {{earlyApplicationCloseDays}} {{earlyApplicationCloseUnit}} antes de la carrera; la lista de equipos se anuncia ese mismo día. La inscripción de corredores/lista de salida permanece abierta hasta {{earlyStartlistHours}} {{earlyStartlistHourUnit}} antes de la Etapa 1. A partir del {{lateStartDay}} de enero deja de aplicarse esta regla especial que permite presentar la lista de salida hasta {{earlyStartlistHours}} {{earlyStartlistHourUnit}} antes de la etapa; enero sigue usando plazos reducidos y el calendario estándar se aplica desde febrero. Consulta con frecuencia el Calendario y los Detalles de la carrera para no perder ningún plazo.",
        "feedMessageGeneric": "La temporada comienza con un calendario de carreras de enero más comprimido. Los plazos de inscripción, lista de equipos y lista de salida de principios de enero son más cortos de lo normal. Consulta con frecuencia el Calendario y los Detalles de la carrera para no perder ningún plazo.",
        "intro": "La temporada {{season}} comienza con un calendario de carreras de enero más comprimido. Los plazos de inscripción y de lista de salida al inicio de la temporada son intencionadamente más cortos de lo normal, así que planifica con cuidado el primer bloque de carreras.",
        "introGeneric": "La temporada comienza con un calendario de carreras de enero más comprimido. Los plazos de inscripción y de lista de salida al inicio de la temporada son intencionadamente más cortos de lo normal, así que planifica con cuidado el primer bloque de carreras.",
        "warning": "Enero está intencionadamente más comprimido que el calendario normal. Consulta con frecuencia el Calendario y los Detalles de la carrera durante el primer bloque de carreras para no perder un plazo de inscripción, lista de equipos o lista de salida.",
        "labels": {
            "season": "Temporada",
            "applicationsEarly": "Inscripciones · 1–{{earlyEndDay}} de enero",
            "teamListEarly": "Lista de equipos · 1–{{earlyEndDay}} de enero",
            "startlistEarly": "Lista de salida · 1–{{earlyEndDay}} de enero",
            "lateJanuary": "{{lateStartDay}}–31 de enero",
            "fromFebruary": "Desde febrero"
        },
        "values": {
            "season": "Temporada {{season}}",
            "newSeason": "Nueva temporada",
            "applicationsEarly": "Abren el 1 de enero · cierran {{days}} {{dayUnit}} antes de la carrera",
            "teamListEarly": "Se anuncia {{days}} {{dayUnit}} antes de la carrera, cuando cierran las inscripciones",
            "startlistEarly": "Abierta hasta {{hours}} {{hourUnit}} antes de la Etapa 1",
            "lateJanuary": "Las inscripciones cierran {{appDays}} {{appDayUnit}} antes · la lista de salida cierra {{startDays}} {{startDayUnit}} antes",
            "standard": "Calendario estándar: las inscripciones abren {{openDays}} {{openDayUnit}} antes, cierran {{closeDays}} {{closeDayUnit}} antes · la lista de salida cierra {{startDays}} {{startDayUnit}} antes"
        },
        "actions": {
            "calendar": "Calendario de temporada",
            "overview": "Resumen de temporada"
        },
        "units": {
            "gameDay_one": "día de juego",
            "gameDay_other": "días de juego",
            "gameHour_one": "hora de juego",
            "gameHour_other": "horas de juego",
            "day_one": "día",
            "day_other": "días"
        }
    },
    "it": {
        "typeLabel": "Inizio stagione",
        "title": "Stagione {{season}}: scadenze gare di inizio gennaio",
        "titleGeneric": "Scadenze gare di inizio gennaio",
        "feedMessage": "La stagione {{season}} inizia con un calendario gare di gennaio più compresso. Per le gare che iniziano dal 1° al {{earlyEndDay}} gennaio, le iscrizioni aprono il 1° gennaio e chiudono {{earlyApplicationCloseDays}} {{earlyApplicationCloseUnit}} prima della gara; l'elenco delle squadre viene annunciato lo stesso giorno. L'invio dei corridori/della lista di partenza resta aperto fino a {{earlyStartlistHours}} {{earlyStartlistHourUnit}} prima della Tappa 1. Dal {{lateStartDay}} gennaio non si applica più la regola speciale che permette di inviare la lista di partenza fino a {{earlyStartlistHours}} {{earlyStartlistHourUnit}} prima della tappa; gennaio mantiene comunque scadenze ridotte e da febbraio si applica il calendario standard. Controlla spesso Calendario e Dettagli gara per non perdere nessuna scadenza.",
        "feedMessageGeneric": "La stagione inizia con un calendario gare di gennaio più compresso. Le scadenze per iscrizioni, elenco squadre e lista di partenza a inizio gennaio sono più brevi del normale. Controlla spesso Calendario e Dettagli gara per non perdere nessuna scadenza.",
        "intro": "La stagione {{season}} inizia con un calendario gare di gennaio più compresso. Le scadenze per iscrizioni e lista di partenza a inizio stagione sono volutamente più brevi del normale, quindi pianifica con attenzione il primo blocco di gare.",
        "introGeneric": "La stagione inizia con un calendario gare di gennaio più compresso. Le scadenze per iscrizioni e lista di partenza a inizio stagione sono volutamente più brevi del normale, quindi pianifica con attenzione il primo blocco di gare.",
        "warning": "Gennaio è volutamente più compresso rispetto al calendario normale. Durante il primo blocco di gare controlla spesso Calendario e Dettagli gara per non perdere una scadenza di iscrizione, elenco squadre o lista di partenza.",
        "labels": {
            "season": "Stagione",
            "applicationsEarly": "Iscrizioni · 1–{{earlyEndDay}} gennaio",
            "teamListEarly": "Elenco squadre · 1–{{earlyEndDay}} gennaio",
            "startlistEarly": "Lista di partenza · 1–{{earlyEndDay}} gennaio",
            "lateJanuary": "{{lateStartDay}}–31 gennaio",
            "fromFebruary": "Da febbraio"
        },
        "values": {
            "season": "Stagione {{season}}",
            "newSeason": "Nuova stagione",
            "applicationsEarly": "Apertura 1° gennaio · chiusura {{days}} {{dayUnit}} prima della gara",
            "teamListEarly": "Annunciato {{days}} {{dayUnit}} prima della gara, alla chiusura delle iscrizioni",
            "startlistEarly": "Aperta fino a {{hours}} {{hourUnit}} prima della Tappa 1",
            "lateJanuary": "Iscrizioni chiuse {{appDays}} {{appDayUnit}} prima · lista di partenza chiusa {{startDays}} {{startDayUnit}} prima",
            "standard": "Calendario standard: iscrizioni aperte {{openDays}} {{openDayUnit}} prima, chiuse {{closeDays}} {{closeDayUnit}} prima · lista di partenza chiusa {{startDays}} {{startDayUnit}} prima"
        },
        "actions": {
            "calendar": "Calendario stagione",
            "overview": "Panoramica stagione"
        },
        "units": {
            "gameDay_one": "giorno di gioco",
            "gameDay_other": "giorni di gioco",
            "gameHour_one": "ora di gioco",
            "gameHour_other": "ore di gioco",
            "day_one": "giorno",
            "day_other": "giorni"
        }
    },
    "fr": {
        "typeLabel": "Début de saison",
        "title": "Saison {{season}} : échéances des courses de début janvier",
        "titleGeneric": "Échéances des courses de début janvier",
        "feedMessage": "La saison {{season}} commence avec un calendrier de courses de janvier plus resserré. Pour les courses débutant du 1er au {{earlyEndDay}} janvier, les inscriptions ouvrent le 1er janvier et ferment {{earlyApplicationCloseDays}} {{earlyApplicationCloseUnit}} avant la course ; la liste des équipes est annoncée le même jour. La soumission des coureurs/de la liste de départ reste ouverte jusqu’à {{earlyStartlistHours}} {{earlyStartlistHourUnit}} avant l’étape 1. À partir du {{lateStartDay}} janvier, la règle spéciale permettant de soumettre la liste de départ jusqu’à {{earlyStartlistHours}} {{earlyStartlistHourUnit}} avant l’étape ne s’applique plus ; janvier conserve des délais raccourcis et le calendrier standard s’applique à partir de février. Consulte régulièrement le Calendrier et les Détails de la course pour ne manquer aucune échéance.",
        "feedMessageGeneric": "La saison commence avec un calendrier de courses de janvier plus resserré. Les délais d’inscription, de liste des équipes et de liste de départ de début janvier sont plus courts que d’habitude. Consulte régulièrement le Calendrier et les Détails de la course pour ne manquer aucune échéance.",
        "intro": "La saison {{season}} commence avec un calendrier de courses de janvier plus resserré. Les délais d’inscription et de liste de départ en début de saison sont volontairement plus courts que d’habitude ; planifie donc soigneusement le premier bloc de courses.",
        "introGeneric": "La saison commence avec un calendrier de courses de janvier plus resserré. Les délais d’inscription et de liste de départ en début de saison sont volontairement plus courts que d’habitude ; planifie donc soigneusement le premier bloc de courses.",
        "warning": "Le calendrier de janvier est volontairement plus resserré que le calendrier normal. Pendant le premier bloc de courses, consulte régulièrement le Calendrier et les Détails de la course afin de ne manquer aucune échéance d’inscription, de liste des équipes ou de liste de départ.",
        "labels": {
            "season": "Saison",
            "applicationsEarly": "Inscriptions · 1er–{{earlyEndDay}} janvier",
            "teamListEarly": "Liste des équipes · 1er–{{earlyEndDay}} janvier",
            "startlistEarly": "Liste de départ · 1er–{{earlyEndDay}} janvier",
            "lateJanuary": "{{lateStartDay}}–31 janvier",
            "fromFebruary": "À partir de février"
        },
        "values": {
            "season": "Saison {{season}}",
            "newSeason": "Nouvelle saison",
            "applicationsEarly": "Ouverture le 1er janvier · fermeture {{days}} {{dayUnit}} avant la course",
            "teamListEarly": "Annoncée {{days}} {{dayUnit}} avant la course, à la fermeture des inscriptions",
            "startlistEarly": "Ouverte jusqu’à {{hours}} {{hourUnit}} avant l’étape 1",
            "lateJanuary": "Inscriptions closes {{appDays}} {{appDayUnit}} avant · liste de départ close {{startDays}} {{startDayUnit}} avant",
            "standard": "Calendrier standard : inscriptions ouvertes {{openDays}} {{openDayUnit}} avant, closes {{closeDays}} {{closeDayUnit}} avant · liste de départ close {{startDays}} {{startDayUnit}} avant"
        },
        "actions": {
            "calendar": "Calendrier de la saison",
            "overview": "Vue d’ensemble de la saison"
        },
        "units": {
            "gameDay_one": "jour de jeu",
            "gameDay_other": "jours de jeu",
            "gameHour_one": "heure de jeu",
            "gameHour_other": "heures de jeu",
            "day_one": "jour",
            "day_other": "jours"
        }
    },
    "ru": {
        "typeLabel": "Начало сезона",
        "title": "Сезон {{season}}: сроки гонок в начале января",
        "titleGeneric": "Сроки гонок в начале января",
        "feedMessage": "Сезон {{season}} начинается с более плотного январского календаря гонок. Для гонок, стартующих с 1 по {{earlyEndDay}} января, заявки открываются 1 января и закрываются за {{earlyApplicationCloseDays}} {{earlyApplicationCloseUnit}} до гонки; список команд публикуется в тот же день. Подача состава/старт-листа остаётся открытой до {{earlyStartlistHours}} {{earlyStartlistHourUnit}} до этапа 1. С {{lateStartDay}} января это особое правило, позволяющее подавать старт-лист до {{earlyStartlistHours}} {{earlyStartlistHourUnit}} до этапа, больше не действует; в январе по-прежнему используются сокращённые сроки, а с февраля действует стандартный график. Регулярно проверяйте Календарь и Детали гонки, чтобы не пропустить срок.",
        "feedMessageGeneric": "Сезон начинается с более плотного январского календаря гонок. Сроки подачи заявок, публикации списка команд и старт-листа в начале января короче обычных. Регулярно проверяйте Календарь и Детали гонки, чтобы не пропустить срок.",
        "intro": "Сезон {{season}} начинается с более плотного январского календаря гонок. Сроки подачи заявок и старт-листов в начале сезона намеренно короче обычных, поэтому тщательно спланируйте первый блок гонок.",
        "introGeneric": "Сезон начинается с более плотного январского календаря гонок. Сроки подачи заявок и старт-листов в начале сезона намеренно короче обычных, поэтому тщательно спланируйте первый блок гонок.",
        "warning": "Январский календарь намеренно плотнее обычного. Во время первого блока гонок регулярно проверяйте Календарь и Детали гонки, чтобы не пропустить срок подачи заявки, публикации списка команд или старт-листа.",
        "labels": {
            "season": "Сезон",
            "applicationsEarly": "Заявки · 1–{{earlyEndDay}} января",
            "teamListEarly": "Список команд · 1–{{earlyEndDay}} января",
            "startlistEarly": "Старт-лист · 1–{{earlyEndDay}} января",
            "lateJanuary": "{{lateStartDay}}–31 января",
            "fromFebruary": "С февраля"
        },
        "values": {
            "season": "Сезон {{season}}",
            "newSeason": "Новый сезон",
            "applicationsEarly": "Открываются 1 января · закрываются за {{days}} {{dayUnit}} до гонки",
            "teamListEarly": "Публикуется за {{days}} {{dayUnit}} до гонки, когда закрываются заявки",
            "startlistEarly": "Открыт до {{hours}} {{hourUnit}} до этапа 1",
            "lateJanuary": "Заявки закрываются за {{appDays}} {{appDayUnit}} до гонки · старт-лист закрывается за {{startDays}} {{startDayUnit}} до гонки",
            "standard": "Стандартный график: заявки открываются за {{openDays}} {{openDayUnit}}, закрываются за {{closeDays}} {{closeDayUnit}} · старт-лист закрывается за {{startDays}} {{startDayUnit}} до гонки"
        },
        "actions": {
            "calendar": "Календарь сезона",
            "overview": "Обзор сезона"
        },
        "units": {
            "gameDay_one": "игровой день",
            "gameDay_few": "игровых дня",
            "gameDay_many": "игровых дней",
            "gameDay_other": "игровых дней",
            "gameHour_one": "игровой час",
            "gameHour_few": "игровых часа",
            "gameHour_many": "игровых часов",
            "gameHour_other": "игровых часов",
            "day_one": "день",
            "day_few": "дня",
            "day_many": "дней",
            "day_other": "дней"
        }
    }
}

TS_HELPERS = r"""
type SeasonStartedContext = {
  season: number | null
  earlyEndDay: number
  lateStartDay: number
  earlyApplicationCloseDays: number
  earlyTeamListDays: number
  earlyStartlistHours: number
  lateJanuaryApplicationCloseDays: number
  lateJanuaryStartlistDays: number
  standardApplicationOpenDays: number
  standardApplicationCloseDays: number
  standardStartlistDays: number
}

function getSeasonStartedContext(item: NotificationItem): SeasonStartedContext {
  const payload = payloadOf(item)
  const earlyEndDay = readNumber(payload, ['early_january_end_day']) ?? 15

  return {
    season: readNumber(payload, ['season_number', 'season', 'target_season', 'new_season_number', 'current_season']),
    earlyEndDay,
    lateStartDay: earlyEndDay + 1,
    earlyApplicationCloseDays:
      readNumber(payload, ['early_january_applications_close_days_before']) ?? 1,
    earlyTeamListDays:
      readNumber(payload, ['early_january_team_list_days_before']) ?? 1,
    earlyStartlistHours:
      readNumber(payload, ['early_january_startlist_hours_before_stage1']) ?? 3,
    lateJanuaryApplicationCloseDays:
      readNumber(payload, ['january_late_applications_close_days_before']) ?? 7,
    lateJanuaryStartlistDays:
      readNumber(payload, ['january_late_startlist_days_before']) ?? 3,
    standardApplicationOpenDays:
      readNumber(payload, ['standard_applications_open_days_before']) ?? 60,
    standardApplicationCloseDays:
      readNumber(payload, ['standard_applications_close_days_before']) ?? 30,
    standardStartlistDays:
      readNumber(payload, ['standard_startlist_days_before']) ?? 3,
  }
}

function seasonStartedUnit(
  unit: 'gameDay' | 'gameHour' | 'day',
  count: number
): string {
  return nt(`seasonStarted.units.${unit}`, { count })
}

function getSeasonStartedTranslationParams(item: NotificationItem): Record<string, unknown> {
  const context = getSeasonStartedContext(item)
  return {
    ...context,
    earlyApplicationCloseUnit: seasonStartedUnit('gameDay', context.earlyApplicationCloseDays),
    earlyTeamListUnit: seasonStartedUnit('gameDay', context.earlyTeamListDays),
    earlyStartlistHourUnit: seasonStartedUnit('gameHour', context.earlyStartlistHours),
    lateJanuaryApplicationCloseUnit: seasonStartedUnit('day', context.lateJanuaryApplicationCloseDays),
    lateJanuaryStartlistUnit: seasonStartedUnit('day', context.lateJanuaryStartlistDays),
    standardApplicationOpenUnit: seasonStartedUnit('day', context.standardApplicationOpenDays),
    standardApplicationCloseUnit: seasonStartedUnit('day', context.standardApplicationCloseDays),
    standardStartlistUnit: seasonStartedUnit('day', context.standardStartlistDays),
  }
}
""".strip()


def indented_json_block(key: str, value: dict) -> str:
    body = json.dumps(value, ensure_ascii=False, indent=2)
    body = body.replace("\n", "\n  ")
    return f'  "{key}": {body},'


def ensure_locale_block(path: Path, block: dict) -> None:
    text = path.read_text(encoding="utf-8")
    if '"seasonStarted": {' in text:
        return
    marker = '\n  "templateValues": {'
    if marker not in text:
        raise RuntimeError(f"Could not find templateValues marker in {path}")
    text = text.replace(marker, "\n" + indented_json_block("seasonStarted", block) + marker, 1)
    path.write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_localization_ts() -> None:
    text = NOTIFICATION_LOCALIZATION.read_text(encoding="utf-8")

    helper_marker = "type EnglishResourceHit = { namespace: string; keyPath: string }"
    if "type SeasonStartedContext =" not in text:
        if helper_marker not in text:
            raise RuntimeError("Could not find helper insertion marker")
        text = text.replace(helper_marker, TS_HELPERS + "\n\n" + helper_marker, 1)

    old = """function localizeSemanticTypeCode(typeCode: string | null | undefined): string | null {
  if (!typeCode || !shouldLocalizeNotifications()) return null
  const code = String(typeCode).toUpperCase()
  const key = `semanticTypeTitles.${code}`"""
    new = """function localizeSemanticTypeCode(typeCode: string | null | undefined): string | null {
  if (!typeCode || !shouldLocalizeNotifications()) return null
  const code = String(typeCode).toUpperCase()
  if (code === 'SEASON_STARTED') return nt('seasonStarted.typeLabel')
  const key = `semanticTypeTitles.${code}`"""
    text = replace_once(text, old, new, "semantic type")

    old = """  const payload = payloadOf(item)
  const typeCode = String(item.type_code ?? '').toUpperCase()
  const entity = getPrimaryEntity(item)

  const feedCopy = localizeNotificationFeedCopy(item.title, item.message, { genericFallback: false })"""
    new = """  const payload = payloadOf(item)
  const typeCode = String(item.type_code ?? '').toUpperCase()
  const entity = getPrimaryEntity(item)

  if (typeCode === 'SEASON_STARTED') {
    const context = getSeasonStartedContext(item)
    const params = getSeasonStartedTranslationParams(item)
    return {
      ...item,
      title: context.season !== null
        ? nt('seasonStarted.title', params)
        : nt('seasonStarted.titleGeneric', params),
      message: context.season !== null
        ? nt('seasonStarted.feedMessage', params)
        : nt('seasonStarted.feedMessageGeneric', params),
    }
  }

  const feedCopy = localizeNotificationFeedCopy(item.title, item.message, { genericFallback: false })"""
    text = replace_once(text, old, new, "item localization")

    old = """  const value = text.trim()
  const payload = item ? payloadOf(item) : {}
  const typeCode = String(item?.type_code ?? '').toUpperCase()

  if (typeCode === 'STAFF_HIRED') {"""
    new = """  const value = text.trim()
  const payload = item ? payloadOf(item) : {}
  const typeCode = String(item?.type_code ?? '').toUpperCase()

  if (typeCode === 'SEASON_STARTED' && item) {
    const context = getSeasonStartedContext(item)
    const params = getSeasonStartedTranslationParams(item)

    if (/January is intentionally more compressed/i.test(value)) {
      return nt('seasonStarted.warning', params)
    }

    if (/begins with a compressed January race calendar/i.test(value)) {
      return context.season !== null
        ? nt('seasonStarted.intro', params)
        : nt('seasonStarted.introGeneric', params)
    }

    if (/starts with a compressed January race calendar/i.test(value)) {
      return context.season !== null
        ? nt('seasonStarted.feedMessage', params)
        : nt('seasonStarted.feedMessageGeneric', params)
    }
  }

  if (typeCode === 'STAFF_HIRED') {"""
    text = replace_once(text, old, new, "narrative localization")

    old = """export function localizeNotificationDetailLabel(label: string): string {
  if (!shouldLocalizeNotifications()) return label"""
    new = """export function localizeNotificationDetailLabel(
  label: string,
  item?: NotificationItem
): string {
  if (!shouldLocalizeNotifications()) return label

  if (String(item?.type_code ?? '').toUpperCase() === 'SEASON_STARTED' && item) {
    const context = getSeasonStartedContext(item)
    const normalizedLabel = label.trim()

    if (/^Season$/i.test(normalizedLabel)) return nt('seasonStarted.labels.season')
    if (/^Applications\\s*·\\s*Jan\\s+1[–-]\\d+$/i.test(normalizedLabel)) {
      return nt('seasonStarted.labels.applicationsEarly', context)
    }
    if (/^Team list\\s*·\\s*Jan\\s+1[–-]\\d+$/i.test(normalizedLabel)) {
      return nt('seasonStarted.labels.teamListEarly', context)
    }
    if (/^Startlist\\s*·\\s*Jan\\s+1[–-]\\d+$/i.test(normalizedLabel)) {
      return nt('seasonStarted.labels.startlistEarly', context)
    }
    if (/^Jan\\s+\\d+[–-]31$/i.test(normalizedLabel)) {
      return nt('seasonStarted.labels.lateJanuary', context)
    }
    if (/^From February$/i.test(normalizedLabel)) {
      return nt('seasonStarted.labels.fromFebruary', context)
    }
  }"""
    text = replace_once(text, old, new, "detail label signature")

    old = """export function localizeNotificationValue(value: string): string {
  if (!shouldLocalizeNotifications()) return value
  const normalized = normalizePhrase(value)"""
    new = """export function localizeNotificationValue(
  value: string,
  item?: NotificationItem
): string {
  if (!shouldLocalizeNotifications()) return value

  if (String(item?.type_code ?? '').toUpperCase() === 'SEASON_STARTED' && item) {
    const cleanValue = value.trim()

    const seasonMatch = /^Season\\s+(\\d+)$/i.exec(cleanValue)
    if (seasonMatch) {
      return nt('seasonStarted.values.season', { season: seasonMatch[1] })
    }
    if (/^New season$/i.test(cleanValue)) {
      return nt('seasonStarted.values.newSeason')
    }

    let match = /^Open Jan 1\\s*·\\s*close\\s+(\\d+)\\s+game days? before the race$/i.exec(cleanValue)
    if (match) {
      const days = Number(match[1])
      return nt('seasonStarted.values.applicationsEarly', {
        days,
        dayUnit: seasonStartedUnit('gameDay', days),
      })
    }

    match = /^Announced\\s+(\\d+)\\s+game days? before the race, when applications close$/i.exec(cleanValue)
    if (match) {
      const days = Number(match[1])
      return nt('seasonStarted.values.teamListEarly', {
        days,
        dayUnit: seasonStartedUnit('gameDay', days),
      })
    }

    match = /^Open until\\s+(\\d+)\\s+game hours? before Stage 1$/i.exec(cleanValue)
    if (match) {
      const hours = Number(match[1])
      return nt('seasonStarted.values.startlistEarly', {
        hours,
        hourUnit: seasonStartedUnit('gameHour', hours),
      })
    }

    match = /^Applications close\\s+(\\d+)\\s+days? before\\s*·\\s*startlist closes\\s+(\\d+)\\s+days? before$/i.exec(cleanValue)
    if (match) {
      const appDays = Number(match[1])
      const startDays = Number(match[2])
      return nt('seasonStarted.values.lateJanuary', {
        appDays,
        appDayUnit: seasonStartedUnit('day', appDays),
        startDays,
        startDayUnit: seasonStartedUnit('day', startDays),
      })
    }

    match = /^Standard schedule:\\s*applications open\\s+(\\d+)\\s+days? before, close\\s+(\\d+)\\s+days? before\\s*·\\s*startlist closes\\s+(\\d+)\\s+days? before$/i.exec(cleanValue)
    if (match) {
      const openDays = Number(match[1])
      const closeDays = Number(match[2])
      const startDays = Number(match[3])
      return nt('seasonStarted.values.standard', {
        openDays,
        openDayUnit: seasonStartedUnit('day', openDays),
        closeDays,
        closeDayUnit: seasonStartedUnit('day', closeDays),
        startDays,
        startDayUnit: seasonStartedUnit('day', startDays),
      })
    }

    // This notification must never fall back to token-by-token translation.
    // Preserve any future dynamic backend value until it receives a semantic rule.
    return cleanValue
  }

  const normalized = normalizePhrase(value)"""
    text = replace_once(text, old, new, "value signature")

    old = """  'view results': 'details.viewResults',
}"""
    new = """  'view results': 'details.viewResults',
  'season calendar': 'seasonStarted.actions.calendar',
  'season overview': 'seasonStarted.actions.overview',
}"""
    text = replace_once(text, old, new, "season action labels")

    NOTIFICATION_LOCALIZATION.write_text(text, encoding="utf-8")


def patch_templates_ts() -> None:
    text = NOTIFICATION_TEMPLATES.read_text(encoding="utf-8")
    old = """  return rows.map(row => ({
    label: localizeNotificationDetailLabel(row.label),
    value: localizeNotificationValue(row.value),
  }))"""
    new = """  return rows.map(row => ({
    label: localizeNotificationDetailLabel(row.label, item),
    value: localizeNotificationValue(row.value, item),
  }))"""
    text = replace_once(text, old, new, "template item propagation")
    NOTIFICATION_TEMPLATES.write_text(text, encoding="utf-8")


def audit() -> None:
    for locale, expected in TRANSLATIONS.items():
        path = LOCALE_ROOT / locale / "notifications.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        actual = data.get("seasonStarted")
        if actual != expected:
            raise RuntimeError(f"{locale}: seasonStarted block mismatch")

    localization = NOTIFICATION_LOCALIZATION.read_text(encoding="utf-8")
    templates = NOTIFICATION_TEMPLATES.read_text(encoding="utf-8")

    required = [
        "if (code === 'SEASON_STARTED') return nt('seasonStarted.typeLabel')",
        "if (typeCode === 'SEASON_STARTED') {",
        "January is intentionally more compressed",
        "seasonStarted.labels.applicationsEarly",
        "seasonStarted.values.applicationsEarly",
        "seasonStarted.values.standard",
        "'season calendar': 'seasonStarted.actions.calendar'",
        "'season overview': 'seasonStarted.actions.overview'",
    ]
    for snippet in required:
        if snippet not in localization:
            raise RuntimeError(f"Missing localization snippet: {snippet}")

    if "localizeNotificationDetailLabel(row.label, item)" not in templates:
        raise RuntimeError("Notification detail labels do not receive item context")
    if "localizeNotificationValue(row.value, item)" not in templates:
        raise RuntimeError("Notification values do not receive item context")

    for locale in ("sr-Latn", "de", "hr", "es", "it", "fr", "ru"):
        block = TRANSLATIONS[locale]
        for key in ("title", "feedMessage", "intro", "warning"):
            if not block.get(key):
                raise RuntimeError(f"{locale}: missing {key}")
        if len(block["labels"]) != 6 or len(block["values"]) != 6:
            raise RuntimeError(f"{locale}: incomplete detail-row localization")

    print("SEASON_STARTED localization audit PASSED")
    print("8 locale blocks checked")
    print("Type, title, feed message, intro, 6 detail rows, warning and actions covered")


def main() -> None:
    for locale, block in TRANSLATIONS.items():
        ensure_locale_block(LOCALE_ROOT / locale / "notifications.json", block)
    patch_localization_ts()
    patch_templates_ts()
    audit()


if __name__ == "__main__":
    main()
