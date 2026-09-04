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
const TUTORIAL_LAST_RESTORE_STORAGE_KEY = 'ppm:tutorial-last-restore-v1'

export const TUTORIAL_HISTORY_CHANGED_EVENT = 'ppm:tutorial-history-changed'
export const TUTORIAL_RESTORE_NAVIGATION_EVENT =
  'ppm:tutorial-restore-navigation'

const TUTORIAL_FALLBACK_HASH_BY_KEY: Partial<Record<TutorialKey, string>> = {
  overview: '#/dashboard/overview',
  squad: '#/dashboard/squad',
  training: '#/dashboard/training',
  equipment: '#/dashboard/equipment',
  facilities: '#/dashboard/infrastructure',
  calendar: '#/dashboard/calendar',
  'race-detail': '#/dashboard/calendar',
  'race-preparation': '#/dashboard/race-preparation',
  'team-ranking': '#/dashboard/team-ranking',
  statistics: '#/dashboard/statistics',
  transfers: '#/dashboard/transfers',
  finance: '#/dashboard/finance',
  menu: '#/dashboard/overview',
  sponsors: '#/dashboard/finance',
  staff: '#/dashboard/staff',
  settings: '#/dashboard/preferences',
}

function canUseWindow(): boolean {
  return typeof window !== 'undefined'
}

function isRestorableTutorialStatus(status: TutorialStatus): boolean {
  return status === 'started' || status === 'completed'
}

function isDashboardHash(hash: string): boolean {
  return hash === '#/dashboard' || hash.startsWith('#/dashboard/')
}

function isDashboardPath(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
}

/**
 * Avoid restoring tutorial history from unsafe browser locations.
 *
 * Important:
 * - The game uses HashRouter.
 * - Safe tutorial restore should always stay inside #/dashboard...
 * - Never restore to /login, /logout, /, or a public route.
 */
function isSafeTutorialHistoryEntry(entry: TutorialHistoryEntry): boolean {
  if (isDashboardHash(entry.locationHash)) return true
  if (isDashboardPath(entry.pathname)) return true

  return false
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

      const safeEntry =
        typeof candidate.tutorialKey === 'string' &&
        typeof candidate.status === 'string' &&
        isRestorableTutorialStatus(candidate.status as TutorialStatus) &&
        (typeof candidate.lastStepKey === 'string' ||
          candidate.lastStepKey === null) &&
        typeof candidate.locationHash === 'string' &&
        typeof candidate.pathname === 'string' &&
        typeof candidate.search === 'string' &&
        typeof candidate.savedAt === 'number'

      if (!safeEntry) return false

      return isSafeTutorialHistoryEntry(candidate as TutorialHistoryEntry)
    })
  } catch {
    return []
  }
}

function dispatchTutorialHistoryChanged(): void {
  if (!canUseWindow()) return

  window.dispatchEvent(new CustomEvent(TUTORIAL_HISTORY_CHANGED_EVENT))
}

function dispatchTutorialRestoreNavigation(
  entry: TutorialHistoryEntry,
  safeHash: string,
): void {
  if (!canUseWindow()) return

  window.dispatchEvent(
    new CustomEvent(TUTORIAL_RESTORE_NAVIGATION_EVENT, {
      detail: {
        safeHash,
        tutorialKey: entry.tutorialKey,
        lastStepKey: entry.lastStepKey,
      },
    }),
  )
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

  const currentHash = window.location.hash

  return {
    locationHash: isDashboardHash(currentHash)
      ? currentHash
      : '#/dashboard/overview',
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

  if (!isSafeTutorialHistoryEntry(entry)) return

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

  if (currentEntry.tutorialKey === 'overview') {
    return -1
  }

  for (let index = history.length - 2; index >= 0; index -= 1) {
    if (history[index].tutorialKey !== currentEntry.tutorialKey) {
      return index
    }
  }

  return -1
}

function getSafeHashForHistoryEntry(entry: TutorialHistoryEntry): string {
  if (isDashboardHash(entry.locationHash)) {
    return entry.locationHash
  }

  const fallbackHash = TUTORIAL_FALLBACK_HASH_BY_KEY[entry.tutorialKey]
  if (fallbackHash) {
    return fallbackHash
  }

  if (isDashboardPath(entry.pathname)) {
    return `#${entry.pathname}`
  }

  return '#/dashboard/overview'
}

function rememberRestoreNavigation(
  entry: TutorialHistoryEntry,
  safeHash: string,
): void {
  if (!canUseWindow()) return

  try {
    window.sessionStorage.setItem('ppm:auto-start-tutorial', entry.tutorialKey)
    window.sessionStorage.setItem(
      TUTORIAL_LAST_RESTORE_STORAGE_KEY,
      JSON.stringify({
        safeHash,
        tutorialKey: entry.tutorialKey,
        lastStepKey: entry.lastStepKey,
        restoredAt: Date.now(),
      }),
    )
  } catch {
    // Ignore browser storage issues.
  }
}

function navigateToHistoryEntry(entry: TutorialHistoryEntry): void {
  if (!canUseWindow()) return

  const safeHash = getSafeHashForHistoryEntry(entry)

  rememberRestoreNavigation(entry, safeHash)

  if (window.location.hash !== safeHash) {
    window.location.hash = safeHash
  }

  window.setTimeout(() => {
    dispatchTutorialHistoryChanged()
    dispatchTutorialRestoreNavigation(entry, safeHash)
  }, 40)
}

export function getTutorialNavigationState(): TutorialNavigationState {
  const history = readTutorialHistory()
  const currentEntry = history[history.length - 1]

  return {
    canGoPrevious: history.length > 1,
    canGoPreviousTutorial:
      currentEntry?.tutorialKey !== 'overview' &&
      findPreviousTutorialEntryIndex(history) >= 0,
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
