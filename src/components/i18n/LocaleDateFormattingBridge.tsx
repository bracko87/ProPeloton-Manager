import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

const GAME_BASE_YEAR = 2000

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

function seasonForGameYear(year: number, currentSeason: number): number | null {
  const season = year - GAME_BASE_YEAR + 1
  if (season < 1) return null
  if (season > Math.max(2, currentSeason + 1)) return null
  return season
}

function validUtcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

function formatGameDate(
  date: Date,
  season: number,
  language: string | undefined,
): string {
  const label = new Intl.DateTimeFormat(localeForLanguage(language), {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date)

  return label + ' · Season ' + season
}

function transformGameDates(
  source: string,
  language: string | undefined,
  currentSeason: number,
): string {
  let value = source

  value = value.replace(
    /\b(20\d{2})-(\d{2})-(\d{2})\b/g,
    (match, y, m, d) => {
      const year = Number(y)
      const season = seasonForGameYear(year, currentSeason)
      const date = validUtcDate(year, Number(m), Number(d))
      return season && date ? formatGameDate(date, season, language) : match
    },
  )

  value = value.replace(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/gi,
    (match, d, monthToken, y) => {
      const year = Number(y)
      const season = seasonForGameYear(year, currentSeason)
      if (!season) return match
      const probe = new Date(String(monthToken) + ' ' + d + ', ' + year + ' UTC')
      return Number.isNaN(probe.getTime())
        ? match
        : formatGameDate(probe, season, language)
    },
  )

  value = value.replace(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s*(20\d{2})\b/gi,
    (match, monthToken, d, y) => {
      const year = Number(y)
      const season = seasonForGameYear(year, currentSeason)
      if (!season) return match
      const probe = new Date(String(monthToken) + ' ' + d + ', ' + year + ' UTC')
      return Number.isNaN(probe.getTime())
        ? match
        : formatGameDate(probe, season, language)
    },
  )

  value = value.replace(/\bYear\s+(20\d{2})\b/gi, (match, y) => {
    const season = seasonForGameYear(Number(y), currentSeason)
    return season ? 'Season ' + season : match
  })

  return value
}

function normalizeDollarDigits(raw: string): string {
  const value = raw.trim().replace(/\s+/g, '')
  const negative = value.startsWith('-')
  let digits = negative ? value.slice(1) : value

  if (/^\d{1,3}(?:\.\d{3})+$/.test(digits)) {
    digits = digits.replace(/\./g, '')
  } else if (/^\d{1,3}(?:,\d{3})+$/.test(digits)) {
    digits = digits.replace(/,/g, '')
  }

  const numeric = Number(digits)
  if (!Number.isFinite(numeric)) return raw.trim()

  return (negative ? '-' : '') + Math.round(Math.abs(numeric)).toLocaleString('en-US')
}

function transformMoney(source: string): string {
  let value = source
    .replace(/\bUS\$\s*/g, '$')
    .replace(/\bUSD\s*/g, '$')
    .replace(/\bEUR\s*/g, '$')
    .replace(/€\s*/g, '$')

  value = value.replace(
    /(-?\d[\d.,\s]*\d|-?\d)\s*\$/g,
    (_match, amount) => '$' + normalizeDollarDigits(String(amount)),
  )

  value = value.replace(
    /\$\s*(-?\d[\d.,\s]*\d|-?\d)/g,
    (_match, amount) => '$' + normalizeDollarDigits(String(amount)),
  )

  return value
}

const MONEY_CONTEXT_RE =
  /\b(price|cost|fee|budget|cash|fund|prize|salary|wage|income|expense|revenue|value|amount|spend|spent|transfer|compensation|sponsor|tax|balance|payment|refund|earnings|bonus|accommodation|logistics|deducted|invested|offer|asking|bid|travel)\b/i

const NON_MONEY_CONTEXT_RE =
  /\b(staff travelling|riders?|teams?|days?|weeks?|months?|points?|rank|age|stages?|quantity|count|number|slots?|limit|starts?|wins?|podiums?|distance|km|percent|percentage)\b/i

function semanticMoneyLabel(parent: HTMLElement): string {
  const previous = parent.previousElementSibling?.textContent ?? ''
  if (previous.trim()) return previous.trim()

  const cell = parent.closest('td')
  if (cell) {
    const row = cell.parentElement
    const table = cell.closest('table')
    const index = row ? Array.from(row.children).indexOf(cell) : -1
    if (table && index >= 0) {
      const headers = Array.from(table.querySelectorAll('thead th'))
      const header = headers[index]?.textContent ?? ''
      if (header.trim()) return header.trim()
    }
  }

  const wrapper = parent.parentElement
  if (wrapper) {
    const first = wrapper.firstElementChild
    if (first && first !== parent) {
      const label = first.textContent ?? ''
      if (label.trim()) return label.trim()
    }
  }

  return ''
}

function transformBareMoneyValue(source: string, parent: HTMLElement): string {
  const raw = source.trim()
  if (!raw) return source
  if (/[$€%]|\b(?:USD|EUR)\b/i.test(raw)) return source
  if (!/^-?\d[\d\s,.]*$/.test(raw)) return source

  const label = semanticMoneyLabel(parent)
  if (!label || NON_MONEY_CONTEXT_RE.test(label) || !MONEY_CONTEXT_RE.test(label)) {
    return source
  }

  const normalized = normalizeDollarDigits(raw)
  const numeric = Number(normalized.replace(/,/g, ''))
  if (!Number.isFinite(numeric)) return source

  const formatted =
    (numeric < 0 ? '-$' : '$') +
    Math.abs(Math.round(numeric)).toLocaleString('en-US')

  const leading = source.match(/^\s*/)?.[0] ?? ''
  const trailing = source.match(/\s*$/)?.[0] ?? ''
  return leading + formatted + trailing
}

function transformTextNode(
  textNode: Text,
  language: string | undefined,
  currentSeason: number,
): void {
  const current = textNode.nodeValue ?? ''
  const parent = textNode.parentElement
  if (!current || !parent) return
  if (['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) return

  const dateAndCurrency = transformMoney(
    transformGameDates(current, language, currentSeason),
  )
  const next = transformBareMoneyValue(dateAndCurrency, parent)

  if (next !== current) {
    textNode.nodeValue = next
  }
}

function applyToDocument(
  language: string | undefined,
  currentSeason: number,
): void {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    transformTextNode(node as Text, language, currentSeason)
    node = walker.nextNode()
  }
}

export default function LocaleDateFormattingBridge(): null {
  const { i18n } = useTranslation()

  useEffect(() => {
    let disposed = false
    let observer: MutationObserver | null = null
    let applying = false

    const start = async (): Promise<void> => {
      let currentSeason = 1
      try {
        const { data } = await supabase.rpc('get_current_season_number')
        const parsed = Number(data ?? 1)
        if (Number.isFinite(parsed) && parsed >= 1) currentSeason = parsed
      } catch {
        // Formatting still works for Season 1 if the helper is unavailable.
      }

      if (disposed || typeof document === 'undefined') return

      const apply = (): void => {
        if (applying) return
        applying = true
        try {
          applyToDocument(
            i18n.resolvedLanguage ?? i18n.language,
            currentSeason,
          )
        } finally {
          applying = false
        }
      }

      apply()
      observer = new MutationObserver(apply)
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      })

      const handleLanguageChanged = (): void => apply()
      i18n.on('languageChanged', handleLanguageChanged)

      return
    }

    void start()

    return () => {
      disposed = true
      observer?.disconnect()
    }
  }, [i18n])

  return null
}
