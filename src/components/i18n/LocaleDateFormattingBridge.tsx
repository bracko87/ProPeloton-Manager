import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

type DateState = {
  original: string
  lastRendered: string
}

const textState = new WeakMap<Text, DateState>()

const MONTH_INDEX: Record<string, number> = {
  Jan: 0,
  January: 0,
  Feb: 1,
  February: 1,
  Mar: 2,
  March: 2,
  Apr: 3,
  April: 3,
  May: 4,
  Jun: 5,
  June: 5,
  Jul: 6,
  July: 6,
  Aug: 7,
  August: 7,
  Sep: 8,
  Sept: 8,
  September: 8,
  Oct: 9,
  October: 9,
  Nov: 10,
  November: 10,
  Dec: 11,
  December: 11,
}

function localeForLanguage(language: string | undefined): string {
  if (language?.startsWith('sr')) return 'sr-Latn-RS'
  if (language?.startsWith('de')) return 'de-DE'
  if (language?.startsWith('hr')) return 'hr-HR'
  if (language?.startsWith('es')) return 'es-ES'
  if (language?.startsWith('it')) return 'it-IT'
  if (language?.startsWith('fr')) return 'fr-FR'
  if (language?.startsWith('ru')) return 'ru-RU'
  return 'en-GB'
}

function parseEnglishDate(value: string): Date | null {
  const trimmed = value.trim()

  let day: number
  let monthToken: string
  let year: number

  const dayFirst = trimmed.match(
    /^(\d{1,2})\s+(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+(\d{4})$/,
  )

  if (dayFirst) {
    day = Number(dayFirst[1])
    monthToken = dayFirst[2]
    year = Number(dayFirst[3])
  } else {
    const monthFirst = trimmed.match(
      /^(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+(\d{1,2}),\s*(\d{4})$/,
    )

    if (!monthFirst) return null

    monthToken = monthFirst[1]
    day = Number(monthFirst[2])
    year = Number(monthFirst[3])
  }

  const month = MONTH_INDEX[monthToken]
  if (month === undefined) return null

  const date = new Date(Date.UTC(year, month, day))
  if (Number.isNaN(date.getTime())) return null

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

function formatLocalizedDate(date: Date, language: string | undefined): string {
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function translateTextNode(textNode: Text, language: string | undefined): void {
  const current = textNode.nodeValue ?? ''
  let state = textState.get(textNode)

  if (!state) {
    if (!parseEnglishDate(current)) return

    state = {
      original: current,
      lastRendered: current,
    }
    textState.set(textNode, state)
  } else if (current !== state.lastRendered && parseEnglishDate(current)) {
    state.original = current
  }

  const sourceDate = parseEnglishDate(state.original)
  if (!sourceDate) return

  const isEnglish = !language || language.startsWith('en')
  const leading = state.original.match(/^\s*/)?.[0] ?? ''
  const trailing = state.original.match(/\s*$/)?.[0] ?? ''
  const next = isEnglish
    ? state.original
    : `${leading}${formatLocalizedDate(sourceDate, language)}${trailing}`

  if (textNode.nodeValue !== next) {
    textNode.nodeValue = next
  }

  state.lastRendered = next
}

function applyToDocument(language: string | undefined): void {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    translateTextNode(node as Text, language)
    node = walker.nextNode()
  }
}

export default function LocaleDateFormattingBridge(): null {
  const { i18n } = useTranslation()

  useEffect(() => {
    let applying = false

    const apply = (): void => {
      if (applying || typeof document === 'undefined') return
      applying = true

      try {
        applyToDocument(i18n.resolvedLanguage ?? i18n.language)
      } finally {
        applying = false
      }
    }

    apply()

    const observer = new MutationObserver(apply)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    const handleLanguageChanged = (): void => apply()
    i18n.on('languageChanged', handleLanguageChanged)

    return () => {
      observer.disconnect()
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [i18n])

  return null
}
