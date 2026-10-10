import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Crown, Gift, Clock3 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type TrialOnboarding = {
  state: 'active' | 'expired' | 'ineligible' | 'not_ready'
  trial_started?: boolean
  expires_at?: string
  seconds_left?: number
  show_welcome?: boolean
  show_expired?: boolean
}

export default function WelcomePremiumTrial(): JSX.Element | null {
  const { t } = useTranslation('proPackages')
  const navigate = useNavigate()
  const [trial, setTrial] = useState<TrialOnboarding | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_premium_trial_onboarding_v1', {
      p_action: 'status',
    })
    if (error) {
      console.warn('Unable to refresh Premium onboarding:', error.message)
      return
    }
    const next = data as TrialOnboarding
    setTrial(next)
    if (next.trial_started || next.state === 'expired') {
      window.dispatchEvent(new CustomEvent('premium-status-changed'))
      window.dispatchEvent(new CustomEvent('coin-balance-changed'))
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Dashboard navigation / returning users can trigger expiration after 7 days.
    const timer = window.setInterval(() => void refresh(), 15 * 60 * 1000)
    const whenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', whenVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', whenVisible)
    }
  }, [refresh])

  const dismiss = async (action: 'dismiss_welcome' | 'dismiss_expired', goToPro = false) => {
    if (busy) return
    setBusy(true)
    const { data, error } = await supabase.rpc('get_my_premium_trial_onboarding_v1', {
      p_action: action,
    })
    setBusy(false)
    if (error) {
      console.warn('Could not acknowledge Premium onboarding:', error.message)
      return
    }
    setTrial(data as TrialOnboarding)
    if (goToPro) navigate('/dashboard/pro')
  }

  if (!trial?.show_welcome && !trial?.show_expired) return null
  const welcome = Boolean(trial.show_welcome)
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-onboarding-title"
      className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/65 p-4"
    >
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-yellow-200 bg-white shadow-2xl">
        <div className="bg-yellow-400 px-6 py-6 text-center text-slate-950">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-white/80">
            {welcome ? <Gift size={28} /> : <Clock3 size={28} />}
          </div>
          <h2 id="premium-onboarding-title" className="text-xl font-extrabold">
            {t(welcome ? 'trial.welcomeTitle' : 'trial.expiredTitle')}
          </h2>
        </div>
        <div className="space-y-4 px-6 py-6">
          <p className="text-sm leading-6 text-slate-700">
            {t(welcome ? 'trial.welcomeBody' : 'trial.expiredBody')}
          </p>
          {welcome ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-amber-50 p-4 text-center">
                <Crown size={23} className="mx-auto mb-1 text-amber-700" />
                <strong className="block text-lg">7</strong>
                <span className="text-xs text-slate-700">{t('trial.premiumDays')}</span>
              </div>
              <div className="rounded-xl bg-amber-50 p-4 text-center">
                <Gift size={23} className="mx-auto mb-1 text-amber-700" />
                <strong className="block text-lg">20</strong>
                <span className="text-xs text-slate-700">{t('trial.welcomeCoins')}</span>
              </div>
            </div>
          ) : null}
          <p className="text-xs leading-5 text-slate-500">
            {t(welcome ? 'trial.noBilling' : 'trial.keepPlaying')}
          </p>
          <div className="flex flex-wrap gap-2">
            {!welcome ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void dismiss('dismiss_expired', true)}
                className="flex-1 rounded-lg bg-yellow-400 px-3 py-3 text-sm font-semibold text-slate-950 hover:bg-yellow-300 disabled:opacity-50"
              >
                {t('trial.viewPro')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void dismiss(welcome ? 'dismiss_welcome' : 'dismiss_expired')}
              className="flex-1 rounded-lg bg-slate-950 px-3 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {t(welcome ? 'trial.startPlaying' : 'trial.continueFree')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
