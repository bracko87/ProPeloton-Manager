// src/components/tutorial/TutorialOverlay.tsx
import React from 'react'
import { createPortal } from 'react-dom'
import { GripHorizontal } from 'lucide-react'
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
  tip?: string
  stepLabel?: string
  primaryAction: string
  secondaryAction?: string
  finishAction?: string
  variant?: 'invite' | 'panel'
  onPrimary: () => void
  onSecondary?: () => void
  onFinish?: () => void
  onClose?: () => void
  primaryDisabled?: boolean
  compact?: boolean
}

type SmoothStartMode = 'offer' | 'guide' | 'completion' | null

type SmoothStartStep = {
  title: string
  body: string
}

const SMOOTH_START_OFFER = {
  title: 'A Smooth Start: Our Recommended First Steps',
  body:
    'You have reached the end of the main tutorial. Before you finish, we can show you six practical first steps that we recommend for a smoother first season.\n\n' +
    'This part is completely optional. You can open the smooth-start guide now, or finish the tutorial and continue on your own.',
  primaryAction: 'Show me the smooth start',
  secondaryAction: 'Finish tutorial',
}

const SMOOTH_START_STEPS: SmoothStartStep[] = [
  {
    title: 'Step 1: Sign Your Sponsors',
    body:
      'Start with Finance → Sponsors and sign your Main, Secondary, and Technical sponsors.\n\n' +
      'Choose carefully instead of simply taking the first offer. Compare the guaranteed money, contract conditions, and the objectives attached to each deal. A sponsor with stronger objectives can sometimes bring much higher rewards if your team can realistically achieve them.\n\n' +
      'Pay special attention to the Technical Sponsor as well. A good technical deal can give you valuable equipment discounts and save a lot of money when you begin building your inventory.\n\n' +
      'Your sponsor choices are one of the first important financial decisions of the season, so it is worth spending a little time comparing the offers before signing.',
  },
  {
    title: 'Step 2: Check Your Squad and Make a Plan',
    body:
      'Open your Squad and decide what kind of races you want your team to target. Make sure you have enough riders for the profiles you plan to race: sprinters for flat races, climbers for mountain races, time-trial specialists for TT-heavy events, and enough support riders for the rest of the team.\n\n' +
      'If you are missing an important rider type, check the Transfers page and Free Agents. A free agent can be a useful and often simpler way to strengthen a new team.\n\n' +
      'But do not sign riders only because they are available. Every additional rider increases your wage bill, and transfer fees, agent fees, and contracts can quickly reduce your budget. Build the squad around a plan, not around quantity.',
  },
  {
    title: 'Step 3: Assign Training',
    body:
      'Every rider should have a sensible training plan. Use Training to improve the skills that fit each rider’s role and the races you want to target.\n\n' +
      'Training is important, but more training is not always better. Hard training and badly timed training can increase fatigue, and fatigue can become one of your biggest enemies when races begin.\n\n' +
      'Balance improvement with recovery. If a rider is becoming too tired, reduce the workload or use recovery and days off so that the rider reaches important races in good condition.',
  },
  {
    title: 'Step 4: Build Equipment Around Your Race Plan',
    body:
      'Next, decide how you want to invest in equipment. You can specialize by buying stronger, more expensive equipment for the race profiles you want to target first, and then apply mainly for those races.\n\n' +
      'Another option is to buy more balanced medium-level equipment across several categories. That gives you more flexibility and lets your team compete in a wider range of race profiles while your budget is still developing.\n\n' +
      'Equipment can bring important performance bonuses, so do not ignore it. Be especially careful with Time Trial equipment: a weak or unsuitable TT setup can create significant negative effects, so prepare properly before entering important time trials.',
  },
  {
    title: 'Step 5: Apply for the Right Races',
    body:
      'Go to the Calendar and choose your first races carefully. Check the race category, profile, dates, application window, and whether the race realistically fits the level of your team.\n\n' +
      'Do not immediately chase the biggest races if your club is still in a lower competition level or your squad is not ready to compete there. Early in the game, it is often better to target races where you have a realistic chance to score points, collect prize money, and build momentum.\n\n' +
      'Travel also matters. Races closer to your home country can be more economical, especially while your finances are still limited. Build a calendar that matches both your sporting level and your budget.',
  },
  {
    title: 'Step 6: Prepare Every Race and Every Stage',
    body:
      'Once your team is accepted into a race, Race Preparation becomes essential. Make sure you submit the correct riders before the deadline and review your staff, assets, equipment, supplies, and race setup.\n\n' +
      'For stage races, prepare the Stage Plan carefully. Assign the right rider roles and configure the team instructions and individual tactics for the type of stage you are facing. Different race phases and different stage profiles may need different decisions.\n\n' +
      'At the beginning, these six steps are enough to give your club a strong and organized start. Other systems can wait until you are comfortable. If you sign sensible sponsors, build a balanced squad, train carefully, prepare equipment, choose the right races, and complete Race Preparation properly, you will already be managing the most important parts of your first season.',
  },
]

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
  tip,
  stepLabel,
  primaryAction,
  secondaryAction,
  finishAction,
  variant = 'panel',
  onPrimary,
  onSecondary,
  onFinish,
  onClose,
  primaryDisabled = false,
  compact = false,
}: TutorialOverlayProps): JSX.Element | null {
  const { t, i18n } = useTranslation('tutorials')
  const bodyScrollRef = React.useRef<HTMLDivElement | null>(null)
  const panelRef = React.useRef<HTMLElement | null>(null)
  const dragRef = React.useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const [manualPosition, setManualPosition] = React.useState<{
    left: number
    top: number
  } | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [previousBusy, setPreviousBusy] = React.useState(false)
  const [smoothStartMode, setSmoothStartMode] =
    React.useState<SmoothStartMode>(null)
  const [smoothStartStepIndex, setSmoothStartStepIndex] = React.useState(0)
  const [navigationState, setNavigationState] = React.useState(() =>
    getTutorialNavigationState(),
  )

  const isMainTutorialCompletionCard =
    variant === 'panel' &&
    title === 'Tutorial Completed' &&
    primaryAction === 'Finish tutorial'

  React.useEffect(() => {
    if (isMainTutorialCompletionCard) {
      setSmoothStartMode((currentMode) => currentMode ?? 'offer')
      return
    }

    setSmoothStartMode(null)
    setSmoothStartStepIndex(0)
  }, [isMainTutorialCompletionCard])

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

  const activeSmoothStartStep =
    smoothStartMode === 'guide'
      ? SMOOTH_START_STEPS[smoothStartStepIndex]
      : undefined

  const displayTitle =
    smoothStartMode === 'offer'
      ? SMOOTH_START_OFFER.title
      : smoothStartMode === 'guide' && activeSmoothStartStep
        ? activeSmoothStartStep.title
        : title

  const displayBody =
    smoothStartMode === 'offer'
      ? SMOOTH_START_OFFER.body
      : smoothStartMode === 'guide' && activeSmoothStartStep
        ? activeSmoothStartStep.body
        : body

  const displayStepLabel =
    smoothStartMode === 'offer'
      ? 'Optional smooth-start guide'
      : smoothStartMode === 'guide'
        ? `Smooth start ${smoothStartStepIndex + 1}/${SMOOTH_START_STEPS.length}`
        : smoothStartMode === 'completion'
          ? 'Tutorial complete'
          : stepLabel

  const displayPrimaryAction =
    smoothStartMode === 'offer'
      ? SMOOTH_START_OFFER.primaryAction
      : smoothStartMode === 'guide'
        ? smoothStartStepIndex >= SMOOTH_START_STEPS.length - 1
          ? 'Continue'
          : 'Next'
        : primaryAction

  const displaySecondaryAction =
    smoothStartMode === 'offer' || smoothStartMode === 'guide'
      ? SMOOTH_START_OFFER.secondaryAction
      : secondaryAction

  const localizedTitle =
    localizeTutorialLiteral(displayTitle) ?? displayTitle
  const localizedBody = localizeTutorialLiteral(displayBody) ?? displayBody
  const localizedTip = localizeTutorialLiteral(tip) ?? tip
  const localizedPrimaryAction =
    localizeTutorialLiteral(displayPrimaryAction) ?? displayPrimaryAction
  const localizedSecondaryAction =
    localizeTutorialLiteral(displaySecondaryAction) ?? displaySecondaryAction
  const localizedFinishAction =
    localizeTutorialLiteral(finishAction) ?? finishAction

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
        displayStepLabel ?? '',
        displayTitle,
        displayBody,
        tip ?? '',
        displayPrimaryAction,
        displaySecondaryAction ?? '',
        finishAction ?? '',
        compact ? 'compact' : 'regular',
        smoothStartMode ?? 'standard',
        smoothStartStepIndex,
      ].join('|'),
    [
      variant,
      displayStepLabel,
      displayTitle,
      displayBody,
      tip,
      displayPrimaryAction,
      displaySecondaryAction,
      finishAction,
      compact,
      smoothStartMode,
      smoothStartStepIndex,
    ],
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

  function handleDisplayedPrimary(): void {
    if (smoothStartMode === 'offer') {
      setSmoothStartStepIndex(0)
      setSmoothStartMode('guide')
      return
    }

    if (smoothStartMode === 'guide') {
      const isLastSmoothStartStep =
        smoothStartStepIndex >= SMOOTH_START_STEPS.length - 1

      if (isLastSmoothStartStep) {
        setSmoothStartMode('completion')
        return
      }

      setSmoothStartStepIndex((currentIndex) => currentIndex + 1)
      return
    }

    onPrimary()
  }

  function handleDisplayedSecondary(): void {
    if (smoothStartMode === 'offer' || smoothStartMode === 'guide') {
      onPrimary()
      return
    }

    onSecondary?.()
  }

  React.useEffect(() => {
    if (!open) {
      setManualPosition(null)
      dragRef.current = null
      setDragging(false)
    }
  }, [open])

  React.useEffect(() => {
    if (!manualPosition) return

    function clampToViewport(): void {
      const panel = panelRef.current
      if (!panel) return

      const rect = panel.getBoundingClientRect()
      const margin = 8
      setManualPosition(current => {
        if (!current) return current
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin)
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin)
        return {
          left: Math.min(Math.max(current.left, margin), maxLeft),
          top: Math.min(Math.max(current.top, margin), maxTop),
        }
      })
    }

    window.addEventListener('resize', clampToViewport)
    return () => window.removeEventListener('resize', clampToViewport)
  }, [manualPosition])

  function handleDragStart(event: React.PointerEvent<HTMLDivElement>): void {
    if (variant !== 'panel' || event.button !== 0) return

    const target = event.target as HTMLElement
    if (target.closest('button, a, input, select, textarea')) return

    const panel = panelRef.current
    if (!panel) return

    const rect = panel.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    setManualPosition({ left: rect.left, top: rect.top })
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function handleDragMove(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current
    const panel = panelRef.current
    if (!drag || drag.pointerId !== event.pointerId || !panel) return

    const rect = panel.getBoundingClientRect()
    const margin = 8
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin)
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin)

    setManualPosition({
      left: Math.min(
        Math.max(event.clientX - drag.offsetX, margin),
        maxLeft,
      ),
      top: Math.min(
        Math.max(event.clientY - drag.offsetY, margin),
        maxTop,
      ),
    })
  }

  function handleDragEnd(event: React.PointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId !== event.pointerId) return

    dragRef.current = null
    setDragging(false)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
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
            onClick={handleDisplayedPrimary}
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
            {localizedSecondaryAction &&
            (onSecondary || smoothStartMode === 'offer' || smoothStartMode === 'guide') ? (
              <button
                type="button"
                onClick={handleDisplayedSecondary}
                className="text-xs font-normal text-slate-500 hover:text-black hover:underline"
              >
                {localizedSecondaryAction}
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={handleDisplayedPrimary}
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

  const smoothStartIsActive =
    smoothStartMode === 'offer' || smoothStartMode === 'guide'

  return createPortal(
    <>
      {variant === 'invite' ? (
        <div className="pointer-events-none fixed inset-0 z-[998] bg-black/55" />
      ) : null}

      <aside
        ref={panelRef}
        key={`tutorial-panel-${contentKey}`}
        data-tutorial-overlay-panel="true"
        data-tutorial-draggable="true"
        className={`fixed right-4 top-24 z-[1000] flex max-h-[calc(100vh-112px)] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl ${
          compact ? 'w-[560px]' : 'w-[640px]'
        }`}
        style={
          manualPosition
            ? {
                left: manualPosition.left,
                top: manualPosition.top,
                right: 'auto',
              }
            : undefined
        }
      >
        <div
          className={`shrink-0 touch-none bg-black px-6 py-5 text-white ${
            dragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          title="Drag tutorial window"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              {displayStepLabel ? (
                <div className="mb-2 text-xs font-normal uppercase tracking-[0.3em] text-yellow-400">
                  {displayStepLabel}
                </div>
              ) : null}

              <h3 className="text-xl font-normal leading-7 text-white">
                {localizedTitle}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <GripHorizontal
                aria-hidden="true"
                className="h-5 w-5 text-white/55"
              />
            {onClose && !smoothStartIsActive ? (
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

          {localizedTip ? (
            <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3">
              <div className="text-[11px] font-normal uppercase tracking-[0.18em] text-yellow-800">
                {t('common.tip', { defaultValue: 'Tip' })}
              </div>
              <div className="mt-1 text-sm font-normal leading-6 text-slate-700">
                {localizedTip}
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex shrink-0 items-center gap-2">
              {localizedSecondaryAction &&
              (onSecondary || smoothStartIsActive) ? (
                <button
                  type="button"
                  onClick={handleDisplayedSecondary}
                  className={footerActionClass}
                >
                  {localizedSecondaryAction}
                </button>
              ) : null}

              {!smoothStartIsActive && navigationState.canGoPreviousTutorial ? (
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

              {!smoothStartIsActive && navigationState.canGoPrevious ? (
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

            <div className="flex shrink-0 items-center gap-2">
              {localizedFinishAction && onFinish ? (
                <button
                  type="button"
                  onClick={onFinish}
                  className={footerActionClass}
                >
                  {localizedFinishAction}
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleDisplayedPrimary}
                disabled={primaryDisabled}
                className={primaryActionClass}
              >
                {localizedPrimaryAction}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>,
    document.body,
  )
}
