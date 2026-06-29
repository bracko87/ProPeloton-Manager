import { supabase } from './supabase'
import type { TutorialKey } from './tutorials'

export type TutorialStatus =
  | 'not_started'
  | 'started'
  | 'completed'
  | 'skipped'

export type TutorialProgress = {
  tutorial_key: string
  status: TutorialStatus
  last_step_key: string | null
  started_at: string | null
  completed_at: string | null
  skipped_at: string | null
}

export async function getTutorialProgress(
  tutorialKey: TutorialKey,
): Promise<TutorialProgress | null> {
  const { data, error } = await supabase.rpc('get_my_tutorial_progress_v1', {
    p_tutorial_key: tutorialKey,
  })

  if (error) {
    console.warn('Could not load tutorial progress:', error.message)
    return null
  }

  const rows = Array.isArray(data) ? data : []
  return (rows[0] as TutorialProgress | undefined) ?? null
}

export async function saveTutorialProgress(
  tutorialKey: TutorialKey,
  status: TutorialStatus,
  lastStepKey?: string | null,
): Promise<TutorialProgress | null> {
  const { data, error } = await supabase.rpc('save_my_tutorial_progress_v1', {
    p_tutorial_key: tutorialKey,
    p_status: status,
    p_last_step_key: lastStepKey ?? null,
  })

  if (error) {
    console.warn('Could not save tutorial progress:', error.message)
    return null
  }

  return data as TutorialProgress
}