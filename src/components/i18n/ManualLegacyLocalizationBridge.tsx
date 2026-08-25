import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import enCore from '../../i18n/locales/en/manualCore.json'
import srCore from '../../i18n/locales/sr-Latn/manualCore.json'
import enDeepA from '../../i18n/locales/en/manualDeepA.json'
import srDeepA from '../../i18n/locales/sr-Latn/manualDeepA.json'
import enDeepB1 from '../../i18n/locales/en/manualDeepB1.json'
import srDeepB1 from '../../i18n/locales/sr-Latn/manualDeepB1.json'
import enDeepB2 from '../../i18n/locales/en/manualDeepB2.json'
import srDeepB2 from '../../i18n/locales/sr-Latn/manualDeepB2.json'
import enFaq from '../../i18n/locales/en/manualFaq.json'
import srFaq from '../../i18n/locales/sr-Latn/manualFaq.json'
import enLegacyDynamic from '../../i18n/locales/en/manualLegacyDynamic.json'
import srLegacyDynamic from '../../i18n/locales/sr-Latn/manualLegacyDynamic.json'

type Pair = {
  en: string
  sr: string
}

type Params = Record<string, string>

type Token = {
  pair: Pair
  params?: Params
}

type NodeState = {
  token: Token
  lastRendered: string
}

type TemplatePair = {
  pair: Pair
  regex: RegExp
  params: string[]
}

const extraPairs: Pair[] = [
  { en: 'New managers should first read', sr: 'Novi menadžeri bi prvo trebalo da pročitaju' },
  { en: 'Quick Start', sr: 'Brzi početak' },
  { en: 'Game Time', sr: 'Vreme igre' },
  { en: 'Overview', sr: 'Pregled' },
  { en: 'Squad', sr: 'Ekipa' },
  { en: 'Training', sr: 'Trening' },
  { en: 'Race Preparation', sr: 'Priprema trke' },
  { en: 'Finance', sr: 'Finansije' },
  { en: 'and', sr: 'i' },
  {
    en: 'Experienced managers can use search for specific topics like sponsor naming rights, race supplies, playoffs, tax audits, emergency rescues or developing-team movement windows.',
    sr: 'Iskusni menadžeri mogu koristiti pretragu za određene teme kao što su naming rights sponzora, zalihe za trku, plej-of, poreske kontrole, hitna spasavanja ili periodi za premeštanje vozača Razvojnog tima.',
  },
  { en: 'Showing', sr: 'Prikazano:' },
  { en: 'section', sr: 'sekcija' },
  { en: 'sections', sr: 'sekcija' },
  { en: 'categories', sr: 'kategorija' },
  { en: 'Rule', sr: 'Pravilo' },
]

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegexSegment(value: string): string {
  return value
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+')
}

function collectPairs(enValue: unknown, srValue: unknown, result: Pair[]): void {
  if (typeof enValue === 'string' && typeof srValue === 'string') {
    result.push({ en: enValue, sr: srValue })
    return
  }

  if (Array.isArray(enValue) && Array.isArray(srValue)) {
    const length = Math.min(enValue.length, srValue.length)
    for (let index = 0; index < length; index += 1) {
      collectPairs(enValue[index], srValue[index], result)
    }
    return
  }

  if (
    enValue &&
    srValue &&
    typeof enValue === 'object' &&
    typeof srValue === 'object' &&
    !Array.isArray(enValue) &&
    !Array.isArray(srValue)
  ) {
    const enObject = enValue as Record<string, unknown>
    const srObject = srValue as Record<string, unknown>

    Object.keys(enObject).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(srObject, key)) {
        collectPairs(enObject[key], srObject[key], result)
      }
    })
  }
}

function compileTemplate(pair: Pair): TemplatePair | null {
  const placeholder = /{{\s*([A-Za-z0-9_]+)\s*}}/g
  const params: string[] = []
  let pattern = '^'
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = placeholder.exec(pair.en))) {
    pattern += escapeRegexSegment(pair.en.slice(cursor, match.index))
    params.push(match[1])
    pattern += '(.+?)'
    cursor = match.index + match[0].length
  }

  if (!params.length) return null

  pattern += escapeRegexSegment(pair.en.slice(cursor))
  pattern += '$'

  return {
    pair,
    regex: new RegExp(pattern),
    params,
  }
}

const allPairs: Pair[] = []
collectPairs(enCore, srCore, allPairs)
collectPairs(enDeepA, srDeepA, allPairs)
collectPairs(enDeepB1, srDeepB1, allPairs)
collectPairs(enDeepB2, srDeepB2, allPairs)
collectPairs(enFaq, srFaq, allPairs)
collectPairs(enLegacyDynamic, srLegacyDynamic, allPairs)
allPairs.push(...extraPairs)

const exactMap = new Map<string, Pair>()
const templates: TemplatePair[] = []

allPairs.forEach(pair => {
  const normalized = normalizeText(pair.en)
  if (!normalized) return

  const template = compileTemplate(pair)
  if (template) templates.push(template)
  else exactMap.set(normalized, pair)
})

function detectToken(text: string): Token | null {
  const normalized = normalizeText(text)
  if (!normalized) return null

  const exact = exactMap.get(normalized)
  if (exact) return { pair: exact }

  for (const template of templates) {
    const match = template.regex.exec(normalized)
    if (!match) continue

    const params: Params = {}
    template.params.forEach((name, index) => {
      params[name] = match[index + 1] ?? ''
    })

    return {
      pair: template.pair,
      params,
    }
  }

  return null
}

function interpolate(template: string, params: Params | undefined): string {
  if (!params) return template

  return template.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_match, name: string) => {
    return params[name] ?? ''
  })
}

function translateFactComposite(value: string): string {
  return value
    .split('; ')
    .map(part => {
      const separatorIndex = part.indexOf(': ')
      if (separatorIndex < 0) return translateInlineValue(part)

      const label = part.slice(0, separatorIndex)
      const factValue = part.slice(separatorIndex + 2)
      return `${translateInlineValue(label)}: ${translateInlineValue(factValue)}`
    })
    .join('; ')
}

function translateInlineValue(value: string, depth = 0): string {
  if (depth > 3) return value

  const normalized = normalizeText(value)
  const exact = exactMap.get(normalized)
  if (exact) return exact.sr

  for (const template of templates) {
    const match = template.regex.exec(normalized)
    if (!match) continue

    const params: Params = {}
    template.params.forEach((name, index) => {
      params[name] = translateInlineValue(match[index + 1] ?? '', depth + 1)
    })

    return interpolate(template.pair.sr, params)
  }

  return value
}

function renderToken(token: Token, language: string | undefined): string {
  const isSerbian = language?.startsWith('sr') ?? false
  if (!isSerbian) {
    return interpolate(token.pair.en, token.params)
  }

  const translatedParams: Params | undefined = token.params
    ? Object.fromEntries(
        Object.entries(token.params).map(([name, value]) => {
          if (name === 'facts') {
            return [name, translateFactComposite(value)]
          }

          return [name, translateInlineValue(value)]
        }),
      )
    : undefined

  return interpolate(token.pair.sr, translatedParams)
}

function currentRoute(): string {
  if (typeof window === 'undefined') return '/'

  const hashPath = window.location.hash.replace(/^#/, '').split('?')[0]
  return hashPath || window.location.pathname
}

function setTranslatedText(node: Text, translated: string): void {
  const original = node.nodeValue ?? ''
  const leading = original.match(/^\s+/)?.[0] ?? ''
  const trailing = original.match(/\s+$/)?.[0] ?? ''
  node.nodeValue = `${leading}${translated}${trailing}`
}

export default function ManualLegacyLocalizationBridge(): null {
  const { i18n } = useTranslation()
  const [route, setRoute] = useState(currentRoute)
  const isManualRoute = useMemo(() => route === '/dashboard/manual', [route])

  useEffect(() => {
    const handleRoute = (): void => setRoute(currentRoute())
    window.addEventListener('hashchange', handleRoute)
    window.addEventListener('popstate', handleRoute)

    return () => {
      window.removeEventListener('hashchange', handleRoute)
      window.removeEventListener('popstate', handleRoute)
    }
  }, [])

  useEffect(() => {
    if (!isManualRoute || typeof document === 'undefined') return

    const textState = new WeakMap<Text, NodeState>()
    const attributeState = new WeakMap<Element, Map<string, NodeState>>()
    let applying = false
    let scheduled = false

    const applyTranslations = (): void => {
      if (applying) return
      applying = true

      try {
        const root = document.querySelector('main') ?? document.getElementById('app')
        if (!root) return

        const language = i18n.resolvedLanguage ?? i18n.language
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()

        while (node) {
          const textNode = node as Text
          const current = normalizeText(textNode.nodeValue ?? '')

          if (current) {
            const previous = textState.get(textNode)
            const token =
              previous && current === previous.lastRendered
                ? previous.token
                : detectToken(current)

            if (token) {
              const translated = renderToken(token, language)
              const normalizedTranslation = normalizeText(translated)

              if (current !== normalizedTranslation) {
                setTranslatedText(textNode, translated)
              }

              textState.set(textNode, {
                token,
                lastRendered: normalizedTranslation,
              })
            }
          }

          node = walker.nextNode()
        }

        root.querySelectorAll('*').forEach(element => {
          let stateMap = attributeState.get(element)

          for (const attribute of ['title', 'aria-label', 'placeholder', 'alt'] as const) {
            const current = normalizeText(element.getAttribute(attribute) ?? '')
            if (!current) continue

            const previous = stateMap?.get(attribute)
            const token =
              previous && current === previous.lastRendered
                ? previous.token
                : detectToken(current)

            if (!token) continue

            const translated = renderToken(token, language)
            const normalizedTranslation = normalizeText(translated)

            if (current !== normalizedTranslation) {
              element.setAttribute(attribute, translated)
            }

            if (!stateMap) {
              stateMap = new Map<string, NodeState>()
              attributeState.set(element, stateMap)
            }

            stateMap.set(attribute, {
              token,
              lastRendered: normalizedTranslation,
            })
          }
        })
      } finally {
        applying = false
      }
    }

    const scheduleApply = (): void => {
      if (scheduled) return
      scheduled = true

      queueMicrotask(() => {
        scheduled = false
        applyTranslations()
      })
    }

    applyTranslations()

    const observer = new MutationObserver(scheduleApply)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'placeholder', 'alt'],
    })

    const handleLanguageChanged = (): void => scheduleApply()
    i18n.on('languageChanged', handleLanguageChanged)

    return () => {
      observer.disconnect()
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [i18n, isManualRoute])

  return null
}
