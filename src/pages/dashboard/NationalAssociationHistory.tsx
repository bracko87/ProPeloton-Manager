import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import NationalAssociationHeader from '../../components/nations/NationalAssociationHeader'

type AssociationData = {
  eligible: boolean
  country_code?: string
  association_exists?: boolean
  association_name?: string
  association_status?: string
  is_member?: boolean
  coach?: {
    club_name?: string | null
    user_id?: string | null
  } | null
}

type HistoryEvent = {
  event_key: string
  event_type: string
  event_date?: string | null
  season_number?: number | null
  title?: string | null
  details?: Record<string, unknown> | null
}

type HistoryData = {
  available: boolean
  association_exists?: boolean
  association_id?: string
  association_name?: string
  country_code?: string
  events?: HistoryEvent[]
}

function formatGameDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
}

export default function NationalAssociationHistoryPage(): JSX.Element {
  const { t } = useTranslation('nations')
  const [association, setAssociation] = useState<AssociationData | null>(null)
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [isCoach, setIsCoach] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [associationResponse, historyResponse, coachResponse] = await Promise.all([
        supabase.rpc('get_my_national_association_v1'),
        supabase.rpc('get_my_national_association_history_v1', { p_limit: 250 }),
        supabase.rpc('get_national_coach_dashboard_v1'),
      ])

      if (associationResponse.error) throw associationResponse.error
      if (historyResponse.error) throw historyResponse.error

      setAssociation((associationResponse.data ?? null) as AssociationData | null)
      setHistory((historyResponse.data ?? null) as HistoryData | null)
      setIsCoach(!coachResponse.error && Boolean((coachResponse.data as any)?.allowed))
    } catch (caught: any) {
      setError(caught?.message ?? t('association.errors.load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const eventTitle = (event: HistoryEvent): string =>
    t(`association.history.event.${event.event_type}`, {
      defaultValue: event.title ?? event.event_type,
    })

  const eventDetail = (event: HistoryEvent): string | null => {
    const details = event.details ?? {}

    if (event.event_type === 'activation_coin_contribution') {
      return t('association.history.detail.activationContribution', {
        club: String(details.club_name ?? '—'),
        amount: Number(details.amount ?? 0),
      })
    }
    if (event.event_type === 'member_joined' || event.event_type === 'member_left') {
      return String(details.club_name ?? '')
    }
    if (event.event_type === 'national_coach_appointed') {
      return t('association.history.detail.coachAppointed', {
        club: String(details.club_name ?? '—'),
        term: String(details.term_kind ?? '—'),
      })
    }
    if (event.event_type === 'national_squad_confirmed') {
      return t('association.history.detail.squadConfirmed', {
        size: Number(details.squad_size ?? 0),
        cycle: String(details.cycle_key ?? '—'),
      })
    }
    if (event.event_type === 'world_nations_result') {
      return t('association.history.detail.worldNations', {
        rank: Number(details.final_rank ?? 0),
        points: Number(details.total_points ?? 0),
      })
    }
    if (event.event_type === 'national_champion_crowned') {
      return t('association.history.detail.nationalChampion', {
        rider: String(details.rider_name ?? '—'),
        club: String(details.club_name ?? '—'),
      })
    }
    if (event.event_type === 'coach_election_opened') {
      const rawKind = String(details.election_kind ?? '')
      const kind =
        rawKind === 'annual'
          ? t('association.electionsPage.kindSeason')
          : rawKind === 'activation'
            ? t('association.electionsPage.kindActivation')
            : rawKind === 'special'
              ? t('association.electionsPage.kindSpecial')
              : rawKind || '—'

      return t('association.history.detail.electionOpened', {
        kind,
        round: Number(details.round ?? 1),
      })
    }
    return null
  }

  const events = history?.events ?? []

  if (loading && !association) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('association.loading')}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <NationalAssociationHeader
        association={association}
        isCoach={isCoach}
        loading={loading}
        onRefresh={() => void load()}
      />

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded bg-white shadow">
        <div className="border-b border-slate-200 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('association.history.eyebrow')}
          </div>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            {t('association.history.title')}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {t('association.history.description')}
          </p>
        </div>

        {!history?.association_exists ? (
          <div className="p-6 text-sm text-slate-600">
            {t('association.history.noAssociation')}
          </div>
        ) : events.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            {t('association.history.empty')}
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {events.map(event => {
              const detail = eventDetail(event)
              return (
                <article key={event.event_key} className="grid gap-3 p-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {event.event_date ? formatGameDate(event.event_date) : t('association.history.seasonOnly', { season: event.season_number ?? '—' })}
                    </div>
                    {event.season_number ? (
                      <div className="mt-1 text-xs text-slate-500">
                        {t('association.history.season', { season: event.season_number })}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">
                      {eventTitle(event)}
                    </div>
                    {detail ? (
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {detail}
                      </p>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
