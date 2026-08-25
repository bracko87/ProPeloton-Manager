import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import i18n from '../../i18n'
import enAppShell from '../../i18n/locales/en/appShell.json'
import srAppShell from '../../i18n/locales/sr-Latn/appShell.json'

type JsonResource = Record<string, unknown>
type Params = Record<string, string>
type Token = { key: string; params?: Params }
type NodeState = { token: Token; lastRendered: string }
type Template = { key: string; regex: RegExp; params: string[] }

const namespace = 'appShell'

if (!i18n.hasResourceBundle('en', namespace)) {
  i18n.addResourceBundle('en', namespace, enAppShell, true, true)
}

if (!i18n.hasResourceBundle('sr-Latn', namespace)) {
  i18n.addResourceBundle('sr-Latn', namespace, srAppShell, true, true)
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegex(value: string): string {
  return value
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+')
}

function flatten(
  resource: JsonResource,
  prefix = '',
): Array<{ key: string; value: string }> {
  const rows: Array<{ key: string; value: string }> = []

  Object.entries(resource).forEach(([name, value]) => {
    const key = prefix ? `${prefix}.${name}` : name

    if (typeof value === 'string') {
      rows.push({ key, value })
      return
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push(...flatten(value as JsonResource, key))
    }
  })

  return rows
}

function compileTemplate(key: string, value: string): Template | null {
  const placeholder = /{{\s*([A-Za-z0-9_]+)\s*}}/g
  const params: string[] = []
  let pattern = '^'
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = placeholder.exec(value))) {
    pattern += escapeRegex(value.slice(cursor, match.index))
    params.push(match[1])
    pattern += '(.+?)'
    cursor = match.index + match[0].length
  }

  if (!params.length) return null

  pattern += escapeRegex(value.slice(cursor))
  pattern += '$'

  return {
    key,
    regex: new RegExp(pattern),
    params,
  }
}

const exact = new Map<string, string>()
const templates: Template[] = []

flatten(enAppShell as JsonResource).forEach(({ key, value }) => {
  const fullKey = `${namespace}:${key}`
  const normalized = normalizeText(value)
  const template = compileTemplate(fullKey, normalized)

  if (template) templates.push(template)
  else if (normalized) exact.set(normalized, fullKey)
})

const textState = new WeakMap<Node, NodeState>()
const attributeState = new WeakMap<Element, Map<string, NodeState>>()

function detectToken(value: string): Token | null {
  const normalized = normalizeText(value)
  const exactKey = exact.get(normalized)

  if (exactKey) return { key: exactKey }

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

function setText(node: Text, translated: string): void {
  const current = node.nodeValue ?? ''
  const leading = current.match(/^\s+/)?.[0] ?? ''
  const trailing = current.match(/\s+$/)?.[0] ?? ''
  node.nodeValue = `${leading}${translated}${trailing}`
}

export default function AppShellLegacyLocalizationBridge(): null {
  const { t, i18n: reactI18n } = useTranslation(namespace)

  useEffect(() => {
    let applying = false
    let scheduled = false

    const translateRoot = (): void => {
      if (applying) return
      applying = true

      try {
        const root = document.getElementById('app')
        if (!root) return

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
              const translated = String(t(token.key, token.params ?? {}))
              const normalizedTranslation = normalizeText(translated)

              if (current !== normalizedTranslation) {
                setText(textNode, translated)
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

            const translated = String(t(token.key, token.params ?? {}))
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

    const schedule = (): void => {
      if (scheduled) return
      scheduled = true

      queueMicrotask(() => {
        scheduled = false
        translateRoot()
      })
    }

    translateRoot()

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
  }, [reactI18n, t])

  return null
}
