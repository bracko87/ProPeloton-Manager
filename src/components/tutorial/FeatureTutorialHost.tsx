import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthProvider'
import {
  advancedTutorialModules,
  findAdvancedTutorialModule,
  type AdvancedTutorialModule,
} from '../../lib/advancedTutorials'
import { supabase } from '../../lib/supabase'
import {
  getTutorialProgress,
  isTutorialActiveInThisSession,
  saveTutorialProgress,
} from '../../lib/tutorialProgress'
import TutorialOverlay from './TutorialOverlay'
import TutorialTargetFrame from './TutorialTargetFrame'

type TutorialMode = 'closed' | 'invite' | 'steps' | 'core-bridge'

const CORE_BRIDGE_FLOW: Record<string, { nextKey: string; nextRoute: string; primaryAction: string }> = {
  'national-championships': {
    nextKey: 'national-association',
    nextRoute: '/dashboard/national-association',
    primaryAction: 'Continue to National Association',
  },
  'national-association': {
    nextKey: 'youth-academy',
    nextRoute: '/dashboard/youth-academy',
    primaryAction: 'Continue to Youth Academy',
  },
  'youth-academy': {
    nextKey: 'menu',
    nextRoute: '/dashboard/overview',
    primaryAction: 'Continue to Menu',
  },
}

function getModuleByKey(key: string): AdvancedTutorialModule | null {
  return advancedTutorialModules.find(module => module.key === key) ?? null
}

async function isContextuallyEligible(
  module: AdvancedTutorialModule,
): Promise<boolean> {
  if (!module.contextualEligibility || module.contextualEligibility === 'always') {
    return true
  }

  if (module.contextualEligibility === 'premium-youth') {
    const { data, error } = await supabase.rpc('get_my_youth_academy_v1')

    if (error) {
      console.warn('Could not resolve Youth Academy tutorial eligibility:', error.message)
      return false
    }

    const payload = (data ?? null) as { premium?: boolean } | null
    return payload?.premium === true
  }

  if (module.contextualEligibility === 'national-coach') {
    const cycleResponse = await supabase.rpc('get_my_current_nations_cycle_v1')

    if (cycleResponse.error) {
      console.warn(
        'Could not resolve National Coach tutorial cycle:',
        cycleResponse.error.message,
      )
      return false
    }

    const cycle = (cycleResponse.data ?? null) as {
      state?: string
      cycle_key?: string | null
    } | null
    const cycleKey =
      cycle?.state === 'active_cycle' && cycle.cycle_key
        ? cycle.cycle_key
        : 'season_main'

    const workspaceResponse = await supabase.rpc(
      'get_my_national_team_squad_workspace_v1',
      { p_cycle_key: cycleKey },
    )

    if (workspaceResponse.error) {
      console.warn(
        'Could not resolve National Coach tutorial eligibility:',
        workspaceResponse.error.message,
      )
      return false
    }

    const workspace = (workspaceResponse.data ?? null) as {
      allowed?: boolean
    } | null

    return workspace?.allowed === true
  }

  return true
}

async function resolveYouthTutorial(
  defaultModule: AdvancedTutorialModule,
): Promise<AdvancedTutorialModule> {
  const graduationModule = getModuleByKey('youth-graduation')
  if (!graduationModule) return defaultModule

  const [academyProgress, graduationProgress] = await Promise.all([
    getTutorialProgress('youth-academy'),
    getTutorialProgress('youth-graduation'),
  ])

  // Explicit Help restarts always win.
  if (academyProgress?.status === 'started') return defaultModule
  if (graduationProgress?.status === 'started') return graduationModule

  // The general Academy tutorial should be encountered before the contextual
  // graduation guide.
  if (
    !academyProgress ||
    academyProgress.status === 'not_started'
  ) {
    return defaultModule
  }

  if (
    graduationProgress?.status === 'completed' ||
    graduationProgress?.status === 'skipped'
  ) {
    return defaultModule
  }

  const { data, error } = await supabase.rpc('get_my_youth_graduations_v1')
  if (error) {
    console.warn('Could not resolve Youth graduation tutorial trigger:', error.message)
    return defaultModule
  }

  const graduations = Array.isArray(data)
    ? (data as Array<{ completed_on?: string | null }>)
    : []

  return graduations.some(item => !item.completed_on)
    ? graduationModule
    : defaultModule
}

export default function FeatureTutorialHost(): JSX.Element | null {
  const { user, loading: authLoading } = useAuth()
  const { t } = useTranslation('help')
  const location = useLocation()
  const navigate = useNavigate()
  const routeModule = useMemo(
    () => findAdvancedTutorialModule(location.pathname),
    [location.pathname],
  )

  const [module, setModule] = useState<AdvancedTutorialModule | null>(null)
  const [mode, setMode] = useState<TutorialMode>('closed')
  const [stepIndex, setStepIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true

    async function loadModule(): Promise<void> {
      setMode('closed')
      setStepIndex(0)
      setModule(null)

      if (
        authLoading ||
        !user ||
        !routeModule ||
        !location.pathname.startsWith('/dashboard/')
      ) {
        return
      }

      setLoading(true)

      // A manager may disable all contextual tutorial prompts persistently.
      // Explicit Help restarts are still allowed for the selected tutorial.
      const { data: tutorialPrefs, error: prefsError } = await supabase
        .from('user_tutorial_preferences')
        .select('auto_tutorials_disabled')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!alive) return
      if (prefsError) {
        console.warn('Could not load tutorial prompt preference:', prefsError.message)
      }
      // On a transient preference error, fail closed for *automatic* prompts
      // but preserve an explicit, in-session Help restart.
      const autoTutorialsDisabled =
        Boolean(prefsError) || tutorialPrefs?.auto_tutorials_disabled === true
      const autoStartTutorial = window.sessionStorage.getItem('ppm:auto-start-tutorial')
      const isCoreBridge =
        autoStartTutorial === routeModule.key &&
        Object.prototype.hasOwnProperty.call(CORE_BRIDGE_FLOW, routeModule.key)

      if (isCoreBridge && (!autoTutorialsDisabled ||
          isTutorialActiveInThisSession(routeModule.key) ||
          window.sessionStorage.getItem('ppm:manual-tutorial-chain') === '1')) {
        if (!alive) return
        setModule(routeModule)
        setStepIndex(0)
        setMode('core-bridge')
        setLoading(false)
        return
      }

      const resolvedModule =
        routeModule.key === 'youth-academy'
          ? await resolveYouthTutorial(routeModule)
          : routeModule

      if (!alive) return
      setModule(resolvedModule)

      const progress = await getTutorialProgress(resolvedModule.key)
      if (!alive) return

      // Explicit restart/resume from Help is represented by "started" plus the
      // active-session marker maintained by tutorialProgress.ts. It is allowed
      // even when the contextual trigger is not currently available so users
      // can always revisit a completed/skipped tutorial from Help.
      if (progress?.status === 'started') {
        const savedIndex = resolvedModule.steps.findIndex(
          step => step.key === progress.last_step_key,
        )
        setStepIndex(savedIndex >= 0 ? savedIndex : 0)
        setMode('steps')
        setLoading(false)
        return
      }

      if (progress?.status === 'completed' || progress?.status === 'skipped') {
        setMode('closed')
        setLoading(false)
        return
      }

      if (autoTutorialsDisabled) {
        setMode('closed')
        setLoading(false)
        return
      }
      const eligible = await isContextuallyEligible(resolvedModule)
      if (!alive) return

      setMode(eligible ? 'invite' : 'closed')
      setLoading(false)
    }

    void loadModule()

    return () => {
      alive = false
    }
  }, [authLoading, location.pathname, routeModule, user])

  if (!module || loading || mode === 'closed') return null

  const activeStep = module.steps[stepIndex] ?? module.steps[0]
  const isLastStep = stepIndex >= module.steps.length - 1

  async function continueCoreBridge(): Promise<void> {
    if (!module) return

    const bridge = CORE_BRIDGE_FLOW[module.key]
    if (!bridge) {
      window.sessionStorage.removeItem('ppm:manual-tutorial-chain')
      window.sessionStorage.removeItem('ppm:auto-start-tutorial')
      setMode('closed')
      return
    }

    const currentStep = module.steps[stepIndex] ?? module.steps[0]
    const isLastCoreStep = stepIndex >= module.steps.length - 1

    if (!isLastCoreStep) {
      const nextIndex = stepIndex + 1
      const nextStep = module.steps[nextIndex]

      await saveTutorialProgress(module.key, 'started', nextStep?.key ?? null)
      setStepIndex(nextIndex)
      return
    }

    await saveTutorialProgress(
      module.key,
      'completed',
      currentStep?.key ?? null,
    )

    window.sessionStorage.setItem('ppm:auto-start-tutorial', bridge.nextKey)
    setMode('closed')
    navigate(bridge.nextRoute)
  }

  async function stopCoreBridge(): Promise<void> {
    window.sessionStorage.removeItem('ppm:auto-start-tutorial')
    window.sessionStorage.removeItem('ppm:manual-tutorial-chain')
    if (module) await saveTutorialProgress(module.key, 'skipped', null)
    setMode('closed')
  }

  async function startTutorial(): Promise<void> {
    if (!module || module.steps.length === 0) return

    await saveTutorialProgress(module.key, 'started', module.steps[0].key)
    setStepIndex(0)
    setMode('steps')
  }

  async function skipTutorial(): Promise<void> {
    if (!module) return

    await saveTutorialProgress(module.key, 'skipped', null)
    setMode('closed')
  }

  async function maybeOfferGraduationTutorial(): Promise<boolean> {
    if (!module || module.key !== 'youth-academy') return false

    const graduationModule = getModuleByKey('youth-graduation')
    if (!graduationModule) return false

    const graduationProgress = await getTutorialProgress('youth-graduation')
    if (
      graduationProgress?.status === 'completed' ||
      graduationProgress?.status === 'skipped'
    ) {
      return false
    }

    const { data, error } = await supabase.rpc('get_my_youth_graduations_v1')
    if (error) return false

    const graduations = Array.isArray(data)
      ? (data as Array<{ completed_on?: string | null }>)
      : []

    if (!graduations.some(item => !item.completed_on)) return false

    setModule(graduationModule)
    setStepIndex(0)
    setMode('invite')
    return true
  }

  async function nextStep(): Promise<void> {
    if (!module || !activeStep) return

    if (isLastStep) {
      await saveTutorialProgress(module.key, 'completed', activeStep.key)

      if (await maybeOfferGraduationTutorial()) {
        return
      }

      setMode('closed')
      return
    }

    const nextIndex = stepIndex + 1
    const nextStep = module.steps[nextIndex]
    await saveTutorialProgress(module.key, 'started', nextStep.key)
    setStepIndex(nextIndex)
  }

  async function closeTutorial(): Promise<void> {
    if (!module) return

    if (mode === 'core-bridge') {
      await stopCoreBridge()
      return
    }

    if (mode === 'invite') {
      await skipTutorial()
      return
    }

    // Closing an unfinished tutorial is a persistent dismissal, not a
    // resumable "started" state that can unexpectedly reopen.
    await saveTutorialProgress(module.key, 'skipped', null)
    setMode('closed')
  }

  async function learnMore(): Promise<void> {
    if (!module) return

    await saveTutorialProgress(
      module.key,
      'completed',
      activeStep?.key ?? module.steps[module.steps.length - 1]?.key ?? null,
    )
    setMode('closed')
    navigate('/dashboard/manual')
  }

  if (mode === 'core-bridge') {
    const bridge = CORE_BRIDGE_FLOW[module.key]
    const bridgeStep = module.steps[stepIndex] ?? module.steps[0]
    const isLastCoreStep = stepIndex >= module.steps.length - 1

    if (!bridge || !bridgeStep) return null

    return (
      <>
        <TutorialTargetFrame
          target={bridgeStep.target ?? module.target ?? 'dashboard-page-body'}
        />
        <TutorialOverlay
          open
          title={bridgeStep.title}
          body={bridgeStep.body}
          accessNote={bridgeStep.accessNote}
          tip={bridgeStep.tip}
          stepLabel={`${stepIndex + 1}/${module.steps.length}`}
          primaryAction={
            isLastCoreStep
              ? bridge.primaryAction
              : bridgeStep.primaryAction ?? 'Next'
          }
          secondaryAction={t('tutorialControl.finishForNow')}
          onPrimary={() => void continueCoreBridge()}
          onSecondary={() => void stopCoreBridge()}
          onClose={() => void stopCoreBridge()}
          onDismiss={() => void stopCoreBridge()}
          dismissLabel={t('tutorialControl.dismiss')}
          compact={bridgeStep.compact}
        />
      </>
    )
  }

  if (mode === 'invite') {
    return (
      <TutorialOverlay
        open
        variant="invite"
        title={t('tutorialControl.inviteTitle', {
          feature: t('tutorialModules.' + module.key + '.title', { defaultValue: module.title }),
        })}
        body={t('tutorialModules.' + module.key + '.description', { defaultValue: module.description })}
        primaryAction={t('tutorialControl.startTutorial')}
        secondaryAction={t('tutorialControl.noThanks')}
        onPrimary={() => void startTutorial()}
        onSecondary={() => void skipTutorial()}
        onClose={() => void skipTutorial()}
        onDismiss={() => void skipTutorial()}
        dismissLabel={t('tutorialControl.dismiss')}
      />
    )
  }

  return (
    <>
      <TutorialTargetFrame
        target={activeStep.target ?? module.target ?? 'dashboard-page-body'}
      />
      <TutorialOverlay
        open
        title={activeStep.title}
        body={activeStep.body}
        accessNote={activeStep.accessNote}
        tip={activeStep.tip}
        stepLabel={`${stepIndex + 1}/${module.steps.length}`}
        primaryAction={activeStep.primaryAction ?? (isLastStep ? 'Finish tutorial' : 'Next')}
        secondaryAction={
          isLastStep
            ? activeStep.secondaryAction ?? 'Learn More'
            : 'Skip tutorial'
        }
        onPrimary={() => void nextStep()}
        onSecondary={() => void (isLastStep ? learnMore() : skipTutorial())}
        onClose={() => void closeTutorial()}
        onDismiss={() => void skipTutorial()}
        dismissLabel={t('tutorialControl.dismiss')}
        compact={activeStep.compact}
      />
    </>
  )
}
