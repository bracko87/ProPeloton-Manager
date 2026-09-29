import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Flag,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  Users,
  Vote,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type CandidateRow = {
  candidate_id: string
  club_id: string
  club_name?: string | null
  manifesto: string
  status: string
  is_me: boolean
  in_current_round: boolean
}

type CoachRow = {
  term_id: string
  user_id: string
  club_id: string
  club_name?: string | null
  season_number: number
  term_kind: 'elected' | 'caretaker' | 'replacement' | string
  starts_on: string
  ends_on: string
}

type ElectionRow = {
  id: string
  season_number: number
  kind: string
  status: 'candidate_registration' | 'voting' | 'runoff' | 'completed' | 'cancelled' | string
  registration_open_date: string
  registration_close_date: string
  round1_open_date: string
  round1_close_date: string
  current_round: number
  current_round_open_date?: string | null
  current_round_close_date?: string | null
  runoff_registration_open: boolean
  winning_candidate_id?: string | null
  my_candidate_id?: string | null
  my_vote_candidate_id?: string | null
  candidates: CandidateRow[]
}

type AssociationData = {
  eligible: boolean
  reason?: string
  country_code?: string
  club_id?: string
  club_name?: string
  association_exists?: boolean
  association_id?: string
  association_name?: string
  association_status?: 'forming' | 'active' | 'inactive' | string
  is_member?: boolean
  membership_id?: string | null
  member_count?: number
  minimum_members?: number
  has_treasury?: boolean
  coach?: CoachRow | null
  election?: ElectionRow | null
}

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w80/${normalized}.png`
    : null
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

function statusClasses(status?: string): string {
  if (status === 'active' || status === 'completed') {
    return 'bg-emerald-100 text-emerald-800'
  }
  if (status === 'forming' || status === 'candidate_registration') {
    return 'bg-amber-100 text-amber-800'
  }
  if (status === 'voting' || status === 'runoff') {
    return 'bg-blue-100 text-blue-800'
  }
  return 'bg-slate-100 text-slate-700'
}

export default function NationalAssociationPage(): JSX.Element {
  const { t } = useTranslation('nationalRanking')
  const [data, setData] = useState<AssociationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [manifesto, setManifesto] = useState('')

  const loadPage = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)

      const first = await supabase.rpc('get_my_national_association_v1')
      if (first.error) throw first.error

      let next = (first.data ?? null) as AssociationData | null

      if (
        next?.association_status === 'active' &&
        next?.is_member === true
      ) {
        const sync = await supabase.rpc('sync_my_national_association_election_v1')
        if (sync.error) {
          console.warn('National Coach election sync failed:', sync.error)
        }

        const refreshed = await supabase.rpc('get_my_national_association_v1')
        if (refreshed.error) throw refreshed.error
        next = (refreshed.data ?? null) as AssociationData | null
      }

      setData(next)

      const mine = next?.election?.candidates?.find(candidate => candidate.is_me)
      setManifesto(mine?.manifesto ?? '')
    } catch (caught: any) {
      setError(caught?.message ?? t('associationPage.errors.load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  const runAction = async (
    key: string,
    action: () => Promise<{ error: any }>,
    successMessage: string,
  ): Promise<void> => {
    try {
      setActionKey(key)
      setError(null)
      setMessage(null)
      const response = await action()
      if (response.error) throw response.error
      setMessage(successMessage)
      await loadPage()
    } catch (caught: any) {
      setError(caught?.message ?? t('associationPage.errors.action'))
    } finally {
      setActionKey(null)
    }
  }

  const joinAssociation = (): Promise<void> =>
    runAction(
      'join',
      () => supabase.rpc('join_my_national_association_v1'),
      t('associationPage.join.joined'),
    )

  const registerCandidate = (): Promise<void> => {
    if (!data?.election?.id) return Promise.resolve()
    return runAction(
      'candidate',
      () =>
        supabase.rpc('register_national_coach_candidate_v1', {
          p_election_id: data.election?.id,
          p_manifesto: manifesto,
        }),
      t('associationPage.election.candidacySaved'),
    )
  }

  const withdrawCandidate = (): Promise<void> => {
    if (!data?.election?.id) return Promise.resolve()
    return runAction(
      'withdraw',
      () =>
        supabase.rpc('withdraw_national_coach_candidate_v1', {
          p_election_id: data.election?.id,
        }),
      t('associationPage.election.candidacyWithdrawn'),
    )
  }

  const castVote = (candidateId: string): Promise<void> => {
    if (!data?.election?.id) return Promise.resolve()
    return runAction(
      `vote:${candidateId}`,
      () =>
        supabase.rpc('cast_national_coach_vote_v1', {
          p_election_id: data.election?.id,
          p_candidate_id: candidateId,
        }),
      t('associationPage.election.voteSaved'),
    )
  }

  const activeCandidates = useMemo(
    () =>
      (data?.election?.candidates ?? []).filter(candidate =>
        data?.election?.status === 'runoff'
          ? candidate.status === 'active' && candidate.in_current_round
          : candidate.status === 'active',
      ),
    [data?.election],
  )

  if (loading && !data) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('associationPage.loading')}
        </div>
      </div>
    )
  }

  const countryFlag = flagUrl(data?.country_code)
  const memberCount = Number(data?.member_count ?? 0)
  const minimumMembers = Number(data?.minimum_members ?? 5)
  const remaining = Math.max(0, minimumMembers - memberCount)
  const progress = Math.min(100, Math.round((memberCount / Math.max(minimumMembers, 1)) * 100))
  const election = data?.election
  const myCandidate = election?.candidates?.find(candidate => candidate.is_me) ?? null

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {countryFlag ? (
                <img
                  src={countryFlag}
                  alt={data?.country_code ?? ''}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Flag className="h-7 w-7 text-slate-500" />
              )}
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-600">
                {t('associationPage.eyebrow')}
              </div>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                {data?.association_name ??
                  t('associationPage.title', {
                    country: data?.country_code ?? '',
                  })}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {t('associationPage.description')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadPage()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('associationPage.refresh')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {message ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}

      {data?.eligible === false ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            {t('associationPage.notEligible.title')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t('associationPage.notEligible.body')}
          </p>
        </div>
      ) : null}

      {data?.eligible !== false && !data?.association_exists ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-4">
            <Users className="mt-1 h-6 w-6 text-amber-700" />
            <div className="flex-1">
              <h2 className="text-lg font-bold text-amber-950">
                {t('associationPage.join.noAssociationTitle')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-900/80">
                {t('associationPage.join.noAssociationBody', {
                  count: minimumMembers,
                })}
              </p>
              <button
                type="button"
                disabled={actionKey === 'join'}
                onClick={() => void joinAssociation()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {actionKey === 'join' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Flag className="h-4 w-4" />
                )}
                {t('associationPage.join.createSupport')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {data?.association_exists ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t('associationPage.cards.status')}
              </div>
              <div className="mt-3">
                <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusClasses(data.association_status)}`}>
                  {t(`associationPage.status.${data.association_status ?? 'forming'}`)}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Users className="h-4 w-4" />
                {t('associationPage.cards.members')}
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-950">
                {memberCount} / {minimumMembers}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <UserRoundCheck className="h-4 w-4" />
                {t('associationPage.cards.coach')}
              </div>
              <div className="mt-2 text-base font-bold text-slate-950">
                {data.coach?.club_name ?? t('associationPage.cards.noCoach')}
              </div>
              {data.coach ? (
                <div className="mt-1 text-xs text-slate-500">
                  {t(`associationPage.coachKind.${data.coach.term_kind}`, {
                    defaultValue: data.coach.term_kind,
                  })}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <ShieldCheck className="h-4 w-4" />
                {t('associationPage.cards.operations')}
              </div>
              <div className="mt-2 text-base font-bold text-emerald-700">
                {t('associationPage.cards.covered')}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {t('associationPage.cards.coveredHelp')}
              </p>
            </div>
          </div>

          {!data.is_member ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
              <h2 className="text-lg font-bold text-blue-950">
                {t('associationPage.join.existingTitle')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-blue-900/80">
                {t('associationPage.join.existingBody')}
              </p>
              <button
                type="button"
                disabled={actionKey === 'join'}
                onClick={() => void joinAssociation()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {actionKey === 'join' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                {t('associationPage.join.join')}
              </button>
            </div>
          ) : null}

          {data.association_status === 'forming' ? (
            <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">
                {t('associationPage.forming.title')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {remaining > 0
                  ? t('associationPage.forming.body', {
                      count: remaining,
                    })
                  : t('associationPage.forming.ready')}
              </p>
            </div>
          ) : null}

          {data.association_status === 'active' && data.is_member ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Vote className="h-5 w-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-slate-950">
                      {t('associationPage.election.title')}
                    </h2>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {t('associationPage.election.oneVote')}
                  </p>
                </div>

                {election ? (
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses(election.status)}`}>
                    {t(`associationPage.electionStatus.${election.status}`, {
                      defaultValue: election.status,
                    })}
                  </span>
                ) : null}
              </div>

              {!election ? (
                <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  {t('associationPage.election.notOpen')}
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <CalendarDays className="h-4 w-4" />
                        {t('associationPage.election.registration')}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {formatGameDate(election.registration_open_date)} – {formatGameDate(election.registration_close_date)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('associationPage.election.round')}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {election.current_round}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('associationPage.election.currentWindow')}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {formatGameDate(election.current_round_open_date)} – {formatGameDate(election.current_round_close_date)}
                      </div>
                    </div>
                  </div>

                  {election.status === 'candidate_registration' ||
                  (election.status === 'runoff' && election.runoff_registration_open) ? (
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="font-semibold text-slate-900">
                        {myCandidate
                          ? t('associationPage.election.yourCandidacy')
                          : t('associationPage.election.standForCoach')}
                      </div>
                      <label className="mt-3 block">
                        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {t('associationPage.election.manifesto')}
                        </span>
                        <textarea
                          value={manifesto}
                          onChange={event => setManifesto(event.target.value)}
                          maxLength={1000}
                          rows={5}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                          placeholder={t('associationPage.election.manifestoPlaceholder')}
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={
                            actionKey === 'candidate' ||
                            manifesto.trim().length < 10
                          }
                          onClick={() => void registerCandidate()}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {actionKey === 'candidate' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserRoundCheck className="h-4 w-4" />
                          )}
                          {myCandidate
                            ? t('associationPage.election.updateCandidacy')
                            : t('associationPage.election.registerCandidacy')}
                        </button>

                        {myCandidate && election.status === 'candidate_registration' ? (
                          <button
                            type="button"
                            disabled={actionKey === 'withdraw'}
                            onClick={() => void withdrawCandidate()}
                            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {t('associationPage.election.withdraw')}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {election.status === 'voting' || election.status === 'runoff' ? (
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="font-bold text-slate-900">
                          {t('associationPage.election.candidates')}
                        </h3>
                        <span className="text-xs text-slate-500">
                          {t('associationPage.election.secretBallot')}
                        </span>
                      </div>

                      {activeCandidates.length === 0 ? (
                        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                          {t('associationPage.election.noCandidates')}
                        </div>
                      ) : (
                        <div className="grid gap-3 lg:grid-cols-2">
                          {activeCandidates.map(candidate => {
                            const selected =
                              election.my_vote_candidate_id === candidate.candidate_id
                            const voteLocked = Boolean(election.my_vote_candidate_id)
                            return (
                              <div
                                key={candidate.candidate_id}
                                className={`rounded-xl border p-4 ${
                                  selected
                                    ? 'border-emerald-300 bg-emerald-50'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-bold text-slate-950">
                                      {candidate.club_name ?? t('associationPage.election.unknownClub')}
                                    </div>
                                    {candidate.is_me ? (
                                      <div className="mt-1 text-xs font-semibold text-blue-700">
                                        {t('associationPage.election.you')}
                                      </div>
                                    ) : null}
                                  </div>
                                  {selected ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                  ) : null}
                                </div>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                                  {candidate.manifesto}
                                </p>
                                <button
                                  type="button"
                                  disabled={
                                    voteLocked ||
                                    actionKey === `vote:${candidate.candidate_id}`
                                  }
                                  onClick={() => void castVote(candidate.candidate_id)}
                                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {actionKey === `vote:${candidate.candidate_id}` ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Vote className="h-4 w-4" />
                                  )}
                                  {selected
                                    ? t('associationPage.election.voted')
                                    : t('associationPage.election.vote')}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {election.status === 'completed' ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                      <div className="font-bold">
                        {t('associationPage.election.completed')}
                      </div>
                      <div className="mt-1">
                        {election.candidates.find(
                          candidate =>
                            candidate.candidate_id === election.winning_candidate_id,
                        )?.club_name ?? t('associationPage.election.winnerConfirmed')}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
