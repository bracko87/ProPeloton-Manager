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


STARTLIST = {
    "en": {
        "templateLocalization.feed.startlistMissed.title": "Startlist missed: {{raceName}}",
        "templateLocalization.feed.startlistMissed.message": "The rider/startlist deadline was missed for {{raceName}}. Review Race Preparation and make sure future startlists are submitted before the deadline.",
    },
    "sr-Latn": {
        "templateLocalization.feed.startlistMissed.title": "Propušten rok za startnu listu: {{raceName}}",
        "templateLocalization.feed.startlistMissed.message": "Propušten je rok za prijavu vozača/startne liste za {{raceName}}. Pregledajte Pripremu trke i ubuduće pošaljite startnu listu pre isteka roka.",
    },
    "hr": {
        "templateLocalization.feed.startlistMissed.title": "Propušten rok za startnu listu: {{raceName}}",
        "templateLocalization.feed.startlistMissed.message": "Propušten je rok za prijavu vozača/startne liste za {{raceName}}. Pregledajte Pripremu utrke i ubuduće pošaljite startnu listu prije isteka roka.",
    },
    "de": {
        "templateLocalization.feed.startlistMissed.title": "Frist für die Startliste verpasst: {{raceName}}",
        "templateLocalization.feed.startlistMissed.message": "Die Frist für Fahrer-/Startlisteneinreichung bei {{raceName}} wurde verpasst. Prüfen Sie die Rennvorbereitung und reichen Sie künftige Startlisten rechtzeitig ein.",
    },
    "es": {
        "templateLocalization.feed.startlistMissed.title": "Se perdió el plazo de la lista de salida: {{raceName}}",
        "templateLocalization.feed.startlistMissed.message": "Se perdió el plazo para enviar corredores/la lista de salida de {{raceName}}. Revisa la preparación de carrera y envía las futuras listas antes del plazo.",
    },
    "it": {
        "templateLocalization.feed.startlistMissed.title": "Scadenza della lista di partenza mancata: {{raceName}}",
        "templateLocalization.feed.startlistMissed.message": "È stata mancata la scadenza per l'invio dei corridori/della lista di partenza per {{raceName}}. Controlla la preparazione gara e invia le future liste prima della scadenza.",
    },
    "fr": {
        "templateLocalization.feed.startlistMissed.title": "Échéance de la liste de départ manquée : {{raceName}}",
        "templateLocalization.feed.startlistMissed.message": "L’échéance d’envoi des coureurs/de la liste de départ pour {{raceName}} a été manquée. Vérifiez la préparation de course et envoyez les prochaines listes avant l’échéance.",
    },
    "ru": {
        "templateLocalization.feed.startlistMissed.title": "Пропущен срок стартового списка: {{raceName}}",
        "templateLocalization.feed.startlistMissed.message": "Для {{raceName}} пропущен срок подачи гонщиков/стартового списка. Проверьте подготовку к гонке и в дальнейшем отправляйте стартовые списки до истечения срока.",
    },
}

for locale in LOCALES:
    path = ROOT / 'src' / 'i18n' / 'locales' / locale / 'notifications.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    for key, value in STARTLIST[locale].items():
        set_path(data, key, value)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

loc_path = ROOT / 'src' / 'features' / 'notifications' / 'notificationLocalization.ts'
text = loc_path.read_text(encoding='utf-8')

anchor = """  if (raceProgrammeMatch) {
    const nextRaceRaw = raceProgrammeMatch[4].trim()
    const nextRace = /^none currently scheduled$/i.test(nextRaceRaw)
      ? nt('templateLocalization.feed.sportsDirector.noneScheduled')
      : nextRaceRaw
    resourceMessage = nt('templateLocalization.feed.sportsDirector.raceProgrammeMessage', {
      raceName: raceProgrammeMatch[1].trim(),
      start: raceProgrammeMatch[2],
      end: raceProgrammeMatch[3],
      nextRace,
      count: Number(raceProgrammeMatch[5]),
    })
  }

"""
addition = anchor + """  const startlistMissedMatch =
    /^Startlist missed:\\s*(.+)$/i.exec(cleanTitle) ||
    /^Missed rider submission deadline:\\s*(.+)$/i.exec(cleanTitle)
  if (startlistMissedMatch) {
    const raceName = startlistMissedMatch[1].trim()
    return {
      title: nt('templateLocalization.feed.startlistMissed.title', { raceName }),
      message:
        resourceMessage && resourceMessage !== cleanMessage
          ? resourceMessage
          : looksEnglish(cleanMessage)
            ? nt('templateLocalization.feed.startlistMissed.message', { raceName })
            : cleanMessage,
    }
  }

  const teamRemovedMatch = /^Team removed from\\s+(.+)$/i.exec(cleanTitle)
  if (teamRemovedMatch) {
    const raceName = teamRemovedMatch[1].trim()
    const detailMatch = /^(.+?) did not have enough mandatory Race Jersey Kits for Stage (\\d+)\\. Required:\\s*(\\d+); available:\\s*(\\d+)\\. The team has been removed from Stage \\2 and every remaining stage of (.+?)\\. Riders can no longer place or score in this race\\.?$/i.exec(cleanMessage)

    return {
      title: nt('templateLocalization.feed.raceJerseysRemoval.title', { raceName }),
      message: detailMatch
        ? nt('templateLocalization.feed.raceJerseysRemoval.message', {
            teamName: detailMatch[1].trim(),
            stage: Number(detailMatch[2]),
            required: Number(detailMatch[3]),
            available: Number(detailMatch[4]),
            raceName: detailMatch[5].trim(),
          })
        : nt('templateLocalization.feed.raceJerseysRemoval.genericMessage', { raceName }),
    }
  }

"""
if anchor not in text:
    raise SystemExit('notificationLocalization.ts: race programme runtime anchor not found')
text = text.replace(anchor, addition, 1)
loc_path.write_text(text, encoding='utf-8')

page_path = ROOT / 'src' / 'pages' / 'dashboard' / 'NotificationsPage.tsx'
page = page_path.read_text(encoding='utf-8')
replacements = {
    "{formatAdvisorDisplayValue(priority.label ?? priority.code)}": "{localizeNotificationValue(formatAdvisorDisplayValue(priority.label ?? priority.code), item)}",
    "{formatAdvisorDisplayValue(priority.detail)}": "{localizeNotificationValue(formatAdvisorDisplayValue(priority.detail), item)}",
    "{formatAdvisorDisplayValue(priority.priority)}": "{localizeNotificationValue(formatAdvisorDisplayValue(priority.priority), item)}",
    "{formatAdvisorAvailability(stage.urgency)}": "{localizeNotificationValue(formatAdvisorAvailability(stage.urgency), item)}",
    "{formatAdvisorAvailability(stage.stage_plan_status)}": "{localizeNotificationValue(formatAdvisorAvailability(stage.stage_plan_status), item)}",
}
for old, new in replacements.items():
    if old not in page:
        raise SystemExit(f'NotificationsPage.tsx runtime detail anchor not found: {old}')
    page = page.replace(old, new)
page_path.write_text(page, encoding='utf-8')

print('Remaining startlist, race-removal, and expanded-detail localization cases applied.')
