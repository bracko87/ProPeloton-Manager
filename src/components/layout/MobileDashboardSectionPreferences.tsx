import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'
const STORAGE_PREFIX = 'ppm-mobile-section-layout-v1:'

const ENABLED_PAGE_KEYS = new Set([
  'overview',
  'squad',
  'staff',
  'calendar',
  'race-preparation',
  'team-ranking',
  'training',
  'equipment',
  'infrastructure',
  'finance',
  'transfers',
  'statistics',
  'notifications',
  'inbox',
  'scouting',
])

type CollapsibleTarget = {
  id: string
  pageKey: string
  element: HTMLElement
  title: string
  collapsed: boolean
}

function getDashboardRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    'main[data-ppm-dashboard-main="true"][data-ppm-dashboard-page]',
  )
}

function getPageKey(root: HTMLElement): string {
  return root.dataset.ppmDashboardPage ?? ''
}

function getStorageKey(pageKey: string): string {
  return `${STORAGE_PREFIX}${pageKey}`
}

function readCollapsedIds(pageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(getStorageKey(pageKey))
    if (!raw) return new Set()

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()

    return new Set(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    return new Set()
  }
}

function writeCollapsedIds(pageKey: string, values: Set<string>): void {
  try {
    window.localStorage.setItem(
      getStorageKey(pageKey),
      JSON.stringify(Array.from(values)),
    )
  } catch {
    // A blocked/full localStorage should never break the dashboard UI.
  }
}

function findSectionHeading(element: HTMLElement): HTMLElement | null {
  const headings = Array.from(
    element.querySelectorAll<HTMLElement>('h2, h3'),
  )

  return (
    headings.find(heading => {
      let current: HTMLElement | null = heading.parentElement
      let depth = 0

      while (current && current !== element && depth <= 2) {
        current = current.parentElement
        depth += 1
      }

      return current === element && depth <= 2
    }) ?? null
  )
}

function getStructuralPath(element: HTMLElement, root: HTMLElement): string {
  const parts: string[] = []
  let current: HTMLElement | null = element

  while (current && current !== root) {
    const parent: HTMLElement | null = current.parentElement
    if (!parent) break

    const elementSiblings = Array.from(parent.children).filter(
      child => child instanceof HTMLElement,
    )
    const siblingIndex = Math.max(0, elementSiblings.indexOf(current))

    parts.unshift(`${current.tagName.toLowerCase()}:${siblingIndex}`)
    current = parent
  }

  return parts.join('/')
}

function getStableSectionId(
  pageKey: string,
  element: HTMLElement,
  root: HTMLElement,
): string {
  const explicitId = element.id.trim()
  if (explicitId) return `${pageKey}:id:${explicitId}`

  const tutorialTarget = element.dataset.tutorialTarget
  if (tutorialTarget) return `${pageKey}:tutorial:${tutorialTarget}`

  return `${pageKey}:path:${getStructuralPath(element, root)}`
}

function isEligibleSection(element: HTMLElement, root: HTMLElement): boolean {
  if (element === root) return false
  if (element.dataset.ppmMobileSectionToggleHost === 'true') return true

  if (
    element.closest(
      '[role="dialog"], [aria-modal="true"], [data-radix-popper-content-wrapper], nav, header, footer',
    )
  ) {
    return false
  }

  const heading = findSectionHeading(element)
  if (!heading || !heading.textContent?.trim()) return false

  const className = element.className
  const classText = typeof className === 'string' ? className : ''
  const looksLikeCard =
    element.tagName === 'SECTION' ||
    element.tagName === 'ARTICLE' ||
    /rounded-(?:lg|xl|2xl)/.test(classText) ||
    /\bborder\b/.test(classText) ||
    /\bbg-white\b/.test(classText)

  if (!looksLikeCard) return false

  const contentHeight = Math.max(element.scrollHeight, element.offsetHeight)
  return contentHeight >= 110
}

function removeEnhancementMarks(): void {
  document
    .querySelectorAll<HTMLElement>('[data-ppm-mobile-section-toggle-host="true"]')
    .forEach(element => {
      delete element.dataset.ppmMobileSectionToggleHost
      delete element.dataset.ppmMobileSectionCollapsed
      delete element.dataset.ppmMobileSectionId
    })
}

function discoverTargets(): CollapsibleTarget[] {
  const root = getDashboardRoot()
  if (!root) return []

  const pageKey = getPageKey(root)
  if (!ENABLED_PAGE_KEYS.has(pageKey)) return []

  const collapsedIds = readCollapsedIds(pageKey)
  const rawCandidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      'section, article, div.rounded-lg, div.rounded-xl, div.rounded-2xl',
    ),
  ).filter(element => isEligibleSection(element, root))

  const candidates: HTMLElement[] = []

  rawCandidates.forEach(element => {
    const alreadyCoveredByParent = candidates.some(parent => parent.contains(element))
    if (!alreadyCoveredByParent) candidates.push(element)
  })

  return candidates.slice(0, 18).map(element => {
    const heading = findSectionHeading(element)
    const title = heading?.textContent?.replace(/\s+/g, ' ').trim() || 'Section'
    const id = getStableSectionId(pageKey, element, root)
    const collapsed = collapsedIds.has(id)

    element.dataset.ppmMobileSectionToggleHost = 'true'
    element.dataset.ppmMobileSectionId = id
    element.dataset.ppmMobileSectionCollapsed = String(collapsed)

    return {
      id,
      pageKey,
      element,
      title,
      collapsed,
    }
  })
}

function targetSignature(targets: CollapsibleTarget[]): string {
  return targets
    .map(target => `${target.id}:${target.collapsed ? '1' : '0'}:${target.title}`)
    .join('|')
}

export default function MobileDashboardSectionPreferences(): JSX.Element | null {
  const [targets, setTargets] = useState<CollapsibleTarget[]>([])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
    let scheduled = false
    let lastSignature = ''

    const scan = () => {
      scheduled = false

      if (!mediaQuery.matches) {
        removeEnhancementMarks()
        if (lastSignature) {
          lastSignature = ''
          setTargets([])
        }
        return
      }

      const nextTargets = discoverTargets()
      const nextSignature = targetSignature(nextTargets)

      if (nextSignature !== lastSignature) {
        lastSignature = nextSignature
        setTargets(nextTargets)
      }
    }

    const scheduleScan = () => {
      if (scheduled) return
      scheduled = true
      window.requestAnimationFrame(scan)
    }

    scheduleScan()

    const observer = new MutationObserver(scheduleScan)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    const handleHashChange = () => {
      removeEnhancementMarks()
      lastSignature = ''
      setTargets([])
      scheduleScan()
    }

    const handleMediaChange = () => {
      if (!mediaQuery.matches) removeEnhancementMarks()
      scheduleScan()
    }

    window.addEventListener('hashchange', handleHashChange)
    mediaQuery.addEventListener('change', handleMediaChange)

    return () => {
      observer.disconnect()
      window.removeEventListener('hashchange', handleHashChange)
      mediaQuery.removeEventListener('change', handleMediaChange)
      removeEnhancementMarks()
    }
  }, [])

  const toggleTarget = (target: CollapsibleTarget): void => {
    const collapsedIds = readCollapsedIds(target.pageKey)
    const nextCollapsed = !target.collapsed

    if (nextCollapsed) {
      collapsedIds.add(target.id)
    } else {
      collapsedIds.delete(target.id)
    }

    writeCollapsedIds(target.pageKey, collapsedIds)
    target.element.dataset.ppmMobileSectionCollapsed = String(nextCollapsed)

    setTargets(current =>
      current.map(item =>
        item.id === target.id && item.element === target.element
          ? { ...item, collapsed: nextCollapsed }
          : item,
      ),
    )
  }

  if (targets.length === 0) return null

  return (
    <>
      {targets.map(target =>
        createPortal(
          <button
            key={target.id}
            type="button"
            className="ppm-mobile-section-toggle"
            aria-expanded={!target.collapsed}
            aria-label={`${target.collapsed ? 'Expand' : 'Collapse'} ${target.title}`}
            title={`${target.collapsed ? 'Expand' : 'Collapse'} ${target.title}`}
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              toggleTarget(target)
            }}
          >
            <span className="ppm-mobile-section-toggle-title">{target.title}</span>
            <span className="ppm-mobile-section-toggle-icon" aria-hidden="true">
              {target.collapsed ? '▸' : '▾'}
            </span>
          </button>,
          target.element,
        ),
      )}
    </>
  )
}
