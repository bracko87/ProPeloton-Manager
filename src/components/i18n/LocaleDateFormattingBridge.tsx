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

  return `${label} · Season ${season}`
}

function transformGameDates(
  source: string,
  language: string | undefined,
  currentSeason: number,
): string {
  let value = source

  // ISO game dates, including dates embedded inside notification text.
  value = value.replace(
    /\b(20\d{2})-(\d{2})-(\d{2})\b/g,
    (match, y, m, d) => {
      const year = Number(y)
      const season = seasonForGameYear(year, currentSeason)
      const date = validUtcDate(year, Number(m), Number(d))
      return season && date ? formatGameDate(date, season, language) : match
    },
  )

  // English day-first game dates: 04 May 2000.
  value = value.replace(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/gi,
    (match, d, monthToken, y) => {
      const year = Number(y)
      const season = seasonForGameYear(year, currentSeason)
      if (!season) return match
      const probe = new Date(`${monthToken} ${d}, ${year} UTC`)
      return Number.isNaN(probe.getTime())
        ? match
        : formatGameDate(probe, season, language)
    },
  )

  // English month-first game dates: May 04, 2000.
  value = value.replace(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s*(20\d{2})\b/gi,
    (match, monthToken, d, y) => {
      const year = Number(y)
      const season = seasonForGameYear(year, currentSeason)
      if (!season) return match
      const probe = new Date(`${monthToken} ${d}, ${year} UTC`)
      return Number.isNaN(probe.getTime())
        ? match
        : formatGameDate(probe, season, language)
    },
  )

  // Explicit "Year 2000" style labels become Season 1.
  value = value.replace(/\bYear\s+(20\d{2})\b/gi, (match, y) => {
    const season = seasonForGameYear(Number(y), currentSeason)
    return season ? `Season ${season}` : match
  })

  return value
}

function transformMoney(source: string): string {
  return source
    .replace(/\bUS\$\s*/g, '$')
    .replace(/\bUSD\s*/g, '$')
    .replace(/€\s*/g, '$')
}

function transformTextNode(
  textNode: Text,
  language: string | undefined,
  currentSeason: number,
): void {
  const current = textNode.nodeValue ?? ''
  const parent = textNode.parentElement
  if (!current || !parent) return
  if (['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION'].includes(parent.tagName)) return

  const next = transformMoney(
    transformGameDates(current, language, currentSeason),
  )

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
