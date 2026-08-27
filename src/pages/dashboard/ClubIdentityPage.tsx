import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

type ClubDisplayIdentityRow = {
  club_id: string
  base_name: string | null
  display_name: string | null
  original_club_name: string | null
  full_display_name: string | null
  season_display_name?: string | null
  locked_by_sponsor: boolean | null
  locked_until_game_date?: string | null
  source_sponsor_id?: string | null
  lock_reason?: string | null
}

type PrimaryClubResponse = string | null

function valueOrDash(
  value: string | number | boolean | null | undefined,
  booleanLabels?: { yes: string; no: string },
): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') {
    return value
      ? (booleanLabels?.yes ?? 'Yes')
      : (booleanLabels?.no ?? 'No')
  }
  return String(value)
}

export default function ClubIdentityPage(): JSX.Element {
  const { t } = useTranslation('club')
  const [clubId, setClubId] = useState<string | null>(null)
  const [identity, setIdentity] = useState<ClubDisplayIdentityRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadIdentity = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      let resolvedClubId: string | null = null

      const primaryClubRes = await supabase.rpc('get_my_primary_club_id')

      if (!primaryClubRes.error && primaryClubRes.data) {
        resolvedClubId = primaryClubRes.data as PrimaryClubResponse
      } else {
        const fallbackClubRes = await supabase.rpc('get_my_club_id')
        if (fallbackClubRes.error) throw fallbackClubRes.error
        resolvedClubId = (fallbackClubRes.data as PrimaryClubResponse) ?? null
      }

      if (!resolvedClubId) {
        throw new Error(t('identity.noClub'))
      }

      setClubId(resolvedClubId)

      const identityRes = await supabase.rpc('get_club_display_identity_v1', {
        p_club_id: resolvedClubId,
      })

      if (identityRes.error) throw identityRes.error

      const row = Array.isArray(identityRes.data)
        ? ((identityRes.data[0] ?? null) as ClubDisplayIdentityRow | null)
        : ((identityRes.data ?? null) as ClubDisplayIdentityRow | null)

      setIdentity(row)
    } catch (err) {
      setIdentity(null)
      setError(err instanceof Error ? err.message : t('identity.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadIdentity()
  }, [loadIdentity])

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">{t('identity.loading')}</div>
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    )
  }

  const booleanLabels = {
    yes: t('common.yes'),
    no: t('common.no'),
  }

  return (
    <div className="p-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{t('identity.title')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('identity.subtitle')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void loadIdentity()
            }}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('common.refresh')}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('identity.clubId')}</div>
            <div className="mt-1 break-all text-sm font-semibold text-gray-900">
              {valueOrDash(clubId ?? identity?.club_id)}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('identity.baseName')}</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {valueOrDash(identity?.base_name)}
            </div>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-700">{t('identity.displayName')}</div>
            <div className="mt-1 text-lg font-bold text-green-900">
              {valueOrDash(identity?.display_name)}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('identity.originalName')}</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {valueOrDash(identity?.original_club_name)}
            </div>
          </div>

          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-purple-700">{t('identity.historyName')}</div>
            <div className="mt-1 text-sm font-semibold text-purple-900">
              {valueOrDash(identity?.full_display_name)}
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t('identity.lockedBySponsor')}</div>
            <div className="mt-1 text-sm font-semibold text-amber-900">
              {valueOrDash(identity?.locked_by_sponsor, booleanLabels)}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('identity.lockedUntil')}</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {valueOrDash(identity?.locked_until_game_date)}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 md:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('identity.lockReason')}</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {valueOrDash(identity?.lock_reason)}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {t('identity.use')} <span className="font-semibold">display_name</span> {t('identity.everywhere')}{' '}
          {t('identity.keep')} <span className="font-semibold">base_name</span> {t('identity.permanent')}
        </div>
      </div>
    </div>
  )
}
