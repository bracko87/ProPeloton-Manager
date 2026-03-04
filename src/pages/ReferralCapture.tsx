/**
 * src/pages/ReferralCapture.tsx
 *
 * Referral capture page.
 *
 * Purpose:
 * - Read referral code from the URL (/referral/:code)
 * - Normalize and persist it to localStorage as a pending referral
 * - Redirect the visitor to the registration page
 */

import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { normalizeReferralCode, setPendingReferralCode } from '../lib/referrals'

export default function ReferralCapturePage(): JSX.Element {
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()

  useEffect(() => {
    const normalizedCode = normalizeReferralCode(code)

    if (normalizedCode) {
      setPendingReferralCode(normalizedCode)
    }

    navigate('/register', { replace: true })
  }, [code, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <p className="text-sm text-slate-300">Redirecting you to sign up...</p>
    </div>
  )
}