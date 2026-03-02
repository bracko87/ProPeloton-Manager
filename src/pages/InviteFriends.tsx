/**
 * InviteFriends.tsx
 * Referral / invite UI placeholder.
 */

import React from 'react'

/**
 * InviteFriendsPage
 * Demonstrates a referral link and basic invite flow UI.
 */
export default function InviteFriendsPage(): JSX.Element {
  const referral = 'https://example.com/referral/ABC123'

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Invite Friends</h2>

      <div className="bg-white p-4 rounded shadow max-w-2xl space-y-3">
        <div className="text-sm text-gray-600">Share your referral link to invite friends:</div>
        <div className="flex items-center gap-2">
          <input className="flex-1 border px-3 py-2 rounded" value={referral} readOnly />
          <button
            onClick={() => navigator.clipboard?.writeText(referral)}
            className="px-3 py-2 bg-yellow-400 text-black rounded font-semibold"
          >
            Copy
          </button>
        </div>
        <div className="text-xs text-gray-500">Referrals will earn rewards when they sign up.</div>
      </div>
    </div>
  )
}