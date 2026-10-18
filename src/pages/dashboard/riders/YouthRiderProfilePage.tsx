import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../../lib/supabase'
import RiderPowerProfile from '../../../components/riders/RiderPowerProfile'

type YouthScoutingStatus = {
  activated?: boolean
  premium?: boolean
  read_only?: boolean
  scout?: { id: string; name?: string } | null
  free_runs_remaining?: number
  can_run?: boolean
  can_run_free?: boolean
  can_run_coin?: boolean
  weekly_runs_used?: number
  weekly_run_limit?: number
  next_run_coin_cost?: number
  coin_balance?: number
  scouting_range?: string
}

type YouthDirectEligibility = {
  available: boolean
  can_scout: boolean
  own_rider?: boolean
  home_country?: string
  target_country?: string
  current_range?: string
  required_range?: string
}

type YouthRiderProfilePayload = {
  id: string
  public_only?: boolean
  academy_id?: string
  academy_name?: string
  club_id?: string
  is_mine?: boolean
  scouting_report?: {
    id: string
    stipend: number
    accommodation: number
    compensation: number
    assessment_band?: string
    confidence?: number
    status?: string
  } | null
  display_name: string
  country_code: string
  birth_date: string
  age: number
  role: string
  assessment_band: string
  development_focus: string
  workload: string
  readiness: number
  fatigue: number
  status: string
  joined_game_date: string
  joined_season: number
  is_starter_rider: boolean
  attributes: Record<string, number>
  agreement?: {
    stipend_weekly?: number
    accommodation_weekly?: number
    starts_on?: string
    ends_on?: string
    status?: string
  }
  race_summary?: {
    starts?: number
    wins?: number
    podiums?: number
    regional_points?: number
    world_points?: number
  }
  recent_results?: Array<{
    race_id: string
    race_name: string
    race_date: string
    competition_class: string
    result_status: string
    finish_position?: number | null
    regional_points?: number
    world_points?: number
  }>
}

function money(value: number | null | undefined): string {
  const amount = Math.round(Number(value ?? 0))
  const sign = amount < 0 ? '-' : ''
  return sign + String.fromCharCode(36) + Math.abs(amount).toLocaleString('en-US')
}

function humanize(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function flagUrl(code: string | null | undefined): string | null {
  const safe = String(code ?? '').trim().toLowerCase()
  return /^[a-z]{2}$/.test(safe) ? `https://flagcdn.com/w80/${safe}.png` : null
}

function Card({
  title,
  children,
  right,
}: {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export default function YouthRiderProfilePage(): JSX.Element {
  const { riderId } = useParams<{ riderId: string }>()
  const { t } = useTranslation('youthAcademy')
  const [profile, setProfile] = useState<YouthRiderProfilePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offerBusy, setOfferBusy] = useState(false)
  const [offerMessage, setOfferMessage] = useState<string | null>(null)
  const [offerValues, setOfferValues] = useState({ stipend: 100, accommodation: 0, compensation: 0 })
  const [scoutingStatus, setScoutingStatus] = useState<YouthScoutingStatus | null>(null)
  const [directEligibility, setDirectEligibility] = useState<YouthDirectEligibility | null>(null)
  const [scoutingLoading, setScoutingLoading] = useState(false)
  const [scoutingBusy, setScoutingBusy] = useState(false)
  const [scoutingMessage, setScoutingMessage] = useState<string | null>(null)
  const [offerOpen, setOfferOpen] = useState(false)
  const [offerSubmitted, setOfferSubmitted] = useState(false)

  useEffect(() => {
    let alive = true

    async function loadProfile() {
      if (!riderId) {
        setError(t('profile.notFound'))
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      const { data, error: profileError } = await supabase.rpc(
        'get_my_youth_rider_profile_v1',
        { p_youth_rider_id: riderId }
      )

      if (!alive) return

      if (profileError) {
        // Public U16 profiles exclude exact attributes, hidden potential and private agreements.
        // The existing full profile RPC remains accessible only to the rider's own manager.
        const { data: publicData, error: publicError } = await supabase.rpc(
          'get_public_youth_rider_profile_v1',
          { p_youth_rider_id: riderId }
        )
        if (!alive) return
        setError(publicError?.message ?? null)
        setProfile(publicError ? null : publicData as YouthRiderProfilePayload | null)
      } else {
        setProfile(data as YouthRiderProfilePayload)
      }

      setLoading(false)
    }

    void loadProfile()

    return () => {
      alive = false
    }
  }, [riderId, t])

  // Public profiles can be viewed by other managers, but their private
  // scouting and contracting tools are unlocked only by their own Youth Academy.
  useEffect(() => {
    if (!profile?.public_only || profile.is_mine) {
      setScoutingStatus(null)
      setDirectEligibility(null)
      return
    }
    let active = true
    setScoutingLoading(true)
    setDirectEligibility(null)
    void Promise.all([
      supabase.rpc('get_my_youth_scouting_v1'),
      supabase.rpc('get_youth_direct_scout_eligibility_v1', { p_youth_rider_id: profile.id }),
    ]).then(([scoutResult, eligibilityResult]) => {
      if (!active) return
      setScoutingStatus(scoutResult.error ? null : scoutResult.data as YouthScoutingStatus)
      setDirectEligibility(eligibilityResult.error ? null : eligibilityResult.data as YouthDirectEligibility)
      setScoutingMessage(scoutResult.error?.message ?? eligibilityResult.error?.message ?? null)
      setScoutingLoading(false)
    })
    return () => { active = false }
  }, [profile?.id, profile?.public_only, profile?.is_mine])

  useEffect(() => {
    const report = profile?.scouting_report
    if (!report?.id) return
    setOfferValues({
      stipend: Number(report.stipend ?? 100),
      accommodation: Number(report.accommodation ?? 0),
      compensation: Number(report.compensation ?? 0),
    })
  }, [profile?.scouting_report?.id])

  const scoutThisRider = async (): Promise<void> => {
    if (!riderId || !profile?.public_only || profile.is_mine || scoutingBusy) return
    if (directEligibility?.available && !directEligibility.can_scout) {
      setScoutingMessage(`Outside your ${directEligibility.current_range ?? 'current'} scouting range. This rider requires ${directEligibility.required_range ?? 'world'} scouting. Update the Youth Academy scouting range before searching.`)
      return
    }
    setScoutingBusy(true)
    setScoutingMessage(null)
    const usesCoins = (scoutingStatus?.free_runs_remaining ?? 0) <= 0
    const { error: scoutError } = await supabase.rpc('scout_youth_rider_direct_v1', {
      p_youth_rider_id: riderId,
      p_use_coins: usesCoins,
    })
    if (scoutError) {
      setScoutingMessage(scoutError.message)
    } else {
      const [{ data: fresh, error: refreshError }, { data: budget }] = await Promise.all([
        supabase.rpc('get_public_youth_rider_profile_v1', { p_youth_rider_id: riderId }),
        supabase.rpc('get_my_youth_scouting_v1'),
      ])
      if (refreshError || !fresh) {
        setScoutingMessage(refreshError?.message ?? 'Scouting completed. Reload this page to view the report.')
      } else {
        setProfile(fresh as YouthRiderProfilePayload)
        setOfferOpen(true)
        setScoutingMessage('Youth scouting report completed. You can now prepare a contract and development compensation offer.')
      }
      if (budget) setScoutingStatus(budget as YouthScoutingStatus)
    }
    setScoutingBusy(false)
  }

  const attributes = useMemo(
    () =>
      profile
        ? [
            ['sprint', profile.attributes?.sprint ?? 0],
            ['climbing', profile.attributes?.climbing ?? 0],
            ['time_trial', profile.attributes?.time_trial ?? 0],
            ['endurance', profile.attributes?.endurance ?? 0],
            ['flat', profile.attributes?.flat ?? 0],
            ['recovery', profile.attributes?.recovery ?? 0],
            ['resistance', profile.attributes?.resistance ?? 0],
            ['race_iq', profile.attributes?.race_iq ?? 0],
            ['teamwork', profile.attributes?.teamwork ?? 0],
          ]
        : [],
    [profile]
  )

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">{t('profile.loading')}</div>
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <Link
          to="/dashboard/youth-academy?tab=riders"
          className="text-sm font-medium text-slate-700 underline"
        >
          ← {t('profile.back')}
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error ?? t('profile.notFound')}
        </div>
      </div>
    )
  }

  const submitScoutedOffer = async (): Promise<void> => {
    if (!profile.scouting_report?.id || profile.is_mine || offerBusy) return
    setOfferBusy(true)
    setOfferMessage(null)
    const { error: offerError } = await supabase.rpc('submit_youth_recruitment_offer_v1', {
      p_report_id: profile.scouting_report.id,
      p_stipend_weekly: Math.max(50, Math.round(offerValues.stipend)),
      p_accommodation_weekly: Math.max(0, Math.round(offerValues.accommodation)),
      p_compensation_offer: Math.max(0, Math.round(offerValues.compensation)),
    })
    setOfferMessage(offerError?.message ?? 'Contract/transfer offer submitted. The current Academy and the rider/family decide separately; acceptance is deliberately difficult.')
    if (!offerError) setOfferSubmitted(true)
    setOfferBusy(false)
  }

  const flag = flagUrl(profile.country_code)
  const summary = profile.race_summary ?? {}

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/dashboard/youth-academy?tab=riders"
          className="text-sm font-medium text-slate-600 hover:text-slate-950 hover:underline"
        >
          ← {t('profile.back')}
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {flag ? (
              <img
                src={flag}
                alt=""
                className="h-6 w-9 rounded-sm border border-slate-200 object-cover"
              />
            ) : null}
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">
                {profile.display_name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {profile.age} · {humanize(profile.role)}{profile.public_only ? '' : ` · ${profile.assessment_band}`}
              </p>
            </div>
          </div>

          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
            {t('profile.youthRider')}
          </span>
        </div>
      </div>

      <RiderPowerProfile
        riderId={profile.id}
        scoutingRestricted={Boolean(profile.public_only && !profile.scouting_report)}
        skills={profile.public_only && !profile.scouting_report ? null : {
          sprint: profile.attributes?.sprint,
          climbing: profile.attributes?.climbing,
          time_trial: profile.attributes?.time_trial,
          endurance: profile.attributes?.endurance,
          flat: profile.attributes?.flat,
          resistance: profile.attributes?.resistance,
        }}
      />
      {profile.academy_id ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <span className="text-xs text-slate-500">U16 Academy</span>
            <div className="font-semibold">{profile.academy_name}</div>
          </div>
          <Link to={`/dashboard/youth-academy/teams/${profile.academy_id}`} className="text-sm font-semibold text-sky-700 hover:underline">View U16 team →</Link>
        </div>
      ) : null}

      {profile.public_only && !profile.is_mine && profile.status === 'academy' ? (
        <Card title="U16 scouting and recruitment">
          <p className="text-sm text-slate-600">
            Scout this specific rider before negotiating. Existing U16 Academy riders
            can only transfer if their current club approves and their family accepts.
            High compensation never guarantees a transfer.
          </p>

          {!profile.scouting_report ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" disabled={scoutingBusy || scoutingLoading || !scoutingStatus?.can_run || directEligibility?.can_scout !== true}
                onClick={() => void scoutThisRider()}
                className="rounded-full bg-yellow-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50">
                {scoutingBusy ? 'Scouting…' : scoutingLoading ? 'Checking scouting…'
                  : (scoutingStatus?.free_runs_remaining ?? 0) > 0
                    ? 'Scout this U16 rider · Free weekly search'
                    : `Scout this U16 rider · ${scoutingStatus?.next_run_coin_cost ?? 0} Coins`}
              </button>
              <button type="button" disabled
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400"
                title="A valid scouting report is required before any offer">
                Make contract/transfer offer · Scout first
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">Scouting report available</p>
              <p className="mt-1 text-xs text-emerald-800">
                {profile.scouting_report.assessment_band ?? 'Assessed youth rider'}
                {profile.scouting_report.confidence != null
                  ? ` · ${profile.scouting_report.confidence}% confidence` : ''}
                {' · '}Suggested weekly support: {money(profile.scouting_report.stipend)}
                {' · '}Suggested development compensation: {money(profile.scouting_report.compensation)}
              </p>
              <button type="button" onClick={() => setOfferOpen(value => !value)}
                className="mt-3 rounded-full bg-yellow-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-yellow-400">
                {offerOpen ? 'Hide contract/transfer offer' : 'Make contract/transfer offer'}
              </button>
              {offerOpen ? (
                <div className="mt-4 space-y-3 border-t border-emerald-200 pt-4">
                  <p className="text-xs text-slate-700">Propose financial support and compensation to the source Academy. The offer is not an automatic transfer.</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {([
                      ['stipend', 'Weekly stipend ($)'],
                      ['accommodation', 'Weekly accommodation ($)'],
                      ['compensation', 'Development compensation ($)'],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="text-xs text-slate-700">{label}
                        <input type="number" min="0" step="1" value={offerValues[key]}
                          onChange={event => setOfferValues(current => ({ ...current, [key]: Number(event.target.value) }))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-950"/>
                      </label>
                    ))}
                  </div>
                  <button type="button" disabled={offerBusy || offerSubmitted}
                    onClick={() => void submitScoutedOffer()}
                    className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {offerBusy ? 'Submitting…' : offerSubmitted ? 'Offer submitted' : 'Submit contract/transfer offer'}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {!profile.scouting_report && directEligibility?.available && !directEligibility.can_scout ? (
            <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This rider from {directEligibility.target_country ?? 'another country'} is outside your current {humanize(directEligibility.current_range)} scouting range.
              Upgrade the Youth Academy scouting programme to <strong>{humanize(directEligibility.required_range)}</strong> before you can scout and negotiate.
              <Link to="/dashboard/youth-academy?tab=settings" className="ml-2 font-semibold text-sky-800 underline">Change scouting range →</Link>
            </div>
          ) : null}
          {!profile.scouting_report && !scoutingLoading ? (
            <div className="mt-3 text-xs text-slate-600">
              {!scoutingStatus?.activated ? 'Activate your Youth Academy to scout U16 riders. ' :
                scoutingStatus?.read_only ? 'Premium access is required for Youth scouting. ' :
                !scoutingStatus?.scout ? 'Hire an active Youth Scout first. ' :
                !scoutingStatus.can_run ? 'All four scouting searches have been used this game week. ' :
                `Your scouting range: ${scoutingStatus.scouting_range ?? 'local'} · searches used: ${scoutingStatus.weekly_runs_used ?? 0}/${scoutingStatus.weekly_run_limit ?? 4}. `}
              <Link to="/dashboard/youth-academy?tab=scouting" className="font-semibold text-sky-700 hover:underline">Youth scouting settings →</Link>
            </div>
          ) : null}
          {scoutingMessage ? <p role="status" className="mt-3 text-sm text-slate-700">{scoutingMessage}</p> : null}
          {offerMessage ? <p role="status" className="mt-3 text-sm text-slate-700">{offerMessage}</p> : null}
        </Card>
      ) : null}

      {!profile.public_only ? (
      <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title={t('profile.readiness')}>
          <div className="text-2xl font-semibold">{profile.readiness}%</div>
        </Card>
        <Card title={t('profile.fatigue')}>
          <div className="text-2xl font-semibold">{profile.fatigue}%</div>
        </Card>
        <Card title={t('profile.developmentFocus')}>
          <div className="text-lg font-semibold">{humanize(profile.development_focus)}</div>
          <div className="mt-1 text-xs text-slate-500">{humanize(profile.workload)}</div>
        </Card>
        <Card title={t('profile.talentAssessment')}>
          <div className="text-lg font-semibold">{profile.assessment_band}</div>
          <div className="mt-1 text-xs text-slate-500">{t('profile.hiddenPotential')}</div>
        </Card>
      </div>

      <Card title={t('profile.attributes')}>
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          {attributes.map(([key, rawValue]) => {
            const value = Number(rawValue)
            return (
              <div key={String(key)}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-600">{humanize(String(key))}</span>
                  <span className="font-semibold text-slate-900">{value}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-yellow-400"
                    style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>
      </>) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {!profile.public_only ? <Card title={t('profile.supportAgreement')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs text-slate-500">{t('profile.weeklyStipend')}</div>
              <div className="mt-1 font-semibold">
                {money(profile.agreement?.stipend_weekly)}/{t('week')}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('profile.accommodation')}</div>
              <div className="mt-1 font-semibold">
                {money(profile.agreement?.accommodation_weekly)}/{t('week')}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('profile.joined')}</div>
              <div className="mt-1 font-semibold">{profile.joined_game_date}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{t('profile.agreementUntil')}</div>
              <div className="mt-1 font-semibold">{profile.agreement?.ends_on ?? '—'}</div>
            </div>
          </div>
        </Card> : null}

        <Card title={t('profile.raceSummary')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              [t('profile.starts'), summary.starts ?? 0],
              [t('profile.wins'), summary.wins ?? 0],
              [t('profile.podiums'), summary.podiums ?? 0],
              [t('profile.regionalPoints'), summary.regional_points ?? 0],
              [t('profile.worldPoints'), summary.world_points ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{String(label)}</div>
                <div className="mt-1 text-lg font-semibold">{String(value)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title={t('profile.recentResults')}>
        {(profile.recent_results?.length ?? 0) === 0 ? (
          <div className="text-sm text-slate-500">{t('profile.noResults')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3">{t('profile.date')}</th>
                  <th className="py-2 pr-3">{t('profile.race')}</th>
                  <th className="py-2 pr-3">{t('profile.class')}</th>
                  <th className="py-2 pr-3">{t('profile.result')}</th>
                  <th className="py-2 text-right">{t('profile.points')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(profile.recent_results ?? []).map(result => (
                  <tr key={result.race_id}>
                    <td className="py-3 pr-3">{result.race_date}</td>
                    <td className="py-3 pr-3 font-medium">{result.race_name}</td>
                    <td className="py-3 pr-3">{humanize(result.competition_class)}</td>
                    <td className="py-3 pr-3">
                      {result.finish_position
                        ? `#${result.finish_position}`
                        : humanize(result.result_status)}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {(result.regional_points ?? 0) + (result.world_points ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
