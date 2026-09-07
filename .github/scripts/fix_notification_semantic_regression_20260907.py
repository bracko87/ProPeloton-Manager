from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ['en','sr-Latn','de','hr','es','it','fr','ru']

TRANSLATIONS = {
  'en': {
    'templateLocalization.feed.raceApplicationResults.title': 'Race application results',
    'templateLocalization.feed.raceApplicationResults.message': 'Your race application results are available. Open the notification to review the details.',
  },
  'sr-Latn': {
    'templateLocalization.feed.raceApplicationResults.title': 'Rezultati prijava za trke',
    'templateLocalization.feed.raceApplicationResults.message': 'Rezultati vaših prijava za trke su dostupni. Otvorite obaveštenje da pregledate detalje.',
  },
  'de': {
    'templateLocalization.feed.raceApplicationResults.title': 'Ergebnisse der Rennanmeldungen',
    'templateLocalization.feed.raceApplicationResults.message': 'Die Ergebnisse Ihrer Rennanmeldungen sind verfügbar. Öffnen Sie die Benachrichtigung, um die Details zu prüfen.',
  },
  'hr': {
    'templateLocalization.feed.raceApplicationResults.title': 'Rezultati prijava za utrke',
    'templateLocalization.feed.raceApplicationResults.message': 'Rezultati vaših prijava za utrke su dostupni. Otvorite obavijest kako biste pregledali detalje.',
  },
  'es': {
    'templateLocalization.feed.raceApplicationResults.title': 'Resultados de las solicitudes de carrera',
    'templateLocalization.feed.raceApplicationResults.message': 'Los resultados de tus solicitudes de carrera están disponibles. Abre la notificación para revisar los detalles.',
  },
  'it': {
    'templateLocalization.feed.raceApplicationResults.title': 'Risultati delle richieste di partecipazione alle gare',
    'templateLocalization.feed.raceApplicationResults.message': 'I risultati delle tue richieste di partecipazione alle gare sono disponibili. Apri la notifica per vedere i dettagli.',
  },
  'fr': {
    'templateLocalization.feed.raceApplicationResults.title': 'Résultats des candidatures aux courses',
    'templateLocalization.feed.raceApplicationResults.message': 'Les résultats de vos candidatures aux courses sont disponibles. Ouvrez la notification pour consulter les détails.',
  },
  'ru': {
    'templateLocalization.feed.raceApplicationResults.title': 'Результаты заявок на гонки',
    'templateLocalization.feed.raceApplicationResults.message': 'Результаты ваших заявок на гонки доступны. Откройте уведомление, чтобы просмотреть подробности.',
  },
}

def set_path(obj, path, value):
    cur = obj
    parts = path.split('.')
    for p in parts[:-1]:
        cur = cur.setdefault(p, {})
    cur[parts[-1]] = value

for locale in LOCALES:
    path = ROOT / 'src' / 'i18n' / 'locales' / locale / 'notifications.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    for key, value in TRANSLATIONS[locale].items():
        set_path(data, key, value)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

path = ROOT / 'src' / 'features' / 'notifications' / 'notificationLocalization.ts'
text = path.read_text(encoding='utf-8')

# The regression came from searching all namespaces for a notification title/message.
# Restrict feed copy reuse to the notifications namespace so dedicated, semantically
# reviewed notification translations always win over unrelated duplicate phrases.
anchor = """function localizeExistingGameTemplate(value: string): string | null {
  if (!shouldLocalizeNotifications() || !value.trim()) return null

  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined
  if (!languageData) return null

  for (const hit of getEnglishTemplateResourceIndex()) {
    const localizedTemplate = readResourceString(languageData[hit.namespace], hit.keyPath)
    if (!localizedTemplate) continue

    const match = hit.pattern.exec(value.trim())
    if (!match) continue

    const params: Record<string, unknown> = {}
    hit.parameterNames.forEach((name, index) => {
      params[name] = match[index + 1]
    })

    const localized = String(i18n.t(hit.keyPath, {
      ns: hit.namespace,
      ...params,
      defaultValue: '',
    }))

    if (localized && localized !== hit.keyPath) return localized
  }

  return null
}
"""
if anchor not in text:
    raise SystemExit('game template localizer anchor not found')
addition = anchor + """
function localizeExistingNotificationPhrase(value: string): string | null {
  if (!shouldLocalizeNotifications() || !value.trim()) return null
  const hits = (getEnglishResourceIndex().get(normalizePhrase(value)) ?? [])
    .filter(hit => hit.namespace === 'notifications')
  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined
  if (!languageData) return null

  for (const hit of hits) {
    const localized = readResourceString(languageData.notifications, hit.keyPath)
    if (localized && !localized.includes('{{')) return localized
  }
  return null
}

function localizeExistingNotificationTemplate(value: string): string | null {
  if (!shouldLocalizeNotifications() || !value.trim()) return null
  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined
  if (!languageData) return null

  for (const hit of getEnglishTemplateResourceIndex()) {
    if (hit.namespace !== 'notifications') continue
    const localizedTemplate = readResourceString(languageData.notifications, hit.keyPath)
    if (!localizedTemplate) continue

    const match = hit.pattern.exec(value.trim())
    if (!match) continue

    const params: Record<string, unknown> = {}
    hit.parameterNames.forEach((name, index) => {
      params[name] = match[index + 1]
    })

    const localized = String(i18n.t(hit.keyPath, {
      ns: 'notifications',
      ...params,
      defaultValue: '',
    }))
    if (localized && localized !== hit.keyPath) return localized
  }
  return null
}
"""
text = text.replace(anchor, addition, 1)

old = """  const resourceTitle =
    localizeExistingGamePhrase(cleanTitle) || localizeExistingGameTemplate(cleanTitle)
  let resourceMessage =
    localizeExistingGamePhrase(cleanMessage) || localizeExistingGameTemplate(cleanMessage)
"""
new = """  const resourceTitle =
    localizeExistingNotificationPhrase(cleanTitle) || localizeExistingNotificationTemplate(cleanTitle)
  let resourceMessage =
    localizeExistingNotificationPhrase(cleanMessage) || localizeExistingNotificationTemplate(cleanMessage)
"""
if old not in text:
    raise SystemExit('feed resource localizer anchor not found')
text = text.replace(old, new, 1)

# Do not return resource matches before the semantic notification handlers below.
# This was the exact regression that scrambled Scout/Head Coach/Sports Director titles.
early = """  if (resourceTitle && resourceMessage) {
    return { title: resourceTitle, message: resourceMessage }
  }

"""
if early not in text:
    raise SystemExit('early resource return anchor not found')
text = text.replace(early, '', 1)

# Treat the race-application-results notification as a complete semantic phrase,
# never as token-translated pieces such as "Rezultati prijava... Obaveštenje".
insert_anchor = """  const staffHiredMatch = /^Staff hired:\\s*(.+)$/i.exec(cleanTitle)
"""
block = """  if (/race application results?/i.test(cleanTitle)) {
    return {
      title: nt('templateLocalization.feed.raceApplicationResults.title'),
      message: nt('templateLocalization.feed.raceApplicationResults.message'),
    }
  }

""" + insert_anchor
if insert_anchor not in text:
    raise SystemExit('staff hired anchor not found')
text = text.replace(insert_anchor, block, 1)

path.write_text(text, encoding='utf-8')
print('Semantic notification regression fix applied.')
