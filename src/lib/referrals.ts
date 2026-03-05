/**
 * src/lib/referrals.ts
 *
 * Shared referral helper utilities.
 *
 * Purpose:
 * - Normalize, store, read, and clear pending referral codes in localStorage.
 * - Apply a referral by calling the apply_club_referral RPC.
 *
 * Note:
 * - Some pages still import normalizeReferralCode + setPendingReferralCode.
 *   These exports are kept for backwards compatibility.
 */

import { supabase } from './supabase'

const PENDING_REFERRAL_KEY = 'pending_referral_code'

export function normalizeReferralCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

export function setPendingReferralCode(code: string): void {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return

  try {
    window.localStorage.setItem(PENDING_REFERRAL_KEY, normalized)
  } catch {
    // ignore
  }
}

export function getPendingReferralCode(): string | null {
  try {
    const value = window.localStorage.getItem(PENDING_REFERRAL_KEY)
    return value?.trim() || null
  } catch {
    return null
  }
}

export function clearPendingReferralCode(): void {
  try {
    window.localStorage.removeItem(PENDING_REFERRAL_KEY)
  } catch {
    // ignore
  }
}

export async function applyPendingReferral(args: {
  referralCode: string
  referredClubId: string
}): Promise<void> {
  const referralCode = normalizeReferralCode(args.referralCode)
  const { referredClubId } = args

  if (!referralCode) {
    clearPendingReferralCode()
    return
  }

  const { error } = await supabase.rpc('apply_club_referral', {
    p_referral_code: referralCode,
    p_referred_club_id: referredClubId,
  })

  if (error) throw error

  clearPendingReferralCode()
}