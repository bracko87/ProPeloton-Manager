/**
 * src/hooks/useResolvedClub.ts
 *
 * React hook for loading and managing the resolved club context.
 *
 * Purpose:
 * - Wrap resolveClubScope with loading and error state.
 * - Provide a simple reload() API for components to refresh club data.
 * - Protect against async race conditions and stale updates.
 * - React to club context changes triggered elsewhere in the app.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  resolveClubScope,
  type ClubScope,
  type ResolvedClubContext,
} from '@/lib/resolveClubScope'

/**
 * UseResolvedClubResult
 *
 * Return shape of the useResolvedClub hook, exposing:
 * - loading: whether resolution is in progress.
 * - error: error message when resolution fails, otherwise null.
 * - context: resolved club context, or null when unavailable.
 * - reload: function to manually trigger a reload.
 */
type UseResolvedClubResult = {
  loading: boolean
  error: string | null
  context: ResolvedClubContext | null
  reload: () => Promise<void>
}

/**
 * ResolvedClubIds
 *
 * Convenience ID-only shape for pages/services that do not need
 * the full resolved club objects.
 */
export type ResolvedClubIds = {
  mainClubId: string
  selectedClubId: string
  pageClubId: string
}

/**
 * resolveClubIds
 *
 * Lightweight helper for callers that only need the resolved IDs.
 */
export async function resolveClubIds(scope: ClubScope): Promise<ResolvedClubIds> {
  const resolved = await resolveClubScope(scope)

  return {
    mainClubId: resolved.mainClub.id,
    selectedClubId: resolved.selectedClub.id,
    pageClubId: resolved.pageClub.id,
  }
}

/**
 * useResolvedClub
 *
 * Hook that resolves the club context for a given scope and tracks
 * loading/error state for UI components.
 *
 * Behavior:
 * - Resolves on initial mount and whenever the scope changes.
 * - Ignores stale async responses when multiple loads overlap.
 * - Prevents outdated requests from overwriting newer results.
 * - Exposes reload() for manual refreshes (e.g., after mutations).
 * - Reacts to app-level club context changes and storage sync events.
 *
 * @param scope - Scope to resolve ('main' or 'selected').
 * @returns UseResolvedClubResult with loading, error, context, and reload.
 */
export function useResolvedClub(scope: ClubScope): UseResolvedClubResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [context, setContext] = useState<ResolvedClubContext | null>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const requestId = ++requestIdRef.current

    try {
      setLoading(true)
      setError(null)

      const resolved = await resolveClubScope(scope)

      if (requestId !== requestIdRef.current) return
      setContext(resolved)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to resolve club context.')
      setContext(null)
    } finally {
      if (requestId !== requestIdRef.current) return
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function handleClubContextChanged(): void {
      void load()
    }

    window.addEventListener('club-context-changed', handleClubContextChanged)
    window.addEventListener('storage', handleClubContextChanged)

    return () => {
      window.removeEventListener('club-context-changed', handleClubContextChanged)
      window.removeEventListener('storage', handleClubContextChanged)

      requestIdRef.current += 1
    }
  }, [load])

  return {
    loading,
    error,
    context,
    reload: load,
  }
}

/**
 * useMainClub
 *
 * Convenience hook for pages that always operate on the resolved main club.
 */
export function useMainClub(): UseResolvedClubResult {
  return useResolvedClub('main')
}

/**
 * useSelectedClub
 *
 * Convenience hook for pages that always operate on the resolved selected club.
 */
export function useSelectedClub(): UseResolvedClubResult {
  return useResolvedClub('selected')
}