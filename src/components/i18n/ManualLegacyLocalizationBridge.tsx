import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import i18n from '../../i18n'
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
import enDynamic from '../../i18n/locales/en/manualDynamic.json'
import srDynamic from '../../i18n/locales/sr-Latn/manualDynamic.json'

type JsonResource = Record<string, unknown>
type Params = Record<string, string>
type Token = { key: string; params?: Params }
type NodeState = { token: Token; lastRendered: string }
type TemplateDefinition = { key: string; regex: RegExp; params: string[] }
type Translator = (key: string, options?: Record<string, unknown>) => string

const namespace = 'manual'

const enResource: JsonResource = {
  core: enCore,
  deepA: enDeepA,
  deepB1: enDeepB1,
  deepB2: enDeepB2,
  faq: enFaq,
  dynamic: enDynamic,
}

const srResource: JsonResource = {
  core: srCore,
  deepA: srDeepA,
  deepB1: srDeepB1,
  deepB2: srDeepB2,
  faq: srFaq,
  dynamic: srDynamic,
}

if (!i18n.hasResourceBundle('en', namespace)) {
  i18n.addResourceBundle('en', namespace, enResource, true, true)
}

if (!i18n.hasResourceBundle('sr-Latn', namespace)) {
  i18n.addResourceBundle('sr-Latn', namespace, srResource, true, true)
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegex(value: string): string {
  return value
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+')
}

function flattenResource(
  value: unknown,
  prefix = '',
): Array<{ key: string; value: string }> {
  if (typeof value === 'string') {
    return [{ key: prefix, value }]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      flattenResource(item, prefix ? `${prefix}.${index}` : String(index)),
    )
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([name, child]) => {
        const key = prefix ? `${prefix}.${name}` : name
        return flattenResource(child, key)
      },
    )
  }

  return []
}

function compileTemplate(
  key: string,
  source: string,
): TemplateDefinition | null {
  const placeholder = /{{\s*([A-Za-z0-9_]+)\s*}}/g
  const params: string[] = []
  let pattern = '^'
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = placeholder.exec(source))) {
    pattern += escapeRegex(source.slice(cursor, match.index))
    params.push(match[1])
    pattern += '(.+?)'
    cursor = match.index + match[0].length
  }

  if (!params.length) return null

  pattern += escapeRegex(source.slice(cursor))
  pattern += '$'

  return {
    key,
    regex: new RegExp(pattern),
    params,
  }
}

function getCurrentRoute(): string {
  if (typeof window === 'undefined') return '/'

  const hashPath = window.location.hash
    .replace(/^#/, '')
    .split('?')[0]

  return hashPath || window.location.pathname
}

const exactMap = new Map<string, string>()
const templates: TemplateDefinition[] = []

flattenResource(enResource).forEach(({ key, value }) => {
  if (!key) return

  const normalized = normalizeText(value)
  if (!normalized) return

  const fullKey = `${namespace}:${key}`
  const template = compileTemplate(fullKey, normalized)

  if (template) templates.push(template)
  else exactMap.set(normalized, fullKey)
})

const textState = new WeakMap<Node, NodeState>()
const attributeState = new WeakMap<Element, Map<string, NodeState>>()

function detectToken(text: string): Token | null {
  const normalized = normalizeText(text)
  const exact = exactMap.get(normalized)

  if (exact) return { key: exact }

  for (const template of templates) {
    const match = template.regex.exec(normalized)
    if (!match) continue

    const params: Params = {}

    template.params.forEach((name, index) => {
      params[name] = match[index + 1] ?? ''
    })

    return { key: template.key, params }
  }

  return null
}

function translateKnownValue(value: string, t: Translator): string {
  const key = exactMap.get(normalizeText(value))
  return key ? String(t(key)) : value
}

function translateFactSummary(value: string, t: Translator): string {
  if (!value) return value

  return value
    .split('; ')
    .map(part => {
      const separatorIndex = part.indexOf(': ')

      if (separatorIndex < 0) {
        return translateKnownValue(part, t)
      }

      const label = part.slice(0, separatorIndex)
      const factValue = part.slice(separatorIndex + 2)

      return `${translateKnownValue(label, t)}: ${translateKnownValue(factValue, t)}`
    })
    .join('; ')
}

function transformParams(
  token: Token,
  t: Translator,
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...(token.params ?? {}) }

  if (typeof params.title === 'string') {
    params.title = translateKnownValue(params.title, t)
  }

  if (typeof params.facts === 'string') {
    params.facts = translateFactSummary(params.facts, t)
  }

  if (
    token.key === 'manual:core.ui.showing' &&
    typeof params.count === 'string'
  ) {
    const countValue = params.count.trim()
    const single = countValue.match(/^1 section$/i)
    const plural = countValue.match(/^(\d+) sections$/i)

    if (single) {
      params.count = String(t('manual:core.ui.section'))
    } else if (plural) {
      params.count = String(
        t('manual:core.ui.sections', { count: plural[1] }),
      )
    }
  }

  return params
}

function renderToken(token: Token, t: Translator): string {
  return String(t(token.key, transformParams(token, t)))
}

function setTranslatedText(node: Text, translated: string): void {
  const original = node.nodeValue ?? ''
  const leading = original.match(/^\s+/)?.[0] ?? ''
  const trailing = original.match(/\s+$/)?.[0] ?? ''
  node.nodeValue = `${leading}${translated}${trailing}`
}

function translateRoot(root: Element, t: Translator): void {
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
        const translated = renderToken(token, t)
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

    for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) {
      const current = normalizeText(element.getAttribute(attribute) ?? '')
      if (!current) continue

      const previous = stateMap?.get(attribute)
      const token =
        previous && current === previous.lastRendered
          ? previous.token
          : detectToken(current)

      if (!token) continue

      const translated = renderToken(token, t)
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
}

export default function ManualLegacyLocalizationBridge(): null {
  const { t, i18n: reactI18n } = useTranslation(namespace)
  const [route, setRoute] = useState(getCurrentRoute)

  const active = useMemo(() => route === '/dashboard/manual', [route])

  useEffect(() => {
    const handleRoute = (): void => setRoute(getCurrentRoute())

    window.addEventListener('hashchange', handleRoute)
    window.addEventListener('popstate', handleRoute)

    return () => {
      window.removeEventListener('hashchange', handleRoute)
      window.removeEventListener('popstate', handleRoute)
    }
  }, [])

  useEffect(() => {
    if (!active) return

    let applying = false
    let scheduled = false

    const apply = (): void => {
      if (applying) return
      applying = true

      try {
        const main = document.querySelector('main')
        if (main) translateRoot(main, t)
      } finally {
        applying = false
      }
    }

    const schedule = (): void => {
      if (scheduled) return
      scheduled = true

      queueMicrotask(() => {
        scheduled = false
        apply()
      })
    }

    apply()

    const observer = new MutationObserver(() => schedule())
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'placeholder', 'alt'],
    })

    reactI18n.on('languageChanged', schedule)

    return () => {
      observer.disconnect()
      reactI18n.off('languageChanged', schedule)
    }
  }, [active, reactI18n, t])

  return null
}
