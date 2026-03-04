/**
 * InviteFriends.tsx
 * Referral / invite UI page.
 */

import React, { useMemo, useState } from 'react'

export default function InviteFriendsPage(): JSX.Element {
  // TODO: Replace with real value from backend / logged-in user profile
  const referralCode = 'ABC123'

  const referral = useMemo(() => {
    // Replace with your real frontend/game domain when wired up
    return `https://example.com/referral/${referralCode}`
  }, [referralCode])

  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('')

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(referral)
      setCopied(true)
      setMessage('Invite link copied.')

      window.setTimeout(() => {
        setCopied(false)
        setMessage('')
      }, 2000)
    } catch {
      setCopied(false)
      setMessage('Unable to copy link. Please copy it manually.')
    }
  }

  const handleShare = async (): Promise<void> => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join me in the game',
          text: 'Use my invite link to join the game:',
          url: referral,
        })
        setMessage('')
        return
      }

      await handleCopy()
      setMessage('Sharing is not supported here, so the link was copied instead.')
    } catch {
      // Ignore cancelled share dialog
    }
  }

  return (
    <div className="w-full h-full min-h-[calc(100vh-10rem)] text-gray-900">
      <div className="flex h-full flex-col gap-6">
        {/* Page header OUTSIDE the box (like Preferences) */}
        <div>
          <h2 className="text-xl font-semibold">Invite Friends</h2>
          <p className="mt-1 text-sm text-gray-500">
            Share your invite link so other players can join the game through your team.
          </p>
        </div>

        {/* Main invite section */}
        <section className="w-full rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* Left: Invite link box */}
            <div className="flex-1">
              <h3 className="text-base font-semibold">Your invite link</h3>
              <p className="mt-1 text-xs text-gray-500">
                Share this link with a friend. When they sign up using it, the invite will be tied to your account.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  readOnly
                  value={referral}
                  aria-label="Referral link"
                  className="h-11 w-full flex-1 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400"
                />

                <button
                  type="button"
                  onClick={handleCopy}
                  className="h-11 rounded-md bg-yellow-400 px-5 text-sm font-semibold text-black transition hover:bg-yellow-300"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="h-11 rounded-md border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
                >
                  Share
                </button>
              </div>

              {message ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {message}
                </div>
              ) : null}
            </div>

            {/* Right: How it works */}
            <div className="w-full lg:w-[320px] rounded-md border border-gray-100 bg-gray-50 p-4">
              <h3 className="text-base font-semibold">How it works</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-600">
                <li>Copy or share your personal invite link.</li>
                <li>Your friend opens the link and creates an account.</li>
                <li>The referral is connected to your profile.</li>
              </ol>
            </div>
          </div>
        </section>

        {/* Placeholder for future referral activity */}
        <section className="w-full rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold">Referral activity</h3>
          <p className="mt-1 text-xs text-gray-500">
            Later this can show invited players, pending signups, and referral status.
          </p>

          <div className="mt-4 flex h-48 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
            No referral activity yet
          </div>
        </section>
      </div>
    </div>
  )
}