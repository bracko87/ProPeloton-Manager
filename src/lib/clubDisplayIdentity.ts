import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type ClubDisplayIdentity = {
  club_id: string
  base_name: string | null
  display_name: string | null
  season_display_name: string | null
  original_club_name: string | null
  full_display_name: string | null
  locked_by_sponsor: boolean
  locked_until_game_date: string | null
  source_sponsor_id: string | null
  country_code: string | null
  club_type: string | null
}

export function getClubDisplayName(
  identity: ClubDisplayIdentity | null | undefined,
  fallbackName?: string | null
): string {
  return (
    identity?.display_name ||
    identity?.season_display_name ||
    fallbackName ||
    identity?.base_name ||
    'Team'
  )
}

export function getClubHistoryDisplayName(
  identity: ClubDisplayIdentity | null | undefined,
  fallbackName?: string | null
): string {
  return identity?.full_display_name || getClubDisplayName(identity, fallbackName)
}

export function useClubDisplayIdentity(clubId: string | null | undefined) {
  const [identity, setIdentity] = useState<ClubDisplayIdentity | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!clubId) {
      setIdentity(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc('get_club_display_identity_v1', {
      p_club_id: clubId,
    })

    if (rpcError) {
      setIdentity(null)
      setError(rpcError.message || 'Failed to load club display identity.')
      setLoading(false)
      return
    }

    const row = Array.isArray(data) ? data[0] : data
    setIdentity((row ?? null) as ClubDisplayIdentity | null)
    setLoading(false)
  }, [clubId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { identity, loading, error, reload }
}

export function useClubDisplayIdentities(clubIds: Array<string | null | undefined>) {
  const stableClubIds = useMemo(
    () => Array.from(new Set(clubIds.filter((id): id is string => Boolean(id)))),
    [clubIds]
  )

  const [identityByClubId, setIdentityByClubId] = useState<Record<string, ClubDisplayIdentity>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (stableClubIds.length === 0) {
      setIdentityByClubId({})
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc('get_club_display_identities_v1', {
      p_club_ids: stableClubIds,
    })

    if (rpcError) {
      setIdentityByClubId({})
      setError(rpcError.message || 'Failed to load club display identities.')
      setLoading(false)
      return
    }

    const rows = (data ?? []) as ClubDisplayIdentity[]
    setIdentityByClubId(
      rows.reduce<Record<string, ClubDisplayIdentity>>((acc, row) => {
        acc[row.club_id] = row
        return acc
      }, {})
    )
    setLoading(false)
  }, [stableClubIds])

  useEffect(() => {
    void reload()
  }, [reload])

  return { identityByClubId, loading, error, reload }
}
