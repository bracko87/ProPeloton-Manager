// src/components/tutorial/TutorialOverlay.tsx
import React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  getTutorialNavigationState,
  restorePreviousTutorial,
  restorePreviousTutorialStep,
  TUTORIAL_HISTORY_CHANGED_EVENT,
  TUTORIAL_RESTORE_NAVIGATION_EVENT,
} from '../../lib/tutorialProgress'

type TutorialOverlayProps = {
  open: boolean
  title: string
  body: string
  stepLabel?: string
  primaryAction: string
  secondaryAction?: string
  variant?: 'invite' | 'panel'
  onPrimary: () => void
  onSecondary?: () => void
  onClose?: () => void
  primaryDisabled?: boolean
  compact?: boolean
}

/**
 * Build a lookup from the canonical English tutorial text to its i18n key.
 *
 * Tutorial step metadata is still defined in src/lib/tutorials.ts because that
 * file also owns targets, step keys and progression data. Keeping that metadata
 * untouched avoids changing tutorial flow/progress behavior. The overlay uses
 * the English resource as the bridge from those canonical literals to the
 * currently selected application language.
 */
function buildTutorialLiteralKeyMap(
  value: unknown,
  prefix = '',
  map = new Map<string, string>(),
): Map<string, string> {
  if (typeof value === 'string') {
    if (prefix && !map.has(value)) {
      map.set(value, prefix)
    }

    return map
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return map
  }

  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const nestedPrefix = prefix ? `${prefix}.${key}` : key
    buildTutorialLiteralKeyMap(nestedValue, nestedPrefix, map)
  }

  return map
}

export default function TutorialOverlay({
  open,
  title,
  body,
  stepLabel,
  primaryAction,
  secondaryAction,
  variant = 'panel',
  onPrimary,
  onSecondary,
  onClose,
  primaryDisabled = false,
  compact = false,
}: TutorialOverlayProps): JSX.Element | null {
  const { t, i18n } = useTranslation('tutorials')
  const bodyScrollRef = React.useRef<HTMLDivElement | null>(null)
  const [previousBusy, setPreviousBusy] = React.useState(false)
  const [navigationState, setNavigationState] = React.useState(() =>
    getTutorialNavigationState(),
  )

  const englishLiteralKeys = React.useMemo(() => {
    return buildTutorialLiteralKeyMap(
      i18n.getResourceBundle('en', 'tutorials'),
    )
  }, [i18n])

  const localizeTutorialLiteral = React.useCallback(
    (value: string | undefined): string | undefined => {
      if (!value) return value

      const key = englishLiteralKeys.get(value)
      if (!key) return value

      const translated = t(key)
      return typeof translated === 'string' ? translated : value
    },
    [englishLiteralKeys, t],
  )

  const localizedTitle = localizeTutorialLiteral(title) ?? title
  const localizedBody = localizeTutorialLiteral(body) ?? body
  const localizedPrimaryAction =
    localizeTutorialLiteral(primaryAction) ?? primaryAction
  const localizedSecondaryAction =
    localizeTutorialLiteral(secondaryAction) ?? secondaryAction

  const localizedPreviousAction = t('common.previous', {
    defaultValue: 'Previous',
  })
  const localizedPreviousTutorialAction = t('common.previousTutorial', {
    defaultValue: 'Previous tutorial',
  })

  const contentKey = React.useMemo(
    () =>
      [
        variant,
        stepLabel ?? '',
        title,
        body,
        primaryAction,
        secondaryAction ?? '',
        compact ? 'compact' : 'regular',
      ].join('|'),
    [variant, stepLabel, title, body, primaryAction, secondaryAction, compact],
  )

  React.useEffect(() => {
    const scrollElement = bodyScrollRef.current
    if (!scrollElement) return

    scrollElement.scrollTop = 0
    scrollElement.scrollLeft = 0
  }, [contentKey])

  React.useEffect(() => {
    if (!open || variant !== 'panel') return

    function refreshNavigationState(): void {
      setNavigationState(getTutorialNavigationState())
    }

    refreshNavigationState()

    window.addEventListener(
      TUTORIAL_HISTORY_CHANGED_EVENT,
      refreshNavigationState,
    )
    window.addEventListener(
      TUTORIAL_RESTORE_NAVIGATION_EVENT,
      refreshNavigationState,
    )
    window.addEventListener('storage', refreshNavigationState)
    window.addEventListener('focus', refreshNavigationState)

    return () => {
      window.removeEventListener(
        TUTORIAL_HISTORY_CHANGED_EVENT,
        refreshNavigationState,
      )
      window.removeEventListener(
        TUTORIAL_RESTORE_NAVIGATION_EVENT,
        refreshNavigationState,
      )
      window.removeEventListener('storage', refreshNavigationState)
      window.removeEventListener('focus', refreshNavigationState)
    }
  }, [open, variant, contentKey])

  React.useEffect(() => {
    if (!previousBusy) return

    const timeoutId = window.setTimeout(() => {
      setPreviousBusy(false)
      setNavigationState(getTutorialNavigationState())
    }, 1200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [previousBusy])

  async function handlePreviousStep(): Promise<void> {
    if (previousBusy) return

    setPreviousBusy(true)

    try {
      await restorePreviousTutorialStep()
      setNavigationState(getTutorialNavigationState())
    } catch (error) {
      console.warn('Could not restore previous tutorial step:', error)
      setNavigationState(getTutorialNavigationState())
    } finally {
      window.setTimeout(() => {
        setPreviousBusy(false)
        setNavigationState(getTutorialNavigationState())
      }, 250)
    }
  }

  async function handlePreviousTutorial(): Promise<void> {
    if (previousBusy) return

    setPreviousBusy(true)

    try {
      await restorePreviousTutorial()
      setNavigationState(getTutorialNavigationState())
    } catch (error) {
      console.warn('Could not restore previous tutorial:', error)
      setNavigationState(getTutorialNavigationState())
    } finally {
      window.setTimeout(() => {
        setPreviousBusy(false)
        setNavigationState(getTutorialNavigationState())
      }, 250)
    }
  }

  if (!open) return null

  if (variant === 'invite') {
    return createPortal(
      <div
        key={`tutorial-invite-${contentKey}`}
        data-tutorial-overlay-panel="true"
        className="fixed right-4 top-28 z-[1000] flex max-w-[calc(100vw-32px)] items-start gap-3"
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <button
            type="button"
            onClick={onPrimary}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-yellow-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-sm font-normal text-yellow-400">
              ?
            </span>

            <span>
              <span className="block text-sm font-normal text-slate-900">
                {localizedTitle}
              </span>
              <span className="mt-0.5 block max-w-[280px] text-xs leading-5 text-slate-500">
                {localizedBody}
              </span>
            </span>
          </button>

          <div className="flex items-center justify-between gap-3 px-4 py-3">
            {localizedSecondaryAction && onSecondary ? (
              <button
                type="button"
                onClick={onSecondary}
                className="text-xs font-normal text-slate-500 hover:text-black hover:underline"
              >
                {localizedSecondaryAction}
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled}
              className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-normal text-black shadow-sm transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {localizedPrimaryAction}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  const footerActionClass =
    'shrink-0 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-black disabled:cursor-not-allowed disabled:opacity-60'

  const primaryActionClass =
    'shrink-0 whitespace-nowrap rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-normal text-black shadow-sm transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60'

  return createPortal(
    <>
      <div className="pointer-events-none fixed inset-0 z-[999] bg-black/10" />

      <aside
        key={`tutorial-panel-${contentKey}`}
        data-tutorial-overlay-panel="true"
        className={`fixed right-4 top-24 z-[1000] flex max-h-[calc(100vh-112px)] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl ${
          compact ? 'w-[560px]' : 'w-[640px]'
        }`}
      >
        <div className="shrink-0 bg-black px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              {stepLabel ? (
                <div className="mb-2 text-xs font-normal uppercase tracking-[0.3em] text-yellow-400">
                  {stepLabel}
                </div>
              ) : null}

              <h3 className="text-xl font-normal leading-7 text-white">
                {localizedTitle}
              </h3>
            </div>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 text-lg font-normal text-white hover:bg-white/10"
                aria-label={t('common.closeTutorial')}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>

        <div
          ref={bodyScrollRef}
          className={`min-h-0 flex-1 overflow-y-auto ${
            compact ? 'px-5 py-5' : 'px-6 py-6'
          }`}
        >
          <div className="whitespace-pre-line text-sm font-normal leading-7 text-slate-700">
            {localizedBody}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex shrink-0 items-center gap-2">
              {localizedSecondaryAction && onSecondary ? (
                <button
                  type="button"
                  onClick={onSecondary}
                  className={footerActionClass}
                >
                  {localizedSecondaryAction}
                </button>
              ) : null}

              {navigationState.canGoPreviousTutorial ? (
                <button
                  type="button"
                  onClick={() => {
                    void handlePreviousTutorial()
                  }}
                  disabled={previousBusy}
                  className={footerActionClass}
                >
                  {localizedPreviousTutorialAction}
                </button>
              ) : null}

              {navigationState.canGoPrevious ? (
                <button
                  type="button"
                  onClick={() => {
                    void handlePreviousStep()
                  }}
                  disabled={previousBusy}
                  className={footerActionClass}
                >
                  {localizedPreviousAction}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled}
              className={primaryActionClass}
            >
              {localizedPrimaryAction}
            </button>
          </div>
        </div>
      </aside>
    </>,
    document.body,
  )
}
