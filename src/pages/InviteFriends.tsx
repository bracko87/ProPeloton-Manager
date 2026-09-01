/**
 * InviteFriends.tsx
 * Two-stage referral / invite UI.
 *
 * Reward model:
 * - +2 Coins when the referred player records activity on 3 distinct real days.
 * - Maximum 10 free activity rewards per inviter per real calendar month.
 * - +40 Coins once when that referred player first buys Premium OR a Coin package.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthProvider'
import { supabase } from '../lib/supabase'

type ReferralActivityStatus = 'pending' | 'completed' | 'rejected'
type ActivityRewardStatus = 'pending' | 'granted' | 'capped' | 'ineligible'
type PaidConversionType = 'coin_package' | 'premium' | null

type ReferralActivity = {
  id: string
  referred_user_id: string
  referred_club_id: string | null
  referral_code_used: string
  status: ReferralActivityStatus
  created_at: string
  completed_at: string | null
  reward_coins: number
  reward_granted_at: string | null
  activity_reward_coins: number
  activity_day_count: number
  activity_qualified_at: string | null
  activity_reward_granted_at: string | null
  activity_reward_status: ActivityRewardStatus
  paid_conversion_type: PaidConversionType
  paid_conversion_at: string | null
}

function formatDateTime(
  value: string | null | undefined,
  locale: string,
): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale)
}

function maskIdentifier(
  value: string | null | undefined,
  startChars = 8,
  endChars = 4
): string {
  if (!value) return '—'
  if (value.length <= startChars + endChars) return value
  return `${value.slice(0, startChars)}******${value.slice(-endChars)}`
}

function statusClasses(status: ReferralActivityStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-800'
    case 'completed':
      return 'bg-emerald-100 text-emerald-800'
    case 'rejected':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function statusLabelKey(
  status: ReferralActivityStatus,
): 'invite.pending' | 'invite.completed' | 'invite.rejected' {
  switch (status) {
    case 'pending':
      return 'invite.pending'
    case 'completed':
      return 'invite.completed'
    case 'rejected':
      return 'invite.rejected'
  }
}

export default function InviteFriendsPage(): JSX.Element {
  const { t, i18n } = useTranslation('accountPages')
  const { user, loading } = useAuth()

  const [clubId, setClubId] = useState<string | null>(null)
  const [referralCode, setReferralCode] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('')

  const [activity, setActivity] = useState<ReferralActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')

  const locale = i18n.resolvedLanguage ?? i18n.language

  useEffect(() => {
    let isMounted = true

    const loadClubReferralData = async (): Promise<void> => {
      try {
        if (loading) return
        if (!user?.id) throw new Error(t('invite.signIn'))

        setIsLoading(true)
        setLoadError('')

        const { data, error } = await supabase
          .from('clubs')
          .select('id, referral_code')
          .eq('owner_user_id', user.id)
          .is('deleted_at', null)
          .eq('club_type', 'main')
          .single()

        if (error) throw new Error(t('invite.loadCodeFailed'))
        if (!data?.referral_code) throw new Error(t('invite.missingCode'))
        if (!isMounted) return

        setClubId(data.id)
        setReferralCode(data.referral_code)
      } catch {
        if (!isMounted) return
        setClubId(null)
        setReferralCode('')
        setLoadError(t('invite.loadLinkFailed'))
      } finally {
        if (!isMounted) return
        setIsLoading(false)
      }
    }

    void loadClubReferralData()
    return () => {
      isMounted = false
    }
  }, [loading, t, user?.id])

  useEffect(() => {
    let isMounted = true

    const loadReferralActivity = async (): Promise<void> => {
      if (!clubId) {
        setActivity([])
        setActivityError('')
        setActivityLoading(false)
        return
      }

      setActivityLoading(true)
      setActivityError('')

      const { data, error } = await supabase
        .from('club_referrals')
        .select(
          'id, referred_user_id, referred_club_id, referral_code_used, status, created_at, completed_at, reward_coins, reward_granted_at, activity_reward_coins, activity_day_count, activity_qualified_at, activity_reward_granted_at, activity_reward_status, paid_conversion_type, paid_conversion_at'
        )
        .eq('referrer_club_id', clubId)
        .order('created_at', { ascending: false })

      if (!isMounted) return

      if (error) {
        setActivity([])
        setActivityError(t('invite.loadActivityFailed'))
        setActivityLoading(false)
        return
      }

      setActivity((data ?? []) as ReferralActivity[])
      setActivityLoading(false)
    }

    void loadReferralActivity()
    return () => {
      isMounted = false
    }
  }, [clubId, t])

  const referral = useMemo(() => {
    if (!referralCode) return ''
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `${baseUrl}/#/referral/${referralCode}`
  }, [referralCode])

  const stats = useMemo(() => {
    const total = activity.length
    const activeQualified = activity.filter(item =>
      item.activity_reward_status === 'granted' || item.activity_reward_status === 'capped'
    ).length
    const paidConversions = activity.filter(item => Boolean(item.reward_granted_at)).length
    const activityCoins = activity.reduce(
      (sum, item) => sum + (item.activity_reward_granted_at ? Number(item.activity_reward_coins || 2) : 0),
      0
    )
    const paidCoins = activity.reduce(
      (sum, item) => sum + (item.reward_granted_at ? Number(item.reward_coins || 40) : 0),
      0
    )

    return {
      total,
      pending: activity.filter(item => item.status === 'pending').length,
      activeQualified,
      paidConversions,
      activityCoins,
      paidCoins,
      totalCoins: activityCoins + paidCoins,
    }
  }, [activity])

  const handleCopy = async (): Promise<void> => {
    if (!referral) return
    try {
      await navigator.clipboard.writeText(referral)
      setCopied(true)
      setMessage(t('invite.copySuccess'))
      window.setTimeout(() => {
        setCopied(false)
        setMessage('')
      }, 2000)
    } catch {
      setCopied(false)
      setMessage(t('invite.copyFailed'))
    }
  }

  const handleShare = async (): Promise<void> => {
    if (!referral) return
    try {
      if (navigator.share) {
        await navigator.share({
          title: t('invite.shareTitle'),
          text: t('invite.shareText'),
          url: referral
        })
        setMessage('')
        return
      }
      await handleCopy()
      setMessage(t('invite.shareFallback'))
    } catch {
      // User cancelled the native share sheet.
    }
  }

  const inputValue = isLoading ? t('invite.loadingLink') : referral

  return (
    <div className="w-full h-full min-h-[calc(100vh-10rem)] text-gray-900">
      <div className="flex h-full flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold">{t('invite.title')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('invite.v2Subtitle')}</p>
        </div>

        <section className="w-full rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold">{t('invite.linkTitle')}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('invite.v2LinkDescription')}</p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              readOnly
              value={inputValue}
              aria-label={t('invite.referralAria')}
              className="h-11 w-full flex-1 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={isLoading || !referral}
              className="h-11 rounded-md bg-yellow-400 px-5 text-sm font-semibold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copied ? t('invite.copied') : t('invite.copy')}
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={isLoading || !referral}
              className="h-11 rounded-md border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('invite.share')}
            </button>
          </div>

          {loadError ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
          ) : null}
          {!loadError && message ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>
          ) : null}
        </section>

        <section className="w-full rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold">{t('invite.v2StatsTitle')}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {[
              [t('invite.v2TotalReferrals'), stats.total],
              [t('invite.v2PendingReferrals'), stats.pending],
              [t('invite.v2ActivePlayers'), stats.activeQualified],
              [t('invite.v2PaidConversions'), stats.paidConversions],
              [t('invite.v2ActivityCoins'), stats.activityCoins],
              [t('invite.v2PaidCoins'), stats.paidCoins],
              [t('invite.v2TotalCoins'), stats.totalCoins],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold">{t('invite.activityTitle')}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('invite.v2ActivityDescription')}</p>

          {activityError ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{activityError}</div>
          ) : null}

          {activityLoading ? (
            <div className="mt-4 flex h-48 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">{t('invite.loadingActivity')}</div>
          ) : activity.length === 0 ? (
            <div className="mt-4 flex h-48 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">{t('invite.v2NoActivity')}</div>
          ) : (
            <div className="mt-4 space-y-3">
              {activity.map(item => {
                const paidLabel = item.paid_conversion_type === 'premium'
                  ? t('invite.v2PremiumConversion')
                  : t('invite.v2CoinConversion')

                return (
                  <article key={item.id} className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold uppercase ${statusClasses(item.status)}`}>
                        {t(statusLabelKey(item.status))}
                      </span>
                      <span className="text-xs text-gray-500">{t('invite.code', { code: item.referral_code_used })}</span>
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                        {t('invite.v2ActiveDays', { count: Math.min(item.activity_day_count, 3) })}
                      </span>
                      {item.activity_reward_granted_at ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">+{item.activity_reward_coins} {t('invite.v2Coins')}</span>
                      ) : item.activity_reward_status === 'capped' ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{t('invite.v2MonthlyCapReached')}</span>
                      ) : null}
                      {item.reward_granted_at ? (
                        <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-800">+{item.reward_coins} {t('invite.v2Coins')} · {paidLabel}</span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-sm text-gray-600">
                      {item.status === 'rejected'
                        ? t('invite.v2RejectedDescription')
                        : item.reward_granted_at
                          ? t('invite.v2PaidCompletedDescription', { type: paidLabel })
                          : item.activity_reward_status === 'granted'
                            ? t('invite.v2ActivityCompletedDescription')
                            : item.activity_reward_status === 'capped'
                              ? t('invite.v2CappedDescription')
                              : t('invite.v2PendingDescription', { count: Math.min(item.activity_day_count, 3) })}
                    </p>

                    <dl className="mt-2 grid gap-2 text-sm text-gray-700 md:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="font-medium text-gray-600">{t('invite.referredUser')}</dt>
                        <dd className="text-xs break-all">{maskIdentifier(item.referred_user_id)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-600">{t('invite.referredClub')}</dt>
                        <dd className="text-xs break-all">{item.referred_club_id ? maskIdentifier(item.referred_club_id) : t('invite.notLinked')}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-600">{t('invite.created')}</dt>
                        <dd>{formatDateTime(item.created_at, locale)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-600">{t('invite.v2PaidConversion')}</dt>
                        <dd>{formatDateTime(item.paid_conversion_at, locale)}</dd>
                      </div>
                    </dl>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="w-full rounded-lg border border-gray-100 bg-gray-50 p-5 shadow-sm">
          <h3 className="text-base font-semibold">{t('invite.how')}</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-600">
            <li>{t('invite.v2Step1')}</li>
            <li>{t('invite.v2Step2')}</li>
            <li>{t('invite.v2Step3')}</li>
            <li>{t('invite.v2Step4')}</li>
          </ol>
          <p className="mt-3 text-xs text-gray-500">{t('invite.v2AntiAbuseNote')}</p>
        </section>
      </div>
    </div>
  )
}
