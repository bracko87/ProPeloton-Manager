from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / 'src' / 'features' / 'notifications' / 'notificationLocalization.ts'
text = path.read_text(encoding='utf-8')

# Dynamic title template matching can match a more generic notification template
# whose translated placeholder order differs from the source title. This caused
# the first semantic word (Plan/Savet/Team/Missing/Notification/etc.) to be
# rendered at the END of translated titles. Exact phrase matches are safe; truly
# dynamic titles are handled later by type_code + entity semantic translations.
old = """  const resourceTitle =
    localizeExistingNotificationPhrase(cleanTitle) || localizeExistingNotificationTemplate(cleanTitle)
"""
new = """  // Titles deliberately use exact notification phrases only. Generic dynamic
  // template matching is unsafe for titles because translated placeholder order
  // can rotate the leading semantic word to the end (for example
  // \"Plan utrke ...\" -> \"utrke ... Plan\"). Dynamic titles are resolved by
  // explicit notification parsers or semantic type/entity translations below.
  const resourceTitle = localizeExistingNotificationPhrase(cleanTitle)
"""
if old not in text:
    raise SystemExit('resourceTitle dynamic-template anchor not found')
text = text.replace(old, new, 1)

anchor = """function looksEnglish(value: string | null | undefined): boolean {
  const text = String(value ?? '').toLowerCase()
  if (!text) return false
  return /\\b(the|your|you|has|have|is|are|was|were|will|can|could|should|joined|available|review|open|staff|rider|sponsor|race|stage|contract|offer|team|club|week|season|completed|required|selected|selection|transfer|warning|reward|results|report|new|for|from|with|without|this|that|as|to|of|and|startlist|missed|missing|advisory|sports|director|programme|program|plans|current|next|accepted|future|priority|priorities|items|require|removed|enough|mandatory|jersey|kits|remaining|riders|score|place)\\b/.test(text)
}
"""
if anchor not in text:
    raise SystemExit('looksEnglish anchor not found')

addition = anchor + r'''

const localizedNotificationTitleFirstTokenCache = new Map<string, Set<string>>()

function normalizeNotificationTitleToken(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function firstAlphabeticCharacter(value: string): string | null {
  for (const character of Array.from(value)) {
    if (character.toLocaleLowerCase() !== character.toLocaleUpperCase()) {
      return character
    }
  }
  return null
}

function startsWithLowercaseLetter(value: string): boolean {
  const firstLetter = firstAlphabeticCharacter(value)
  if (!firstLetter) return false
  return (
    firstLetter === firstLetter.toLocaleLowerCase() &&
    firstLetter !== firstLetter.toLocaleUpperCase()
  )
}

function capitalizeFirstAlphabeticCharacter(value: string): string {
  const characters = Array.from(value)
  const index = characters.findIndex(
    character => character.toLocaleLowerCase() !== character.toLocaleUpperCase()
  )
  if (index < 0) return value
  characters[index] = characters[index].toLocaleUpperCase()
  return characters.join('')
}

function getLocalizedNotificationTitleFirstTokens(): Set<string> {
  const language = activeLanguageCode()
  const cached = localizedNotificationTitleFirstTokenCache.get(language)
  if (cached) return cached

  const tokens = new Set<string>()
  const languageData = i18n.getDataByLanguage(language) as Record<string, unknown> | undefined
  const notifications = languageData?.notifications

  const visit = (value: unknown, keyPath = ''): void => {
    if (typeof value === 'string') {
      const isTitleResource =
        /(^|\.)title$/i.test(keyPath) ||
        keyPath.startsWith('semanticTypeTitles.') ||
        keyPath.startsWith('semanticTypeEntityTitles.')
      if (!isTitleResource) return

      // Dynamic entity/name-first titles cannot provide a stable semantic first
      // word. All other title resources contribute their first word to the repair
      // dictionary for the currently active language.
      const stripped = value.trim().replace(/^{{\s*[A-Za-z0-9_]+\s*}}\s*/, '')
      if (!stripped || stripped.startsWith('{{')) return
      const firstToken = stripped.match(/^\S+/u)?.[0] ?? ''
      const normalized = normalizeNotificationTitleToken(firstToken)
      if (normalized) tokens.add(normalized)
      return
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      visit(child, keyPath ? `${keyPath}.${key}` : key)
    })
  }

  visit(notifications)
  localizedNotificationTitleFirstTokenCache.set(language, tokens)
  return tokens
}

/**
 * Repairs the legacy/runtime title-order regression where the translated first
 * semantic word was appended to the end of the title. Examples:
 *   "utrke zahtijeva pažnju: ... Plan" -> "Plan utrke zahtijeva pažnju: ..."
 *   "sportskog direktora — ... Savjet" -> "Savjet sportskog direktora — ..."
 *   "Rezultati prijava za utrke. Obavijest:" -> "Obavijest: Rezultati prijava za utrke"
 *
 * The repair is language-independent: the candidate leading words are derived
 * from each locale's own notification-title resources, so the same rule covers
 * Serbian, Croatian, German, Spanish, Italian, French and Russian.
 */
function repairRotatedLocalizedNotificationTitle(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || !shouldLocalizeNotifications()) return trimmed

  const lastTokenMatch = trimmed.match(/(\S+)\s*$/u)
  const lastToken = lastTokenMatch?.[1] ?? ''
  const normalizedLastToken = normalizeNotificationTitleToken(lastToken)
  const titleFirstTokens = getLocalizedNotificationTitleFirstTokens()

  const candidateWasRotated =
    normalizedLastToken.length > 0 &&
    titleFirstTokens.has(normalizedLastToken) &&
    !normalizeNotificationTitleToken(trimmed.match(/^\S+/u)?.[0] ?? '').startsWith(normalizedLastToken)

  // Most corrupted titles start with a lower-case word. Generic notification
  // wrappers such as "Obavijest:"/"Benachrichtigung:" are the exception: they
  // may be rotated after a period while the remaining subject still starts with
  // an uppercase noun. A trailing colon is therefore also a strong signal.
  const shouldRotate =
    candidateWasRotated &&
    (startsWithLowercaseLetter(trimmed) || /[:：]$/u.test(lastToken))

  let repaired = trimmed
  if (shouldRotate && lastTokenMatch?.index !== undefined) {
    let body = trimmed.slice(0, lastTokenMatch.index).trim()
    // A period/semicolon immediately before the displaced leading word was only
    // acting as a separator introduced by the broken rendering order.
    body = body.replace(/[.;]\s*$/u, '').trim()
    repaired = `${lastToken} ${body}`.trim()
  }

  // UI notification headlines always use sentence/title capitalization. This is
  // also a safety net for any translated title that was stored without it.
  return capitalizeFirstAlphabeticCharacter(repaired)
}
'''
text = text.replace(anchor, addition, 1)

# Final generic feed fallback: repair both persisted legacy titles and any title
# returned by an older/non-semantic notification path.
old = """      title: resourceTitle || (looksEnglish(cleanTitle) ? nt('templateLocalization.feed.teamUpdateTitle') : cleanTitle),
"""
new = """      title: repairRotatedLocalizedNotificationTitle(
        resourceTitle || (looksEnglish(cleanTitle) ? nt('templateLocalization.feed.teamUpdateTitle') : cleanTitle)
      ),
"""
if old not in text:
    raise SystemExit('generic feed title fallback anchor not found')
text = text.replace(old, new, 1)

old = """  return {
    title: resourceTitle || cleanTitle,
    message: resourceMessage || cleanMessage,
  }
}

export function localizeNotificationItem"""
new = """  return {
    title: repairRotatedLocalizedNotificationTitle(resourceTitle || cleanTitle),
    message: resourceMessage || cleanMessage,
  }
}

export function localizeNotificationItem"""
if old not in text:
    raise SystemExit('feed final return anchor not found')
text = text.replace(old, new, 1)

# Central final item return catches already-localized/broken legacy DB titles too.
old = """  return {
    ...item,
    title: localizedTitle,
    message: localizedMessage,
  }
}

export function localizeNotificationNarrative"""
new = """  return {
    ...item,
    title: repairRotatedLocalizedNotificationTitle(localizedTitle),
    message: localizedMessage,
  }
}

export function localizeNotificationNarrative"""
if old not in text:
    raise SystemExit('localized item final return anchor not found')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Notification translated-title rotation repair applied.')
