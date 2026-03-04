/**
 * src/lib/referrals.ts
 *
 * Shared referral helper utilities.
 *
 * Purpose:
 * - Normalize, store and clear pending referral codes in localStorage.
 * - Resolve referrer club by referral_code, block self-referrals and
 *   insert pending referral records into club_referrals with a few
 *   fallback payload shapes for schema compatibility.
 */

import { supabase } from './supabase'

export const PENDING_REFERRAL_STORAGE_KEY = 'pending_referral_code'

export function normalizeReferralCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

export function setPendingReferralCode(code: string): void {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return

  window.localStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, normalized)
}

export function getPendingReferralCode(): string {
  return normalizeReferralCode(window.localStorage.getItem(PENDING_REFERRAL_STORAGE_KEY))
}

export function clearPendingReferralCode(): void {
  window.localStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY)
}

type ApplyPendingReferralParams = {
  referralCode: string
  referredUserId: string
  referredClubId: string
}

export async function applyPendingReferral({
  referralCode,
  referredUserId,
  referredClubId,
}: ApplyPendingReferralParams): Promise<void> {
  const normalizedCode = normalizeReferralCode(referralCode)

  if (!normalizedCode) {
    clearPendingReferralCode()
    return
  }

  const { data: referrerClub, error: referrerError } = await supabase
    .from('clubs')
    .select('id, owner_user_id')
    .eq('referral_code', normalizedCode)
    .single()

  if (referrerError || !referrerClub) {
    clearPendingReferralCode()
    return
  }

  if (referrerClub.owner_user_id === referredUserId) {
    clearPendingReferralCode()
    return
  }

  const insertAttempts: Array<Record<string, string>> = [
    {
      referrer_club_id: referrerClub.id,
      referred_club_id: referredClubId,
      referred_user_id: referredUserId,
      referral_code: normalizedCode,
      status: 'pending',
    },
    {
      referrer_club_id: referrerClub.id,
      referred_club_id: referredClubId,
      referred_user_id: referredUserId,
      status: 'pending',
    },
    {
      referrer_club_id: referrerClub.id,
      referred_club_id: referredClubId,
      status: 'pending',
    },
  ]

  let lastError: Error | null = null

  for (const payload of insertAttempts) {
    const { error } = await supabase.from('club_referrals').insert(payload)

    if (!error) {
      clearPendingReferralCode()
      return
    }

    lastError = error
  }

  if (lastError) {
    throw lastError
  }
}