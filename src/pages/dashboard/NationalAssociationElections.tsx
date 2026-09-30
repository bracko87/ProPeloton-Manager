import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import NationalAssociationHeader from '../../components/nations/NationalAssociationHeader'

type Candidate = {
  candidate_id: string
  club_id?: string | null
  club_name?: string | null
  manifesto?: string | null
  status: string
  is_me?: boolean
  in_current_round?: boolean
}

type Election = {
  id: string
  season_number: number
  kind: string
  status: string
  registration_open_date?: string | null
  registration_close_date?: string | null
  round1_open_date?: string | null
  round1_close_date?: string | null
  current_round: number
  current_round_open_date?: string | null
  current_round_close_date?: string | null
  runoff_registration_open?: boolean
  winning_candidate_id?: string | null
  my_candidate_id?: string | null
  my_vote_candidate_id?: string | null
  candidates: Candidate[]
}

type AssociationData = {
  eligible: boolean
  country_code?: string
  association_exists?: boolean
  association_name?: string
  association_status?: string
  is_member?: boolean
  member_count?: number
  minimum_members?: number
  activation_coin_target?: number
  activation_coin_contributed?: number
  coach?: {
    term_id: string
    user_id: string
    club_id?: string | null
    club_name?: string | null
    season_number: number
    term_kind: string
    starts_on?: string | null
    ends_on?: string | null
  } | null
  election?: Election | null
}

function humanize(value?: string | null): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatGameDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function statusClasses(status?: string | null): string {
  if (status === 'active' || status === 'completed') return 'bg-emerald-100 text-emerald-800'
  if (status === 'candidate_registration' || status === 'voting' || status === 'runoff' || status === 'forming') {
    return 'bg-amber-100 text-amber-800'
  }
  if (status === 'inactive' || status === 'cancelled') return 'bg-rose-100 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

export default function NationalAssociationElectionsPage(): JSX.Element {
  const { t } = useTranslation('nations')
  const [association, setAssociation] = useState<AssociationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isCoach, setIsCoach] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [manifesto, setManifesto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [associationResponse, coachResponse] = await Promise.all([
        supabase.rpc('get_my_national_association_v1'),
        supabase.rpc('get_national_coach_dashboard_v1'),
      ])
      if (associationResponse.error) throw associationResponse.error

      const next = (associationResponse.data ?? null) as AssociationData | null
      setAssociation(next)
      setIsCoach(!coachResponse.error && Boolean((coachResponse.data as any)?.allowed))

      const myCandidate = next?.election?.candidates?.find(candidate => candidate.is_me)
      if (myCandidate?.manifesto) setManifesto(myCandidate.manifesto)
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

  const perform = async (key: string, action: () => Promise<void>): Promise<void> => {
    try {
      setBusyKey(key)
      setError(null)
      setMessage(null)
      await action()
      await load()
    } catch (caught: any) {
      setError(caught?.message ?? t('association.errors.action'))
    } finally {
      setBusyKey(null)
    }
  }

  const syncElection = async (): Promise<void> => {
    await perform('sync', async () => {
      const { error: rpcError } = await supabase.rpc('sync_my_national_association_election_v1')
      if (rpcError) throw rpcError
      setMessage(t('association.messages.electionUpdated'))
    })
  }

  const registerCandidate = async (): Promise<void> => {
    const electionId = association?.election?.id
    if (!electionId) return

    await perform('candidate', async () => {
      const { error: rpcError } = await supabase.rpc('register_national_coach_candidate_v1', {
        p_election_id: electionId,
        p_manifesto: manifesto,
      })
      if (rpcError) throw rpcError
      setMessage(t('association.messages.candidatureRegistered'))
    })
  }

  const voteForCandidate = async (candidateId: string): Promise<void> => {
    const electionId = association?.election?.id
    if (!electionId) return

    await perform(`vote:${candidateId}`, async () => {
      const { error: rpcError } = await supabase.rpc('cast_national_coach_vote_v1', {
        p_election_id: electionId,
        p_candidate_id: candidateId,
      })
      if (rpcError) throw rpcError
      setMessage(t('association.messages.voteSubmitted'))
    })
  }

  const election = association?.election ?? null

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

      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      {!association?.eligible || !association.association_exists ? (
        <section className="rounded bg-white p-5 shadow">
          <h3 className="font-semibold text-slate-900">{t('association.electionsPage.unavailableTitle')}</h3>
          <p className="mt-2 text-sm text-slate-600">{t('association.electionsPage.unavailableText')}</p>
        </section>
      ) : (
        <>
          <section className="overflow-hidden rounded bg-white shadow">
            <div className="border-b border-slate-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('association.electionsPage.currentCoachEyebrow')}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                {association.coach?.club_name ?? t('common.notElected')}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {association.coach
                  ? t('association.electionsPage.currentCoachTerm', {
                      season: association.coach.season_number,
                      start: formatGameDate(association.coach.starts_on),
                      end: formatGameDate(association.coach.ends_on),
                    })
                  : association.association_status === 'active'
                    ? t('association.electionsPage.coachPending')
                    : t('association.electionsPage.coachAfterActivation')}
              </p>
            </div>

            <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.electionsPage.associationStatus')}
                </div>
                <div className="mt-2 font-semibold text-slate-900">
                  {humanize(association.association_status)}
                </div>
              </div>
              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.electionsPage.members')}
                </div>
                <div className="mt-2 font-semibold text-slate-900">
                  {association.member_count ?? 0} / {association.minimum_members ?? 5}
                </div>
              </div>
              <div className="bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.electionsPage.activation')}
                </div>
                <div className="mt-2 font-semibold text-slate-900">
                  {association.activation_coin_contributed ?? 0} / {association.activation_coin_target ?? 50} {t('association.activation.coins')}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded bg-white shadow">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {t('association.election.title')}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {t('association.election.schedule')}
                </p>
              </div>

              {association.is_member && association.association_status === 'active' ? (
                <button
                  type="button"
                  disabled={busyKey === 'sync'}
                  onClick={() => void syncElection()}
                  className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busyKey === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('association.election.update')}
                </button>
              ) : null}
            </div>

            {!association.is_member ? (
              <div className="p-5 text-sm text-slate-600">
                {t('association.electionsPage.memberRequired')}
              </div>
            ) : association.association_status !== 'active' ? (
              <div className="p-5 text-sm text-slate-600">
                {t('association.electionsPage.activationRequired')}
              </div>
            ) : !election ? (
              <div className="p-5 text-sm text-slate-600">
                {t('association.electionsPage.noElection')}
              </div>
            ) : (
              <div className="space-y-4 p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded border border-slate-200 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('common.status')}
                    </div>
                    <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(election.status)}`}>
                      {t(`status.${election.status}`, { defaultValue: humanize(election.status) })}
                    </span>
                  </div>
                  <div className="rounded border border-slate-200 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('association.electionsPage.type')}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {humanize(election.kind)}
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('common.round')}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {election.current_round}
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('common.currentWindow')}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {formatGameDate(election.current_round_open_date)} – {formatGameDate(election.current_round_close_date)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('association.electionsPage.phase1')}
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {formatGameDate(election.registration_open_date)} – {formatGameDate(election.registration_close_date)}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {t('association.electionsPage.phase1Help')}
                    </p>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('association.electionsPage.phase2')}
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {formatGameDate(election.round1_open_date)} – {formatGameDate(election.round1_close_date)}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {t('association.electionsPage.phase2Help')}
                    </p>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t('association.electionsPage.phase3')}
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {election.status === 'runoff'
                        ? `${formatGameDate(election.current_round_open_date)} – ${formatGameDate(election.current_round_close_date)}`
                        : t('association.electionsPage.ifRequired')}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {t('association.electionsPage.phase3Help')}
                    </p>
                  </div>
                </div>

                {election.status === 'candidate_registration' && !election.my_candidate_id ? (
                  <div className="rounded border border-yellow-200 bg-yellow-50 p-4">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-900">
                        {t('association.election.manifesto')}
                      </span>
                      <textarea
                        value={manifesto}
                        onChange={event => setManifesto(event.target.value)}
                        rows={5}
                        maxLength={1000}
                        className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-500"
                        placeholder={t('association.election.manifestoPlaceholder')}
                      />
                    </label>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={busyKey === 'candidate' || manifesto.trim().length < 10}
                        onClick={() => void registerCandidate()}
                        className="inline-flex items-center gap-2 rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                      >
                        {busyKey === 'candidate' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {t('association.election.submitCandidature')}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div>
                  <h4 className="text-sm font-semibold text-slate-900">
                    {t('association.electionsPage.candidates')}
                  </h4>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {(election.candidates ?? []).length === 0 ? (
                      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        {t('association.electionsPage.noCandidates')}
                      </div>
                    ) : (
                      (election.candidates ?? []).map(candidate => (
                        <article
                          key={candidate.candidate_id}
                          className={[
                            'rounded border p-4',
                            candidate.in_current_round === false
                              ? 'border-slate-200 bg-slate-50 opacity-60'
                              : 'border-slate-200 bg-white',
                          ].join(' ')}
                        >
                          <div className="font-semibold text-slate-900">
                            {candidate.club_name ?? t('common.candidate')}
                            {candidate.is_me ? ` · ${t('common.you')}` : ''}
                          </div>
                          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                            {candidate.manifesto || t('association.election.noManifesto')}
                          </p>

                          {(election.status === 'voting' || election.status === 'runoff') &&
                          candidate.in_current_round !== false &&
                          !election.my_vote_candidate_id ? (
                            <div className="mt-4">
                              <button
                                type="button"
                                disabled={busyKey === `vote:${candidate.candidate_id}`}
                                onClick={() => void voteForCandidate(candidate.candidate_id)}
                                className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                              >
                                {t('common.vote')}
                              </button>
                            </div>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded bg-white shadow">
            <div className="border-b border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">
                {t('association.electionsPage.principlesTitle')}
              </h3>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {[
                t('association.electionsPage.principle1'),
                t('association.electionsPage.principle2'),
                t('association.electionsPage.principle3'),
                t('association.electionsPage.principle4'),
              ].map((textValue, index) => (
                <div key={index} className="rounded border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                  {textValue}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
