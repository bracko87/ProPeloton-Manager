/** Non-blocking one-time setup reminder after guest conversion or direct Google signup. */
import React from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'

type Missing = {
  name: string
  personal: boolean
  birthday: boolean
  jersey: boolean
  logo: boolean
  source: 'converted_guest' | 'direct_google'
}

const REMINDER_KEY_PREFIX = 'ppm-converted-profile-reminder-v1:'

export default function PostConversionProfileReminder(): JSX.Element | null {
  const { user, loading } = useAuth()
  const [missing, setMissing] = React.useState<Missing | null>(null)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (loading || !user?.id || user.is_anonymous === true) {
      setVisible(false)
      setMissing(null)
      return
    }
    const userId = user.id
    // A Google-created account has its first verified Google provider already
    // in Supabase Auth, unlike an older email account that links Google later.
    const isDirectGoogleSignup = user.app_metadata?.provider === 'google'
    let active = true
    const key = REMINDER_KEY_PREFIX + userId
    const inspect = async () => {
      const { data: converted, error: trialError } = await supabase
        .from('saturn_test_accounts_v1')
        .select('club_id,converted_at')
        .eq('user_id', userId).maybeSingle()
      if (!active || (trialError && !isDirectGoogleSignup)) return
      const convertedClubId = converted?.converted_at ? converted.club_id : null
      if (!convertedClubId && !isDirectGoogleSignup) return

      // Google signups do not have a Saturn guest-lifecycle row. Discover the
      // REAL owner club only through the existing authenticated server RPC;
      // do not create or claim a club from the UI.
      let clubId: string | null = convertedClubId
      if (!clubId) {
        const { data: ownedClubId, error: clubError } = await supabase.rpc('get_my_club_id')
        if (!active || clubError || typeof ownedClubId !== 'string') return
        clubId = ownedClubId
      }
      if (!clubId) return

      const [profileResult, clubResult, kitResult] = await Promise.all([
        supabase.from('profiles').select('username,first_name,last_name,city,country,birthday_month,birthday_day,birthday_locked').eq('id',userId).maybeSingle(),
        supabase.from('clubs').select('id,name,logo_path').eq('id',clubId).maybeSingle(),
        supabase.from('team_kits').select('id,config').eq('team_id',clubId).eq('name','home').maybeSingle(),
      ])
      if (!active || profileResult.error || clubResult.error || kitResult.error ||
          !profileResult.data || !clubResult.data) return
      const profile = profileResult.data
      const club = clubResult.data
      const status: Missing = {
        name: club.name,
        personal: !profile.username || /^mgr_[a-f0-9]{20}$/i.test(profile.username) || !profile.first_name || !profile.last_name || !profile.city || !profile.country,
        birthday: (!profile.birthday_locked && (profile.birthday_month == null || profile.birthday_day == null)),
        jersey: !kitResult.data?.config,
        logo: !club.logo_path || club.logo_path.startsWith('data:image/svg+xml;base64,') ||
          club.logo_path.startsWith('generated/base-'),
        source: convertedClubId ? 'converted_guest' : 'direct_google',
      }
      if (!status.personal && !status.birthday && !status.jersey && !status.logo) return
      if (!active) return
      setMissing(status)
      try { setVisible(window.localStorage.getItem(key) !== 'dismissed') }
      catch { setVisible(true) }
    }
    void inspect()
    const onProfileUpdate = () => { void inspect() }
    window.addEventListener('saturn-profile-completion-updated',onProfileUpdate)
    return () => {
      active = false
      window.removeEventListener('saturn-profile-completion-updated',onProfileUpdate)
    }
  }, [user?.id, user?.is_anonymous, loading])

  if (!visible || !missing || !user?.id) return null
  const dismiss = () => {
    try { window.localStorage.setItem(REMINDER_KEY_PREFIX + user.id,'dismissed') } catch {}
    setVisible(false)
  }
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="converted-profile-reminder-heading"
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-yellow-300 bg-slate-900 px-6 py-5 text-white">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-yellow-300">Registration completed</p>
            <h2 id="converted-profile-reminder-heading" className="mt-1 text-xl font-bold">Finish setting up your manager profile</h2>
          </div>
          <button type="button" className="rounded p-2 text-slate-200 hover:bg-slate-700"
            aria-label="Close setup reminder" onClick={dismiss}>✕</button>
        </div>
        <div className="space-y-4 px-6 py-5 text-sm text-gray-700">
          <p>Your team <strong>{missing.name}</strong> is registered. {missing.source === 'direct_google' ? 'Some optional details were skipped when you created your account with Google.' : 'Some optional details were skipped when you converted your guest account.'} You can complete them now or later.</p>
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-950">Manager details</h3>
              <p className="mt-1">
                {missing.personal ? 'Complete your full name, city or country, and review your display name.' : 'Your main contact details are already filled in.'}
                {missing.birthday ? ' Your birthday is still missing. You can enter it once; after saving it is permanently locked.' : ''}
              </p>
              <Link to="/dashboard/my-profile" onClick={dismiss}
                className="mt-3 inline-block rounded-lg bg-yellow-400 px-4 py-2 font-semibold text-slate-950 hover:bg-yellow-300">
                Open My Profile
              </Link>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-950">Team identity</h3>
              <p className="mt-1">
                {missing.logo ? 'Your automatic team shield is already active. You can keep it or upload a custom logo. ' : 'Your team logo is saved. '}
                {missing.jersey ? 'Choose a generic jersey or upload your own design.' : 'Your jersey is saved and can be reviewed.'}
              </p>
              <Link to="/dashboard/customize-team" onClick={dismiss}
                className="mt-3 inline-block rounded-lg bg-yellow-400 px-4 py-2 font-semibold text-slate-950 hover:bg-yellow-300">
                Customize Team
              </Link>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={dismiss} className="rounded-lg border border-gray-300 px-5 py-2 font-semibold text-gray-800 hover:bg-gray-50">
              I'll do this later
            </button>
          </div>
          <p className="text-xs text-gray-500">This reminder does not restrict gameplay. Your team and account remain active.</p>
        </div>
      </section>
    </div>
  )
}
