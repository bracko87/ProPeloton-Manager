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

type TutorialHistoryEntry = {
  tutorialKey: TutorialKey
  status: TutorialStatus
  lastStepKey: string | null
  locationHash: string
  pathname: string
  search: string
  savedAt: number
}

type SaveTutorialProgressOptions = {
  remember?: boolean
}

export type TutorialNavigationState = {
  canGoPrevious: boolean
  canGoPreviousTutorial: boolean
}

const TUTORIAL_HISTORY_STORAGE_KEY = 'ppm:tutorial-history-v1'
export const TUTORIAL_HISTORY_CHANGED_EVENT = 'ppm:tutorial-history-changed'

function canUseWindow(): boolean {
  return typeof window !== 'undefined'
}

function isRestorableTutorialStatus(status: TutorialStatus): boolean {
  return status === 'started' || status === 'completed'
}

function readTutorialHistory(): TutorialHistoryEntry[] {
  if (!canUseWindow()) return []

  try {
    const rawValue = window.sessionStorage.getItem(TUTORIAL_HISTORY_STORAGE_KEY)
    if (!rawValue) return []

    const parsedValue = JSON.parse(rawValue)
    if (!Array.isArray(parsedValue)) return []

    return parsedValue.filter((entry): entry is TutorialHistoryEntry => {
      if (!entry || typeof entry !== 'object') return false

      const candidate = entry as Partial<TutorialHistoryEntry>

      return (
        typeof candidate.tutorialKey === 'string' &&
        typeof candidate.status === 'string' &&
        isRestorableTutorialStatus(candidate.status as TutorialStatus) &&
        (typeof candidate.lastStepKey === 'string' || candidate.lastStepKey === null) &&
        typeof candidate.locationHash === 'string' &&
        typeof candidate.pathname === 'string' &&
        typeof candidate.search === 'string' &&
        typeof candidate.savedAt === 'number'
      )
    })
  } catch {
    return []
  }
}

function dispatchTutorialHistoryChanged(): void {
  if (!canUseWindow()) return

  window.dispatchEvent(new CustomEvent(TUTORIAL_HISTORY_CHANGED_EVENT))
}

function writeTutorialHistory(history: TutorialHistoryEntry[]): void {
  if (!canUseWindow()) return

  const trimmedHistory = history.slice(-250)
  window.sessionStorage.setItem(
    TUTORIAL_HISTORY_STORAGE_KEY,
    JSON.stringify(trimmedHistory),
  )

  dispatchTutorialHistoryChanged()
}

function getCurrentTutorialLocation(): Pick<
  TutorialHistoryEntry,
  'locationHash' | 'pathname' | 'search'
> {
  if (!canUseWindow()) {
    return {
      locationHash: '',
      pathname: '',
      search: '',
    }
  }

  return {
    locationHash: window.location.hash,
    pathname: window.location.pathname,
    search: window.location.search,
  }
}

function areSameTutorialHistoryPoint(
  first: TutorialHistoryEntry,
  second: TutorialHistoryEntry,
): boolean {
  return (
    first.tutorialKey === second.tutorialKey &&
    first.lastStepKey === second.lastStepKey &&
    first.locationHash === second.locationHash &&
    first.pathname === second.pathname &&
    first.search === second.search
  )
}

function rememberTutorialProgress(
  tutorialKey: TutorialKey,
  status: TutorialStatus,
  lastStepKey?: string | null,
): void {
  if (!canUseWindow()) return
  if (!isRestorableTutorialStatus(status)) return

  const entry: TutorialHistoryEntry = {
    tutorialKey,
    status,
    lastStepKey: lastStepKey ?? null,
    ...getCurrentTutorialLocation(),
    savedAt: Date.now(),
  }

  const history = readTutorialHistory()
  const lastEntry = history[history.length - 1]

  if (lastEntry && areSameTutorialHistoryPoint(lastEntry, entry)) {
    history[history.length - 1] = entry
    writeTutorialHistory(history)
    return
  }

  history.push(entry)
  writeTutorialHistory(history)
}

function findPreviousTutorialEntryIndex(history: TutorialHistoryEntry[]): number {
  if (history.length <= 1) return -1

  const currentEntry = history[history.length - 1]

  for (let index = history.length - 2; index >= 0; index -= 1) {
    if (history[index].tutorialKey !== currentEntry.tutorialKey) {
      return index
    }
  }

  return -1
}

function navigateToHistoryEntry(entry: TutorialHistoryEntry): void {
  if (!canUseWindow()) return

  const nextHash = entry.locationHash || ''
  const nextPath = entry.pathname || window.location.pathname
  const nextSearch = entry.search || ''
  const currentPathAndSearch = `${window.location.pathname}${window.location.search}`
  const nextPathAndSearch = `${nextPath}${nextSearch}`

  if (nextHash) {
    window.location.hash = nextHash
  } else if (currentPathAndSearch !== nextPathAndSearch) {
    window.history.pushState(null, '', nextPathAndSearch)
  }

  window.setTimeout(() => {
    window.location.reload()
  }, 40)
}

export function getTutorialNavigationState(): TutorialNavigationState {
  const history = readTutorialHistory()

  return {
    canGoPrevious: history.length > 1,
    canGoPreviousTutorial: findPreviousTutorialEntryIndex(history) >= 0,
  }
}

export async function restorePreviousTutorialStep(): Promise<boolean> {
  const history = readTutorialHistory()
  if (history.length <= 1) return false

  history.pop()

  const previousEntry = history[history.length - 1]
  if (!previousEntry) return false

  writeTutorialHistory(history)

  await saveTutorialProgress(
    previousEntry.tutorialKey,
    'started',
    previousEntry.lastStepKey,
    { remember: false },
  )

  navigateToHistoryEntry(previousEntry)
  return true
}

export async function restorePreviousTutorial(): Promise<boolean> {
  const history = readTutorialHistory()
  const previousTutorialIndex = findPreviousTutorialEntryIndex(history)

  if (previousTutorialIndex < 0) return false

  const previousEntry = history[previousTutorialIndex]
  const nextHistory = history.slice(0, previousTutorialIndex + 1)

  writeTutorialHistory(nextHistory)

  await saveTutorialProgress(
    previousEntry.tutorialKey,
    'started',
    previousEntry.lastStepKey,
    { remember: false },
  )

  navigateToHistoryEntry(previousEntry)
  return true
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
  options: SaveTutorialProgressOptions = {},
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

  if (options.remember !== false) {
    rememberTutorialProgress(tutorialKey, status, lastStepKey ?? null)
  }

  return data as TutorialProgress
}
