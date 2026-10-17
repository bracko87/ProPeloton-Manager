import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../../lib/supabase'

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
    setOfferMessage(offerError?.message ?? 'Recruitment offer submitted. The academy, rider and family must approve; success is not guaranteed.')
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
        <Card title="Recruit this U16 rider">
          <p className="text-sm text-slate-600">
            Youth transfers require scouting, approval from the current Academy and the rider's family. A large offer does not guarantee a move.
          </p>
          {profile.scouting_report ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ['stipend', 'Weekly support'],
                  ['accommodation', 'Weekly accommodation'],
                  ['compensation', 'Academy compensation'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="text-xs text-slate-600">{label}
                    <input type="number" min="0" step="1" value={offerValues[key]}
                      onChange={event => setOfferValues(current => ({ ...current, [key]: Number(event.target.value) }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-950" />
                  </label>
                ))}
              </div>
              <button type="button" disabled={offerBusy} onClick={() => void submitScoutedOffer()}
                className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">
                {offerBusy ? 'Submitting…' : 'Submit U16 recruitment offer'}
              </button>
            </div>
          ) : (
            <Link to="/dashboard/youth-academy?tab=scouting" className="mt-3 inline-block rounded-full bg-yellow-100 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-yellow-200">
              Scout this rider to unlock an offer →
            </Link>
          )}
          {offerMessage ? <p className="mt-2 text-sm text-slate-700">{offerMessage}</p> : null}
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
