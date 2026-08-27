import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import i18n from '../../i18n'

type JsonResource = Record<string, unknown>

type Translator = (
  key: string,
  options?: Record<string, unknown>,
) => string

type Params = Record<string, string>

type Token = {
  key: string
  params?: Params
}

type NodeState = {
  token: Token
  lastRendered: string
}

type TemplateDefinition = {
  key: string
  regex: RegExp
  params: string[]
}

export type LegacyLocalizationBridgeOptions = {
  namespace: string
  enResource: JsonResource
  srResource: JsonResource
  routeMatch: (path: string) => boolean
  aliases?: Record<string, string>
  resolveStaticKey?: (
    text: string,
    element: Element | null,
  ) => string | null
  transformParams?: (
    key: string,
    params: Params,
    t: Translator,
  ) => Params
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegexSegment(value: string): string {
  return value
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+')
}

function flattenResource(
  resource: JsonResource,
  prefix = '',
): Array<{ key: string; value: string }> {
  const result: Array<{ key: string; value: string }> = []

  Object.entries(resource).forEach(([name, value]) => {
    const key = prefix ? `${prefix}.${name}` : name

    if (typeof value === 'string') {
      result.push({ key, value })
      return
    }

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result.push(
        ...flattenResource(value as JsonResource, key),
      )
    }
  })

  return result
}

function compileTemplate(
  key: string,
  source: string,
): TemplateDefinition | null {
  const placeholder =
    /{{\s*([A-Za-z0-9_]+)\s*}}/g

  const params: string[] = []
  let pattern = '^'
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = placeholder.exec(source))) {
    pattern += escapeRegexSegment(
      source.slice(cursor, match.index),
    )

    params.push(match[1])
    pattern += '(.+?)'
    cursor = match.index + match[0].length
  }

  if (!params.length) {
    return null
  }

  pattern += escapeRegexSegment(
    source.slice(cursor),
  )
  pattern += '$'

  return {
    key,
    regex: new RegExp(pattern),
    params,
  }
}

function getCurrentRoute(): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  const hashPath = window.location.hash
    .replace(/^#/, '')
    .split('?')[0]

  if (hashPath) {
    return hashPath
  }

  return window.location.pathname
}

function getTranslationRoots(): Element[] {
  const roots = new Set<Element>()

  const main = document.querySelector('main')
  const app = document.getElementById('app')

  if (main) {
    roots.add(main)
  } else if (app) {
    roots.add(app)
  }

  // Many dialogs, menus and popovers are rendered through portals outside <main>.
  // Include those surfaces so route localization also covers modal/overlay UI.
  document
    .querySelectorAll(
      [
        '[data-tutorial-overlay-panel="true"]',
        '[role="dialog"]',
        '[role="menu"]',
        '[data-radix-popper-content-wrapper]',
      ].join(','),
    )
    .forEach(element => {
      roots.add(element)
    })

  return Array.from(roots)
}

function looksLikeTranslationKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(value)
}

export function createLegacyLocalizationBridge(
  options: LegacyLocalizationBridgeOptions,
) {
  const {
    namespace,
    enResource,
    srResource,
    routeMatch,
    aliases = {},
    resolveStaticKey,
    transformParams,
  } = options

  // Always merge the route-specific resource. Central registration may already
  // have created the namespace, while some bridges intentionally extend it with
  // small helper-only keys used for legacy dynamic UI.
  i18n.addResourceBundle(
    'en',
    namespace,
    enResource,
    true,
    true,
  )

  i18n.addResourceBundle(
    'sr-Latn',
    namespace,
    srResource,
    true,
    true,
  )

  const exactMap = new Map<string, string>()
  const templates: TemplateDefinition[] = []

  flattenResource(enResource).forEach(
    ({ key, value }) => {
      const normalized = normalizeText(value)
      const fullKey = `${namespace}:${key}`

      const template = compileTemplate(
        fullKey,
        normalized,
      )

      if (template) {
        templates.push(template)
      } else if (normalized && !exactMap.has(normalized)) {
        // Preserve the first matching key rather than letting later duplicate
        // English values (often tutorial/help copies) overwrite the primary UI key.
        exactMap.set(normalized, fullKey)
      }
    },
  )

  Object.entries(aliases).forEach(
    ([source, key]) => {
      exactMap.set(
        normalizeText(source),
        key.includes(':')
          ? key
          : `${namespace}:${key}`,
      )
    },
  )

  const textState = new WeakMap<Node, NodeState>()

  const attributeState = new WeakMap<
    Element,
    Map<string, NodeState>
  >()

  function detectToken(
    text: string,
    element: Element | null,
  ): Token | null {
    const normalized = normalizeText(text)

    const resolved =
      resolveStaticKey?.(
        normalized,
        element,
      ) ?? null

    if (resolved) {
      return {
        key: resolved.includes(':')
          ? resolved
          : `${namespace}:${resolved}`,
      }
    }

    // If a component accidentally renders an i18n key literally (for example
    // "history.title" or "common.next"), resolve it instead of showing the key.
    if (looksLikeTranslationKey(normalized)) {
      const namespacedKey = `${namespace}:${normalized}`

      if (i18n.exists(namespacedKey)) {
        return { key: namespacedKey }
      }
    }

    if (normalized.includes(':') && i18n.exists(normalized)) {
      return { key: normalized }
    }

    const exact = exactMap.get(normalized)

    if (exact) {
      return { key: exact }
    }

    for (const template of templates) {
      const match = template.regex.exec(
        normalized,
      )

      if (!match) continue

      const params: Params = {}

      template.params.forEach(
        (name, index) => {
          params[name] =
            match[index + 1] ?? ''
        },
      )

      return {
        key: template.key,
        params,
      }
    }

    return null
  }

  function renderToken(
    token: Token,
    t: Translator,
  ): string {
    const params = token.params
      ? transformParams
        ? transformParams(
            token.key,
            { ...token.params },
            t,
          )
        : token.params
      : undefined

    return String(
      t(
        token.key,
        params ?? {},
      ),
    )
  }

  function setTranslatedText(
    node: Text,
    translated: string,
  ): void {
    const original = node.nodeValue ?? ''
    const leading =
      original.match(/^\s+/)?.[0] ?? ''
    const trailing =
      original.match(/\s+$/)?.[0] ?? ''

    node.nodeValue =
      `${leading}${translated}${trailing}`
  }

  function translateTextNodes(
    root: Element,
    t: Translator,
  ): void {
    const walker =
      document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
      )

    let node = walker.nextNode()

    while (node) {
      const textNode = node as Text
      const current = normalizeText(
        textNode.nodeValue ?? '',
      )

      if (current) {
        const previous =
          textState.get(textNode)

        const token =
          previous &&
          current === previous.lastRendered
            ? previous.token
            : detectToken(
                current,
                textNode.parentElement,
              )

        if (token) {
          const translated =
            renderToken(token, t)

          const normalizedTranslation =
            normalizeText(translated)

          if (
            current !==
            normalizedTranslation
          ) {
            setTranslatedText(
              textNode,
              translated,
            )
          }

          textState.set(textNode, {
            token,
            lastRendered:
              normalizedTranslation,
          })
        }
      }

      node = walker.nextNode()
    }
  }

  function translateAttributes(
    root: Element,
    t: Translator,
  ): void {
    root
      .querySelectorAll('*')
      .forEach(element => {
        let stateMap =
          attributeState.get(element)

        for (const attribute of [
          'title',
          'aria-label',
          'placeholder',
          'alt',
        ] as const) {
          const current = normalizeText(
            element.getAttribute(
              attribute,
            ) ?? '',
          )

          if (!current) continue

          const previous =
            stateMap?.get(attribute)

          const token =
            previous &&
            current ===
              previous.lastRendered
              ? previous.token
              : detectToken(
                  current,
                  element,
                )

          if (!token) continue

          const translated =
            renderToken(token, t)

          const normalizedTranslation =
            normalizeText(translated)

          if (
            normalizeText(
              element.getAttribute(
                attribute,
              ) ?? '',
            ) !==
            normalizedTranslation
          ) {
            element.setAttribute(
              attribute,
              translated,
            )
          }

          if (!stateMap) {
            stateMap =
              new Map<
                string,
                NodeState
              >()

            attributeState.set(
              element,
              stateMap,
            )
          }

          stateMap.set(attribute, {
            token,
            lastRendered:
              normalizedTranslation,
          })
        }
      })
  }

  function LegacyLocalizationBridge(): null {
    const {
      t,
      i18n: reactI18n,
    } = useTranslation(namespace)

    const [route, setRoute] =
      useState(getCurrentRoute)

    const isActiveRoute =
      useMemo(
        () => routeMatch(route),
        [route],
      )

    useEffect(() => {
      const handleRouteChange =
        (): void => {
          setRoute(getCurrentRoute())
        }

      window.addEventListener(
        'hashchange',
        handleRouteChange,
      )

      window.addEventListener(
        'popstate',
        handleRouteChange,
      )

      return () => {
        window.removeEventListener(
          'hashchange',
          handleRouteChange,
        )

        window.removeEventListener(
          'popstate',
          handleRouteChange,
        )
      }
    }, [])

    useEffect(() => {
      if (!isActiveRoute) return

      let applying = false
      let scheduled = false

      const applyTranslations =
        (): void => {
          if (applying) return

          applying = true

          try {
            getTranslationRoots().forEach(
              root => {
                translateTextNodes(
                  root,
                  t,
                )

                translateAttributes(
                  root,
                  t,
                )
              },
            )
          } finally {
            applying = false
          }
        }

      const scheduleApply =
        (): void => {
          if (scheduled) return

          scheduled = true

          queueMicrotask(() => {
            scheduled = false
            applyTranslations()
          })
        }

      applyTranslations()

      const observer =
        new MutationObserver(() => {
          scheduleApply()
        })

      observer.observe(
        document.body,
        {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: [
            'title',
            'aria-label',
            'placeholder',
            'alt',
          ],
        },
      )

      const handleLanguageChanged =
        (): void => {
          scheduleApply()
        }

      reactI18n.on(
        'languageChanged',
        handleLanguageChanged,
      )

      return () => {
        observer.disconnect()

        reactI18n.off(
          'languageChanged',
          handleLanguageChanged,
        )
      }
    }, [
      isActiveRoute,
      reactI18n,
      t,
    ])

    return null
  }

  return LegacyLocalizationBridge
}
