import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

type PublicYouthAcademyProfile = {
  academy_id: string
  club_id: string
  academy_name: string
  country_code: string
  logo_path: string | null
  club_tier: string
  reputation: number
  capacity: number
  is_active?: boolean
  is_mine: boolean
  starts: number
  wins: number
  division?: { class: string; division: string } | null
  riders: Array<{ id: string; name: string; country_code: string; age: number; role: string }>
}

function logoUrl(path: string | null): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return supabase.storage.from('club-logos').getPublicUrl(path).data.publicUrl ?? null
}

export default function YouthAcademyTeamProfilePage(): JSX.Element {
  const { academyId } = useParams<{ academyId: string }>()
  const { t } = useTranslation('youthAcademy')
  const [profile, setProfile] = useState<PublicYouthAcademyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!academyId) { setLoading(false); setError('Academy not found'); return }
    let alive = true
    setLoading(true)
    void supabase.rpc('get_public_youth_academy_profile_v1', { p_academy_id: academyId })
      .then(({ data, error: rpcError }) => {
        if (!alive) return
        setProfile(rpcError ? null : data as PublicYouthAcademyProfile | null)
        setError(rpcError?.message ?? null)
        setLoading(false)
      })
    return () => { alive = false }
  }, [academyId])

  if (loading) return <div className="p-6 text-sm text-slate-500">{t('profile.loading', { defaultValue: 'Loading academy profile...' })}</div>
  if (!profile) return <div className="p-6 text-sm text-red-600">{error || 'Academy not found'}</div>

  const clubLogo = logoUrl(profile.logo_path)
  return (
    <div className="space-y-5">
      <Link to="/dashboard/youth-academy?tab=rankings" className="text-sm text-slate-600 hover:underline">
        ← {t('profile.back', { defaultValue: 'Back to Youth Academy' })}
      </Link>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {clubLogo ? <img src={clubLogo} alt="" className="h-20 w-20 rounded-xl border border-slate-200 object-contain p-2" /> : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-950">{profile.academy_name} · U16</h1>
            <p className="mt-1 text-sm text-slate-600">
              {profile.country_code} · {profile.division?.class ?? 'Youth Academy'} · {profile.division?.division ?? ''}
            </p>
            {profile.is_active === false ? (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                Historical U16 Academy · not active in current Youth competitions
              </p>
            ) : null}
            <Link to={`/dashboard/teams/${profile.club_id}`} className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:underline">
              {t('profile.parentClub', { defaultValue: 'View parent club profile' })} →
            </Link>
          </div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [t('rankings.starts', { defaultValue: 'Race starts' }), profile.starts],
          [t('profile.raceWins', { defaultValue: 'Race wins' }), profile.wins],
          [t('profile.riders', { defaultValue: 'U16 roster' }), `${profile.riders.length} / ${profile.capacity}`],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-bold">{value}</div>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 p-4 font-semibold">
          {t('profile.riders', { defaultValue: 'U16 riders' })}
        </h2>
        <div className="divide-y divide-slate-100">
          {profile.riders.map(rider => (
            <Link key={rider.id} to={`/dashboard/youth-academy/riders/${rider.id}`}
              className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm hover:bg-slate-50">
              <span className="font-semibold text-sky-800">{rider.name}</span>
              <span className="text-xs text-slate-500">{rider.country_code} · {rider.age} · {rider.role}</span>
            </Link>
          ))}
          {!profile.riders.length ? (
            <div className="p-4 text-sm text-slate-500">{t('rankings.noPoints', { defaultValue: 'No active U16 riders' })}</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
