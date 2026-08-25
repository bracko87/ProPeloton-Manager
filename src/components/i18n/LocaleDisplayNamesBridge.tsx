import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

type TextState = {
  original: string
  lastRendered: string
}

const textState = new WeakMap<Text, TextState>()

function normalizeLanguage(language: string | undefined): string {
  if (!language) return 'en'
  return language === 'sr' ? 'sr-Latn' : language
}

function normalizeCountryCode(value: string | null | undefined): string | null {
  const code = String(value ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

function countryCodeFromFlagImage(image: HTMLImageElement): string | null {
  const src = image.getAttribute('src') ?? ''
  const match = src.match(/flagcdn\.com\/(?:w\d+\/)?([a-z]{2})\.(?:png|webp|jpg|jpeg|svg)/i)
  return normalizeCountryCode(match?.[1])
}

function getDisplayName(code: string, locale: string): string | null {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? null
  } catch {
    return null
  }
}

function translateOption(option: HTMLOptionElement, locale: string): void {
  const code = normalizeCountryCode(option.value)
  if (!code) return

  const localized = getDisplayName(code, locale)
  if (!localized) return

  if (!option.dataset.ppmCountryOriginal) {
    option.dataset.ppmCountryOriginal = option.textContent ?? localized
  }

  option.textContent = locale === 'en'
    ? option.dataset.ppmCountryOriginal
    : localized
}

function translateTextNode(
  textNode: Text,
  englishName: string,
  localizedName: string,
  locale: string,
): void {
  const current = textNode.nodeValue ?? ''
  const trimmed = current.trim()
  const existing = textState.get(textNode)

  if (!existing) {
    if (trimmed !== englishName) return

    const state: TextState = {
      original: current,
      lastRendered: current,
    }
    textState.set(textNode, state)
  }

  const state = textState.get(textNode)
  if (!state) return

  if (current !== state.lastRendered && current.trim() !== englishName) {
    state.original = current
  }

  const leading = state.original.match(/^\s*/)?.[0] ?? ''
  const trailing = state.original.match(/\s*$/)?.[0] ?? ''
  const next = locale === 'en'
    ? state.original
    : `${leading}${localizedName}${trailing}`

  if (textNode.nodeValue !== next) {
    textNode.nodeValue = next
  }

  state.lastRendered = next
}

function translateCountryWithinContainer(
  container: Element,
  code: string,
  locale: string,
): void {
  const englishName = getDisplayName(code, 'en')
  const localizedName = getDisplayName(code, locale)

  if (!englishName || !localizedName) return

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    translateTextNode(node as Text, englishName, localizedName, locale)
    node = walker.nextNode()
  }
}

function nearestUsefulContainer(element: Element): Element {
  let current: Element = element

  for (let depth = 0; depth < 4; depth += 1) {
    const parent = current.parentElement
    if (!parent) break

    current = parent

    const text = (current.textContent ?? '').trim()
    if (text.length >= 2 && text.length <= 180) {
      return current
    }
  }

  return current
}

export default function LocaleDisplayNamesBridge(): null {
  const { i18n } = useTranslation()

  useEffect(() => {
    let applying = false

    const apply = (): void => {
      if (applying || typeof document === 'undefined') return
      applying = true

      try {
        const locale = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language)

        document.querySelectorAll('option').forEach(option => {
          translateOption(option as HTMLOptionElement, locale)
        })

        document.querySelectorAll('[data-country-code]').forEach(element => {
          const code = normalizeCountryCode(element.getAttribute('data-country-code'))
          if (code) translateCountryWithinContainer(element, code, locale)
        })

        document.querySelectorAll('img[src*="flagcdn.com"]').forEach(element => {
          const image = element as HTMLImageElement
          const code = countryCodeFromFlagImage(image)
          if (!code) return

          translateCountryWithinContainer(
            nearestUsefulContainer(image),
            code,
            locale,
          )
        })
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
