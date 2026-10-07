import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'
import {
  findAdvancedTutorialModule,
  type AdvancedTutorialModule,
} from '../../lib/advancedTutorials'
import {
  getTutorialProgress,
  saveTutorialProgress,
} from '../../lib/tutorialProgress'
import TutorialOverlay from './TutorialOverlay'
import TutorialTargetFrame from './TutorialTargetFrame'

type TutorialMode = 'closed' | 'invite' | 'steps'

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

export default function FeatureTutorialHost(): JSX.Element | null {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const module = useMemo(
    () => findAdvancedTutorialModule(location.pathname),
    [location.pathname],
  )

  const [mode, setMode] = useState<TutorialMode>('closed')
  const [stepIndex, setStepIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true

    async function loadModule(): Promise<void> {
      setMode('closed')
      setStepIndex(0)

      if (authLoading || !user || !module || !location.pathname.startsWith('/dashboard/')) {
        return
      }

      setLoading(true)

      const progress = await getTutorialProgress(module.key)
      if (!alive) return

      // Explicit restart/resume from Help is represented by "started" plus the
      // active-session marker maintained by tutorialProgress.ts. It is allowed
      // even when the contextual trigger is not currently available so users
      // can always revisit a completed/skipped tutorial from Help.
      if (progress?.status === 'started') {
        const savedIndex = module.steps.findIndex(
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

      const eligible = await isContextuallyEligible(module)
      if (!alive) return

      setMode(eligible ? 'invite' : 'closed')
      setLoading(false)
    }

    void loadModule()

    return () => {
      alive = false
    }
  }, [authLoading, location.pathname, module, user])

  if (!module || loading || mode === 'closed') return null

  const activeStep = module.steps[stepIndex] ?? module.steps[0]
  const isLastStep = stepIndex >= module.steps.length - 1

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

  async function nextStep(): Promise<void> {
    if (!module || !activeStep) return

    if (isLastStep) {
      await saveTutorialProgress(module.key, 'completed', activeStep.key)
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

    if (mode === 'invite') {
      await skipTutorial()
      return
    }

    await saveTutorialProgress(module.key, 'started', activeStep?.key ?? null)
    setMode('closed')
  }

  async function learnMore(): Promise<void> {
    if (!module) return

    await saveTutorialProgress(
      module.key,
      'completed',
      activeStep?.key ?? module.steps.at(-1)?.key ?? null,
    )
    setMode('closed')
    navigate('/dashboard/manual')
  }

  if (mode === 'invite') {
    return (
      <TutorialOverlay
        open
        variant="invite"
        title={`Need help with ${module.title}?`}
        body={module.description}
        primaryAction="Start tutorial"
        secondaryAction="No thanks"
        onPrimary={() => void startTutorial()}
        onSecondary={() => void skipTutorial()}
        onClose={() => void skipTutorial()}
      />
    )
  }

  return (
    <>
      <TutorialTargetFrame target={module.target ?? null} />
      <TutorialOverlay
        open
        title={activeStep.title}
        body={activeStep.body}
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
        compact={activeStep.compact}
      />
    </>
  )
}
