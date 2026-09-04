from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "src/pages/dashboard/NotificationsPage.tsx"
LOCALE_ROOT = ROOT / "src/i18n/locales"
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]

COPY = {
    "en": {
        "fit": "Fit",
        "notFullyFit": "Not fully fit",
        "notFullyAvailable": "Not fully available",
        "fatigueWatch": {
            "title": "Head Coach Advisory — Fatigue Watch",
            "summaryOne": "1 rider is currently in the elevated fatigue band (50–69). Monitor the trend before workload increases further.",
            "summaryMany": "{{count}} riders are currently in the elevated fatigue band (50–69). Monitor the trend before workload increases further.",
            "recommendation": "Monitor the affected riders through the next training block.",
        },
        "riderAvailability": {
            "title": "Head Coach Advisory — Rider Availability",
            "summaryOne": "1 rider is not fully available for normal training load. Review recovery status before the next intensive block.",
            "summaryMany": "{{count}} riders are not fully available for normal training load. Review recovery status before the next intensive block.",
            "reason": "Not fully available",
        },
        "trainingScheduleGap": {
            "title": "Head Coach Advisory — Training Schedule Gap",
            "summary": "No regular training sessions are planned from {{start}} through {{end}}. Review the training calendar before the next race block.",
            "recommendationReview": "Review the next three game days in the training calendar.",
            "recommendationConfirm": "Confirm that the empty training window is intentional.",
        },
        "actions": {
            "staffBriefingCentre": "Staff Briefing Centre",
            "trainingPage": "Training page",
            "teamSquad": "Team squad",
            "staffPage": "Staff page",
        },
        "variants": {
            "fatigue_watch": "Fatigue Watch",
            "rider_availability": "Rider Availability",
            "training_schedule_gap": "Training Schedule Gap",
        },
    },
    "sr-Latn": {
        "fit": "Spreman",
        "notFullyFit": "Nije potpuno spreman",
        "notFullyAvailable": "Nije potpuno dostupan",
        "fatigueWatch": {
            "title": "Savet glavnog trenera — praćenje umora",
            "summaryOne": "1 vozač se trenutno nalazi u zoni povišenog umora (50–69). Pratite trend pre nego što dodatno povećate opterećenje.",
            "summaryMany": "{{count}} vozača se trenutno nalaze u zoni povišenog umora (50–69). Pratite trend pre nego što dodatno povećate opterećenje.",
            "recommendation": "Pratite pogođene vozače tokom sledećeg trening bloka.",
        },
        "riderAvailability": {
            "title": "Savet glavnog trenera — dostupnost vozača",
            "summaryOne": "1 vozač trenutno nije potpuno spreman za uobičajeno trenažno opterećenje. Proverite status oporavka pre sledećeg intenzivnog bloka.",
            "summaryMany": "{{count}} vozača trenutno nisu potpuno spremna za uobičajeno trenažno opterećenje. Proverite status oporavka pre sledećeg intenzivnog bloka.",
            "reason": "Nije potpuno dostupan",
        },
        "trainingScheduleGap": {
            "title": "Savet glavnog trenera — praznina u rasporedu treninga",
            "summary": "Nema planiranih redovnih treninga od {{start}} do {{end}}. Proverite kalendar treninga pre sledećeg bloka trka.",
            "recommendationReview": "Pregledajte naredna tri dana u igri u kalendaru treninga.",
            "recommendationConfirm": "Potvrdite da je prazan period za trening nameran.",
        },
        "actions": {
            "staffBriefingCentre": "Centar za brifinge osoblja",
            "trainingPage": "Stranica treninga",
            "teamSquad": "Tim",
            "staffPage": "Stranica osoblja",
        },
        "variants": {
            "fatigue_watch": "Praćenje umora",
            "rider_availability": "Dostupnost vozača",
            "training_schedule_gap": "Praznina u rasporedu treninga",
        },
    },
    "de": {
        "fit": "Einsatzbereit",
        "notFullyFit": "Nicht vollständig fit",
        "notFullyAvailable": "Nicht vollständig einsatzbereit",
        "fatigueWatch": {
            "title": "Hinweis des Cheftrainers — Ermüdung beobachten",
            "summaryOne": "1 Fahrer befindet sich derzeit im Bereich erhöhter Ermüdung (50–69). Beobachte die Entwicklung, bevor die Belastung weiter steigt.",
            "summaryMany": "{{count}} Fahrer befinden sich derzeit im Bereich erhöhter Ermüdung (50–69). Beobachte die Entwicklung, bevor die Belastung weiter steigt.",
            "recommendation": "Beobachte die betroffenen Fahrer im nächsten Trainingsblock.",
        },
        "riderAvailability": {
            "title": "Hinweis des Cheftrainers — Fahrerverfügbarkeit",
            "summaryOne": "1 Fahrer ist derzeit für die normale Trainingsbelastung nicht vollständig einsatzbereit. Prüfe den Erholungsstatus vor dem nächsten intensiven Block.",
            "summaryMany": "{{count}} Fahrer sind derzeit für die normale Trainingsbelastung nicht vollständig einsatzbereit. Prüfe den Erholungsstatus vor dem nächsten intensiven Block.",
            "reason": "Nicht vollständig einsatzbereit",
        },
        "trainingScheduleGap": {
            "title": "Hinweis des Cheftrainers — Lücke im Trainingsplan",
            "summary": "Vom {{start}} bis {{end}} sind keine regulären Trainingseinheiten geplant. Prüfe den Trainingskalender vor dem nächsten Rennblock.",
            "recommendationReview": "Prüfe die nächsten drei Spieltage im Trainingskalender.",
            "recommendationConfirm": "Bestätige, dass das leere Trainingsfenster beabsichtigt ist.",
        },
        "actions": {
            "staffBriefingCentre": "Mitarbeiter-Briefing-Center",
            "trainingPage": "Trainingsseite",
            "teamSquad": "Teamkader",
            "staffPage": "Mitarbeiterseite",
        },
        "variants": {
            "fatigue_watch": "Ermüdung beobachten",
            "rider_availability": "Fahrerverfügbarkeit",
            "training_schedule_gap": "Lücke im Trainingsplan",
        },
    },
    "hr": {
        "fit": "Spreman",
        "notFullyFit": "Nije potpuno spreman",
        "notFullyAvailable": "Nije potpuno dostupan",
        "fatigueWatch": {
            "title": "Savjet glavnog trenera — praćenje umora",
            "summaryOne": "1 vozač trenutačno se nalazi u rasponu povišenog umora (50–69). Pratite trend prije daljnjeg povećanja opterećenja.",
            "summaryMany": "{{count}} vozača trenutačno se nalaze u rasponu povišenog umora (50–69). Pratite trend prije daljnjeg povećanja opterećenja.",
            "recommendation": "Pratite pogođene vozače tijekom sljedećeg bloka treninga.",
        },
        "riderAvailability": {
            "title": "Savjet glavnog trenera — dostupnost vozača",
            "summaryOne": "1 vozač trenutačno nije potpuno spreman za uobičajeno trenažno opterećenje. Provjerite status oporavka prije sljedećeg intenzivnog bloka.",
            "summaryMany": "{{count}} vozača trenutačno nisu potpuno spremna za uobičajeno trenažno opterećenje. Provjerite status oporavka prije sljedećeg intenzivnog bloka.",
            "reason": "Nije potpuno dostupan",
        },
        "trainingScheduleGap": {
            "title": "Savjet glavnog trenera — praznina u rasporedu treninga",
            "summary": "Nema planiranih redovitih treninga od {{start}} do {{end}}. Provjerite kalendar treninga prije sljedećeg bloka utrka.",
            "recommendationReview": "Pregledajte sljedeća tri dana u igri u kalendaru treninga.",
            "recommendationConfirm": "Potvrdite da je prazno razdoblje za trening namjerno.",
        },
        "actions": {
            "staffBriefingCentre": "Centar za brifinge osoblja",
            "trainingPage": "Stranica treninga",
            "teamSquad": "Momčad",
            "staffPage": "Stranica osoblja",
        },
        "variants": {
            "fatigue_watch": "Praćenje umora",
            "rider_availability": "Dostupnost vozača",
            "training_schedule_gap": "Praznina u rasporedu treninga",
        },
    },
    "es": {
        "fit": "En forma",
        "notFullyFit": "No está completamente en forma",
        "notFullyAvailable": "No está completamente disponible",
        "fatigueWatch": {
            "title": "Aviso del entrenador jefe — Control de fatiga",
            "summaryOne": "1 corredor se encuentra actualmente en el rango de fatiga elevada (50–69). Vigila la tendencia antes de aumentar más la carga.",
            "summaryMany": "{{count}} corredores se encuentran actualmente en el rango de fatiga elevada (50–69). Vigila la tendencia antes de aumentar más la carga.",
            "recommendation": "Supervisa a los corredores afectados durante el próximo bloque de entrenamiento.",
        },
        "riderAvailability": {
            "title": "Aviso del entrenador jefe — Disponibilidad de corredores",
            "summaryOne": "1 corredor no está plenamente disponible para la carga normal de entrenamiento. Revisa su estado de recuperación antes del próximo bloque intensivo.",
            "summaryMany": "{{count}} corredores no están plenamente disponibles para la carga normal de entrenamiento. Revisa su estado de recuperación antes del próximo bloque intensivo.",
            "reason": "No está completamente disponible",
        },
        "trainingScheduleGap": {
            "title": "Aviso del entrenador jefe — Hueco en el calendario de entrenamiento",
            "summary": "No hay sesiones regulares de entrenamiento programadas del {{start}} al {{end}}. Revisa el calendario de entrenamiento antes del próximo bloque de carreras.",
            "recommendationReview": "Revisa los próximos tres días de juego en el calendario de entrenamiento.",
            "recommendationConfirm": "Confirma que el periodo sin entrenamiento es intencionado.",
        },
        "actions": {
            "staffBriefingCentre": "Centro de informes del personal",
            "trainingPage": "Página de entrenamiento",
            "teamSquad": "Plantilla del equipo",
            "staffPage": "Página del personal",
        },
        "variants": {
            "fatigue_watch": "Control de fatiga",
            "rider_availability": "Disponibilidad de corredores",
            "training_schedule_gap": "Hueco en el calendario de entrenamiento",
        },
    },
    "it": {
        "fit": "In forma",
        "notFullyFit": "Non completamente in forma",
        "notFullyAvailable": "Non pienamente disponibile",
        "fatigueWatch": {
            "title": "Avviso dell'allenatore capo — Controllo della fatica",
            "summaryOne": "1 corridore si trova attualmente nella fascia di fatica elevata (50–69). Monitora la tendenza prima di aumentare ulteriormente il carico.",
            "summaryMany": "{{count}} corridori si trovano attualmente nella fascia di fatica elevata (50–69). Monitora la tendenza prima di aumentare ulteriormente il carico.",
            "recommendation": "Monitora i corridori interessati durante il prossimo blocco di allenamento.",
        },
        "riderAvailability": {
            "title": "Avviso dell'allenatore capo — Disponibilità dei corridori",
            "summaryOne": "1 corridore non è attualmente pienamente disponibile per il normale carico di allenamento. Controlla lo stato di recupero prima del prossimo blocco intenso.",
            "summaryMany": "{{count}} corridori non sono attualmente pienamente disponibili per il normale carico di allenamento. Controlla lo stato di recupero prima del prossimo blocco intenso.",
            "reason": "Non pienamente disponibile",
        },
        "trainingScheduleGap": {
            "title": "Avviso dell'allenatore capo — Vuoto nel programma di allenamento",
            "summary": "Non sono previste sessioni regolari di allenamento dal {{start}} al {{end}}. Controlla il calendario degli allenamenti prima del prossimo blocco di gare.",
            "recommendationReview": "Controlla i prossimi tre giorni di gioco nel calendario degli allenamenti.",
            "recommendationConfirm": "Conferma che il periodo senza allenamenti sia intenzionale.",
        },
        "actions": {
            "staffBriefingCentre": "Centro briefing dello staff",
            "trainingPage": "Pagina allenamento",
            "teamSquad": "Rosa della squadra",
            "staffPage": "Pagina staff",
        },
        "variants": {
            "fatigue_watch": "Controllo della fatica",
            "rider_availability": "Disponibilità dei corridori",
            "training_schedule_gap": "Vuoto nel programma di allenamento",
        },
    },
    "fr": {
        "fit": "En forme",
        "notFullyFit": "Pas totalement en forme",
        "notFullyAvailable": "Pas totalement disponible",
        "fatigueWatch": {
            "title": "Conseil de l’entraîneur principal — Surveillance de la fatigue",
            "summaryOne": "1 coureur se trouve actuellement dans la zone de fatigue élevée (50–69). Surveillez la tendance avant d’augmenter davantage la charge.",
            "summaryMany": "{{count}} coureurs se trouvent actuellement dans la zone de fatigue élevée (50–69). Surveillez la tendance avant d’augmenter davantage la charge.",
            "recommendation": "Surveillez les coureurs concernés pendant le prochain bloc d’entraînement.",
        },
        "riderAvailability": {
            "title": "Conseil de l’entraîneur principal — Disponibilité des coureurs",
            "summaryOne": "1 coureur n’est actuellement pas totalement disponible pour une charge d’entraînement normale. Vérifiez son état de récupération avant le prochain bloc intensif.",
            "summaryMany": "{{count}} coureurs ne sont actuellement pas totalement disponibles pour une charge d’entraînement normale. Vérifiez leur état de récupération avant le prochain bloc intensif.",
            "reason": "Pas totalement disponible",
        },
        "trainingScheduleGap": {
            "title": "Conseil de l’entraîneur principal — Période sans entraînement planifié",
            "summary": "Aucune séance d’entraînement régulière n’est prévue du {{start}} au {{end}}. Vérifiez le calendrier d’entraînement avant le prochain bloc de courses.",
            "recommendationReview": "Vérifiez les trois prochains jours de jeu dans le calendrier d’entraînement.",
            "recommendationConfirm": "Confirmez que cette période sans entraînement est volontaire.",
        },
        "actions": {
            "staffBriefingCentre": "Centre de briefing du staff",
            "trainingPage": "Page d’entraînement",
            "teamSquad": "Effectif de l’équipe",
            "staffPage": "Page du staff",
        },
        "variants": {
            "fatigue_watch": "Surveillance de la fatigue",
            "rider_availability": "Disponibilité des coureurs",
            "training_schedule_gap": "Période sans entraînement planifié",
        },
    },
    "ru": {
        "fit": "Готов",
        "notFullyFit": "Не полностью готов",
        "notFullyAvailable": "Не полностью доступен",
        "fatigueWatch": {
            "title": "Совет главного тренера — контроль усталости",
            "summaryOne": "1 гонщик сейчас находится в зоне повышенной усталости (50–69). Следите за динамикой, прежде чем дополнительно увеличивать нагрузку.",
            "summaryMany": "{{count}} гонщиков сейчас находятся в зоне повышенной усталости (50–69). Следите за динамикой, прежде чем дополнительно увеличивать нагрузку.",
            "recommendation": "Следите за состоянием этих гонщиков в течение следующего тренировочного блока.",
        },
        "riderAvailability": {
            "title": "Совет главного тренера — готовность гонщиков",
            "summaryOne": "1 гонщик сейчас не полностью готов к обычной тренировочной нагрузке. Проверьте состояние восстановления перед следующим интенсивным блоком.",
            "summaryMany": "{{count}} гонщиков сейчас не полностью готовы к обычной тренировочной нагрузке. Проверьте состояние восстановления перед следующим интенсивным блоком.",
            "reason": "Не полностью готов",
        },
        "trainingScheduleGap": {
            "title": "Совет главного тренера — пробел в тренировочном расписании",
            "summary": "С {{start}} по {{end}} регулярные тренировки не запланированы. Проверьте тренировочный календарь перед следующим гоночным блоком.",
            "recommendationReview": "Проверьте следующие три игровых дня в тренировочном календаре.",
            "recommendationConfirm": "Убедитесь, что пустое тренировочное окно оставлено намеренно.",
        },
        "actions": {
            "staffBriefingCentre": "Центр брифинга персонала",
            "trainingPage": "Страница тренировок",
            "teamSquad": "Состав команды",
            "staffPage": "Страница персонала",
        },
        "variants": {
            "fatigue_watch": "Контроль усталости",
            "rider_availability": "Готовность гонщиков",
            "training_schedule_gap": "Пробел в тренировочном расписании",
        },
    },
}

NEW_RUNTIME_HELPER = r'''function localizeAdvisorNotificationRuntimeText(value: unknown, t: any): string {
  const text = String(value ?? '').trim()
  if (!text) return text

  if (/^Head Coach Advisory\s*[—-]\s*Fatigue Watch$/i.test(text)) {
    return t('headCoach.fatigueWatch.title')
  }
  if (/^Head Coach Advisory\s*[—-]\s*Rider Availability$/i.test(text)) {
    return t('headCoach.riderAvailability.title')
  }
  if (/^Head Coach Advisory\s*[—-]\s*Training Schedule Gap$/i.test(text)) {
    return t('headCoach.trainingScheduleGap.title')
  }

  let match = /^(\d+)\s+rider\(s\)\s+are currently in the elevated fatigue band \(50[–-]69\)\. Monitor the trend before workload increases further\.$/i.exec(text)
  if (match) {
    const count = Number(match[1])
    return t(count === 1 ? 'headCoach.fatigueWatch.summaryOne' : 'headCoach.fatigueWatch.summaryMany', { count })
  }

  match = /^(\d+)\s+rider\(s\)\s+are not fully available for normal training load\. Review recovery status before the next intensive block\.$/i.exec(text)
  if (match) {
    const count = Number(match[1])
    return t(count === 1 ? 'headCoach.riderAvailability.summaryOne' : 'headCoach.riderAvailability.summaryMany', { count })
  }

  match = /^No regular training sessions are planned from (\d{4}-\d{2}-\d{2}) through (\d{4}-\d{2}-\d{2})\. Review the training calendar before the next race block\.$/i.exec(text)
  if (match) {
    return t('headCoach.trainingScheduleGap.summary', {
      start: formatAdvisorCompactCalendarDate(match[1]),
      end: formatAdvisorCompactCalendarDate(match[2]),
    })
  }

  const normalized = text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (normalized === 'elevated fatigue') return t('headCoach.elevatedFatigue')
  if (normalized === 'fatigue watch') return t('reportVariants.fatigue_watch')
  if (normalized === 'fit') return t('headCoach.fit')
  if (normalized === 'not fully fit') return t('headCoach.notFullyFit')
  if (normalized === 'not fully available') return t('headCoach.notFullyAvailable')
  if (normalized === 'rider availability') return t('reportVariants.rider_availability')
  if (normalized === 'training schedule gap') return t('reportVariants.training_schedule_gap')

  if (normalized === 'monitor the affected riders through the next training block.') {
    return t('headCoach.fatigueWatch.recommendation')
  }
  if (normalized === 'review the next three game days in the training calendar.') {
    return t('headCoach.trainingScheduleGap.recommendationReview')
  }
  if (normalized === 'confirm that the empty training window is intentional.') {
    return t('headCoach.trainingScheduleGap.recommendationConfirm')
  }

  if (normalized === 'staff briefing centre') return t('headCoach.actions.staffBriefingCentre')
  if (normalized === 'training page') return t('headCoach.actions.trainingPage')
  if (normalized === 'team squad') return t('headCoach.actions.teamSquad')
  if (normalized === 'staff page') return t('headCoach.actions.staffPage')

  return text
}'''

NEW_DATE_HELPERS = r'''function formatAdvisorCompactCalendarDate(value: unknown): string {
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return text
  return `${Number(match[3])}.${String(Number(match[2])).padStart(2, '0')}.`
}

function formatAdvisorGameDateTime(value: unknown, t?: any): string {
  const text = String(value ?? '').trim()
  if (!text) return '—'

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?/)
  if (!match) return formatAdvisorDisplayText(value)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return formatAdvisorDisplayText(value)
  }

  const seasonNumber = year >= 2000 ? year - 1999 : year
  const dateLabel = `${day}.${String(month).padStart(2, '0')}.`
  const hour = match[4]
  const minute = match[5]
  const timeLabel = hour && minute ? ` ${hour}:${minute}` : ''
  const localizedDate = `${dateLabel}${timeLabel}`

  return t
    ? t('common.seasonDate', { season: seasonNumber, date: localizedDate })
    : `Season ${seasonNumber} - ${localizedDate}`
}'''


def patch_page() -> None:
    text = PAGE.read_text(encoding="utf-8")

    helper_start = text.index("function localizeAdvisorNotificationRuntimeText(")
    helper_end = text.index("\n\n\nfunction formatAdvisorDisplayValue", helper_start)
    text = text[:helper_start] + NEW_RUNTIME_HELPER + text[helper_end:]

    date_start = text.index("function formatAdvisorGameDateTime(")
    date_end = text.index("\n\nfunction getAdvisorRiderDisplayName", date_start)
    text = text[:date_start] + NEW_DATE_HELPERS + text[date_end:]

    text = text.replace(
        "formatAdvisorGameDateTime(snapshot.window_start)",
        "formatAdvisorGameDateTime(snapshot.window_start, t)",
    )
    text = text.replace(
        "formatAdvisorGameDateTime(snapshot.window_end)",
        "formatAdvisorGameDateTime(snapshot.window_end, t)",
    )

    old_action = "{translateDetailActionLabel(action.label || t('details.open'))}"
    new_action = "{localizeAdvisorNotificationRuntimeText(translateDetailActionLabel(action.label || t('details.open')), t)}"
    if old_action in text:
        text = text.replace(old_action, new_action)

    PAGE.write_text(text, encoding="utf-8")


def patch_locales() -> None:
    for locale in LOCALES:
        path = LOCALE_ROOT / locale / "notifications.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        cfg = COPY[locale]
        hc = data.setdefault("headCoach", {})
        hc["fit"] = cfg["fit"]
        hc["notFullyFit"] = cfg["notFullyFit"]
        hc["notFullyAvailable"] = cfg["notFullyAvailable"]
        hc["fatigueWatch"] = cfg["fatigueWatch"]
        hc["riderAvailability"] = cfg["riderAvailability"]
        hc["trainingScheduleGap"] = cfg["trainingScheduleGap"]
        hc["actions"] = cfg["actions"]

        variants = data.setdefault("reportVariants", {})
        variants.update(cfg["variants"])

        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def audit() -> None:
    source = PAGE.read_text(encoding="utf-8")
    required_source = [
        "headCoach.riderAvailability.title",
        "headCoach.trainingScheduleGap.title",
        "headCoach.notFullyAvailable",
        "headCoach.trainingScheduleGap.recommendationReview",
        "headCoach.trainingScheduleGap.recommendationConfirm",
        "headCoach.actions.staffBriefingCentre",
        "formatAdvisorGameDateTime(snapshot.window_start, t)",
        "localizeAdvisorNotificationRuntimeText(translateDetailActionLabel(action.label || t('details.open')), t)",
    ]
    for needle in required_source:
        if needle not in source:
            raise RuntimeError(f"missing runtime localization hook: {needle}")

    for locale in LOCALES:
        path = LOCALE_ROOT / locale / "notifications.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        hc = data["headCoach"]
        for key in ["fatigueWatch", "riderAvailability", "trainingScheduleGap", "actions"]:
            if key not in hc:
                raise RuntimeError(f"{locale}: missing headCoach.{key}")
        for key in ["fatigue_watch", "rider_availability", "training_schedule_gap"]:
            if not data["reportVariants"].get(key):
                raise RuntimeError(f"{locale}: missing reportVariants.{key}")

        if locale != "en":
            en = COPY["en"]
            cfg = COPY[locale]
            for group, field in [
                ("fatigueWatch", "title"),
                ("riderAvailability", "title"),
                ("riderAvailability", "summaryMany"),
                ("trainingScheduleGap", "title"),
                ("trainingScheduleGap", "summary"),
            ]:
                if cfg[group][field] == en[group][field]:
                    raise RuntimeError(f"{locale}: untranslated {group}.{field}")

    print("HEAD COACH advisory semantic localization audit PASSED")
    print("Checked: Fatigue Watch, Rider Availability, Training Schedule Gap")
    print("Checked locales:", ", ".join(LOCALES))


def main() -> None:
    patch_page()
    patch_locales()
    audit()


if __name__ == "__main__":
    main()
