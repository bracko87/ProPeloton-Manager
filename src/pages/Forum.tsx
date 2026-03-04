/**
 * Forum.tsx
 * Community page with Discord notice / placeholder.
 */

import React from 'react'

/**
 * ForumPage
 * Shows a notice that all community discussions will be handled on Discord.
 */
export default function ForumPage(): JSX.Element {
  return (
    <div className="w-full">
      <h2 className="mb-4 text-xl font-semibold">Forum</h2>

      <div className="space-y-4">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 shadow">
          <p className="text-sm font-semibold text-gray-900">
            Community discussions are moving to Discord
          </p>
          <p className="mt-2 text-sm text-gray-700">
            We will not have an in-game forum on this page. All game conversations,
            manuals, questions, and community discussions will be available in our
            Discord channel.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Our Discord server is not live yet, but it will be added here soon.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl bg-indigo-600 shadow">
          <div className="flex flex-col gap-4 p-6 text-white md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                Discord Community
              </p>
              <h3 className="mt-1 text-2xl font-bold">Join our Discord server</h3>
              <p className="mt-2 text-sm text-indigo-100">
                Chat with other players, ask questions, get manual help, and stay up
                to date with the latest community updates.
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 md:items-end">
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                Coming Soon
              </span>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-md bg-white px-4 py-2 text-sm font-semibold text-indigo-600 opacity-80"
              >
                Discord Link Coming Soon
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}