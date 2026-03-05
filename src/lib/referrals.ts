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

/**
 * Hardened referral-code retrieval:
 * Always normalize (trim + uppercase) before returning.
 * Prevents subtle mismatches caused by raw localStorage values.
 */
export function getPendingReferralCode(): string | null {
  try {
    const value = window.localStorage.getItem(PENDING_REFERRAL_KEY)
    const normalized = normalizeReferralCode(value)
    return normalized || null
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

/**
 * Apply pending referral by calling RPC `apply_club_referral`.
 *
 * Compatibility:
 * - Supports both RPC signatures:
 *   1) (p_referral_code, p_referred_club_id, p_referred_user_id)
 *   2) (p_referral_code, p_referred_club_id)
 *
 * If the newer parameter isn't supported by backend, we retry with the older payload.
 */
export async function applyPendingReferral(args: {
  referralCode: string
  referredClubId: string
  referredUserId?: string
}): Promise<void> {
  const referralCode = normalizeReferralCode(args.referralCode)
  const { referredClubId, referredUserId } = args

  if (!referralCode) {
    clearPendingReferralCode()
    return
  }

  const payload: {
    p_referral_code: string
    p_referred_club_id: string
    p_referred_user_id?: string
  } = {
    p_referral_code: referralCode,
    p_referred_club_id: referredClubId
  }

  if (referredUserId) {
    payload.p_referred_user_id = referredUserId
  }

  let { error } = await supabase.rpc('apply_club_referral', payload)

  if (error && referredUserId) {
    const maybeSignatureMismatch =
      /function public\.apply_club_referral/i.test(error.message ?? '') &&
      /p_referred_user_id/i.test(error.message ?? '')

    if (maybeSignatureMismatch) {
      ;({ error } = await supabase.rpc('apply_club_referral', {
        p_referral_code: referralCode,
        p_referred_club_id: referredClubId
      }))
    }
  }

  if (error) throw error

  clearPendingReferralCode()
}